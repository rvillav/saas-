"use client";

import { createProduct, updateProduct, deleteProduct } from "@/app/actions/products";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import {
  Package,
  Plus,
  Search,
  X,
  Save,
  AlertCircle,
  Pencil,
  Trash2,
  Wind,
  Stethoscope,
  Thermometer,
  Layers,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// ── Category config ──────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    key: "MASCARILLA",
    label: "Mascarilla",
    color: "bg-violet-500/10 text-violet-500 border-violet-500/20",
    activeFilter: "bg-violet-500/20 text-violet-500 border-violet-500",
    icon: Wind,
  },
  {
    key: "CPAP",
    label: "CPAP",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    activeFilter: "bg-blue-500/20 text-blue-500 border-blue-500",
    icon: Stethoscope,
  },
  {
    key: "TUBO_CALEFACCIONADO",
    label: "Tubo Calefaccionado",
    color: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    activeFilter: "bg-amber-500/20 text-amber-500 border-amber-500",
    icon: Thermometer,
  },
  {
    key: "OTROS",
    label: "Otros",
    color: "bg-slate-500/10 text-slate-500 border-slate-500/20",
    activeFilter: "bg-slate-500/20 text-slate-500 border-slate-500",
    icon: Layers,
  },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

function getCategoryConfig(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[3];
}

// ── Types ────────────────────────────────────────────────────────────────────
type Product = {
  id: string;
  sku: string | null;
  brand: string | null;
  name: string;
  description: string | null;
  unit_price: number;
  current_stock: number;
  category: CategoryKey;
};

type ModalMode = "create" | "edit";

const EMPTY_FORM = {
  sku: "",
  brand: "",
  name: "",
  description: "",
  unit_price: "",
  current_stock: "",
  category: "OTROS" as CategoryKey,
};

export default function ProductsPage() {
  const [supabase] = useState(() => createClient());
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("category")
      .order("name");
    if (error) setError(error.message);
    else setProducts(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchCat = filterCategory === "ALL" || p.category === filterCategory;
    return matchSearch && matchCat;
  });

  // ── Category counts ───────────────────────────────────────────────────────
  const counts = CATEGORIES.reduce<Record<string, number>>((acc, cat) => {
    acc[cat.key] = products.filter((p) => p.category === cat.key).length;
    return acc;
  }, {});

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setModalMode("create");
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowModal(true);
  }

  function openEdit(product: Product) {
    setModalMode("edit");
    setEditingProduct(product);
    setForm({
      sku: product.sku ?? "",
      brand: product.brand ?? "",
      name: product.name,
      description: product.description ?? "",
      unit_price: String(product.unit_price),
      current_stock: String(product.current_stock),
      category: product.category,
    });
    setError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function handleDelete(product: Product) {
    if (!window.confirm(`¿Seguro que deseas eliminar "${product.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setLoading(true);
    setError(null);

    const res = await deleteProduct(product.id);
    if (!res.ok) {
      setError(res.error);
    } else {
      await fetchProducts();
    }
    setLoading(false);
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      sku: form.sku || null,
      brand: form.brand,
      name: form.name,
      description: form.description || null,
      unit_price: parseFloat(form.unit_price),
      current_stock: parseInt(form.current_stock),
      category: form.category,
    };

    if (modalMode === "create") {
      const res = await createProduct(payload);
      if (!res.ok) { setError(res.error); setSaving(false); return; }
    } else {
      if (!editingProduct) { setSaving(false); return; }
      const res = await updateProduct(editingProduct.id, payload);
      if (!res.ok) { setError(res.error); setSaving(false); return; }
    }

    closeModal();
    fetchProducts();
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bodega</h1>
          <p className="text-muted-foreground mt-1">Gestiona el inventario activo y el catálogo</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Añadir a Bodega
        </Button>
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = filterCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setFilterCategory(isActive ? "ALL" : cat.key)}
              className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                isActive
                  ? cat.activeFilter
                  : "bg-card text-card-foreground hover:bg-muted/50 border-border"
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                isActive ? "bg-current/10" : "bg-muted"
              }`}>
                <Icon className={`w-5 h-5 ${isActive ? "" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className={`text-xs font-semibold ${isActive ? "" : "text-muted-foreground"}`}>
                  {cat.label}
                </p>
                <p className={`text-xl font-bold ${isActive ? "" : ""}`}>
                  {counts[cat.key] ?? 0}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search + active filter label */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {filterCategory !== "ALL" && (
          <Button
            variant="ghost"
            onClick={() => setFilterCategory("ALL")}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
            Limpiar filtro
          </Button>
        )}
      </div>

      {error && !showModal && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Precio Unit.</TableHead>
                <TableHead className="text-center">Stock</TableHead>
                <TableHead className="text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">No se encontraron productos.</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((product) => {
                  const cat = getCategoryConfig(product.category);
                  const CatIcon = cat.icon;
                  return (
                    <TableRow key={product.id} className="group">
                      <TableCell className="font-mono text-muted-foreground">
                        {product.sku || "—"}
                      </TableCell>
                      <TableCell>
                        {product.brand || "—"}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{product.name}</p>
                        {product.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">
                            {product.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${cat.color}`}>
                          <CatIcon className="w-3.5 h-3.5" />
                          {cat.label}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {Number(product.unit_price).toLocaleString("es-CL", {
                          style: "currency",
                          currency: "CLP",
                        })}
                      </TableCell>
                      <TableCell className="text-center">
                        <div
                          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${
                            product.current_stock <= 5
                              ? "bg-destructive/10 text-destructive border border-destructive/20"
                              : product.current_stock <= 20
                              ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          }`}
                        >
                          {product.current_stock}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(product)}
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(product)}
                            title="Eliminar"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {modalMode === "create" ? "Añadir a Bodega" : "Editar Ítem Bodega"}
            </DialogTitle>
            {modalMode === "edit" && editingProduct && (
              <p className="text-xs text-muted-foreground mt-1">
                ID: <span className="font-mono">{editingProduct.id.slice(0, 8)}…</span>
              </p>
            )}
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Category picker */}
            <div>
              <Label className="mb-2 block">Categoría *</Label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = form.category === cat.key;
                  return (
                    <button
                      type="button"
                      key={cat.key}
                      onClick={() => setForm({ ...form, category: cat.key })}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-left ${
                        isSelected
                          ? cat.activeFilter
                          : "bg-muted/30 border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SKU + Brand */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="MED-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand">Marca *</Label>
                <Input
                  id="brand"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  required
                  placeholder="ResMed, Philips..."
                />
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del Producto *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Mascarilla Nasal"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="Descripción del producto..."
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>

            {/* Price + Stock */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit_price">Precio (IVA incl.) *</Label>
                <Input
                  id="unit_price"
                  value={form.unit_price}
                  onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                  type="number"
                  step="1"
                  min="0"
                  required
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="current_stock">
                  {modalMode === "create" ? "Stock Inicial *" : "Stock Actual *"}
                </Label>
                <Input
                  id="current_stock"
                  value={form.current_stock}
                  onChange={(e) => setForm({ ...form, current_stock: e.target.value })}
                  type="number"
                  min="0"
                  required
                  placeholder="0"
                />
              </div>
            </div>

            {modalMode === "edit" && (
              <p className="text-xs text-amber-500 flex items-center gap-1.5 mt-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Ajustar el stock aquí no registra un movimiento. Usa el módulo de Movimientos para trazabilidad.
              </p>
            )}

            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" onClick={closeModal}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {modalMode === "create" ? "Guardar" : "Actualizar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
