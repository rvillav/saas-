"use client";

import { createExpense, deleteExpense } from "@/app/actions/expenses";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useUserRole } from "@/components/RoleProvider";
import { hasMinRole } from "@/lib/roles";
import { friendlyError } from "@/lib/errors";
import {
  TrendingDown,
  Plus,
  Trash2,
  Save,
  AlertCircle,
  Search,
  CalendarDays,
  Filter,
  DollarSign,
  ArrowDownRight,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CLP = (n: number) =>
  Number(n).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

const EXPENSE_CATEGORIES: Record<string, string> = {
  COMPRA_INSUMOS: "Compra de Insumos",
  SERVICIOS: "Servicios (Luz, agua, etc.)",
  SUELDOS: "Sueldos y Honorarios",
  MANTENCION: "Mantención de Equipos",
  OTROS: "Otros Gastos",
};

type ExpenseTransaction = {
  id: string;
  type: "INCOME" | "EXPENSE";
  category: string;
  amount: number;
  description: string | null;
  reference_type: string | null;
  transaction_date: string;
  created_at: string;
};

export default function ExpensesPage() {
  const [supabase] = useState(() => createClient());
  const { profile } = useUserRole();
  const isAdmin = profile ? hasMinRole(profile.role, "ADMIN") : false;

  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1); // First day of the month
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  // Form State
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("OTROS");
  const [description, setDescription] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().split("T")[0]);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("cash_transactions")
      .select("*")
      .eq("type", "EXPENSE")
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (categoryFilter !== "ALL") {
      query = query.eq("category", categoryFilter);
    }

    const { data, error } = await query;
    if (error) setError(friendlyError(error.message));
    else setExpenses((data as ExpenseTransaction[]) ?? []);
    setLoading(false);
  }, [supabase, dateFrom, dateTo, categoryFilter]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const resetForm = () => {
    setAmount("");
    setCategory("OTROS");
    setDescription("");
    setTransactionDate(new Date().toISOString().split("T")[0]);
    setError(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amtNum = parseInt(amount);
    if (isNaN(amtNum) || amtNum <= 0) {
      setError("El monto debe ser un número entero mayor a 0.");
      return;
    }
    if (!description.trim()) {
      setError("La descripción es obligatoria.");
      return;
    }

    setSaving(true);
    setError(null);

    const res = await createExpense({
      category: category as any,
      amount: amtNum,
      description: description.trim(),
      transaction_date: transactionDate,
    });

    if (!res.ok) {
      setError(res.error);
    } else {
      setShowModal(false);
      fetchExpenses();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setError(null);

    const res = await deleteExpense(id);

    if (!res.ok) {
      setError(res.error);
    } else {
      setShowDeleteModal(null);
      fetchExpenses();
    }
    setSaving(false);
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (!search) return true;
      const term = search.toLowerCase();
      return (
        (e.description && e.description.toLowerCase().includes(term)) ||
        CLP(e.amount).toLowerCase().includes(term) ||
        (EXPENSE_CATEGORIES[e.category] && EXPENSE_CATEGORIES[e.category].toLowerCase().includes(term))
      );
    });
  }, [expenses, search]);

  // Compute metrics for the current visible date range
  const totalOutflow = useMemo(() => {
    return filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);
  }, [filteredExpenses]);

  const todayOutflow = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    return expenses
      .filter((e) => e.transaction_date === todayStr)
      .reduce((s, e) => s + Number(e.amount), 0);
  }, [expenses]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gastos y Pagos</h1>
          <p className="text-muted-foreground mt-1">
            Registro comercial de egresos y pagos de servicios vinculados a caja
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Registrar Egreso
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 bg-red-500/5 border-red-500/20">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-red-400 uppercase tracking-wider">Gastos en Rango Filtrado</p>
            <TrendingDown className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-2xl font-bold text-red-400">{CLP(totalOutflow)}</p>
          <p className="text-xs text-red-400/60 mt-1">{filteredExpenses.length} egresos registrados</p>
        </Card>

        <Card className="p-5 bg-amber-500/5 border-amber-500/20">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-amber-400 uppercase tracking-wider">Egresos de Hoy</p>
            <ArrowDownRight className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400">{CLP(todayOutflow)}</p>
          <p className="text-xs text-amber-400/60 mt-1">Para la fecha {new Date().toLocaleDateString("es-CL")}</p>
        </Card>

        <Card className="p-5 bg-indigo-500/5 border-indigo-500/20">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-indigo-400 uppercase tracking-wider">Caja General</p>
            <DollarSign className="w-5 h-5 text-indigo-400" />
          </div>
          <p className="text-sm font-semibold text-muted-foreground mt-1">Actualizado en tiempo real</p>
          <p className="text-xs text-indigo-400/60 mt-2">
            Afecta el balance neto del resumen de caja diario.
          </p>
        </Card>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-end gap-3 bg-muted/10 p-4 rounded-2xl border">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descripción o monto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Categoría</Label>
          <Select value={categoryFilter} onValueChange={(val) => setCategoryFilter(val || "ALL")}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las categorías</SelectItem>
              {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Desde</Label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="pl-9 w-40 [color-scheme:dark]"
              />
            </div>
          </div>
          <span className="text-muted-foreground text-sm self-end mb-2">→</span>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="pl-9 w-40 [color-scheme:dark]"
              />
            </div>
          </div>
        </div>
      </div>

      {error && !showModal && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* List Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                {isAdmin && <TableHead className="text-center w-20">Acción</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 5 : 4} className="h-32 text-center">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 5 : 4} className="h-32 text-center">
                    <TrendingDown className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-muted-foreground text-sm">
                      No se encontraron egresos o pagos en este período.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredExpenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(expense.transaction_date + "T12:00:00").toLocaleDateString("es-CL")}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {EXPENSE_CATEGORIES[expense.category] ?? expense.category}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-sm truncate">
                      {expense.description || "—"}
                    </TableCell>
                    <TableCell className="text-right font-bold text-red-400">
                      -{CLP(expense.amount)}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowDeleteModal(expense.id)}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Eliminar registro"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Modal - Registrar Egreso */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Gasto o Pago</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-2">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="category">Categoría *</Label>
              <Select value={category} onValueChange={(val) => setCategory(val || "OTROS")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="amount">Monto ($) *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="1"
                  min="1"
                  required
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transactionDate">Fecha Transacción *</Label>
                <Input
                  id="transactionDate"
                  type="date"
                  required
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className="[color-scheme:dark]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Detalle / Proveedor *</Label>
              <Textarea
                id="description"
                rows={2}
                placeholder="Indica el motivo del gasto o destinatario del pago..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="resize-none"
                required
              />
            </div>

            <DialogFooter>
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

      {/* Modal - Confirmar Eliminación */}
      <Dialog open={!!showDeleteModal} onOpenChange={(open) => !open && setShowDeleteModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4 mt-2">
              <Trash2 className="w-6 h-6 text-destructive" />
            </div>
            <DialogTitle className="text-center">Confirmar Eliminación</DialogTitle>
            <DialogDescription className="text-center pt-1">
              ¿Estás seguro de que deseas eliminar este registro de egreso? Esta acción modificará el saldo en el resumen de caja general. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-center mt-4">
            <Button variant="outline" onClick={() => setShowDeleteModal(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => showDeleteModal && handleDelete(showDeleteModal)}
              disabled={saving}
              variant="destructive"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Eliminar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
