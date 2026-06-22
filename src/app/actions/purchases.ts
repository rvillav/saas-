"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";

const CategoryEnum = z.enum(["MASCARILLA", "CPAP", "TUBO_CALEFACCIONADO", "OTROS"]);

const LineItemSchema = z.object({
  product_name: z.string().min(1, "Nombre de producto requerido").max(255),
  brand: z.string().min(1, "Marca requerida").max(100),
  category: CategoryEnum,
  quantity: z.number().int().positive(),
  unit_purchase_price: z.number().nonnegative(),
});

const CreatePurchaseInvoiceSchema = z.object({
  invoice_number: z.string().min(1, "Número de factura requerido").max(100),
  supplier_name: z.string().min(1, "Nombre de proveedor requerido").max(255),
  supplier_rut: z.string().max(20).nullable().optional(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(LineItemSchema).min(1, "Debe agregar al menos un producto"),
});

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

export async function createPurchaseInvoice(
  input: z.infer<typeof CreatePurchaseInvoiceSchema>
): Promise<ActionResult> {
  const parsed = CreatePurchaseInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
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
    return { ok: false, error: "Sin permiso para registrar facturas de compra." };
  }

  const { data, error } = await supabase.rpc("create_purchase_invoice", {
    p_org_id: profile.organization_id,
    p_invoice_number: parsed.data.invoice_number,
    p_supplier_name: parsed.data.supplier_name,
    p_supplier_rut: parsed.data.supplier_rut ?? null,
    p_purchase_date: parsed.data.purchase_date,
    p_notes: parsed.data.notes ?? null,
    p_user_id: user.id,
    p_items: parsed.data.items,
  });

  if (error) return { ok: false, error: friendlyError(error.message) };

  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/movements");
  return { ok: true, id: data as string };
}

export async function cancelPurchaseInvoice(
  id: string
): Promise<ActionResult> {
  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) return { ok: false, error: "ID de factura inválido." };

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
    return { ok: false, error: "Solo administradores pueden anular facturas." };
  }

  const { error } = await supabase.rpc("cancel_purchase_invoice", {
    p_invoice_id: idParsed.data,
    p_user_id: user.id,
  });

  if (error) return { ok: false, error: friendlyError(error.message) };

  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/movements");
  return { ok: true };
}
