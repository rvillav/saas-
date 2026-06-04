"use client";

import { createLoan, returnLoan } from "@/app/actions/loans";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { useUserRole } from "@/components/RoleProvider";
import { hasMinRole } from "@/lib/roles";
import { friendlyError } from "@/lib/errors";
import {
  Package,
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
  Search,
  Calendar,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Loan = {
  id: string;
  borrower_name: string;
  borrower_rut: string | null;
  borrower_phone: string | null;
  borrower_email: string | null;
  quantity: number;
  start_date: string;
  expected_return_date: string | null;
  actual_return_date: string | null;
  status: "ACTIVE" | "RETURNED" | "LOST";
  notes: string | null;
  created_at: string;
  products: { name: string } | null;
};

type Product = {
  id: string;
  name: string;
  current_stock: number;
};

const statusConfig: Record<
  string,
  { label: string; color: string; icon: typeof Clock }
> = {
  ACTIVE: {
    label: "Activo",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: Clock,
  },
  RETURNED: {
    label: "Devuelto",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: CheckCircle2,
  },
  LOST: {
    label: "Perdido",
    color: "bg-destructive/10 text-destructive border-destructive/20",
    icon: XCircle,
  },
};

export default function LoansPage() {
  const [supabase] = useState(() => createClient());
  const { profile } = useUserRole();
  const canWrite = profile ? hasMinRole(profile.role, "USER") : false;

  const [loans, setLoans] = useState<Loan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState<string | null>(null);
  
  // Search & Filter
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("ALL");
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [selectedProductId, setSelectedProductId] = useState("");
  const [borrowerName, setBorrowerName] = useState("");
  const [borrowerRut, setBorrowerRut] = useState("");
  const [borrowerPhone, setBorrowerPhone] = useState("");
  const [borrowerEmail, setBorrowerEmail] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [notes, setNotes] = useState("");

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("loans")
      .select(`id, borrower_name, borrower_rut, borrower_phone, borrower_email, quantity, start_date, expected_return_date, actual_return_date, status, notes, created_at, products (name)`)
      .order("created_at", { ascending: false });

    if (filter !== "ALL") {
      query = query.eq("status", filter);
    }

    const { data, error } = await query;
    if (error) setError(friendlyError(error.message));
    else setLoans((data as unknown as Loan[]) ?? []);
    setLoading(false);
  }, [supabase, filter]);

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from("products")
      .select("id, name, current_stock")
      .order("name");
    setProducts(data ?? []);
  }, [supabase]);

  useEffect(() => {
    fetchLoans();
    fetchProducts();
  }, [fetchLoans, fetchProducts]);

  const resetForm = () => {
    setSelectedProductId("");
    setBorrowerName("");
    setBorrowerRut("");
    setBorrowerPhone("");
    setBorrowerEmail("");
    setQuantity("1");
    setExpectedReturnDate("");
    setNotes("");
    setError(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      setError("Por favor, selecciona un producto.");
      return;
    }
    const qtyNum = parseInt(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }

    setSaving(true);
    setError(null);

    const res = await createLoan({
      product_id: selectedProductId,
      borrower_name: borrowerName,
      borrower_rut: borrowerRut || null,
      borrower_phone: borrowerPhone || null,
      borrower_email: borrowerEmail || null,
      quantity: qtyNum,
      expected_return_date: expectedReturnDate || null,
      notes: notes || null,
    });

    if (!res.ok) {
      setError(res.error);
    } else {
      setShowModal(false);
      fetchLoans();
      fetchProducts();
    }
    setSaving(false);
  };

  const handleReturn = async (loanId: string, status: "RETURNED" | "LOST") => {
    setSaving(true);
    setError(null);

    const res = await returnLoan(loanId, status);

    if (!res.ok) {
      setError(res.error);
    } else {
      setShowReturnModal(null);
      fetchLoans();
      fetchProducts();
    }
    setSaving(false);
  };

  const filteredLoans = loans.filter((l) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      l.borrower_name.toLowerCase().includes(term) ||
      (l.borrower_rut && l.borrower_rut.toLowerCase().includes(term)) ||
      (l.products?.name && l.products.name.toLowerCase().includes(term))
    );
  });

  const activeCount = loans.filter((l) => l.status === "ACTIVE").length;
  const returnedCount = loans.filter((l) => l.status === "RETURNED").length;
  const lostCount = loans.filter((l) => l.status === "LOST").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Préstamos de Insumos</h1>
          <p className="text-muted-foreground mt-1">
            Gestión y seguimiento de insumos prestados a clientes o pacientes
          </p>
        </div>
        {canWrite && (
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            Registrar Préstamo
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 bg-muted/20">
          <p className="text-xs text-muted-foreground font-medium">Total Registros</p>
          <p className="text-2xl font-bold mt-1">{loans.length}</p>
        </Card>
        <Card className="p-4 bg-blue-500/5 border-blue-500/20">
          <p className="text-xs text-blue-400 font-medium">Activos</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{activeCount}</p>
        </Card>
        <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
          <p className="text-xs text-emerald-400 font-medium">Devueltos</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{returnedCount}</p>
        </Card>
        <Card className="p-4 bg-destructive/5 border-destructive/20">
          <p className="text-xs text-destructive font-medium">Perdidos</p>
          <p className="text-2xl font-bold text-destructive mt-1">{lostCount}</p>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por prestatario, RUT o insumo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { key: "ALL", label: "Todos" },
            { key: "ACTIVE", label: "Activos" },
            { key: "RETURNED", label: "Devueltos" },
            { key: "LOST", label: "Perdidos" },
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
      </div>

      {error && !showModal && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Main Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prestatario</TableHead>
                <TableHead>Insumo</TableHead>
                <TableHead>Fecha Préstamo</TableHead>
                <TableHead>Fecha Retorno</TableHead>
                <TableHead>Estado</TableHead>
                {canWrite && <TableHead className="text-right">Acción</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredLoans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-muted-foreground text-sm">
                      No se encontraron préstamos de insumos.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredLoans.map((loan) => {
                  const cfg = statusConfig[loan.status];
                  const StatusIcon = cfg.icon;

                  return (
                    <TableRow key={loan.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{loan.borrower_name}</p>
                        {loan.borrower_rut && (
                          <p className="text-xs text-muted-foreground">{loan.borrower_rut}</p>
                        )}
                        {(loan.borrower_phone || loan.borrower_email) && (
                          <p className="text-[10px] text-muted-foreground/75 mt-0.5">
                            {loan.borrower_phone} {loan.borrower_email ? `| ${loan.borrower_email}` : ""}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{loan.products?.name ?? "Insumo eliminado"}</p>
                        <p className="text-xs text-muted-foreground">{loan.quantity} unidad{loan.quantity > 1 ? "es" : ""}</p>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(loan.start_date + "T12:00:00").toLocaleDateString("es-CL")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {loan.actual_return_date ? (
                          <span className="text-emerald-400">
                            {new Date(loan.actual_return_date + "T12:00:00").toLocaleDateString("es-CL")}
                          </span>
                        ) : loan.expected_return_date ? (
                          <span className="text-muted-foreground">
                            {new Date(loan.expected_return_date + "T12:00:00").toLocaleDateString("es-CL")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${cfg.color}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {cfg.label}
                        </span>
                      </TableCell>
                      {canWrite && (
                        <TableCell className="text-right">
                          {loan.status === "ACTIVE" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowReturnModal(loan.id)}
                              className="text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10 gap-1.5"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Retorno
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Completado</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Modal - Registrar Préstamo */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[550px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Préstamo de Insumo</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-5 py-2">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Datos prestatario */}
            <div className="space-y-3 p-4 rounded-xl bg-muted/20 border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Datos del prestatario / paciente
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1 space-y-1.5">
                  <Label htmlFor="borrowerName">Nombre Completo *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="borrowerName"
                      required
                      placeholder="Juan Pérez"
                      value={borrowerName}
                      onChange={(e) => setBorrowerName(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1 space-y-1.5">
                  <Label htmlFor="borrowerRut">RUT</Label>
                  <Input
                    id="borrowerRut"
                    placeholder="12.345.678-9"
                    value={borrowerRut}
                    onChange={(e) => setBorrowerRut(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="borrowerPhone">Teléfono</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="borrowerPhone"
                      placeholder="+56 9 1234 5678"
                      value={borrowerPhone}
                      onChange={(e) => setBorrowerPhone(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="borrowerEmail">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="borrowerEmail"
                      type="email"
                      placeholder="email@ejemplo.cl"
                      value={borrowerEmail}
                      onChange={(e) => setBorrowerEmail(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Datos Insumo */}
            <div className="space-y-3 p-4 rounded-xl bg-muted/20 border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Detalle del insumo
              </p>
              
              <div className="space-y-1.5">
                <Label>Insumo *</Label>
                <Select value={selectedProductId} onValueChange={(val) => setSelectedProductId(val || "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar insumo...">
                      {(val: string | null) => {
                        if (!val) return "Seleccionar insumo...";
                        const p = products.find((pr) => pr.id === val);
                        return p ? p.name : val;
                      }}
                    </SelectValue>
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
                <div className="space-y-1.5">
                  <Label htmlFor="quantity">Cantidad *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expectedReturn">Retorno Esperado</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="expectedReturn"
                      type="date"
                      value={expectedReturnDate}
                      onChange={(e) => setExpectedReturnDate(e.target.value)}
                      className="pl-9 [color-scheme:dark]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notas / Justificación</Label>
              <Textarea
                id="notes"
                rows={2}
                placeholder="Observaciones o indicaciones especiales..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Registrar Préstamo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal - Registrar Retorno de Préstamo */}
      <Dialog open={!!showReturnModal} onOpenChange={(open) => !open && setShowReturnModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 mt-2">
              <RotateCcw className="w-6 h-6 text-emerald-400" />
            </div>
            <DialogTitle className="text-center">Procesar Retorno del Insumo</DialogTitle>
            <DialogDescription className="text-center pt-1">
              ¿Cuál es la resolución para este préstamo de insumo? Selecciona si el insumo fue devuelto en buen estado al inventario, o si se declara como perdido.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center py-4">
            <Button
              variant="outline"
              onClick={() => setShowReturnModal(null)}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => showReturnModal && handleReturn(showReturnModal, "LOST")}
              disabled={saving}
              variant="destructive"
              className="w-full sm:w-auto gap-1.5"
            >
              <XCircle className="w-4 h-4" />
              Marcar como Perdido
            </Button>
            <Button
              onClick={() => showReturnModal && handleReturn(showReturnModal, "RETURNED")}
              disabled={saving}
              className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirmar Devolución
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
