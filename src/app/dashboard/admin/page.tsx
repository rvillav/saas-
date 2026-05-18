"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import {
  useUserRole,
  AccessDenied,
  RoleBadge,
} from "@/components/RoleProvider";
import {
  type AppRole,
  ROLE_LABELS,
  canManageOrg,
  isSuperAdmin,
} from "@/lib/roles";
import {
  Users,
  Shield,
  Building2,
  UserCog,
  AlertCircle,
  CheckCircle2,
  Search,
  UserPlus,
  Mail,
  User,
  X,
  Send,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OrgUser = {
  id: string;
  full_name: string;
  role: AppRole;
  created_at: string;
  email?: string;
};

type OrgInfo = {
  id: string;
  name: string;
};

export default function AdminPage() {
  const [supabase] = useState(() => createClient());
  const { profile, loading: roleLoading } = useUserRole();

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    full_name: "",
    email: "",
    role: "USER" as AppRole,
  });

  const fetchData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    // Organization info
    const { data: orgData } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", profile.organization_id)
      .single();
    setOrg(orgData);

    // Users in this org
    const { data: usersData } = await supabase
      .from("users")
      .select("id, full_name, role, created_at")
      .eq("organization_id", profile.organization_id)
      .order("created_at");

    setUsers((usersData as OrgUser[]) ?? []);
    setLoading(false);
  }, [supabase, profile]);

  useEffect(() => {
    if (profile) fetchData();
  }, [profile, fetchData]);

  // Wait for role to load
  if (roleLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Access check
  if (!profile || !canManageOrg(profile.role)) {
    return <AccessDenied />;
  }

  async function handleRoleChange(userId: string, newRole: AppRole) {
    // Can't change own role
    if (userId === profile!.id) {
      setError("No puedes cambiar tu propio rol.");
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Non-SUPER_ADMIN can't assign SUPER_ADMIN
    if (newRole === "SUPER_ADMIN" && !isSuperAdmin(profile!.role)) {
      setError("Solo un Super Administrador puede asignar ese rol.");
      setTimeout(() => setError(null), 3000);
      return;
    }

    setSaving(userId);
    setError(null);

    const { error: updateError } = await supabase
      .from("users")
      .update({ role: newRole })
      .eq("id", userId);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(`Rol actualizado a ${ROLE_LABELS[newRole]}`);
      setTimeout(() => setSuccess(null), 3000);
      fetchData();
    }
    setSaving(null);
  }

  async function handleInviteUser(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("No hay sesión activa. Inicia sesión nuevamente.");
        setInviting(false);
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            email: inviteForm.email,
            full_name: inviteForm.full_name,
            role: inviteForm.role,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Error al enviar la invitación.");
      } else {
        setSuccess(result.message || "Invitación enviada exitosamente.");
        setTimeout(() => setSuccess(null), 5000);
        setShowInvite(false);
        setInviteForm({ full_name: "", email: "", role: "USER" });
        fetchData();
      }
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
    }

    setInviting(false);
  }

  const filtered = users.filter((u) =>
    u.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const roleOptions: AppRole[] = isSuperAdmin(profile.role)
    ? ["SUPER_ADMIN", "ADMIN", "USER", "VIEWER"]
    : ["ADMIN", "USER", "VIEWER"];

  const inviteRoleOptions: AppRole[] = ["ADMIN", "USER", "VIEWER"];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            Administración
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestiona los usuarios y permisos de tu organización
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-500/25 text-sm"
        >
          <UserPlus className="w-4 h-4" />
          Invitar Usuario
        </button>
      </div>

      {org && (
        <Card className="flex items-center gap-4 p-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-lg font-bold">{org.name}</p>
            <p className="text-sm text-muted-foreground">
              {users.length} usuario{users.length !== 1 ? "s" : ""} registrado
              {users.length !== 1 ? "s" : ""}
            </p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(["ADMIN", "USER", "VIEWER"] as const).map((role) => {
          const count = users.filter((u) => u.role === role).length;
          return (
            <Card key={role} className="p-4">
              <p className="text-xs text-muted-foreground font-medium">
                {ROLE_LABELS[role]}
              </p>
              <p className="text-2xl font-bold mt-1">{count}</p>
            </Card>
          );
        })}
        <Card className="p-4 bg-muted/20">
          <p className="text-xs text-muted-foreground font-medium">Total</p>
          <p className="text-2xl font-bold mt-1">{users.length}</p>
        </Card>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar usuario..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol Actual</TableHead>
                <TableHead>Miembro Desde</TableHead>
                <TableHead>Cambiar Rol</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center">
                    <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-muted-foreground text-sm">
                      No se encontraron usuarios.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((user) => {
                  const isSelf = user.id === profile!.id;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                            {user.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {user.full_name}
                              {isSelf && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  (tú)
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {user.id.slice(0, 8)}…
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={user.role} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString("es-CL")}
                      </TableCell>
                      <TableCell>
                        {isSelf ? (
                          <span className="text-xs text-muted-foreground italic">
                            No puedes cambiar tu propio rol
                          </span>
                        ) : (
                          <div className="flex items-center gap-2 max-w-[200px]">
                            <Select
                              value={user.role}
                              onValueChange={(val) =>
                                handleRoleChange(user.id, val as AppRole)
                              }
                              disabled={saving === user.id}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {roleOptions.map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {ROLE_LABELS[r]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {saving === user.id && (
                              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin shrink-0" />
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <UserCog className="w-4 h-4 text-primary" />
            Matriz de Permisos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Acción</TableHead>
                  <TableHead className="text-center">Viewer</TableHead>
                  <TableHead className="text-center">User</TableHead>
                  <TableHead className="text-center">Admin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  {
                    action: "Ver productos, ventas, cotizaciones",
                    viewer: true,
                    user: true,
                    admin: true,
                  },
                  {
                    action: "Crear ventas y cotizaciones",
                    viewer: false,
                    user: true,
                    admin: true,
                  },
                  {
                    action: "Crear/editar productos",
                    viewer: false,
                    user: true,
                    admin: true,
                  },
                  {
                    action: "Registrar movimientos de inventario",
                    viewer: false,
                    user: true,
                    admin: true,
                  },
                  {
                    action: "Eliminar productos",
                    viewer: false,
                    user: false,
                    admin: true,
                  },
                  {
                    action: "Gestionar usuarios y roles",
                    viewer: false,
                    user: false,
                    admin: true,
                  },
                  {
                    action: "Invitar nuevos usuarios",
                    viewer: false,
                    user: false,
                    admin: true,
                  },
                ].map((row) => (
                  <TableRow key={row.action}>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.action}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.viewer ? "✅" : "❌"}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.user ? "✅" : "❌"}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.admin ? "✅" : "❌"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Invite User Modal ──────────────────────────────────────────── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !inviting && setShowInvite(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 z-10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                Invitar Usuario
              </h2>
              <button
                onClick={() => !inviting && setShowInvite(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-slate-400 text-sm mb-6">
              El usuario recibirá un correo electrónico con un enlace para
              establecer su contraseña y acceder a la plataforma.
            </p>

            <form onSubmit={handleInviteUser} className="space-y-4">
              <div>
                <label
                  htmlFor="invite-name"
                  className="block text-sm font-medium text-slate-300 mb-1.5"
                >
                  Nombre completo
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    id="invite-name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    value={inviteForm.full_name}
                    onChange={(e) =>
                      setInviteForm({ ...inviteForm, full_name: e.target.value })
                    }
                    placeholder="Juan Pérez"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="invite-email"
                  className="block text-sm font-medium text-slate-300 mb-1.5"
                >
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    id="invite-email"
                    type="email"
                    required
                    value={inviteForm.email}
                    onChange={(e) =>
                      setInviteForm({ ...inviteForm, email: e.target.value })
                    }
                    placeholder="usuario@email.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="invite-role"
                  className="block text-sm font-medium text-slate-300 mb-1.5"
                >
                  Rol asignado
                </label>
                <Select
                  value={inviteForm.role}
                  onValueChange={(val) =>
                    setInviteForm({ ...inviteForm, role: val as AppRole })
                  }
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {inviteRoleOptions.map((r) => (
                      <SelectItem key={r} value={r}>
                        <div className="flex flex-col">
                          <span>{ROLE_LABELS[r]}</span>
                          <span className="text-xs text-muted-foreground">
                            {r === "ADMIN"
                              ? "Acceso total + gestión de usuarios"
                              : r === "USER"
                                ? "Crear y editar datos"
                                : "Solo lectura"}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => !inviting && setShowInvite(false)}
                  disabled={inviting}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 hover:text-white transition-all text-sm font-medium disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-500/25 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {inviting ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Enviar Invitación
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
