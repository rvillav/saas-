import { createClient } from "@/lib/supabase/client";

export type AppRole = "SUPER_ADMIN" | "ADMIN" | "USER" | "VIEWER";

export type UserProfile = {
  id: string;
  organization_id: string;
  role: AppRole;
  full_name: string;
};

const ROLE_HIERARCHY: Record<AppRole, number> = {
  SUPER_ADMIN: 4,
  ADMIN: 3,
  USER: 2,
  VIEWER: 1,
};

/**
 * Check if a role meets or exceeds the required level.
 *
 * Example: `hasMinRole("ADMIN", "USER")` → true (ADMIN ≥ USER)
 */
export function hasMinRole(userRole: AppRole, requiredRole: AppRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Check if the user can write data (i.e., create/update).
 * VIEWER is read-only.
 */
export function canWrite(role: AppRole): boolean {
  return hasMinRole(role, "USER");
}

/**
 * Check if the user can manage the organization (invite/remove users, config).
 */
export function canManageOrg(role: AppRole): boolean {
  return hasMinRole(role, "ADMIN");
}

/**
 * Check if the user is the platform owner.
 */
export function isSuperAdmin(role: AppRole): boolean {
  return role === "SUPER_ADMIN";
}

/**
 * Fetch the current user's profile (role, org) from Supabase.
 * Uses the client-side Supabase client.
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, organization_id, role, full_name")
    .eq("id", user.id)
    .single();

  return data as UserProfile | null;
}

/**
 * Role labels for UI display (Spanish).
 */
export const ROLE_LABELS: Record<AppRole, string> = {
  SUPER_ADMIN: "Super Administrador",
  ADMIN: "Administrador",
  USER: "Usuario",
  VIEWER: "Solo Lectura",
};

/**
 * Role colors for badges.
 */
export const ROLE_COLORS: Record<AppRole, string> = {
  SUPER_ADMIN: "bg-red-500/10 text-red-400 border-red-500/20",
  ADMIN: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  USER: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  VIEWER: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};
