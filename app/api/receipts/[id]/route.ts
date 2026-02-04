import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  // /api/receipts/<id>
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[parts.indexOf("receipts") + 1];

  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("receipts")
    .select(
      "id,status,attempts,has_mismatch,difference_cents,parsed_json,error_reason,created_at,processed_at"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  }

  return NextResponse.json(data);
}
