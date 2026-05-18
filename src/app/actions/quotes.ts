"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";

const QuoteItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive().max(10_000),
  unit_price: z.number().nonnegative().max(100_000_000),
  description: z.string().max(500).nullable().optional(),
});

const QuoteSchema = z.object({
  client_name: z.string().min(1).max(255),
  client_email: z.string().email().max(254).nullable().optional(),
  client_phone: z.string().max(30).nullable().optional(),
  client_rut: z.string().max(20).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  items: z.array(QuoteItemSchema).min(1).max(100),
});

const UpdateQuoteSchema = QuoteSchema.extend({
  valid_until: z.string().nullable().optional(),
});

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

export async function createQuote(
  input: z.infer<typeof QuoteSchema>
): Promise<ActionResult> {
  const parsed = QuoteSchema.safeParse(input);
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
    return { ok: false, error: "Sin permiso para crear cotizaciones." };
  }

  const { client_name, client_email, client_phone, client_rut, notes, items } = parsed.data;
  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const validUntilDate = new Date();
  validUntilDate.setDate(validUntilDate.getDate() + 15);
  const valid_until = validUntilDate.toISOString().split("T")[0];

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      organization_id: profile.organization_id,
      client_name,
      client_email: client_email ?? null,
      client_phone: client_phone ?? null,
      client_rut: client_rut ?? null,
      notes: notes ?? null,
      valid_until,
      total_amount: total,
      status: "DRAFT",
    })
    .select("id")
    .single();

  if (quoteError || !quote) {
    return {
      ok: false,
      error: friendlyError(quoteError?.message ?? "Error al crear la cotización."),
    };
  }

  const { error: itemsError } = await supabase.from("quote_items").insert(
    items.map((item) => ({
      quote_id: quote.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      description: item.description ?? null,
    }))
  );

  if (itemsError) return { ok: false, error: friendlyError(itemsError.message) };

  revalidatePath("/dashboard/quotes");
  return { ok: true, id: quote.id };
}

export async function updateQuote(
  quoteId: string,
  input: z.infer<typeof UpdateQuoteSchema>
): Promise<ActionResult> {
  const idParsed = z.string().uuid().safeParse(quoteId);
  if (!idParsed.success) return { ok: false, error: "ID inválido." };

  const parsed = UpdateQuoteSchema.safeParse(input);
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
    return { ok: false, error: "Sin permiso para editar cotizaciones." };
  }

  const { client_name, client_email, client_phone, client_rut, notes, items, valid_until } =
    parsed.data;
  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const { error: quoteError } = await supabase
    .from("quotes")
    .update({
      client_name,
      client_email: client_email ?? null,
      client_phone: client_phone ?? null,
      client_rut: client_rut ?? null,
      notes: notes ?? null,
      valid_until: valid_until ?? null,
      total_amount: total,
    })
    .eq("id", idParsed.data);

  if (quoteError) return { ok: false, error: friendlyError(quoteError.message) };

  // Replace items: delete old, insert new
  await supabase.from("quote_items").delete().eq("quote_id", idParsed.data);

  const { error: itemsError } = await supabase.from("quote_items").insert(
    items.map((item) => ({
      quote_id: idParsed.data,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      description: item.description ?? null,
    }))
  );

  if (itemsError) return { ok: false, error: friendlyError(itemsError.message) };

  revalidatePath("/dashboard/quotes");
  return { ok: true };
}

export async function deleteQuote(quoteId: string): Promise<ActionResult> {
  const idParsed = z.string().uuid().safeParse(quoteId);
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
    return { ok: false, error: "Sin permiso para eliminar cotizaciones." };
  }

  const { error } = await supabase.from("quotes").delete().eq("id", idParsed.data);
  if (error) return { ok: false, error: friendlyError(error.message) };

  revalidatePath("/dashboard/quotes");
  return { ok: true };
}
