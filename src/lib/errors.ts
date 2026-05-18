/**
 * Map raw Supabase/Postgres error messages to user-friendly Spanish messages.
 * Prevents leaking internal DB details (table names, column names, etc.) to the UI.
 */
export function friendlyError(message: string): string {
  const lower = message.toLowerCase();

  // RLS violations
  if (lower.includes("violates row-level security") || lower.includes("row-level security"))
    return "No tienes permisos para realizar esta operación.";

  // Foreign key violations
  if (lower.includes("violates foreign key"))
    return "El registro referenciado no existe o fue eliminado.";

  // Unique constraint violations
  if (lower.includes("violates unique constraint") || lower.includes("duplicate key"))
    return "Ya existe un registro con estos datos.";

  // Not-null violations
  if (lower.includes("violates not-null constraint"))
    return "Faltan campos obligatorios.";

  // Check constraint violations
  if (lower.includes("violates check constraint"))
    return "Los datos ingresados no son válidos.";

  // Stock-related errors from RPCs
  if (lower.includes("stock insuficiente"))
    return message; // These are already user-friendly

  // Auth errors
  if (lower.includes("not authenticated") || lower.includes("jwt"))
    return "Tu sesión expiró. Inicia sesión nuevamente.";

  // Network errors
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("timeout"))
    return "Error de conexión. Verifica tu internet e intenta nuevamente.";

  // Default: generic message (avoid leaking internals)
  return "Error inesperado. Intenta nuevamente.";
}
