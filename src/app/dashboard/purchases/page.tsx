"use client";

import { createClient } from "@/lib/supabase/client";
import {
  createPurchaseInvoice,
  cancelPurchaseInvoice,
} from "@/app/actions/purchases";
import { useEffect, useState, useCallback } from "react";
import { useUserRole } from "@/components/RoleProvider";
import { hasMinRole } from "@/lib/roles";
import { friendlyError } from "@/lib/errors";
import {
  PackagePlus,
  Plus,
  X,
  Save,
  Trash2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Ban,
  FileInput,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type Product = {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  unit_price: number;
  purchase_price: number | null;
  current_stock: number;
};

type InvoiceItem = {
  id: string;
  product_id: string;
  quantity: number;
  unit_purchase_price: number;
  products: { name: string; sku: string | null; category: string } | null;
};

type PurchaseInvoice = {
  id: string;
  invoice_number: string;
  supplier_name: string;
  supplier_rut: string | null;
  purchase_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  purchase_invoice_items: InvoiceItem[];
};

type LineItem = {
  _id: string;
  product_id: string;
  quantity: number;
  unit_purchase_price: number;
};

/* ─── Constants ─────────────────────────────────────────────────────────── */

const EMPTY_FORM = {
  invoice_number: "",
  supplier_name: "",
  supplier_rut: "",
  purchase_date: new Date().toISOString().split("T")[0],
  notes: "",
};

const CATEGORY_LABELS: Record<string, string> = {
  MASCARILLA: "Mascarilla",
  CPAP: "CPAP",
  TUBO_CALEFACCIONADO: "Tubo Calef.",
  OTROS: "Otros",
};

const fmt = (n: number) =>
  n.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });

