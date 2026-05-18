"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import {
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  CalendarDays,
  Filter,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CLP = (n: number) =>
  Number(n).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

const CATEGORIES: Record<string, string> = {
  COMPRA_INSUMOS: "Compra de Insumos",
  SERVICIOS: "Servicios",
  SUELDOS: "Sueldos",
  MANTENCION: "Mantención",
  OTROS: "Otros",
  VENTA: "Venta",
  ARRIENDO: "Arriendo",
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

export default function CashTransactionsPage() {
  const [supabase] = useState(() => createClient());
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("cash_transactions")
      .select("*")
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (typeFilter !== "ALL") query = query.eq("type", typeFilter);

    const { data } = await query;
    setTransactions(data ?? []);
    setLoading(false);
  }, [supabase, dateFrom, dateTo, typeFilter]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const filtered = transactions.filter(t => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      (t.description?.toLowerCase().includes(term)) ||
      (t.category?.toLowerCase().includes(term)) ||
      CLP(t.amount).toLowerCase().includes(term)
    );
  });

  const totalIncome = filtered.filter(t => t.type === "INCOME").reduce((s, t) => s + Number(t.amount), 0);
  const totalExpenses = filtered.filter(t => t.type === "EXPENSE").reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Movimientos de Caja</h1>
        <p className="text-muted-foreground mt-1">Historial completo de ingresos y egresos</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por descripción..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={(val) => val && setTypeFilter(val)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="INCOME">Ingresos</SelectItem>
              <SelectItem value="EXPENSE">Egresos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40 [color-scheme:dark]" />
          <span className="text-muted-foreground text-sm">→</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40 [color-scheme:dark]" />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
          <p className="text-xs text-emerald-500 font-medium">Ingresos</p>
          <p className="text-xl font-bold text-emerald-500 mt-1">{CLP(totalIncome)}</p>
        </Card>
        <Card className="p-4 bg-red-500/5 border-red-500/20">
          <p className="text-xs text-red-400 font-medium">Egresos</p>
          <p className="text-xl font-bold text-red-400 mt-1">{CLP(totalExpenses)}</p>
        </Card>
        <Card className="p-4 bg-blue-500/5 border-blue-500/20">
          <p className="text-xs text-blue-400 font-medium">Neto</p>
          <p className={`text-xl font-bold mt-1 ${totalIncome - totalExpenses >= 0 ? "text-blue-400" : "text-destructive"}`}>{CLP(totalIncome - totalExpenses)}</p>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-muted-foreground text-sm">No hay transacciones para este período.</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(txn => (
                  <TableRow key={txn.id}>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(txn.transaction_date + "T12:00:00").toLocaleDateString("es-CL")}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                        txn.type === "INCOME"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : "bg-red-500/10 text-red-400 border-red-500/20"
                      }`}>
                        {txn.type === "INCOME" ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {txn.type === "INCOME" ? "Ingreso" : "Egreso"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{CATEGORIES[txn.category] ?? txn.category}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{txn.description || "—"}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {txn.reference_type === "SALE" ? "Venta" : txn.reference_type === "RENTAL" ? "Arriendo" : "Manual"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-semibold ${txn.type === "INCOME" ? "text-emerald-500" : "text-red-400"}`}>
                        {txn.type === "INCOME" ? "+" : "-"}{CLP(txn.amount)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
