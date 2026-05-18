"use client";

import { createMovement } from "@/app/actions/movements";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { useUserRole } from "@/components/RoleProvider";
import { hasMinRole } from "@/lib/roles";
import { friendlyError } from "@/lib/errors";
import {
  ArrowDownUp,
  Plus,
  X,
  Save,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Movement = {
  id: string;
  type: "IN" | "OUT";
  quantity: number;
  notes: string | null;
  created_at: string;
  products: { name: string } | null;
};

type Product = {
  id: string;
  name: string;
  current_stock: number;
};

export default function MovementsPage() {
  const [supabase] = useState(() => createClient());
  const { profile } = useUserRole();
  const canWrite = profile ? hasMinRole(profile.role, "USER") : false;
  const [movements, setMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [productId, setProductId] = useState<string>("");
  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [quantity, setQuantity] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory_movements")
      .select(`id, type, quantity, notes, created_at, products (name)`)
      .order("created_at", { ascending: false });

    if (error) setError(friendlyError(error.message));
    else setMovements((data as unknown as Movement[]) ?? []);
    setLoading(false);
  }, [supabase]);

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from("products")
      .select("id, name, current_stock")
      .order("name");
    setProducts(data ?? []);
  }, [supabase]);

  useEffect(() => {
    fetchMovements();
    fetchProducts();
  }, [fetchMovements, fetchProducts]);

  function resetForm() {
    setProductId("");
    setType("IN");
    setQuantity("");
    setNotes("");
    setError(null);
  }

  function openCreate() {
    resetForm();
    setShowModal(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) {
      setError("Por favor, selecciona un producto.");
      return;
    }
    if (!quantity || parseInt(quantity) <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }

    setSaving(true);
    setError(null);

    const res = await createMovement({
      product_id: productId,
      type,
      quantity: parseInt(quantity),
      notes: notes || null,
    });

    if (!res.ok) {
      setError(res.error);
      setSaving(false);
      return;
    }

    setShowModal(false);
    fetchMovements();
    fetchProducts();
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Movimientos</h1>
          <p className="text-muted-foreground mt-1">
            Registro de entradas y salidas de inventario
          </p>
        </div>
        {canWrite && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            Registrar Movimiento
          </Button>
        )}
      </div>

      {error && !showModal && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* List */}
      <Card>
        <div className="divide-y divide-border">
          {loading ? (
            <div className="px-6 py-12 text-center">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
            </div>
          ) : movements.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <ArrowDownUp className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No hay movimientos registrados.</p>
            </div>
          ) : (
            movements.map((mov) => (
              <div
                key={mov.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    mov.type === "IN"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {mov.type === "IN" ? (
                    <ArrowDownToLine className="w-5 h-5" />
                  ) : (
                    <ArrowUpFromLine className="w-5 h-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {mov.products?.name ?? "Producto eliminado"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {mov.notes || "Sin notas"}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`text-sm font-bold ${
                      mov.type === "IN" ? "text-emerald-500" : "text-destructive"
                    }`}
                  >
                    {mov.type === "IN" ? "+" : "-"}
                    {mov.quantity} uds
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(mov.created_at).toLocaleDateString("es-CL", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Registrar Movimiento</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label>Producto *</Label>
              <Select value={productId} onValueChange={(val) => setProductId(val || "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar producto..." />
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
                <Label>Tipo *</Label>
                <Select value={type} onValueChange={(val) => setType((val as "IN" | "OUT") || "IN")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">Entrada</SelectItem>
                    <SelectItem value="OUT">Salida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Cantidad *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  required
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Detalles del movimiento..."
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
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
                Registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
