"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";

const SaleItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive().max(10_000),
  unit_price: z.number().nonnegative().max(100_000_000),
});

const CreateSaleSchema = z.object({
  client_name: z.string().min(1).max(255),
  client_rut: z.string().max(20).nullable().optional(),
  client_email: z.string().email().max(254).nullable().optional(),
  client_phone: z.string().max(30).nullable().optional(),
  payment_method: z.enum(["CASH", "TRANSFER", "CARD", "CHECK", "OTHER"]),
  notes: z.string().max(1000).nullable().optional(),
  items: z.array(SaleItemSchema).min(1).max(100),
});

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createSale(
  input: z.infer<typeof CreateSaleSchema>
): Promise<ActionResult> {
  const parsed = CreateSaleSchema.safeParse(input);
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
    return { ok: false, error: "Sin permiso para crear ventas." };
  }

  const { client_name, client_rut, client_email, client_phone, payment_method, notes, items } =
    parsed.data;

  const { error: rpcErr } = await supabase.rpc("create_sale", {
    p_org_id: profile.organization_id,
    p_client_name: client_name,
    p_client_rut: client_rut ?? null,
    p_client_email: client_email ?? null,
    p_client_phone: client_phone ?? null,
    p_payment_method: payment_method,
    p_notes: notes ?? null,
    p_items: items,
    p_user_id: user.id,
  });

  if (rpcErr) return { ok: false, error: friendlyError(rpcErr.message) };

  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function deleteSale(saleId: string): Promise<ActionResult> {
  const idParsed = z.string().uuid().safeParse(saleId);
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
    return { ok: false, error: "Sin permiso para eliminar ventas." };
  }

  const { error: rpcErr } = await supabase.rpc("delete_sale", {
    p_sale_id: idParsed.data,
    p_user_id: user.id,
  });

  if (rpcErr) return { ok: false, error: friendlyError(rpcErr.message) };

  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/products");
  return { ok: true };
}
