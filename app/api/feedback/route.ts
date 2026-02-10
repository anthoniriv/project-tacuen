import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type FeedbackPayload = {
  device_id?: string;
  rating?: number;
  comment?: string;
  contact?: string;
};

export async function POST(req: Request) {
  let payload: FeedbackPayload = {};
  try {
    payload = (await req.json()) as FeedbackPayload;
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }

  const deviceId = (payload.device_id || "").trim();
  const rating = Number(payload.rating);
  const comment = (payload.comment || "").trim();
  const contact = (payload.contact || "").trim();

  if (!deviceId) {
    return NextResponse.json({ error: "device_id requerido" }, { status: 400 });
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "rating debe ser 1-5" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const now = new Date().toISOString();

  const { error: insertErr } = await sb.from("feedback").insert({
    device_id: deviceId,
    rating,
    comment,
    contact,
    created_at: now,
  });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
