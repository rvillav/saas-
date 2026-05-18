"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";

const CategoryEnum = z.enum(["MASCARILLA", "CPAP", "TUBO_CALEFACCIONADO", "OTROS"]);

const ProductSchema = z.object({
  sku: z.string().max(50).nullable().optional(),
  brand: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).nullable().optional(),
  unit_price: z.number().nonnegative().max(100_000_000),
  current_stock: z.number().int().min(0).max(1_000_000),
  category: CategoryEnum,
});

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createProduct(
  input: z.infer<typeof ProductSchema>
): Promise<ActionResult> {
  const parsed = ProductSchema.safeParse(input);
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
    return { ok: false, error: "Sin permiso para crear productos." };
  }

  const { error } = await supabase.from("products").insert({
    ...parsed.data,
    sku: parsed.data.sku ?? null,
    description: parsed.data.description ?? null,
    organization_id: profile.organization_id,
  });

  if (error) return { ok: false, error: friendlyError(error.message) };

  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function updateProduct(
  id: string,
  input: z.infer<typeof ProductSchema>
): Promise<ActionResult> {
  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) return { ok: false, error: "ID inválido." };

  const parsed = ProductSchema.safeParse(input);
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
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["USER", "ADMIN", "SUPER_ADMIN"].includes(profile.role)) {
    return { ok: false, error: "Sin permiso para editar productos." };
  }

  const { error } = await supabase
    .from("products")
    .update({
      ...parsed.data,
      sku: parsed.data.sku ?? null,
      description: parsed.data.description ?? null,
    })
    .eq("id", idParsed.data);

  if (error) return { ok: false, error: friendlyError(error.message) };

  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const idParsed = z.string().uuid().safeParse(id);
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
    return { ok: false, error: "Solo administradores pueden eliminar productos." };
  }

  const { error } = await supabase.from("products").delete().eq("id", idParsed.data);

  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error:
          "No se puede eliminar el producto porque tiene ventas o arriendos activos asociados.",
      };
    }
    return { ok: false, error: friendlyError(error.message) };
  }

  revalidatePath("/dashboard/products");
  return { ok: true };
}
