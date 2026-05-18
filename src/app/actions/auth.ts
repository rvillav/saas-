"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

// ── Validation schemas ───────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z
    .string()
    .email("El correo electrónico no es válido.")
    .max(254, "El correo es demasiado largo."),
  password: z
    .string()
    .min(1, "La contraseña es obligatoria.")
    .max(128, "La contraseña es demasiado larga."),
});

// ── Actions ──────────────────────────────────────────────────────────────────

export async function login(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.message === "Invalid login credentials") {
      return { error: "Correo o contraseña incorrectos." };
    }
    if (error.message === "Email not confirmed") {
      return {
        error:
          "Tu correo no ha sido confirmado. Revisa tu bandeja de entrada.",
      };
    }
    return { error: "Error al iniciar sesión. Intenta nuevamente." };
  }

  redirect("/dashboard");
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

