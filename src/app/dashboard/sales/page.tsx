"use client";

import { createSale, deleteSale } from "@/app/actions/sales";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useUserRole } from "@/components/RoleProvider";
import { hasMinRole } from "@/lib/roles";
import { friendlyError } from "@/lib/errors";
import {
  ShoppingCart,
  Plus,
  X,
  Save,
  Trash2,
  AlertCircle,
  Search,
  TrendingUp,
  CheckCircle2,
  XCircle,
  RotateCcw,
  CreditCard,
  Banknote,
  Building2,
  FileCheck2,
  HelpCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Sale = {
  id: string;
  sale_number: number;
  client_name: string;
  client_rut: string | null;
  client_email: string | null;
  payment_method: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  sale_items?: {
    quantity: number;
    products: { name: string } | null;
  }[];
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  unit_price: number;
  current_stock: number;
};

type SaleItem = {
  product_id: string;
  name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  stock: number; // available
};

const PAYMENT_METHODS: Record<string, { label: string; icon: typeof Banknote }> = {
  CASH:     { label: "Efectivo",      icon: Banknote },
  TRANSFER: { label: "Transferencia", icon: Building2 },
  CARD:     { label: "Tarjeta",       icon: CreditCard },
  CHECK:    { label: "Cheque",        icon: FileCheck2 },
  OTHER:    { label: "Otro",          icon: HelpCircle },
};

const STATUS_CFG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  COMPLETED: { label: "Completada",  color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", icon: CheckCircle2 },
  CANCELLED: { label: "Cancelada",   color: "bg-muted text-muted-foreground border-border",    icon: XCircle },
  REFUNDED:  { label: "Reembolsada", color: "bg-amber-500/10 text-amber-500 border-amber-500/20",    icon: RotateCcw },
};

const CLP = (n: number) =>
  Number(n).toLocaleString("es-CL", { style: "currency", currency: "CLP" });

export default function SalesPage() {
  const [supabase] = useState(() => createClient());
  const { profile } = useUserRole();
  const canWrite = profile ? hasMinRole(profile.role, "USER") : false;
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stockErrors, setStockErrors] = useState<Record<number, string>>({});

  const fetchSales = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sales")
      .select("*, sale_items (quantity, products (name))")
      .order("created_at", { ascending: false });
    if (error) setError(friendlyError(error.message));
    else setSales(data ?? []);
    setLoading(false);
  }, [supabase]);

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from("products")
      .select("id, name, sku, unit_price, current_stock")
      .order("name");
    setProducts(data ?? []);
  }, [supabase]);

  useEffect(() => {
    fetchSales();
    fetchProducts();
  }, [fetchSales, fetchProducts]);

  // ── Filtered sales ────────────────────────────────────────────────────────
  const filtered = sales.filter((s) =>
    s.client_name.toLowerCase().includes(search.toLowerCase()) ||
    String(s.sale_number).includes(search)
  );

  // ── Stats ─────────────────────────────────────────────────────────────────
  const todayStr = new Date().toDateString();
  const todaySales = sales.filter(
    (s) => s.status === "COMPLETED" && new Date(s.created_at).toDateString() === todayStr
  );
  const todayTotal = todaySales.reduce((a, s) => a + Number(s.total_amount), 0);
  const monthTotal = sales
    .filter((s) => {
      const d = new Date(s.created_at);
      const now = new Date();
      return s.status === "COMPLETED" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((a, s) => a + Number(s.total_amount), 0);

  // ── Item management ───────────────────────────────────────────────────────
  function addItem() {
    setItems((prev) => [
      ...prev,
      { product_id: "", name: "", sku: null, quantity: 1, unit_price: 0, stock: 0 },
    ]);
  }

  function updateItem(idx: number, field: string, value: string | number) {
    setItems((prev) => {
      const updated = [...prev];
      if (field === "product_id") {
        const p = products.find((pr) => pr.id === value);
        if (p) updated[idx] = { product_id: p.id, name: p.name, sku: p.sku, quantity: 1, unit_price: p.unit_price, stock: p.current_stock };
      } else if (field === "quantity") {
        updated[idx] = { ...updated[idx], quantity: Math.max(1, Number(value)) };
      } else if (field === "unit_price") {
        updated[idx] = { ...updated[idx], unit_price: Number(value) };
      }
      return updated;
    });
    // Clear stock error for this row
    setStockErrors((prev) => { const n = { ...prev }; delete n[idx]; return n; });
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setStockErrors((prev) => { const n = { ...prev }; delete n[idx]; return n; });
  }

  // Prices are IVA-included — extract neto and IVA.
  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const subtotal = Math.round(total / 1.19);
  const tax = total - subtotal;

  function validateStock(): boolean {
    const errors: Record<number, string> = {};
    // Sum quantities per product in the current items
    const qtyByProduct: Record<string, number> = {};
    items.forEach((item, idx) => {
      qtyByProduct[item.product_id] = (qtyByProduct[item.product_id] ?? 0) + item.quantity;
      const available = item.stock;
      if (qtyByProduct[item.product_id] > available) {
        errors[idx] = `Stock insuficiente — disponible: ${available}`;
      }
    });
    setStockErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleDelete(sale: Sale) {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la venta #${String(sale.sale_number).padStart(4, "0")}? Esta acción revertirá el stock automáticamente y no se puede deshacer.`)) {
      return;
    }

    setLoading(true);
    setError(null);

    const res = await deleteSale(sale.id);
    if (!res.ok) {
      setError(res.error);
    } else {
      await fetchSales();
      await fetchProducts();
    }

    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (items.length === 0) { setError("Agrega al menos un producto."); return; }
    if (items.some(i => !i.product_id)) { setError("Por favor, selecciona un producto en todas las líneas."); return; }
    if (!validateStock()) { setError("Hay productos sin stock suficiente."); return; }

    setSaving(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    const res = await createSale({
      client_name: formData.get("client_name") as string,
      client_rut: (formData.get("client_rut") as string) || null,
      client_email: (formData.get("client_email") as string) || null,
      client_phone: (formData.get("client_phone") as string) || null,
      payment_method: paymentMethod as "CASH" | "TRANSFER" | "CARD" | "CHECK" | "OTHER",
      notes: (formData.get("notes") as string) || null,
      items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price })),
    });

    if (!res.ok) {
      setError(res.error);
      setSaving(false);
      return;
    }

    setShowModal(false);
    setItems([]);
    setPaymentMethod("CASH");
    await fetchSales();
    await fetchProducts();
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ventas</h1>
          <p className="text-muted-foreground mt-1">Registra ventas y descuenta el stock automáticamente</p>
        </div>
        {canWrite && (
          <Button onClick={() => { setItems([]); setPaymentMethod("CASH"); setError(null); setShowModal(true); }} className="gap-2">
            <Plus className="w-4 h-4" />
            Nueva Venta
          </Button>
        )}
      </div>

      {error && !showModal && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 bg-muted/20">
          <p className="text-xs text-muted-foreground font-medium">Total ventas</p>
          <p className="text-2xl font-bold mt-1">{sales.filter(s => s.status === "COMPLETED").length}</p>
        </Card>
        <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
          <p className="text-xs text-emerald-500 font-medium">Hoy</p>
          <p className="text-2xl font-bold text-emerald-500 mt-1">{todaySales.length}</p>
          <p className="text-xs text-emerald-500/60 mt-0.5">{CLP(todayTotal)}</p>
        </Card>
        <Card className="p-4 bg-blue-500/5 border-blue-500/20 col-span-2">
          <p className="text-xs text-blue-500 font-medium flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> Este mes
          </p>
          <p className="text-2xl font-bold text-blue-500 mt-1">{CLP(monthTotal)}</p>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar por cliente o N° de venta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <ShoppingCart className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-muted-foreground text-sm">No hay ventas registradas.</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((sale) => {
                  const cfg = STATUS_CFG[sale.status] ?? STATUS_CFG.COMPLETED;
                  const StatusIcon = cfg.icon;
                  const pm = PAYMENT_METHODS[sale.payment_method];
                  const PmIcon = pm?.icon ?? HelpCircle;
                  return (
                    <TableRow key={sale.id}>
                      <TableCell className="font-mono text-muted-foreground">
                        #{String(sale.sale_number).padStart(4, "0")}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{sale.client_name}</p>
                        {sale.client_rut && <p className="text-xs text-muted-foreground">{sale.client_rut}</p>}
                      </TableCell>
                      <TableCell>
                        {sale.sale_items?.length ? (
                          <div className="flex flex-col gap-1">
                            {sale.sale_items.map((item, i) => (
                              <span key={i} className="text-sm truncate max-w-[200px]" title={item.products?.name ?? ""}>
                                <span className="font-medium">{item.quantity}x</span> {item.products?.name ?? "Producto eliminado"}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin productos</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <PmIcon className="w-3.5 h-3.5" />
                          {pm?.label ?? sale.payment_method}
                        </span>
                      </TableCell>
                      <TableCell>
                        <p className="font-semibold">{CLP(sale.total_amount)}</p>
                        <p className="text-xs text-muted-foreground">IVA: {CLP(sale.tax_amount)}</p>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${cfg.color}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {cfg.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(sale.created_at).toLocaleDateString("es-CL")}
                      </TableCell>
                      <TableCell className="text-center">
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(sale)}
                            title="Eliminar venta y revertir stock"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
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
        <DialogContent className="sm:max-w-[700px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Venta</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-6 py-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-4 p-4 rounded-xl bg-muted/30 border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Datos del cliente</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <Label>Nombre *</Label>
                  <Input name="client_name" required placeholder="Nombre del cliente" />
                </div>
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <Label>RUT</Label>
                  <Input name="client_rut" placeholder="12.345.678-9" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input name="client_email" type="email" placeholder="correo@ejemplo.cl" />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input name="client_phone" placeholder="+56 9 1234 5678" />
                </div>
              </div>
            </div>

            <div className="space-y-3 p-4 rounded-xl bg-muted/30 border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Método de pago</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PAYMENT_METHODS).map(([key, pm]) => {
                  const Icon = pm.icon;
                  const isSelected = paymentMethod === key;
                  return (
                    <Button
                      type="button"
                      key={key}
                      variant={isSelected ? "default" : "secondary"}
                      size="sm"
                      onClick={() => setPaymentMethod(key)}
                      className="gap-2"
                    >
                      <Icon className="w-4 h-4" />
                      {pm.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Productos *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addItem}
                  disabled={products.filter(p => p.current_stock > 0).length === 0}
                  className="h-8 gap-1 text-primary"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar línea
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm border border-dashed rounded-xl">
                  <ShoppingCart className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  Agrega los productos de esta venta
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={idx} className="rounded-xl bg-muted/20 border p-3 space-y-3">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <Select
                          value={item.product_id}
                          onValueChange={(val) => updateItem(idx, "product_id", val as string)}
                        >
                          <SelectTrigger className="flex-1 min-w-[200px]">
                            <SelectValue placeholder="Seleccionar producto...">
                              {(val: string | null) => {
                                if (!val) return "Seleccionar producto...";
                                const p = products.find((pr) => pr.id === val);
                                return p ? `${p.name}${p.sku ? ` [${p.sku}]` : ""}` : val;
                              }}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id} disabled={p.current_stock === 0}>
                                {p.name}{p.sku ? ` [${p.sku}]` : ""} — Stock: {p.current_stock}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <Input
                            type="number"
                            min="1"
                            max={item.stock}
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                            className={`w-20 text-center ${stockErrors[idx] ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          />
                          <Input
                            type="number"
                            step="1"
                            min="0"
                            value={item.unit_price}
                            onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                            className="w-28 text-right"
                          />
                          <span className="text-sm font-medium w-28 text-right shrink-0">
                            {CLP(item.quantity * item.unit_price)}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(idx)}
                            className="text-muted-foreground hover:text-destructive shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between px-1">
                        {stockErrors[idx] ? (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            {stockErrors[idx]}
                          </p>
                        ) : item.product_id ? (
                          <p className="text-xs text-muted-foreground">
                            Disponible: <span className={item.stock - item.quantity < 5 ? "text-amber-500" : "text-emerald-500"}>{item.stock - item.quantity}</span> unidades tras la venta
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Seleccione un producto para ver el stock</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-1.5">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Neto (sin IVA)</span>
                  <span>{CLP(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>IVA incluido (19%)</span>
                  <span>{CLP(tax)}</span>
                </div>
                <div className="flex justify-between text-base font-bold pt-1 border-t border-primary/10 mt-2">
                  <span>Total (IVA incluido)</span>
                  <span className="text-primary">{CLP(total)}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                name="notes"
                rows={2}
                placeholder="Observaciones de la venta..."
                className="resize-none"
              />
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || items.length === 0}>
                {saving ? (
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Confirmar Venta
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
