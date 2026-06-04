"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";

const CreateExpenseSchema = z.object({
  category: z.enum(["COMPRA_INSUMOS", "SERVICIOS", "SUELDOS", "MANTENCION", "OTROS"]),
  amount: z.number().int().positive("El monto debe ser mayor a 0"),
  description: z.string().min(1, "La descripción es requerida").max(500),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido"),
});

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createExpense(
  input: z.infer<typeof CreateExpenseSchema>
): Promise<ActionResult> {
  const parsed = CreateExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos: " + parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) return { ok: false, error: "Perfil no encontrado." };
  if (!["USER", "ADMIN", "SUPER_ADMIN"].includes(profile.role)) {
    return { ok: false, error: "Sin permiso para registrar egresos." };
  }

  const { category, amount, description, transaction_date } = parsed.data;

  const { error } = await supabase.from("cash_transactions").insert({
    organization_id: profile.organization_id,
    type: "EXPENSE",
    category,
    amount,
    description,
    reference_type: "MANUAL",
    transaction_date,
    created_by: user.id,
  });

  if (error) return { ok: false, error: friendlyError(error.message) };

  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/cashbox");
  revalidatePath("/dashboard/cashbox/transactions");
  return { ok: true };
}

export async function deleteExpense(expenseId: string): Promise<ActionResult> {
  const idParsed = z.string().uuid().safeParse(expenseId);
  if (!idParsed.success) return { ok: false, error: "ID de egreso inválido." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) return { ok: false, error: "Perfil no encontrado." };
  // Only ADMIN or SUPER_ADMIN can delete expenses
  if (!["ADMIN", "SUPER_ADMIN"].includes(profile.role)) {
    return { ok: false, error: "Sin permiso para eliminar egresos (mínimo Administrador)." };
  }

  // Fetch transaction to verify it is an expense of this organization
  const { data: txn, error: fetchErr } = await supabase
    .from("cash_transactions")
    .select("id, organization_id, type")
    .eq("id", idParsed.data)
    .single();

  if (fetchErr || !txn) return { ok: false, error: "Egreso no encontrado." };
  if (txn.organization_id !== profile.organization_id) return { ok: false, error: "No autorizado." };
  if (txn.type !== "EXPENSE") return { ok: false, error: "Esta transacción no es un egreso." };

  const { error } = await supabase
    .from("cash_transactions")
    .delete()
    .eq("id", idParsed.data);

  if (error) return { ok: false, error: friendlyError(error.message) };

  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/cashbox");
  revalidatePath("/dashboard/cashbox/transactions");
  return { ok: true };
}
