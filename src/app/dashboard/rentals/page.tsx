"use client";

import { createRental, returnRental } from "@/app/actions/rentals";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { useUserRole } from "@/components/RoleProvider";
import { hasMinRole } from "@/lib/roles";
import { friendlyError } from "@/lib/errors";
import {
  KeyRound,
  Plus,
  X,
  Save,
  AlertCircle,
  User,
  Phone,
  Mail,
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  Download,
  Eye,
} from "lucide-react";
import { downloadRentalPdf, previewRentalPdf } from "@/lib/pdf/generateRentalPdf";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Rental = {
  id: string;
  client_name: string;
  client_rut: string | null;
  client_phone: string | null;
  client_email: string | null;
  quantity: number;
  daily_rate: number;
  start_date: string;
  expected_return_date: string | null;
  actual_return_date: string | null;
  status: "ACTIVE" | "RETURNED" | "OVERDUE" | "CANCELLED";
  notes: string | null;
  created_at: string;
  products: { name: string } | null;
};

type Product = {
  id: string;
  name: string;
  unit_price: number;
  current_stock: number;
};

const statusConfig: Record<
  string,
  { label: string; color: string; icon: typeof Clock }
> = {
  ACTIVE: {
    label: "Activo",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    icon: Clock,
  },
  RETURNED: {
    label: "Devuelto",
    color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    icon: CheckCircle2,
  },
  OVERDUE: {
    label: "Vencido",
    color: "bg-destructive/10 text-destructive border-destructive/20",
    icon: AlertCircle,
  },
  CANCELLED: {
    label: "Cancelado",
    color: "bg-muted text-muted-foreground border-border",
    icon: XCircle,
  },
};

