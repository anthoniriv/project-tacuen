import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  analizarTicketConIA_v2,
  transcribirSoloTablaItems,
} from "@/lib/ia/analizarTicket";
import { parsearItemsDesdeLineas } from "@/lib/ia/analizarTicket";

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

function toCents(n: any): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100);
}

function extractTrailingPrice(line: string): string | null {
  const m = line.match(/(\d+\.\d{2})\s*$/);
  return m?.[1] ?? null;
}

/**
 * Heurística simple:
 * - Si un mismo monto se repite 3+ veces en líneas de items, suele ser OCR malo de tabla.
 */
function looksSuspicious(raw_lines: string[]): boolean {
  const prices = raw_lines
    .map((l) => extractTrailingPrice(l))
    .filter(Boolean) as string[];

  if (prices.length < 5) return false;

  const freq = new Map<string, number>();
  for (const p of prices) freq.set(p, (freq.get(p) || 0) + 1);

  return Array.from(freq.values()).some((v) => v >= 3);
}

function calcItemsSubtotalCents(items: any[]): number {
  return items.reduce((acc: number, it: any) => acc + toCents(it.total), 0);
}

function pickComputedTotalCents(
  itemsSubtotalCents: number,
  igvCents: number,
  recargoCents: number,
  totalDetectedCents: number
): number {
  const options = [
    itemsSubtotalCents,
    itemsSubtotalCents + recargoCents,
    itemsSubtotalCents + igvCents,
    itemsSubtotalCents + igvCents + recargoCents,
  ];
  let best = options[0];
  let bestDiff = Math.abs(totalDetectedCents - best);
  for (const opt of options.slice(1)) {
    const diff = Math.abs(totalDetectedCents - opt);
    if (diff < bestDiff) {
      best = opt;
      bestDiff = diff;
    }
  }
  return best;
}

export async function POST(req: Request) {
  // ✅ Evita params Promise (Next)
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[parts.indexOf("receipts") + 1];

  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const token = getAccessToken(req);
  if (!token) {
    return NextResponse.json({ error: "token requerido" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "receipts";

  // body { contexto? }
  let contexto = "";
  try {
    const body = await req.json();
    contexto = typeof body?.contexto === "string" ? body.contexto : "";
  } catch {}

  // 1) Cargar receipt
  const { data: receipt, error: rErr } = await sb
    .from("receipts")
    .select("id,access_token,attempts,status,image_path")
    .eq("id", id)
    .single();

  if (rErr || !receipt) {
    return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  }

  if (receipt.access_token !== token) {
    return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  }

  // limitar reintentos
  const attempts = Number(receipt.attempts ?? 0);
  if (attempts >= 3) {
    return NextResponse.json(
      { error: "Máximo de intentos alcanzado", status: receipt.status },
      { status: 429 }
    );
  }

  // 2) status processing
  await sb
    .from("receipts")
    .update({
      status: "processing",
      attempts: attempts + 1,
      error_reason: null,
    })
    .eq("id", id);

  // 3) Descargar imagen
  const { data: blob, error: dlErr } = await sb.storage
    .from(bucket)
    .download(receipt.image_path);

  if (dlErr || !blob) {
    await sb
      .from("receipts")
      .update({
        status: "error",
        error_reason: dlErr?.message || "No se pudo descargar la imagen",
      })
      .eq("id", id);

    return NextResponse.json(
      { error: dlErr?.message || "download fail" },
      { status: 500 }
    );
  }

  // 4) Blob -> File
  const arrayBuffer = await blob.arrayBuffer();
  const file = new File([arrayBuffer], "receipt.jpg", {
    type: blob.type || "image/jpeg",
  });

  try {
    // 5) Pipeline v2 normal (A/B)
    const result = await analizarTicketConIA_v2(file, contexto);
    let parsed = result.parsed;
    let raw_lines = result.raw_lines;

    // 6) Calcular mismatch base
    const subtotalCents = toCents((parsed as any).subtotal);
    const igvCents = toCents((parsed as any).igv);
    const recargoServicioCents = toCents((parsed as any).recargoServicio ?? 0);
    const totalDetectedCents = toCents((parsed as any).importeTotal);

    let items = (parsed as any).items ?? [];
    let itemsSubtotalCents = calcItemsSubtotalCents(items);

    // tu computed actual: items + recargoServicio (ojo: IGV ya viene incluido en precios normalmente,
    // pero tú estás cuadrando contra IMPORTE TOTAL, así que está bien si items ya son con IGV)
    let computedTotalCents = pickComputedTotalCents(
      itemsSubtotalCents,
      igvCents,
      recargoServicioCents,
      totalDetectedCents
    );
    let differenceCents = totalDetectedCents - computedTotalCents;

    let hasMismatch = Math.abs(differenceCents) > 100;
    const suspicious = looksSuspicious(raw_lines);

    // 7) ✅ FALLBACK TABLA:
    // si mismatch o sospechoso, re-extrae SOLO la tabla de items desde la imagen
    if (hasMismatch || suspicious) {
      const tableLines = await transcribirSoloTablaItems(file);

      // si el fallback trajo algo útil, reparseamos SOLO desde esas líneas
      if (tableLines.length >= 5) {
        // Reusar totales detectados y fees del parsed original,
        // pero reconstruir items usando parsearLineasATicket(tableLines)
        const itemsFromTable = parsearItemsDesdeLineas(tableLines);
        
        if (itemsFromTable.length >= 5) {
          parsed = {
            ...parsed,
            items: itemsFromTable,
          };
        }
        // guarda ambas fuentes (útil para debug):
        raw_lines = raw_lines; // sigue guardando full lines (ya lo tienes)
        // (opcional) podrías guardar tableLines en otra columna si luego la creas

        // recalcula mismatch con nuevos items
        items = (parsed as any).items ?? [];
        itemsSubtotalCents = calcItemsSubtotalCents(items);
        computedTotalCents = pickComputedTotalCents(
          itemsSubtotalCents,
          igvCents,
          recargoServicioCents,
          totalDetectedCents
        );
        differenceCents = totalDetectedCents - computedTotalCents;
        hasMismatch = Math.abs(differenceCents) > 100;
      }
    }

    const nextStatus = hasMismatch ? "needs_review" : "done";

    // 8) Guardar en DB
    await sb
      .from("receipts")
      .update({
        status: nextStatus,
        raw_lines,
        parsed_json: parsed,
        subtotal_cents: subtotalCents,
        igv_cents: igvCents,
        recargos_cents: recargoServicioCents,
        total_detected_cents: totalDetectedCents,
        computed_total_cents: computedTotalCents,
        difference_cents: differenceCents,
        has_mismatch: hasMismatch,
        processed_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({
      id,
      status: nextStatus,
      hasMismatch,
      differenceCents,
      suspicious,
    });
  } catch (e: any) {
    await sb
      .from("receipts")
      .update({
        status: "error",
        error_reason: e?.message || "Error en IA",
      })
      .eq("id", id);

    return NextResponse.json(
      { error: e?.message || "error procesando" },
      { status: 500 }
    );
  }
}
