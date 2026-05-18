"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { useUserRole } from "@/components/RoleProvider";
import { hasMinRole } from "@/lib/roles";
import {
  Inbox,
  Plus,
  Search,
  X,
  Save,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Package,
  AlertTriangle,
  Clock,
  ArrowRightCircle,
  BadgeAlert,
  Trash2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type RequestStatus = 'PENDING_VALIDATION' | 'APPROVED' | 'REJECTED' | 'MANAGED';
type Urgency = 'LOW' | 'MEDIUM' | 'HIGH';

type ProductRequest = {
  id: string;
  product_id: string | null;
  product_name_fallback: string | null;
  quantity: number;
  urgency: Urgency;
  justification: string;
  status: RequestStatus;
  created_at: string;
  products?: { id: string; name: string; sku: string | null };
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
};

const STATUS_CFG: Record<RequestStatus, { label: string; color: string; icon: any }> = {
  PENDING_VALIDATION: { label: "Pendiente", color: "bg-amber-500/10 text-amber-500 border-amber-500/20", icon: Clock },
  APPROVED: { label: "Aprobado", color: "bg-blue-500/10 text-blue-500 border-blue-500/20", icon: CheckCircle2 },
  REJECTED: { label: "Rechazado", color: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
  MANAGED: { label: "Gestionado", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", icon: ArrowRightCircle },
};

const URGENCY_CFG: Record<Urgency, { label: string; color: string }> = {
  LOW: { label: "Baja", color: "text-muted-foreground" },
  MEDIUM: { label: "Media", color: "text-amber-500" },
  HIGH: { label: "Alta", color: "text-destructive font-bold" },
};

type RequestItemForm = {
  id: string;
  isNewProduct: boolean;
  product_id: string;
  product_name_fallback: string;
  quantity: string;
};

export default function RequestsPage() {
  const [supabase] = useState(() => createClient());
  const { profile } = useUserRole();
  const isAdmin = profile ? hasMinRole(profile.role, "ADMIN") : false;

  const [requests, setRequests] = useState<ProductRequest[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  
  const [showModal, setShowModal] = useState(false);
  
  const [items, setItems] = useState<RequestItemForm[]>([]);
  const [urgency, setUrgency] = useState<Urgency>("LOW");
  const [justification, setJustification] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: prods } = await supabase.from("products").select("id, name, sku").order("name");
    setProducts(prods ?? []);

    const { data: reqs, error: reqsErr } = await supabase
      .from("product_requests")
      .select("*, products(id, name, sku)")
      .order("created_at", { ascending: false });

    if (reqsErr) setError(reqsErr.message);
    else setRequests(reqs ?? []);

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = requests.filter((r) => {
    const term = search.toLowerCase();
    const name = r.product_id ? r.products?.name : r.product_name_fallback;
    return name?.toLowerCase().includes(term);
  });

  function openCreate() {
    setItems([{ id: Date.now().toString(), isNewProduct: false, product_id: "", product_name_fallback: "", quantity: "1" }]);
    setUrgency("LOW");
    setJustification("");
    setError(null);
    setShowModal(true);
  }

  function addLineItem() {
    setItems([...items, { id: Date.now().toString(), isNewProduct: false, product_id: "", product_name_fallback: "", quantity: "1" }]);
  }

  function removeLineItem(id: string) {
    if (items.length === 1) return;
    setItems(items.filter(i => i.id !== id));
  }

  function updateItem(id: string, field: keyof RequestItemForm, value: any) {
    setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  }

  async function handleStatusChange(id: string, newStatus: RequestStatus) {
    if (!isAdmin) return;
    setLoading(true);
    const { error: updErr } = await supabase
      .from("product_requests")
      .update({ status: newStatus })
      .eq("id", id);
    if (!updErr) {
      await fetchData();
    } else {
      setError(updErr.message);
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payloads = items.map(item => ({
      product_id: item.isNewProduct ? null : item.product_id,
      product_name_fallback: item.isNewProduct ? item.product_name_fallback : null,
      quantity: parseInt(item.quantity) || 1,
      urgency: urgency,
      justification: justification,
      status: "PENDING_VALIDATION" as RequestStatus,
      requested_by: profile?.id,
      organization_id: profile?.organization_id
    }));

    for (let i = 0; i < payloads.length; i++) {
       const p = payloads[i];
       if (!p.product_id && !p.product_name_fallback) {
         setError(`La línea ${i + 1} debe tener un producto del catálogo o un nombre válido escrito.`);
         setSaving(false);
         return;
       }
    }

    const { error: insertErr } = await supabase
      .from("product_requests")
      .insert(payloads);

    if (insertErr) {
      setError(insertErr.message);
    } else {
      setShowModal(false);
      fetchData();
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Solicitudes de Insumos</h1>
          <p className="text-muted-foreground mt-1">Gestión y aprobación de compras y reabastecimiento de stock.</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Nueva Solicitud
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar solicitud por artículo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {error && !showModal && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Articulo Solicitado</TableHead>
                <TableHead>Urgencia</TableHead>
                <TableHead>Justificación</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center">Administración</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                     <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <Inbox className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    No hay solicitudes registradas.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((req) => {
                  const cfg = STATUS_CFG[req.status];
                  const StatusIcon = cfg.icon;
                  const urg = URGENCY_CFG[req.urgency];
                  const isExisting = req.product_id !== null;
                  const name = isExisting ? req.products?.name : req.product_name_fallback;
                  
                  return (
                    <TableRow key={req.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isExisting ? 'bg-blue-500/10 text-blue-500' : 'bg-amber-500/10 text-amber-500'}`}>
                            {isExisting ? <Package className="w-4 h-4" /> : <BadgeAlert className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{name}</p>
                            <p className="text-xs text-muted-foreground">Cantidad: {req.quantity} und.</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-semibold ${urg.color}`}>{urg.label}</span>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground max-w-xs line-clamp-2" title={req.justification}>
                          {req.justification}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${cfg.color}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {cfg.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          {req.status === 'PENDING_VALIDATION' && isAdmin && (
                            <>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleStatusChange(req.id, 'APPROVED')} 
                                className="text-blue-500 border-blue-500/20 hover:bg-blue-500/10"
                              >
                                Aprobar
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleStatusChange(req.id, 'REJECTED')} 
                                className="text-destructive border-destructive/20 hover:bg-destructive/10"
                              >
                                Rechazar
                              </Button>
                            </>
                          )}
                          {req.status === 'APPROVED' && isAdmin && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleStatusChange(req.id, 'MANAGED')} 
                              className="text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/10 gap-1.5"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Marcar Gestionado
                            </Button>
                          )}
                          {!isAdmin && (
                            <span className="text-xs text-muted-foreground">Solo visualización</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Levantar Solicitud (Lote)</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6 py-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Líneas de Productos a Solicitar</p>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={addLineItem}
                  className="h-8 gap-1 text-blue-500 hover:text-blue-400"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Añadir Ítem
                </Button>
              </div>
              
              {items.map((item, index) => (
                <div key={item.id} className="relative bg-muted/30 p-4 rounded-xl border flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      Línea {index + 1}
                    </p>
                    {items.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeLineItem(item.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  
                  <div className="flex bg-muted p-1 rounded-md w-fit">
                    <button
                      type="button"
                      onClick={() => updateItem(item.id, 'isNewProduct', false)}
                      className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${!item.isNewProduct ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Catálogo Existente
                    </button>
                    <button
                      type="button"
                      onClick={() => updateItem(item.id, 'isNewProduct', true)}
                      className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${item.isNewProduct ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Item Libre / Nuevo
                    </button>
                  </div>

                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      {!item.isNewProduct ? (
                        <Select 
                          value={item.product_id} 
                          onValueChange={(val) => updateItem(item.id, 'product_id', val)}
                          required={!item.isNewProduct}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Buscar en la base de datos..." />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} {p.sku ? `(SKU: ${p.sku})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={item.product_name_fallback}
                          onChange={(e) => updateItem(item.id, 'product_name_fallback', e.target.value)}
                          required={item.isNewProduct}
                          placeholder="Ej: Insumos de escritorio, Nueva esterilizadora..."
                        />
                      )}
                    </div>
                    <div className="w-24">
                      <Input
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                        type="number"
                        min="1"
                        required
                        placeholder="Cant."
                        className="text-center"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-4 grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label>Nivel de Urgencia Global *</Label>
                <Select value={urgency} onValueChange={(val) => setUrgency(val as Urgency)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Baja</SelectItem>
                    <SelectItem value="MEDIUM">Media</SelectItem>
                    <SelectItem value="HIGH" className="text-destructive font-bold">Alta Urgencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="justification">Justificación de la compra *</Label>
                <Textarea
                  id="justification"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  required
                  rows={2}
                  placeholder="Detalla por qué es necesario comprar esto ahora..."
                  className="resize-none"
                />
              </div>
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
                Enviar a Validación ({items.length})
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