export default function RentalsPage() {
  const [supabase] = useState(() => createClient());
  const { profile } = useUserRole();
  const canWrite = profile ? hasMinRole(profile.role, "USER") : false;
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("MedStock");

  const fetchRentals = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("rentals")
      .select(`id, client_name, client_rut, client_phone, client_email, quantity, daily_rate, start_date, expected_return_date, actual_return_date, status, notes, created_at, products (name)`)
      .order("created_at", { ascending: false });

    if (filter !== "ALL") {
      query = query.eq("status", filter);
    }

    const { data, error } = await query;
    if (error) setError(friendlyError(error.message));
    else setRentals((data as unknown as Rental[]) ?? []);
    setLoading(false);
  }, [supabase, filter]);

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from("products")
      .select("id, name, unit_price, current_stock")
      .order("name");
    setProducts(data ?? []);
  }, [supabase]);

  const fetchOrgName = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: userProfile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (!userProfile) return;
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", userProfile.organization_id)
      .single();
    if (org) setOrgName(org.name);
  }, [supabase]);

  useEffect(() => {
    fetchRentals();
    fetchProducts();
    fetchOrgName();
  }, [fetchRentals, fetchProducts, fetchOrgName]);

  const WEEKLY_RATE = 50000;

  function weeksBetween(start: string, end: string | null): number {
    const s = new Date(start);
    const e = end ? new Date(end) : new Date();
    const diff = Math.ceil(
      (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 7)
    );
    return Math.max(1, diff);
  }

  async function handleCreate(formData: FormData) {
    setSaving(true);
    setError(null);

    const res = await createRental({
      product_id: formData.get("product_id") as string,
      client_name: formData.get("client_name") as string,
      client_rut: (formData.get("client_rut") as string) || null,
      client_phone: (formData.get("client_phone") as string) || null,
      client_email: (formData.get("client_email") as string) || null,
      quantity: parseInt(formData.get("quantity") as string),
      weeks: parseInt(formData.get("weeks") as string),
      notes: (formData.get("notes") as string) || null,
    });

    if (!res.ok) {
      setError(res.error);
    } else {
      setShowModal(false);
      fetchRentals();
      fetchProducts();
    }
    setSaving(false);
  }

  async function handleReturn(rentalId: string) {
    setSaving(true);
    setError(null);

    const res = await returnRental(rentalId);

    if (!res.ok) {
      setError(res.error);
    } else {
      setShowReturnModal(null);
      fetchRentals();
      fetchProducts();
    }
    setSaving(false);
  }

  const activeCount = rentals.filter((r) => r.status === "ACTIVE").length;
  const overdueCount = rentals.filter((r) => r.status === "OVERDUE").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Arriendos</h1>
          <p className="text-muted-foreground mt-1">
            Gestión de arriendos de equipos médicos
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setShowModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nuevo Arriendo
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 bg-muted/20">
          <p className="text-xs text-muted-foreground font-medium">Total</p>
          <p className="text-2xl font-bold mt-1">{rentals.length}</p>
        </Card>
        <Card className="p-4 bg-blue-500/5 border-blue-500/20">
          <p className="text-xs text-blue-500 font-medium">Activos</p>
          <p className="text-2xl font-bold text-blue-500 mt-1">{activeCount}</p>
        </Card>
        <Card className="p-4 bg-destructive/5 border-destructive/20">
          <p className="text-xs text-destructive font-medium">Vencidos</p>
          <p className="text-2xl font-bold text-destructive mt-1">{overdueCount}</p>
        </Card>
        <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
          <p className="text-xs text-emerald-500 font-medium">Devueltos</p>
          <p className="text-2xl font-bold text-emerald-500 mt-1">
            {rentals.filter((r) => r.status === "RETURNED").length}
          </p>
        </Card>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: "ALL", label: "Todos" },
          { key: "ACTIVE", label: "Activos" },
          { key: "OVERDUE", label: "Vencidos" },
          { key: "RETURNED", label: "Devueltos" },
          { key: "CANCELLED", label: "Cancelados" },
        ].map((tab) => (
          <Button
            key={tab.key}
            variant={filter === tab.key ? "default" : "secondary"}
            size="sm"
            onClick={() => setFilter(tab.key)}
            className="rounded-full"
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Tarifa</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : rentals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <KeyRound className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-muted-foreground text-sm">
                      No hay arriendos registrados.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                rentals.map((rental) => {
                  const weeks = weeksBetween(rental.start_date, rental.actual_return_date ?? rental.expected_return_date);
                  const totalCost = weeks * rental.daily_rate;
                  const cfg = statusConfig[rental.status];
                  const StatusIcon = cfg.icon;

                  return (
                    <TableRow key={rental.id}>
                      <TableCell>
                        <p className="font-medium">{rental.client_name}</p>
                        {rental.client_rut && (
                          <p className="text-xs text-muted-foreground">{rental.client_rut}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{rental.products?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">x{rental.quantity}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">
                          {new Date(rental.start_date).toLocaleDateString("es-CL")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {rental.expected_return_date
                            ? `→ ${new Date(rental.expected_return_date).toLocaleDateString("es-CL")}`
                            : "Sin fecha límite"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">
                          ${rental.daily_rate.toLocaleString("es-CL")}/sem
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {weeks} sem = ${totalCost.toLocaleString("es-CL")}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${cfg.color}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {cfg.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              previewRentalPdf({
                                clientName: rental.client_name,
                                clientRut: rental.client_rut,
                                clientPhone: rental.client_phone,
                                clientEmail: rental.client_email,
                                productName: rental.products?.name ?? "Equipo",
                                quantity: rental.quantity,
                                dailyRate: rental.daily_rate,
                                startDate: rental.start_date,
                                expectedReturnDate: rental.expected_return_date,
                                actualReturnDate: rental.actual_return_date,
                                status: rental.status,
                                notes: rental.notes,
                                organizationName: orgName,
                                createdAt: rental.created_at,
                              })
                            }
                            title="Ver PDF"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              downloadRentalPdf({
                                clientName: rental.client_name,
                                clientRut: rental.client_rut,
                                clientPhone: rental.client_phone,
                                clientEmail: rental.client_email,
                                productName: rental.products?.name ?? "Equipo",
                                quantity: rental.quantity,
                                dailyRate: rental.daily_rate,
                                startDate: rental.start_date,
                                expectedReturnDate: rental.expected_return_date,
                                actualReturnDate: rental.actual_return_date,
                                status: rental.status,
                                notes: rental.notes,
                                organizationName: orgName,
                                createdAt: rental.created_at,
                              })
                            }
                            title="Descargar PDF"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          {rental.status === "ACTIVE" && canWrite && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowReturnModal(rental.id)}
                              className="text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/10 gap-1.5"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Devolver
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[600px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Arriendo</DialogTitle>
          </DialogHeader>

          <form action={handleCreate} className="space-y-6 py-4">
            <div className="space-y-4 p-4 rounded-xl bg-muted/30 border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Datos del cliente
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <Label>Nombre *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input name="client_name" required placeholder="Juan Pérez" className="pl-9" />
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <Label>RUT</Label>
                  <Input name="client_rut" placeholder="12.345.678-9" />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input name="client_phone" placeholder="+56 9 1234 5678" className="pl-9" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input name="client_email" type="email" placeholder="email@ejemplo.cl" className="pl-9" />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-4 rounded-xl bg-muted/30 border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Equipo y período
              </p>
              <div className="space-y-2">
                <Label>Equipo *</Label>
                <Select name="product_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar equipo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} (Stock: {p.current_stock})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cantidad *</Label>
                  <Input name="quantity" type="number" min="1" defaultValue="1" required />
                </div>
                <div className="space-y-2">
                  <Label>Semanas *</Label>
                  <Select name="weeks" required defaultValue="1">
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((w) => (
                        <SelectItem key={w} value={String(w)}>
                          {w} semana{w > 1 ? "s" : ""} — ${(WEEKLY_RATE * w).toLocaleString("es-CL")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-xs text-blue-400">
                  💰 Tarifa fija: <span className="font-semibold">${WEEKLY_RATE.toLocaleString("es-CL")}/semana</span> por equipo. La fecha de inicio es hoy y la devolución se calcula automáticamente.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                name="notes"
                rows={2}
                placeholder="Observaciones del arriendo..."
                className="resize-none"
              />
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Crear Arriendo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showReturnModal} onOpenChange={(open) => !open && setShowReturnModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 mt-2">
              <RotateCcw className="w-6 h-6 text-emerald-500" />
            </div>
            <DialogTitle className="text-center">Confirmar Devolución</DialogTitle>
            <DialogDescription className="text-center pt-2">
              ¿Confirmas que el equipo ha sido devuelto? El stock se restaurará automáticamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-center mt-4">
            <Button variant="outline" onClick={() => setShowReturnModal(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => showReturnModal && handleReturn(showReturnModal)}
              disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Confirmar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
