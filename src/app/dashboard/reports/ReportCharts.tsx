"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CategoryKey = "MASCARILLA" | "CPAP" | "TUBO_CALEFACCIONADO" | "OTROS";

export type ProductStat = { name: string; units: number; revenue: number };

export type CategoryChartData = {
  units: number;
  revenue: number;
  products: ProductStat[];
  label: string;
  color: string;
};

export type MonthlyPoint = {
  month: number;
  label: string;
  total: number;
  MASCARILLA: number;
  CPAP: number;
  TUBO_CALEFACCIONADO: number;
  OTROS: number;
};

export type CategoryDef = { key: CategoryKey; label: string; color: string };

interface ReportChartsProps {
  monthlyCategoryStats: Record<CategoryKey, CategoryChartData>;
  monthlyTimeSeries: MonthlyPoint[];
  categories: CategoryDef[];
  year: number;
  monthLabel: string;
}

const fmt = (n: number) =>
  n.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });

const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

const CHART_STYLE = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "12px",
  fontSize: "12px",
};

// recharts 3.x: ValueType = number | string | ReadonlyArray<number | string>
type RechartsValue = number | string | ReadonlyArray<number | string> | undefined;

interface TooltipEntry {
  name?: string | number;
  // Match recharts Payload.value which is ValueType | undefined
  value?: RechartsValue;
  color?: string;
}

// Custom tooltip — typed loosely so recharts can inject its own payload type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip(props: any) {
  const { active, payload, label } = props as {
    active?: boolean;
    payload?: ReadonlyArray<TooltipEntry>;
    label?: string | number;
  };
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-3 shadow-2xl min-w-[160px]">
      <p className="text-white font-semibold mb-2 text-sm">{label}</p>
      {payload.map((entry, i) => {
        const val = Array.isArray(entry.value)
          ? Number(entry.value[0] ?? 0)
          : Number(entry.value ?? 0);
        return (
          <div key={i} className="flex items-center gap-2 text-xs mt-1">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: String(entry.color ?? "") }}
            />
            <span className="text-slate-400">{entry.name}:</span>
            <span className="text-white font-medium">{fmt(val)}</span>
          </div>
        );
      })}
    </div>
  );
}

// Safe formatter: recharts 3.x passes ValueType | undefined
const moneyFormatter = (v: RechartsValue): string => {
  const n = Array.isArray(v) ? Number(v[0] ?? 0) : Number(v ?? 0);
  return fmt(n);
};

export function ReportCharts({
  monthlyCategoryStats,
  monthlyTimeSeries,
  categories,
  year,
  monthLabel,
}: ReportChartsProps) {
  const pieData = categories
    .map((c) => ({
      name: c.label,
      value: monthlyCategoryStats[c.key]?.revenue ?? 0,
      color: c.color,
    }))
    .filter((d) => d.value > 0);

  const barData = categories.map((c) => ({
    name: c.label,
    Ingresos: monthlyCategoryStats[c.key]?.revenue ?? 0,
    color: c.color,
  }));

  const hasMonthData = pieData.length > 0;
  const hasYearData = monthlyTimeSeries.some((p) => p.total > 0);

  return (
    <div className="space-y-6">
      {/* ── Pie + Bar de categorías ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Distribución por categoría — {monthLabel} {year}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!hasMonthData ? (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                Sin ventas registradas en este período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={65}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.color}
                        opacity={0.9}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={moneyFormatter}
                    contentStyle={CHART_STYLE}
                    labelStyle={{ color: "#fff" }}
                    itemStyle={{ color: "#94a3b8" }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                        {value}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Ingresos por categoría — {monthLabel} {year}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={barData}
                margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={fmtShort}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip content={(props: any) => <CustomTooltip {...props} />} />
                <Bar dataKey="Ingresos" radius={[6, 6, 0, 0]}>
                  {barData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Top productos por categoría ──────────────────────────────── */}
      {hasMonthData && (
        <div>
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">
            Top productos por categoría — {monthLabel} {year}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {categories.map((cat) => {
              const products = (
                monthlyCategoryStats[cat.key]?.products ?? []
              )
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 5);

              return (
                <Card key={cat.key}>
                  <CardHeader className="pb-2">
                    <CardTitle
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: cat.color }}
                    >
                      {cat.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    {products.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        Sin ventas
                      </p>
                    ) : (
                      <ResponsiveContainer
                        width="100%"
                        height={products.length * 34 + 8}
                      >
                        <BarChart
                          layout="vertical"
                          data={products}
                          margin={{ top: 0, right: 4, left: 0, bottom: 0 }}
                        >
                          <XAxis type="number" hide />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={90}
                            tick={{ fill: "#94a3b8", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            formatter={moneyFormatter}
                            contentStyle={CHART_STYLE}
                            itemStyle={{ color: "#94a3b8" }}
                          />
                          <Bar
                            dataKey="revenue"
                            name="Ingresos"
                            fill={cat.color}
                            radius={[0, 4, 4, 0]}
                            barSize={18}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Serie de tiempo anual ────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Tendencia de ventas mensuales — {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasYearData ? (
            <div className="h-[320px] flex items-center justify-center text-muted-foreground text-sm">
              Sin datos de ventas para {year}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart
                data={monthlyTimeSeries}
                margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
              >
                <defs>
                  {categories.map((c) => (
                    <linearGradient
                      key={c.key}
                      id={`grad-${c.key}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={c.color}
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor={c.color}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={fmtShort}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip content={(props: any) => <CustomTooltip {...props} />} />
                <Legend
                  wrapperStyle={{ paddingTop: "16px" }}
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                      {value}
                    </span>
                  )}
                />
                {categories.map((c) => (
                  <Area
                    key={c.key}
                    type="monotone"
                    dataKey={c.key}
                    name={c.label}
                    stroke={c.color}
                    fill={`url(#grad-${c.key})`}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
