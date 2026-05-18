"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";

const CreateMovementSchema = z.object({
  product_id: z.string().uuid(),
  type: z.enum(["IN", "OUT"]),
  quantity: z.number().int().positive().max(100_000),
  notes: z.string().max(500).nullable().optional(),
});

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createMovement(
  input: z.infer<typeof CreateMovementSchema>
): Promise<ActionResult> {
  const parsed = CreateMovementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos: " + parsed.error.issues[0].message };
  }

  const { product_id, type, quantity, notes } = parsed.data;

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
    return { ok: false, error: "Sin permiso para registrar movimientos." };
  }

  const { error: insertError } = await supabase.from("inventory_movements").insert({
    organization_id: profile.organization_id,
    product_id,
    type,
    quantity,
    user_id: user.id,
    notes: notes ?? null,
  });

  if (insertError) return { ok: false, error: friendlyError(insertError.message) };

  // Update stock — two queries because there's no RPC for manual movements yet.
  // Race condition risk is low for manual adjustments; acceptable until an RPC is added.
  const { data: product, error: fetchErr } = await supabase
    .from("products")
    .select("current_stock")
    .eq("id", product_id)
    .single();

  if (!fetchErr && product) {
    const newStock =
      type === "IN"
        ? product.current_stock + quantity
        : Math.max(0, product.current_stock - quantity);

    await supabase.from("products").update({ current_stock: newStock }).eq("id", product_id);
  }

  revalidatePath("/dashboard/movements");
  revalidatePath("/dashboard/products");
  return { ok: true };
}
