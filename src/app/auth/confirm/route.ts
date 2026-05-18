import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next") ?? "/dashboard";
  // Only allow same-origin paths. Reject:
  //  - absolute URLs ("http://...", "https://...")
  //  - protocol-relative URLs ("//evil.com/...") — these still start with "/"
  //  - backslash variants browsers may normalize ("/\\evil.com")
  const isSafeNext =
    rawNext.startsWith("/") &&
    !rawNext.startsWith("//") &&
    !rawNext.startsWith("/\\");
  const next = isSafeNext ? rawNext : "/dashboard";

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (!error) {
      redirect(next);
    }
  }

  // If verification fails, redirect to an error-friendly login page
  redirect("/login?error=confirmation_failed");
}
