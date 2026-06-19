import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wind, Stethoscope, Thermometer, Layers, TrendingUp } from "lucide-react";
import { ReportCharts } from "./ReportCharts";
import { ReportFilters } from "./ReportFilters";
import type { CategoryDef, CategoryChartData, MonthlyPoint } from "./ReportCharts";

const CATEGORIES_DB = [
  { key: "MASCARILLA", label: "Mascarillas", icon: Wind, color: "#3b82f6" },
  { key: "CPAP", label: "CPAP", icon: Stethoscope, color: "#10b981" },
  { key: "TUBO_CALEFACCIONADO", label: "Tubos Calef.", icon: Thermometer, color: "#f59e0b" },
  { key: "OTROS", label: "Otros", icon: Layers, color: "#8b5cf6" },
] as const;

const MONTH_LABELS = [
  "Ene","Feb","Mar","Abr","May","Jun",
  "Jul","Ago","Sep","Oct","Nov","Dic",
];

const fmt = (n: number) =>
  n.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });

type SaleItem = {
  quantity: number;
  unit_price: number;
  products: { name: string; category: string } | null;
};

type SaleRow = {
  id: string;
  total_amount: number;
  created_at?: string;
  sale_items: SaleItem[] | null;
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const supabase = await createClient();

  const monthStart = new Date(year, month - 1, 1).toISOString();
  const monthEnd = new Date(year, month, 1).toISOString();
  const yearStart = new Date(year, 0, 1).toISOString();
  const yearEnd = new Date(year + 1, 0, 1).toISOString();

  const [{ data: monthlySales }, { data: yearlySales }] = await Promise.all([
    supabase
      .from("sales")
      .select(
        `id, total_amount,
         sale_items(quantity, unit_price, products(name, category))`
      )
      .eq("status", "COMPLETED")
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd),

    supabase
      .from("sales")
      .select(
        `id, total_amount, created_at,
         sale_items(quantity, unit_price, products(category))`
      )
      .eq("status", "COMPLETED")
      .gte("created_at", yearStart)
      .lt("created_at", yearEnd),
  ]);

  // ── Build monthly stats per category ────────────────────────────────────

  type ProductAccum = { name: string; units: number; revenue: number };
  type CatAccum = {
    units: number;
    revenue: number;
    products: Record<string, ProductAccum>;
  };

  const monthlyRaw: Record<string, CatAccum> = Object.fromEntries(
    CATEGORIES_DB.map((c) => [c.key, { units: 0, revenue: 0, products: {} }])
  );

  for (const sale of (monthlySales ?? []) as unknown as SaleRow[]) {
    for (const item of sale.sale_items ?? []) {
      const cat = item.products?.category ?? "OTROS";
      const name = item.products?.name ?? "Desconocido";
      const rev = item.quantity * item.unit_price;

      if (!monthlyRaw[cat]) continue;
      monthlyRaw[cat].units += item.quantity;
      monthlyRaw[cat].revenue += rev;

      if (!monthlyRaw[cat].products[name]) {
        monthlyRaw[cat].products[name] = { name, units: 0, revenue: 0 };
      }
      monthlyRaw[cat].products[name].units += item.quantity;
      monthlyRaw[cat].products[name].revenue += rev;
    }
  }

  const monthlyCategoryStats = Object.fromEntries(
    CATEGORIES_DB.map((c) => [
      c.key,
      {
        units: monthlyRaw[c.key].units,
        revenue: monthlyRaw[c.key].revenue,
        products: Object.values(monthlyRaw[c.key].products),
        label: c.label,
        color: c.color,
      } satisfies CategoryChartData,
    ])
  ) as Record<string, CategoryChartData>;

  // ── Build annual time series ─────────────────────────────────────────────

  const monthlyTimeSeries: MonthlyPoint[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: MONTH_LABELS[i],
    total: 0,
    MASCARILLA: 0,
    CPAP: 0,
    TUBO_CALEFACCIONADO: 0,
    OTROS: 0,
  }));

  for (const sale of (yearlySales ?? []) as unknown as SaleRow[]) {
    const idx = new Date(sale.created_at ?? "").getMonth();
    if (idx < 0 || idx > 11) continue;
    monthlyTimeSeries[idx].total += Number(sale.total_amount);

    for (const item of sale.sale_items ?? []) {
      const cat = item.products?.category ?? "OTROS";
      const rev = item.quantity * item.unit_price;
      const point = monthlyTimeSeries[idx] as unknown as Record<string, number>;
      if (cat in point) point[cat] += rev;
    }
  }

  // ── Annual totals ────────────────────────────────────────────────────────

  const annualTotals: Record<string, number> & { total: number } = {
    MASCARILLA: 0,
    CPAP: 0,
    TUBO_CALEFACCIONADO: 0,
    OTROS: 0,
    total: 0,
  };

  for (const row of monthlyTimeSeries) {
    annualTotals.total += row.total;
    for (const c of CATEGORIES_DB) {
      annualTotals[c.key] += (row as unknown as Record<string, number>)[c.key] ?? 0;
    }
  }

  const monthlyTotal = monthlySales
    ? (monthlySales as unknown as SaleRow[]).reduce(
        (s, r) => s + Number(r.total_amount),
        0
      )
    : 0;

  const categoryDefs: CategoryDef[] = CATEGORIES_DB.map((c) => ({
    key: c.key as CategoryDef["key"],
    label: c.label,
    color: c.color,
  }));

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-blue-400" />
            Reportes
          </h1>
          <p className="text-muted-foreground mt-1">
            Análisis mensual y anual de ventas por categoría
          </p>
        </div>
        <ReportFilters year={year} month={month} />
      </div>

      {/* ── Resumen mensual por categoría ──────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-base font-semibold text-white/80">
            Resumen mensual — {MONTH_LABELS[month - 1]} {year}
          </h2>
          <span className="text-sm text-muted-foreground">
            Total:{" "}
            <span className="text-white font-semibold">{fmt(monthlyTotal)}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {CATEGORIES_DB.map((cat) => {
            const stats = monthlyCategoryStats[cat.key];
            const topProducts = [...(stats.products)]
              .sort((a, b) => b.revenue - a.revenue)
              .slice(0, 4);

            return (
              <Card key={cat.key} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${cat.color}20` }}
                    >
                      <cat.icon
                        className="w-4 h-4"
                        style={{ color: cat.color }}
                      />
                    </div>
                    <CardTitle className="text-sm font-semibold leading-tight">
                      {cat.label}
                    </CardTitle>
                  </div>
                  <div className="mt-3">
                    <p className="text-2xl font-bold tracking-tight">
                      {fmt(stats.revenue)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {stats.units} unidad{stats.units !== 1 ? "es" : ""} vendida
                      {stats.units !== 1 ? "s" : ""}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  {topProducts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Sin ventas en este período
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {topProducts.map((p) => (
                        <div
                          key={p.name}
                          className="flex items-center justify-between gap-2"
                        >
                          <span
                            className="text-xs text-muted-foreground truncate"
                            title={p.name}
                          >
                            {p.name}
                          </span>
                          <span className="text-xs font-medium text-white/80 shrink-0">
                            {fmt(p.revenue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Gráficos ───────────────────────────────────────────────────── */}
      <ReportCharts
        monthlyCategoryStats={monthlyCategoryStats as Record<"MASCARILLA" | "CPAP" | "TUBO_CALEFACCIONADO" | "OTROS", CategoryChartData>}
        monthlyTimeSeries={monthlyTimeSeries}
        categories={categoryDefs}
        year={year}
        monthLabel={MONTH_LABELS[month - 1]}
      />

      {/* ── Resumen anual ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Resumen anual — {year}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">
                    Mes
                  </th>
                  {CATEGORIES_DB.map((c) => (
                    <th
                      key={c.key}
                      className="text-right px-4 py-3 font-medium"
                      style={{ color: c.color }}
                    >
                      {c.label}
                    </th>
                  ))}
                  <th className="text-right px-5 py-3 font-semibold text-white">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthlyTimeSeries.map((row, i) => {
                  const isCurrentMonth = i === month - 1;
                  return (
                    <tr
                      key={row.month}
                      className={`border-b border-border/20 transition-colors ${
                        isCurrentMonth
                          ? "bg-blue-500/5"
                          : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <td
                        className={`px-5 py-3 font-medium ${
                          isCurrentMonth ? "text-blue-400" : "text-white/70"
                        }`}
                      >
                        {row.label}
                        {isCurrentMonth && (
                          <span className="ml-2 text-xs text-blue-400/60">
                            ← actual
                          </span>
                        )}
                      </td>
                      {CATEGORIES_DB.map((c) => {
                        const val = (row as unknown as Record<string, number>)[c.key] ?? 0;
                        return (
                          <td
                            key={c.key}
                            className="text-right px-4 py-3 text-muted-foreground tabular-nums"
                          >
                            {val > 0 ? fmt(val) : "—"}
                          </td>
                        );
                      })}
                      <td className="text-right px-5 py-3 font-semibold text-white tabular-nums">
                        {row.total > 0 ? fmt(row.total) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-white/[0.04]">
                  <td className="px-5 py-3 font-bold text-white">
                    Total {year}
                  </td>
                  {CATEGORIES_DB.map((c) => (
                    <td
                      key={c.key}
                      className="text-right px-4 py-3 font-semibold tabular-nums"
                      style={{ color: c.color }}
                    >
                      {annualTotals[c.key] > 0
                        ? fmt(annualTotals[c.key])
                        : "—"}
                    </td>
                  ))}
                  <td className="text-right px-5 py-3 font-bold text-white tabular-nums">
                    {fmt(annualTotals.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
