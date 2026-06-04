"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";

const CreateLoanSchema = z.object({
  product_id: z.string().uuid(),
  borrower_name: z.string().min(1, "El nombre del prestatario es requerido").max(255),
  borrower_rut: z.string().max(20).nullable().optional(),
  borrower_phone: z.string().max(30).nullable().optional(),
  borrower_email: z.union([z.literal(""), z.string().email()]).nullable().optional().transform(v => v || null),
  quantity: z.number().int().positive("La cantidad debe ser mayor a 0").max(1000),
  expected_return_date: z.string().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createLoan(
  input: z.infer<typeof CreateLoanSchema>
): Promise<ActionResult> {
  const parsed = CreateLoanSchema.safeParse(input);
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
    return { ok: false, error: "Sin permiso para crear préstamos." };
  }

  const {
    product_id,
    borrower_name,
    borrower_rut,
    borrower_phone,
    borrower_email,
    quantity,
    expected_return_date,
    notes,
  } = parsed.data;

  const startDate = new Date().toISOString().split("T")[0];

  const { error: rpcErr } = await supabase.rpc("create_loan", {
    p_org_id: profile.organization_id,
    p_product_id: product_id,
    p_borrower_name: borrower_name,
    p_borrower_rut: borrower_rut || null,
    p_borrower_phone: borrower_phone || null,
    p_borrower_email: borrower_email || null,
    p_quantity: quantity,
    p_start_date: startDate,
    p_expected_return_date: expected_return_date || null,
    p_notes: notes || null,
    p_user_id: user.id,
  });

  if (rpcErr) return { ok: false, error: friendlyError(rpcErr.message) };

  revalidatePath("/dashboard/loans");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/movements");
  return { ok: true };
}

export async function returnLoan(
  loanId: string,
  status: "RETURNED" | "LOST"
): Promise<ActionResult> {
  const idParsed = z.string().uuid().safeParse(loanId);
  if (!idParsed.success) return { ok: false, error: "ID de préstamo inválido." };

  const statusParsed = z.enum(["RETURNED", "LOST"]).safeParse(status);
  if (!statusParsed.success) return { ok: false, error: "Estado de devolución inválido." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["USER", "ADMIN", "SUPER_ADMIN"].includes(profile.role)) {
    return { ok: false, error: "Sin permiso para registrar devoluciones de préstamos." };
  }

  const { error: rpcErr } = await supabase.rpc("return_loan", {
    p_loan_id: idParsed.data,
    p_status: statusParsed.data,
    p_user_id: user.id,
  });

  if (rpcErr) return { ok: false, error: friendlyError(rpcErr.message) };

  revalidatePath("/dashboard/loans");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/movements");
  return { ok: true };
}
