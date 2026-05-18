"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useUserRole } from "@/components/RoleProvider";
import { hasMinRole } from "@/lib/roles";
import { friendlyError } from "@/lib/errors";
import {
  Wallet,
  Plus,
  Save,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  CalendarDays,
  Filter,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CLP = (n: number) =>
  Number(n).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

const EXPENSE_CATEGORIES: Record<string, string> = {
  COMPRA_INSUMOS: "Compra de Insumos",
  SERVICIOS: "Servicios (luz, agua, etc.)",
  SUELDOS: "Sueldos",
  MANTENCION: "Mantención de Equipos",
  OTROS: "Otros Gastos",
};

type CashPeriod = {
  id: string;
  period_date: string;
  opening_balance: number;
  notes: string | null;
};

type CashTransaction = {
  id: string;
  type: "INCOME" | "EXPENSE";
  category: string;
  amount: number;
  description: string | null;
  reference_type: string | null;
  transaction_date: string;
  created_at: string;
};

export default function CashboxPage() {
  const [supabase] = useState(() => createClient());
  const { profile } = useUserRole();
  const isAdmin = profile ? hasMinRole(profile.role, "ADMIN") : false;

  const [todayPeriod, setTodayPeriod] = useState<CashPeriod | null>(null);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<CashTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showOpenCash, setShowOpenCash] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingNotes, setOpeningNotes] = useState("");

  // Expense form
  const [expCategory, setExpCategory] = useState("OTROS");
  const [expAmount, setExpAmount] = useState("");
  const [expDesc, setExpDesc] = useState("");

  // Chart filter
  const [chartMonth, setChartMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const todayStr = new Date().toISOString().split("T")[0];

  const fetchData = useCallback(async () => {
    setLoading(true);
    // Today's period
    const { data: period } = await supabase
      .from("cash_periods")
      .select("*")
      .eq("period_date", todayStr)
      .maybeSingle();
    setTodayPeriod(period);

    // Today's transactions
    const { data: txns } = await supabase
      .from("cash_transactions")
      .select("*")
      .eq("transaction_date", todayStr)
      .order("created_at", { ascending: false });
    setTransactions(txns ?? []);

    // All transactions for chart (current month by default)
    const [year, month] = chartMonth.split("-");
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(Number(year), Number(month), 0).toISOString().split("T")[0];

    const { data: allTxns } = await supabase
      .from("cash_transactions")
      .select("*")
      .gte("transaction_date", startDate)
      .lte("transaction_date", endDate)
      .order("transaction_date", { ascending: true });
    setAllTransactions(allTxns ?? []);

    setLoading(false);
  }, [supabase, todayStr, chartMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Computed values ──────────────────────────────────────────────────
  const todayIncome = transactions.filter(t => t.type === "INCOME").reduce((s, t) => s + Number(t.amount), 0);
  const todayExpenses = transactions.filter(t => t.type === "EXPENSE").reduce((s, t) => s + Number(t.amount), 0);
  const openBal = todayPeriod ? Number(todayPeriod.opening_balance) : 0;
  const currentBalance = openBal + todayIncome - todayExpenses;

  // Monthly chart data
  const chartData = useMemo(() => {
    const byDay: Record<string, { income: number; expense: number }> = {};
    allTransactions.forEach(t => {
      const d = t.transaction_date;
      if (!byDay[d]) byDay[d] = { income: 0, expense: 0 };
      if (t.type === "INCOME") byDay[d].income += Number(t.amount);
      else byDay[d].expense += Number(t.amount);
    });
    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));
  }, [allTransactions]);

  const monthIncome = allTransactions.filter(t => t.type === "INCOME").reduce((s, t) => s + Number(t.amount), 0);
  const monthExpenses = allTransactions.filter(t => t.type === "EXPENSE").reduce((s, t) => s + Number(t.amount), 0);

  // Chart bar rendering
  const maxVal = Math.max(...chartData.map(d => Math.max(d.income, d.expense)), 1);

  // ── Open cash ────────────────────────────────────────────────────────
  async function handleOpenCash(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("No autenticado."); setSaving(false); return; }
    const { data: prof } = await supabase.from("users").select("organization_id").eq("id", user.id).single();
    if (!prof) { setError("Perfil no encontrado."); setSaving(false); return; }

    const { error: err } = await supabase.from("cash_periods").upsert({
      organization_id: prof.organization_id,
      period_date: todayStr,
      opening_balance: parseFloat(openingBalance),
      notes: openingNotes || null,
      created_by: user.id,
    }, { onConflict: "organization_id,period_date" });

    if (err) setError(friendlyError(err.message));
    else { setShowOpenCash(false); setOpeningBalance(""); setOpeningNotes(""); await fetchData(); }
    setSaving(false);
  }

  // ── Register expense ─────────────────────────────────────────────────
  async function handleExpense(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("No autenticado."); setSaving(false); return; }
    const { data: prof } = await supabase.from("users").select("organization_id").eq("id", user.id).single();
    if (!prof) { setError("Perfil no encontrado."); setSaving(false); return; }

    const { error: err } = await supabase.from("cash_transactions").insert({
      organization_id: prof.organization_id,
      type: "EXPENSE",
      category: expCategory,
      amount: parseFloat(expAmount),
      description: expDesc || null,
      reference_type: "MANUAL",
      transaction_date: todayStr,
      created_by: user.id,
    });

    if (err) setError(friendlyError(err.message));
    else { setShowExpense(false); setExpAmount(""); setExpDesc(""); setExpCategory("OTROS"); await fetchData(); }
    setSaving(false);
  }

  // ── Month options for filter ─────────────────────────────────────────
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
      opts.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return opts;
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Caja</h1>
          <p className="text-muted-foreground mt-1">Control de ingresos y egresos del día</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setOpeningBalance(String(todayPeriod?.opening_balance ?? "")); setShowOpenCash(true); }} className="gap-2">
              <Wallet className="w-4 h-4" />
              {todayPeriod ? "Editar Apertura" : "Abrir Caja"}
            </Button>
            <Button onClick={() => { setError(null); setShowExpense(true); }} className="gap-2">
              <Plus className="w-4 h-4" />
              Registrar Egreso
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {/* Status banner */}
      {!todayPeriod && !loading && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm flex items-center gap-3">
          <Wallet className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold">Caja no abierta hoy</p>
            <p className="text-xs text-amber-500/70 mt-0.5">
              {isAdmin ? "Haz clic en \"Abrir Caja\" para definir el saldo inicial del día." : "Un administrador debe abrir la caja para el día de hoy."}
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saldo Actual</p>
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
          </div>
          <p className={`text-3xl font-bold ${currentBalance >= 0 ? "text-emerald-500" : "text-destructive"}`}>
            {loading ? "—" : CLP(currentBalance)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Apertura: {loading ? "—" : CLP(openBal)}</p>
        </Card>

        <Card className="p-5 bg-emerald-500/5 border-emerald-500/20">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-emerald-500 uppercase tracking-wider">Ingresos Hoy</p>
            <ArrowUpRight className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-500">{loading ? "—" : CLP(todayIncome)}</p>
          <p className="text-xs text-emerald-500/60 mt-1">{transactions.filter(t => t.type === "INCOME").length} transacciones</p>
        </Card>

        <Card className="p-5 bg-red-500/5 border-red-500/20">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-red-400 uppercase tracking-wider">Egresos Hoy</p>
            <ArrowDownRight className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-2xl font-bold text-red-400">{loading ? "—" : CLP(todayExpenses)}</p>
          <p className="text-xs text-red-400/60 mt-1">{transactions.filter(t => t.type === "EXPENSE").length} transacciones</p>
        </Card>

        <Card className="p-5 bg-violet-500/5 border-violet-500/20">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-violet-400 uppercase tracking-wider">Balance del Mes</p>
            <TrendingUp className="w-5 h-5 text-violet-400" />
          </div>
          <p className="text-2xl font-bold text-violet-400">{loading ? "—" : CLP(monthIncome - monthExpenses)}</p>
          <p className="text-xs text-violet-400/60 mt-1">{CLP(monthIncome)} ing. / {CLP(monthExpenses)} egr.</p>
        </Card>
      </div>

      {/* Monthly Chart */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Flujo de Caja Mensual</h2>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={chartMonth} onValueChange={(val) => val && setChartMonth(val)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-6 mb-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500" /> Ingresos</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-400" /> Egresos</span>
        </div>

        {chartData.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Sin datos para este período
          </div>
        ) : (
          <div className="flex items-end gap-1 h-48 overflow-x-auto pb-2">
            {chartData.map(d => (
              <div key={d.date} className="flex flex-col items-center gap-1 min-w-[28px] flex-1" title={`${new Date(d.date + "T12:00:00").toLocaleDateString("es-CL")}\nIng: ${CLP(d.income)}\nEgr: ${CLP(d.expense)}`}>
                <div className="flex gap-0.5 items-end h-36 w-full justify-center">
                  <div className="w-1/2 max-w-[10px] rounded-t bg-emerald-500 transition-all" style={{ height: `${(d.income / maxVal) * 100}%`, minHeight: d.income > 0 ? "2px" : "0" }} />
                  <div className="w-1/2 max-w-[10px] rounded-t bg-red-400 transition-all" style={{ height: `${(d.expense / maxVal) * 100}%`, minHeight: d.expense > 0 ? "2px" : "0" }} />
                </div>
                <span className="text-[10px] text-muted-foreground">{new Date(d.date + "T12:00:00").getDate()}</span>
              </div>
            ))}
          </div>
        )}

        {/* Monthly totals */}
        <div className="flex gap-6 mt-4 pt-4 border-t border-border/50 text-sm">
          <div><span className="text-muted-foreground">Total Ingresos:</span> <span className="font-semibold text-emerald-500">{CLP(monthIncome)}</span></div>
          <div><span className="text-muted-foreground">Total Egresos:</span> <span className="font-semibold text-red-400">{CLP(monthExpenses)}</span></div>
          <div><span className="text-muted-foreground">Neto:</span> <span className={`font-semibold ${monthIncome - monthExpenses >= 0 ? "text-emerald-500" : "text-destructive"}`}>{CLP(monthIncome - monthExpenses)}</span></div>
        </div>
      </Card>

      {/* Today's Transactions */}
      <Card>
        <div className="px-6 py-4 border-b border-border/50">
          <h2 className="text-lg font-semibold">Transacciones de Hoy</h2>
        </div>
        <div className="divide-y divide-border">
          {loading ? (
            <div className="px-6 py-12 text-center">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">No hay transacciones registradas hoy.</p>
            </div>
          ) : (
            transactions.map(txn => (
              <div key={txn.id} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${txn.type === "INCOME" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-400"}`}>
                  {txn.type === "INCOME" ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{txn.description || (txn.type === "INCOME" ? "Ingreso" : "Egreso")}</p>
                  <p className="text-xs text-muted-foreground">
                    {txn.type === "INCOME" ? "Ingreso" : EXPENSE_CATEGORIES[txn.category] ?? txn.category}
                    {txn.reference_type && txn.reference_type !== "MANUAL" && ` · ${txn.reference_type === "SALE" ? "Venta" : "Arriendo"}`}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold ${txn.type === "INCOME" ? "text-emerald-500" : "text-red-400"}`}>
                    {txn.type === "INCOME" ? "+" : "-"}{CLP(txn.amount)}
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(txn.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Open Cash Modal */}
      <Dialog open={showOpenCash} onOpenChange={setShowOpenCash}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{todayPeriod ? "Editar Apertura de Caja" : "Abrir Caja del Día"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleOpenCash} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Saldo Inicial ($) *</Label>
              <Input type="number" step="1" min="0" required value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={openingNotes} onChange={e => setOpeningNotes(e.target.value)} rows={2} placeholder="Observaciones..." className="resize-none" />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowOpenCash(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                {todayPeriod ? "Actualizar" : "Abrir Caja"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Expense Modal */}
      <Dialog open={showExpense} onOpenChange={setShowExpense}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Egreso</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleExpense} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Categoría *</Label>
              <Select value={expCategory} onValueChange={(val) => val && setExpCategory(val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Monto ($) *</Label>
              <Input type="number" step="1" min="1" required value={expAmount} onChange={e => setExpAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea value={expDesc} onChange={e => setExpDesc(e.target.value)} rows={2} placeholder="Detalle del gasto..." className="resize-none" />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowExpense(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