const newLineItem = (): LineItem => ({
  _id: crypto.randomUUID(),
  product_id: "",
  quantity: 1,
  unit_purchase_price: 0,
});

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function PurchasesPage() {
  const { profile } = useUserRole();
  const supabase = createClient();
  const isAdmin = profile ? hasMinRole(profile.role, "ADMIN") : false;

  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [actionError, setActionError] = useState("");

  // Dialogs
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PurchaseInvoice | null>(null);

  // Create form
  const [form, setForm] = useState(EMPTY_FORM);
  const [lineItems, setLineItems] = useState<LineItem[]>([newLineItem()]);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  /* ── Data fetching ─────────────────────────────────────────── */

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError("");

    const [invRes, prodRes] = await Promise.all([
      supabase
        .from("purchase_invoices")
        .select(
          `id, invoice_number, supplier_name, supplier_rut, purchase_date,
           subtotal, tax_amount, total_amount, status, notes, created_at,
           purchase_invoice_items(
             id, product_id, quantity, unit_purchase_price,
             products(name, sku, category)
           )`
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("products")
        .select("id, name, sku, category, unit_price, purchase_price, current_stock")
        .order("name"),
    ]);

    if (invRes.error) setFetchError(friendlyError(invRes.error.message));
    else setInvoices((invRes.data ?? []) as unknown as PurchaseInvoice[]);

    if (prodRes.error) setFetchError(friendlyError(prodRes.error.message));
    else setProducts((prodRes.data ?? []) as unknown as Product[]);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Create dialog helpers ─────────────────────────────────── */

  function openCreate() {
    setForm({
      ...EMPTY_FORM,
      purchase_date: new Date().toISOString().split("T")[0],
    });
    setLineItems([newLineItem()]);
    setActionError("");
    setShowCreate(true);
  }

  function closeCreate() {
    setShowCreate(false);
    setActionError("");
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, newLineItem()]);
  }

  function removeLineItem(id: string) {
    setLineItems((prev) => prev.filter((i) => i._id !== id));
  }

  function updateLineItem(id: string, field: keyof Omit<LineItem, "_id">, value: string | number) {
    setLineItems((prev) =>
      prev.map((item) =>
        item._id === id ? { ...item, [field]: value } : item
      )
    );
  }

  /* ── Computed totals ───────────────────────────────────────── */

  const itemsTotal = lineItems.reduce(
    (sum, i) => sum + i.quantity * i.unit_purchase_price,
    0
  );
  const itemsSubtotal = Math.round(itemsTotal / 1.19);
  const itemsTax = itemsTotal - itemsSubtotal;

  /* ── Handlers ──────────────────────────────────────────────── */

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setActionError("");

    const validItems = lineItems.filter((i) => i.product_id !== "");
    if (validItems.length === 0) {
      setActionError("Debe seleccionar al menos un producto.");
      return;
    }
    for (const item of validItems) {
      if (item.quantity < 1) {
        setActionError("La cantidad debe ser al menos 1 en todos los ítems.");
        return;
      }
    }

    setSaving(true);
    const result = await createPurchaseInvoice({
      invoice_number: form.invoice_number,
      supplier_name: form.supplier_name,
      supplier_rut: form.supplier_rut || null,
      purchase_date: form.purchase_date,
      notes: form.notes || null,
      items: validItems.map((i) => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_purchase_price: i.unit_purchase_price,
      })),
    });
    setSaving(false);

    if (!result.ok) {
      setActionError(result.error);
      return;
    }

    closeCreate();
    fetchData();
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    const result = await cancelPurchaseInvoice(cancelTarget.id);
    setCancelling(false);

    if (!result.ok) {
      setActionError(result.error);
      setCancelTarget(null);
      return;
    }
    setCancelTarget(null);
    fetchData();
  }

  /* ── Monthly stats ─────────────────────────────────────────── */

  const now = new Date();
  const thisMonthInvoices = invoices.filter((inv) => {
    const d = new Date(inv.created_at);
    return (
      inv.status === "CONFIRMED" &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  });
  const monthTotal = thisMonthInvoices.reduce(
    (s, inv) => s + Number(inv.total_amount),
    0
  );
  const monthUnits = thisMonthInvoices.reduce(
    (s, inv) =>
      s + inv.purchase_invoice_items.reduce((q, it) => q + it.quantity, 0),
    0
  );

  /* ── Render ────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <PackagePlus className="w-8 h-8 text-emerald-400" />
            Facturas de Compra
          </h1>
          <p className="text-muted-foreground mt-1">
            Registro de compras a proveedores y reposición de stock
          </p>
        </div>
        {hasMinRole(profile?.role ?? "VIEWER", "USER") && (
          <Button onClick={openCreate} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Nueva Factura
          </Button>
        )}
      </div>

      {/* ── Stats ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Facturas del mes",
            value: thisMonthInvoices.length,
            color: "from-blue-500 to-blue-600",
            shadow: "shadow-blue-500/20",
          },
          {
            label: "Invertido este mes",
            value: fmt(monthTotal),
            color: "from-emerald-500 to-emerald-600",
            shadow: "shadow-emerald-500/20",
          },
          {
            label: "Unidades recibidas",
            value: monthUnits,
            color: "from-violet-500 to-violet-600",
            shadow: "shadow-violet-500/20",
          },
        ].map((stat) => (
          <Card key={stat.label} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <div
                className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-md ${stat.shadow}`}
              >
                <PackagePlus className="w-4 h-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Error global ─────────────────────────────────────── */}
      {(fetchError || actionError) && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {fetchError || actionError}
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-muted-foreground text-sm">Cargando…</span>
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-16 text-center">
              <FileInput className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">
                No hay facturas de compra registradas.
              </p>
              <p className="text-muted-foreground/60 text-xs mt-1">
                Crea la primera factura para comenzar a registrar compras.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>N° Factura</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-center">Productos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const isExpanded = expandedId === inv.id;
                  const totalUnits = inv.purchase_invoice_items.reduce(
                    (s, i) => s + i.quantity,
                    0
                  );

                  return (
                    <>
                      <TableRow
                        key={inv.id}
                        className="group cursor-pointer hover:bg-muted/30"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : inv.id)
                        }
                      >
                        {/* Expand toggle */}
                        <TableCell className="text-muted-foreground">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </TableCell>

                        {/* Invoice number */}
                        <TableCell className="font-mono font-semibold">
                          {inv.invoice_number}
                        </TableCell>

                        {/* Supplier */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium">{inv.supplier_name}</span>
                          </div>
                          {inv.supplier_rut && (
                            <p className="text-xs text-muted-foreground mt-0.5 ml-5">
                              RUT: {inv.supplier_rut}
                            </p>
                          )}
                        </TableCell>

                        {/* Date */}
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(inv.purchase_date + "T12:00:00").toLocaleDateString(
                            "es-CL"
                          )}
                        </TableCell>

                        {/* Units */}
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {inv.purchase_invoice_items.length} ítem
                          {inv.purchase_invoice_items.length !== 1 ? "s" : ""}
                          {" · "}
                          {totalUnits} ud.
                        </TableCell>

                        {/* Total */}
                        <TableCell className="text-right font-semibold tabular-nums">
                          {fmt(Number(inv.total_amount))}
                        </TableCell>

                        {/* Status */}
                        <TableCell className="text-center">
                          {inv.status === "CONFIRMED" ? (
                            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
                              Confirmada
                            </Badge>
                          ) : (
                            <Badge className="bg-destructive/15 text-destructive border-destructive/20">
                              Anulada
                            </Badge>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div
                            className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isAdmin && inv.status === "CONFIRMED" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                title="Anular factura"
                                onClick={() => {
                                  setActionError("");
                                  setCancelTarget(inv);
                                }}
                              >
                                <Ban className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* ── Expanded detail row ─────────────── */}
                      {isExpanded && (
                        <TableRow key={`${inv.id}-detail`} className="bg-muted/10">
                          <TableCell colSpan={8} className="py-0">
                            <div className="px-4 py-4 space-y-3">
                              {/* Meta */}
                              {inv.notes && (
                                <p className="text-xs text-muted-foreground italic">
                                  Nota: {inv.notes}
                                </p>
                              )}

                              {/* Items sub-table */}
                              <div className="rounded-lg border border-border/50 overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-border/50 bg-muted/20">
                                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                                        SKU
                                      </th>
                                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                                        Producto
                                      </th>
                                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                                        Categoría
                                      </th>
                                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">
                                        Cant.
                                      </th>
                                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">
                                        Precio compra
                                      </th>
                                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">
                                        Subtotal
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {inv.purchase_invoice_items.map((item) => {
                                      const prod = item.products as unknown as {
                                        name: string;
                                        sku: string | null;
                                        category: string;
                                      } | null;
                                      return (
                                        <tr
                                          key={item.id}
                                          className="border-b border-border/30 last:border-0 hover:bg-muted/10"
                                        >
                                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                                            {prod?.sku ?? "—"}
                                          </td>
                                          <td className="px-4 py-2 font-medium">
                                            {prod?.name ?? "Producto eliminado"}
                                          </td>
                                          <td className="px-4 py-2 text-muted-foreground text-xs">
                                            {CATEGORY_LABELS[prod?.category ?? ""] ??
                                              prod?.category ?? "—"}
                                          </td>
                                          <td className="px-4 py-2 text-right tabular-nums">
                                            {item.quantity}
                                          </td>
                                          <td className="px-4 py-2 text-right tabular-nums">
                                            {fmt(Number(item.unit_purchase_price))}
                                          </td>
                                          <td className="px-4 py-2 text-right tabular-nums font-medium">
                                            {fmt(
                                              item.quantity *
                                                Number(item.unit_purchase_price)
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-muted/20 border-t border-border/50">
                                      <td
                                        colSpan={5}
                                        className="px-4 py-2 text-right text-xs text-muted-foreground"
                                      >
                                        Neto (sin IVA)
                                      </td>
                                      <td className="px-4 py-2 text-right text-xs text-muted-foreground tabular-nums">
                                        {fmt(Number(inv.subtotal))}
                                      </td>
                                    </tr>
                                    <tr className="bg-muted/20">
                                      <td
                                        colSpan={5}
                                        className="px-4 py-2 text-right text-xs text-muted-foreground"
                                      >
                                        IVA (19%)
                                      </td>
                                      <td className="px-4 py-2 text-right text-xs text-muted-foreground tabular-nums">
                                        {fmt(Number(inv.tax_amount))}
                                      </td>
                                    </tr>
                                    <tr className="bg-muted/30 border-t border-border/50">
                                      <td
                                        colSpan={5}
                                        className="px-4 py-2 text-right font-semibold text-sm"
                                      >
                                        Total IVA incluido
                                      </td>
                                      <td className="px-4 py-2 text-right font-bold tabular-nums">
                                        {fmt(Number(inv.total_amount))}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Create Dialog ─────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={(open) => !open && closeCreate()}>
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="w-5 h-5 text-emerald-400" />
              Nueva Factura de Compra
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-6">
            {/* ── Datos del proveedor ──────────────────────── */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wide">
                Datos del proveedor
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="supplier_name">
                    Proveedor <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="supplier_name"
                    placeholder="Nombre del proveedor"
                    value={form.supplier_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, supplier_name: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="supplier_rut">RUT proveedor</Label>
                  <Input
                    id="supplier_rut"
                    placeholder="76.XXX.XXX-X"
                    value={form.supplier_rut}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, supplier_rut: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invoice_number">
                    N° Factura <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="invoice_number"
                    placeholder="Ej: 001234"
                    value={form.invoice_number}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        invoice_number: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="purchase_date">
                    Fecha de compra <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="purchase_date"
                    type="date"
                    value={form.purchase_date}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        purchase_date: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notas</Label>
                <textarea
                  id="notes"
                  rows={2}
                  placeholder="Observaciones opcionales…"
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            </div>

            {/* ── Productos comprados ──────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wide">
                  Productos comprados
                </h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addLineItem}
                  className="gap-1.5 h-8"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar producto
                </Button>
              </div>

              {/* Line items header */}
              <div className="hidden sm:grid grid-cols-[1fr_80px_140px_32px] gap-2 px-1">
                <span className="text-xs text-muted-foreground">Producto</span>
                <span className="text-xs text-muted-foreground text-center">
                  Cant.
                </span>
                <span className="text-xs text-muted-foreground text-right">
                  Precio compra (IVA inc.)
                </span>
                <span />
              </div>

              <div className="space-y-2">
                {lineItems.map((item) => (
                  <div
                    key={item._id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_80px_140px_32px] gap-2 items-center p-2 rounded-lg border border-border/50 bg-muted/20"
                  >
                    {/* Product selector */}
                    <Select
                      value={item.product_id}
                      onValueChange={(v) =>
                        updateLineItem(item._id, "product_id", v ?? "")
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecciona un producto…" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="font-mono text-xs text-muted-foreground mr-2">
                              {p.sku ?? "—"}
                            </span>
                            {p.name}
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({CATEGORY_LABELS[p.category] ?? p.category})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Quantity */}
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      placeholder="Cant."
                      className="h-9 text-center"
                      value={item.quantity}
                      onChange={(e) =>
                        updateLineItem(
                          item._id,
                          "quantity",
                          Math.max(1, parseInt(e.target.value) || 1)
                        )
                      }
                    />

                    {/* Unit purchase price */}
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      placeholder="$0"
                      className="h-9 text-right"
                      value={item.unit_purchase_price || ""}
                      onChange={(e) =>
                        updateLineItem(
                          item._id,
                          "unit_purchase_price",
                          parseFloat(e.target.value) || 0
                        )
                      }
                    />

                    {/* Remove */}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeLineItem(item._id)}
                      disabled={lineItems.length === 1}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Totals summary */}
              {itemsTotal > 0 && (
                <div className="rounded-lg border border-border/50 bg-muted/10 p-3 space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Neto (sin IVA)</span>
                    <span className="tabular-nums">{fmt(itemsSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>IVA (19%)</span>
                    <span className="tabular-nums">{fmt(itemsTax)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-border/50 pt-1 mt-1">
                    <span>Total IVA incluido</span>
                    <span className="tabular-nums text-emerald-400">
                      {fmt(itemsTotal)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Error / notice ───────────────────────────── */}
            {actionError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {actionError}
              </div>
            )}

            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Al guardar, el stock de cada producto se incrementará automáticamente y
              quedará registrado como movimiento de entrada.
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={closeCreate}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saving ? "Guardando…" : "Registrar factura"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Cancel Confirmation Dialog ────────────────────────── */}
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="w-5 h-5" />
              Anular factura
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              ¿Seguro que deseas anular la factura{" "}
              <span className="font-semibold text-white">
                {cancelTarget?.invoice_number}
              </span>{" "}
              de{" "}
              <span className="font-semibold text-white">
                {cancelTarget?.supplier_name}
              </span>
              ?
            </p>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Esta acción revertirá el stock de todos los productos de esta
                factura y registrará movimientos de salida. No se puede deshacer.
              </span>
            </div>
            {actionError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {actionError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCancelTarget(null)}
              disabled={cancelling}
            >
              Mantener
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelling}
              className="gap-2"
            >
              {cancelling ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {cancelling ? "Anulando…" : "Anular factura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
