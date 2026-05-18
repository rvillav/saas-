import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("organizations").select("id").limit(1);
    return NextResponse.json(
      {
        status: error ? "degraded" : "ok",
        commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
        timestamp: new Date().toISOString(),
      },
      { status: error ? 503 : 200 }
    );
  } catch {
    return NextResponse.json(
      { status: "error", timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
