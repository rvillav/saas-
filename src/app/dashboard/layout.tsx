"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signout } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import {
  Activity,
  LayoutDashboard,
  Package,
  ArrowDownUp,
  KeyRound,
  FileText,
  ShoppingCart,
  LogOut,
  Menu,
  X,
  Shield,
  Inbox,
  ChevronDown,
  Wallet,
  Receipt,
  BarChart3,
  Clock,
  TrendingUp,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  RoleProvider,
  useUserRole,
  RoleBadge,
} from "@/components/RoleProvider";
import type { AppRole } from "@/lib/roles";
import { hasMinRole } from "@/lib/roles";
import { CosmicBackground } from "@/components/CosmicBackground";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type NavLeaf = {
  kind: "leaf";
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  minRole?: AppRole;
};

type NavGroup = {
  kind: "group";
  label: string;
  icon: typeof LayoutDashboard;
  minRole?: AppRole;
  children: NavLeaf[];
};

type NavEntry = NavLeaf | NavGroup;

/* ─── Navigation Structure ───────────────────────────────────────────────── */

const navEntries: NavEntry[] = [
  {
    kind: "leaf",
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    kind: "group",
    label: "Inventario",
    icon: Package,
    children: [
      { kind: "leaf", label: "Bodega", href: "/dashboard/products", icon: Package },
      { kind: "leaf", label: "Préstamos", href: "/dashboard/loans", icon: Clock },
      { kind: "leaf", label: "Solicitudes", href: "/dashboard/requests", icon: Inbox },
      { kind: "leaf", label: "Movimientos", href: "/dashboard/movements", icon: ArrowDownUp },
    ],
  },
  {
    kind: "group",
    label: "Comercial",
    icon: ShoppingCart,
    children: [
      { kind: "leaf", label: "Ventas", href: "/dashboard/sales", icon: ShoppingCart },
      { kind: "leaf", label: "Cotizaciones", href: "/dashboard/quotes", icon: FileText },
      { kind: "leaf", label: "Arriendos", href: "/dashboard/rentals", icon: KeyRound },
      { kind: "leaf", label: "Gastos y Pagos", href: "/dashboard/expenses", icon: Receipt },
    ],
  },
  {
    kind: "group",
    label: "Caja",
    icon: Wallet,
    children: [
      { kind: "leaf", label: "Resumen de Caja", href: "/dashboard/cashbox", icon: BarChart3 },
      { kind: "leaf", label: "Movimientos de Caja", href: "/dashboard/cashbox/transactions", icon: Receipt },
    ],
  },
  {
    kind: "leaf",
    label: "Reportes",
    href: "/dashboard/reports",
    icon: TrendingUp,
  },
  {
    kind: "leaf",
    label: "Administración",
    href: "/dashboard/admin",
    icon: Shield,
    minRole: "ADMIN",
  },
];

/* ─── NavLeafItem ─────────────────────────────────────────────────────── */

function NavLeafItem({
  item,
  pathname,
  indented,
  onClick,
}: {
  item: NavLeaf;
  pathname: string;
  indented?: boolean;
  onClick?: () => void;
}) {
  const isActive =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(item.href));

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200",
        indented ? "px-4 py-2.5 pl-11" : "px-4 py-3",
        isActive
          ? "bg-blue-500/15 text-blue-400 shadow-sm shadow-blue-500/10"
          : "text-slate-400 hover:bg-white/5 hover:text-white"
      )}
    >
      <item.icon className={cn("w-4 h-4 shrink-0", indented && "w-4 h-4")} />
      {item.label}
    </Link>
  );
}

/* ─── NavGroupItem ────────────────────────────────────────────────────── */

function NavGroupItem({
  group,
  pathname,
  userRole,
  onLeafClick,
}: {
  group: NavGroup;
  pathname: string;
  userRole?: AppRole;
  onLeafClick?: () => void;
}) {
  // Filter children by role
  const visibleChildren = group.children.filter((child) => {
    if (!child.minRole) return true;
    if (!userRole) return false;
    return hasMinRole(userRole, child.minRole);
  });

  if (visibleChildren.length === 0) return null;

  // Auto-open if any child is active
  const anyChildActive = visibleChildren.some(
    (child) =>
      pathname === child.href ||
      (child.href !== "/dashboard" && pathname.startsWith(child.href))
  );

  const [open, setOpen] = useState(anyChildActive);

  // Keep group open when navigating into it
  useEffect(() => {
    if (anyChildActive && !open) setOpen(true);
  }, [anyChildActive]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
          anyChildActive
            ? "text-blue-400"
            : "text-slate-400 hover:bg-white/5 hover:text-white"
        )}
      >
        <group.icon className="w-5 h-5 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          className={cn(
            "w-4 h-4 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Collapsible children */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out",
          open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="space-y-0.5 pb-1">
          {visibleChildren.map((child) => (
            <NavLeafItem
              key={child.href}
              item={child}
              pathname={pathname}
              indented
              onClick={onLeafClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── DashboardShell ─────────────────────────────────────────────────── */

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile, loading: roleLoading } = useUserRole();

  // Filter top-level entries by role
  const visibleEntries = navEntries.filter((entry) => {
    if (!entry.minRole) return true;
    if (!profile) return false;
    return hasMinRole(profile.role, entry.minRole);
  });

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-[#05060f]">
      <CosmicBackground />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-sidebar backdrop-blur-xl border-r border-border flex flex-col transition-transform duration-300 shadow-xl shadow-black/20",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">
            MedStock
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User info + role badge */}
        {profile && !roleLoading && (
          <div className="px-5 py-3 border-b border-white/5">
            <p className="text-sm font-medium text-white truncate">
              {profile.full_name}
            </p>
            <div className="mt-1.5">
              <RoleBadge role={profile.role} />
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleEntries.map((entry) => {
            if (entry.kind === "leaf") {
              return (
                <NavLeafItem
                  key={entry.href}
                  item={entry}
                  pathname={pathname}
                  onClick={() => setSidebarOpen(false)}
                />
              );
            }
            return (
              <NavGroupItem
                key={entry.label}
                group={entry}
                pathname={pathname}
                userRole={profile?.role}
                onLeafClick={() => setSidebarOpen(false)}
              />
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-white/5">
          <form action={signout}>
            <button
              type="submit"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 w-full"
            >
              <LogOut className="w-5 h-5" />
              Cerrar Sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen relative z-10">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-4 px-6 py-4 bg-background/30 backdrop-blur-md border-b border-border">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-slate-400 hover:text-white transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex-1" />
        </header>

        {/* Page content */}
        <div className="flex-1 p-6">{children}</div>
      </main>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleProvider>
      <DashboardShell>{children}</DashboardShell>
    </RoleProvider>
  );
}
