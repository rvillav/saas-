"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, createContext, useContext, useCallback } from "react";
import type { AppRole, UserProfile } from "@/lib/roles";
import { hasMinRole, ROLE_LABELS, ROLE_COLORS } from "@/lib/roles";
import { ShieldAlert } from "lucide-react";

// ── Context ──────────────────────────────────────────────────────────────────

type RoleContextValue = {
  profile: UserProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const RoleContext = createContext<RoleContextValue>({
  profile: null,
  loading: true,
  refresh: async () => {},
});

export function useUserRole() {
  return useContext(RoleContext);
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("users")
      .select("id, organization_id, role, full_name")
      .eq("id", user.id)
      .single();

    setProfile(data as UserProfile | null);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <RoleContext.Provider value={{ profile, loading, refresh }}>
      {children}
    </RoleContext.Provider>
  );
}

// ── RoleGate ─────────────────────────────────────────────────────────────────

/**
 * Only renders children if the current user has at least the required role.
 *
 * ```tsx
 * <RoleGate minRole="ADMIN">
 *   <DangerousAdminButton />
 * </RoleGate>
 * ```
 */
export function RoleGate({
  minRole,
  children,
  fallback,
}: {
  minRole: AppRole;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { profile, loading } = useUserRole();

  if (loading) return null; // invisible while loading
  if (!profile) return null;

  if (!hasMinRole(profile.role, minRole)) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}

/**
 * Full-page access denied screen.
 * Use when an entire route requires a minimum role.
 */
export function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <ShieldAlert className="w-8 h-8 text-red-400" />
      </div>
      <h2 className="text-xl font-bold text-white">Acceso denegado</h2>
      <p className="text-slate-400 text-sm text-center max-w-sm">
        No tienes los permisos necesarios para acceder a esta sección.
        Contacta al administrador de tu organización.
      </p>
    </div>
  );
}

/**
 * Small role badge component for user lists.
 */
export function RoleBadge({ role }: { role: AppRole }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${ROLE_COLORS[role]}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
