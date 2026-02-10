import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AnalyticsPayload = {
  device_id?: string;
  event_name?: string;
  metadata?: Record<string, unknown>;
};

export async function POST(req: Request) {
  let payload: AnalyticsPayload = {};
  try {
    payload = (await req.json()) as AnalyticsPayload;
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }

  const deviceId = (payload.device_id || "").trim();
  const eventName = (payload.event_name || "").trim();
  if (!deviceId || !eventName) {
    return NextResponse.json({ error: "device_id y event_name requeridos" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const now = new Date().toISOString();
  const userAgent = req.headers.get("user-agent") || "";
  const language = req.headers.get("accept-language") || "";

  const { error: insertErr } = await sb.from("usage_events").insert({
    device_id: deviceId,
    event_name: eventName,
    metadata: payload.metadata ?? {},
    user_agent: userAgent,
    language,
    created_at: now,
  });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Mantener tabla devices con first/last seen
  const { error: devInsertErr } = await sb.from("devices").insert({
    device_id: deviceId,
    first_seen: now,
    last_seen: now,
    last_user_agent: userAgent,
    last_language: language,
  });

  if (devInsertErr && devInsertErr.code !== "23505") {
    return NextResponse.json({ error: devInsertErr.message }, { status: 500 });
  }

  if (devInsertErr && devInsertErr.code === "23505") {
    const { error: devUpdateErr } = await sb
      .from("devices")
      .update({ last_seen: now, last_user_agent: userAgent, last_language: language })
      .eq("device_id", deviceId);

    if (devUpdateErr) {
      return NextResponse.json({ error: devUpdateErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
