"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";

const WEEKLY_RATE = 50_000;

const CreateRentalSchema = z.object({
  product_id: z.string().uuid(),
  client_name: z.string().min(1).max(255),
  client_rut: z.string().max(20).nullable().optional(),
  client_phone: z.string().max(30).nullable().optional(),
  client_email: z.string().email().max(254).nullable().optional(),
  quantity: z.number().int().positive().max(1000),
  weeks: z.number().int().positive().max(52),
  notes: z.string().max(1000).nullable().optional(),
});

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createRental(
  input: z.infer<typeof CreateRentalSchema>
): Promise<ActionResult> {
  const parsed = CreateRentalSchema.safeParse(input);
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
    return { ok: false, error: "Sin permiso para crear arriendos." };
  }

  const {
    product_id,
    client_name,
    client_rut,
    client_phone,
    client_email,
    quantity,
    weeks,
    notes,
  } = parsed.data;

  const startDate = new Date().toISOString().split("T")[0];
  const returnDate = new Date();
  returnDate.setDate(returnDate.getDate() + weeks * 7);
  const expectedReturn = returnDate.toISOString().split("T")[0];

  const { error: rpcErr } = await supabase.rpc("create_rental", {
    p_org_id: profile.organization_id,
    p_product_id: product_id,
    p_client_name: client_name,
    p_client_rut: client_rut ?? null,
    p_client_phone: client_phone ?? null,
    p_client_email: client_email ?? null,
    p_quantity: quantity,
    p_daily_rate: WEEKLY_RATE,
    p_start_date: startDate,
    p_expected_return_date: expectedReturn,
    p_notes: notes ?? null,
    p_user_id: user.id,
  });

  if (rpcErr) return { ok: false, error: friendlyError(rpcErr.message) };

  revalidatePath("/dashboard/rentals");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function deleteRental(rentalId: string): Promise<ActionResult> {
  const idParsed = z.string().uuid().safeParse(rentalId);
  if (!idParsed.success) return { ok: false, error: "ID inválido." };

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

  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) {
    return { ok: false, error: "Solo administradores pueden eliminar arriendos." };
  }

  const { error: rpcErr } = await supabase.rpc("delete_rental", {
    p_rental_id: idParsed.data,
    p_user_id: user.id,
  });

  if (rpcErr) return { ok: false, error: friendlyError(rpcErr.message) };

  revalidatePath("/dashboard/rentals");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/movements");
  return { ok: true };
}

export async function returnRental(rentalId: string): Promise<ActionResult> {
  const idParsed = z.string().uuid().safeParse(rentalId);
  if (!idParsed.success) return { ok: false, error: "ID inválido." };

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
    return { ok: false, error: "Sin permiso para registrar devoluciones." };
  }

  const { error: rpcErr } = await supabase.rpc("return_rental", {
    p_rental_id: idParsed.data,
    p_user_id: user.id,
  });

  if (rpcErr) return { ok: false, error: friendlyError(rpcErr.message) };

  revalidatePath("/dashboard/rentals");
  revalidatePath("/dashboard/products");
  return { ok: true };
}
