import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getAccessToken(req: Request): string | null {
  const headerToken = req.headers.get("x-receipt-token");
  if (headerToken) return headerToken;
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7);
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  // /api/receipts/<id>
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[parts.indexOf("receipts") + 1];

  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const token = getAccessToken(req);
  if (!token) {
    return NextResponse.json({ error: "token requerido" }, { status: 401 });
  }

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("receipts")
    .select(
      "id,status,attempts,has_mismatch,difference_cents,parsed_json,error_reason,created_at,processed_at,access_token"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  }

  if (data.access_token !== token) {
    return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  }

  const { access_token: _accessToken, ...safe } = data as any;
  return NextResponse.json(safe);
}
