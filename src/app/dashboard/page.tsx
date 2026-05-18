import { createClient } from "@/lib/supabase/server";
import {
  Package,
  ArrowDownUp,
  FileText,
  KeyRound,
  TrendingUp,
  ShoppingCart,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Fetch summary data
  const [productsRes, movementsRes, quotesRes, rentalsRes, salesRes] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase
      .from("inventory_movements")
      .select("id", { count: "exact", head: true }),
    supabase.from("quotes").select("id", { count: "exact", head: true }),
    supabase.from("rentals").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
    supabase.from("sales").select("total_amount, created_at").eq("status", "COMPLETED"),
  ]);

  // Fetch recent movements
  const { data: recentMovements } = await supabase
    .from("inventory_movements")
    .select(`
      id,
      type,
      quantity,
      notes,
      created_at,
      products (name)
    `)
    .order("created_at", { ascending: false })
    .limit(5);

  const salesData = salesRes.data ?? [];
  const now = new Date();
  const monthRevenue = salesData
    .filter((s) => {
      const d = new Date(s.created_at ?? "");
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, s) => sum + Number(s.total_amount), 0);

  const stats = [
    {
      label: "Productos",
      value: productsRes.count ?? 0,
      icon: Package,
      color: "from-blue-500 to-blue-600",
      shadow: "shadow-blue-500/20",
    },
    {
      label: "Movimientos",
      value: movementsRes.count ?? 0,
      icon: ArrowDownUp,
      color: "from-emerald-500 to-emerald-600",
      shadow: "shadow-emerald-500/20",
    },
    {
      label: "Cotizaciones",
      value: quotesRes.count ?? 0,
      icon: FileText,
      color: "from-violet-500 to-violet-600",
      shadow: "shadow-violet-500/20",
    },
    {
      label: "Arriendos Activos",
      value: rentalsRes.count ?? 0,
      icon: KeyRound,
      color: "from-cyan-500 to-blue-500",
      shadow: "shadow-cyan-500/20",
    },
    {
      label: "Ventas del Mes",
      value: monthRevenue.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }),
      icon: ShoppingCart,
      color: "from-emerald-500 to-teal-600",
      shadow: "shadow-emerald-500/20",
    },
    {
      label: "Stock Bajo",
      value: 0,
      icon: TrendingUp,
      color: "from-amber-500 to-orange-500",
      shadow: "shadow-amber-500/20",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Resumen general de tu organización
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="relative overflow-hidden group hover:bg-muted/50 transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <div
                className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-md ${stat.shadow}`}
              >
                <stat.icon className="w-4 h-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
            {/* Decorative gradient */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </Card>
        ))}
      </div>

      {/* Recent Movements */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Movimientos Recientes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {(!recentMovements || recentMovements.length === 0) ? (
              <div className="px-6 py-12 text-center">
                <ArrowDownUp className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">
                  No hay movimientos registrados aún.
                </p>
                <p className="text-muted-foreground/70 text-xs mt-1">
                  Agrega productos y registra entradas o salidas para verlos aquí.
                </p>
              </div>
            ) : (
              recentMovements.map((mov) => (
                <div
                  key={mov.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors"
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      mov.type === "IN"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    <ArrowDownUp className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {(mov.products as unknown as { name: string } | null)?.name ?? "Producto"}
                    </p>
                    <p className="text-xs text-muted-foreground">{mov.notes || "Sin notas"}</p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-sm font-semibold ${
                        mov.type === "IN"
                          ? "text-emerald-500"
                          : "text-destructive"
                      }`}
                    >
                      {mov.type === "IN" ? "+" : "-"}
                      {mov.quantity}
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(mov.created_at).toLocaleDateString("es-CL")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
