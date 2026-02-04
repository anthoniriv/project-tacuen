// lib/ia/analizarTicket.ts
import { openai } from "./openaiClient";
import type { AnalisisTicketIA, LineaItem } from "@/lib/excel/generarExcel";

/**
 * ✅ Mejoras
 * - OCR A: Imagen -> raw_lines[]
 * - IA B: raw_lines -> AnalisisTicketIA (Structured Outputs JSON Schema)
 * - Patch determinístico de items (regex) para tickets tipo Chili's:
 *   qty al inicio + monto final = TOTAL de línea (unit = total/qty)
 * - Normalización + cuadre suave
 * - Retry 1 vez si los totales no cuadran
 */

// ---------------------------------------------
// Helpers
// ---------------------------------------------

/** Convierte un File (Web API) a base64 */
async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64");
}

function round2(n: number): number {
  const x = Number.isFinite(n) ? n : 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function clampNonNegative(n: number): number {
  return n < 0 ? 0 : n;
}

function normalizeSpaces(s: string): string {
  return (s ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*\+\s*/g, " + ")
    .replace(/\s+\+/g, " +")
    .replace(/\+\s+/g, "+ ")
    .trim();
}

/** Normaliza nombre para keys */
function keyName(s: string): string {
  return normalizeSpaces(s).toLowerCase();
}

/** Key tolerante para precio (redondeo 2) */
function keyPrice(n: number): string {
  return round2(n).toFixed(2);
}

type Categoria = "plato" | "bebida" | "postre" | "otro";
type RecargoTipo = "servicio" | "delivery" | "propina" | "redondeo" | "descuento" | "otro";

type Recargo = {
  tipo: RecargoTipo;
  monto: number; // descuento puede ser negativo
};

// ---------------------------------------------
// Combinar duplicados (tolerante)
// ---------------------------------------------
function combinarItemsDuplicados(items: LineaItem[]): LineaItem[] {
  const map = new Map<string, LineaItem>();

  for (const item of items) {
    const nombreKey = keyName(item.nombre);
    const precioKey = keyPrice(item.precioUnitario);
    const key = `${nombreKey}|${item.categoria}|${item.esBonificacion}|${precioKey}`;

    const existente = map.get(key);
    if (!existente) {
      map.set(key, { ...item });
    } else {
      existente.cantidad = round2(existente.cantidad + item.cantidad);
      existente.total = round2(existente.total + item.total);
    }
  }

  return Array.from(map.values());
}

// ---------------------------------------------
// Normalización items
// ---------------------------------------------
function normalizarItems(items: LineaItem[]): LineaItem[] {
  const out: LineaItem[] = items.map((raw) => {
    const nombre = normalizeSpaces(raw.nombre || "");
    const categoria = (raw.categoria || "otro") as Categoria;

    let cantidad = Number(raw.cantidad);
    let precioUnitario = Number(raw.precioUnitario);
    let total = Number(raw.total);
    let esBonificacion = Boolean(raw.esBonificacion);

    if (!Number.isFinite(cantidad)) cantidad = 1;
    if (!Number.isFinite(precioUnitario)) precioUnitario = 0;
    if (!Number.isFinite(total)) total = 0;

    // bonificación SOLO si unit y total son 0 (no infieras con uno solo)
    if (precioUnitario === 0 && total === 0) {
      esBonificacion = true;
    }

    if (esBonificacion) {
      return {
        ...raw,
        nombre,
        categoria,
        cantidad: clampNonNegative(round2(cantidad)),
        precioUnitario: round2(precioUnitario),
        total: 0,
        esBonificacion: true,
      };
    }

    cantidad = clampNonNegative(cantidad);
    precioUnitario = round2(precioUnitario);
    total = round2(total);

    const calculado = round2(precioUnitario * cantidad);
    const diff = Math.abs(calculado - total);

    if (total === 0 && calculado > 0) {
      total = calculado;
    } else if (diff > 0.05 && precioUnitario > 0 && cantidad > 0) {
      const posible = total / precioUnitario;
      const posibleRounded = Math.round(posible * 2) / 2; // soporta 0.5
      if (Math.abs(posible - posibleRounded) <= 0.01) {
        cantidad = posibleRounded;
      }
    }

    return {
      ...raw,
      nombre,
      categoria,
      cantidad: round2(cantidad),
      precioUnitario,
      total: round2(total),
      esBonificacion: false,
    };
  });

  return combinarItemsDuplicados(out);
}

function normalizarRecargos(recargos?: Recargo[]): Recargo[] {
  if (!Array.isArray(recargos)) return [];
  return recargos
    .map((r) => ({
      tipo: (r?.tipo ?? "otro") as RecargoTipo,
      monto: round2(Number(r?.monto ?? 0)),
    }))
    .filter((r) => Number.isFinite(r.monto) && r.monto !== 0);
}

function normalizarAnalisisMejorado(analisis: any): AnalisisTicketIA & { recargos?: Recargo[] } {
  const moneda = "PEN";

  const subtotal = round2(Number(analisis?.subtotal ?? 0));
  const igv = round2(Number(analisis?.igv ?? 0));
  const importeTotal = round2(Number(analisis?.importeTotal ?? 0));

  const recargos = normalizarRecargos(analisis?.recargos);
  const recargoServicioIA = round2(Number(analisis?.recargoServicio ?? 0));

  const recargoServicioDerivado = round2(
    recargos.filter((r) => r.tipo === "servicio" && r.monto > 0).reduce((a, r) => a + r.monto, 0)
  );

  const recargoServicio = recargoServicioDerivado !== 0 ? recargoServicioDerivado : recargoServicioIA;

  const items = normalizarItems(Array.isArray(analisis?.items) ? analisis.items : []);

  const recargosPositivos = round2(recargos.filter((r) => r.monto > 0).reduce((a, r) => a + r.monto, 0));
  const descuentos = round2(
    recargos.filter((r) => r.tipo === "descuento" && r.monto < 0).reduce((a, r) => a + Math.abs(r.monto), 0)
  );

  const totalEsperado = round2(subtotal + igv + recargosPositivos - descuentos);

  const delta = round2(importeTotal - totalEsperado);
  const tolerancia = 0.2;

  let importeTotalFinal = importeTotal;
  if (importeTotalFinal === 0 && totalEsperado > 0) {
    importeTotalFinal = totalEsperado;
  } else if (Math.abs(delta) <= tolerancia && totalEsperado > 0) {
    importeTotalFinal = totalEsperado;
  }

  const personas = Array.isArray(analisis?.personas) ? analisis.personas : [];

  return {
    moneda,
    subtotal,
    igv,
    recargoServicio: round2(recargoServicio),
    importeTotal: round2(importeTotalFinal),
    items,
    personas,
    recargos,
  } as any;
}

// ---------------------------------------------
// Prompt + Schema (Structured Outputs)
// ---------------------------------------------

const PROMPT_SISTEMA = `
Eres un asistente experto en analizar tickets y boletas de consumo de restaurantes en Perú.

Devuelve un JSON EXACTO del schema.

Reglas:
- Moneda: PEN
- Usa SOLO lo que esté en la imagen/lines.
- Items: nombre literal, no resumir.
- Si hay "RECARGO CONSUMO", colócalo como recargoServicio y además en recargos[] tipo "servicio".
- personas: SOLO si el contexto trae nombres (sino []).

IMPORTANTE (tickets tipo Chili's):
En muchas boletas, la línea de item es:
"CANTIDAD NOMBRE TOTAL"
donde el monto final es TOTAL de línea (no unitario).
`;

const ANALISIS_TICKET_SCHEMA = {
  name: "analisis_ticket",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["moneda", "subtotal", "igv", "importeTotal", "items", "personas", "recargos"],
    properties: {
      moneda: { type: "string", enum: ["PEN"] },
      subtotal: { type: "number" },
      igv: { type: "number" },
      recargoServicio: { type: "number" },
      importeTotal: { type: "number" },
      recargos: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["tipo", "monto"],
          properties: {
            tipo: { type: "string", enum: ["servicio", "delivery", "propina", "redondeo", "descuento", "otro"] },
            monto: { type: "number" },
          },
        },
      },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["nombre", "cantidad", "precioUnitario", "total", "categoria", "esBonificacion"],
          properties: {
            nombre: { type: "string" },
            cantidad: { type: "number" },
            precioUnitario: { type: "number" },
            total: { type: "number" },
            categoria: { type: "string", enum: ["plato", "bebida", "postre", "otro"] },
            esBonificacion: { type: "boolean" },
          },
        },
      },
      personas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["nombre", "consumo"],
          properties: {
            nombre: { type: "string" },
            consumo: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["item", "cantidad"],
                properties: {
                  item: { type: "string" },
                  cantidad: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

// ---------------------------------------------
// Paso A: Imagen -> raw_lines[]
// ---------------------------------------------

const TRANSCRIBIR_PROMPT = `
Eres un OCR especializado en tickets de restaurante en Perú.
Devuelve SOLO un JSON: { "lines": string[] }

Reglas:
- Todas las líneas visibles, mismo orden.
- No corrijas ortografía.
- No inventes.
- No resumas.
`;

const TRANSCRIBIR_SCHEMA = {
  name: "ticket_lines",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["lines"],
    properties: {
      lines: { type: "array", items: { type: "string" } },
    },
  },
} as const;

export async function transcribirTicketALineas(file: File): Promise<string[]> {
  const base64 = await fileToBase64(file);
  const mimeType = file.type || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: TRANSCRIBIR_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe el ticket." },
          { type: "image_url", image_url: { url: dataUrl } },
        ] as any,
      },
    ],
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: TRANSCRIBIR_SCHEMA as any,
    } as any,
  });

  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error("No se pudo transcribir el ticket");

  const parsed = JSON.parse(text);
  const lines = Array.isArray(parsed?.lines) ? parsed.lines : [];
  return lines.map((l: any) => String(l).trim()).filter(Boolean);
}

// ---------------------------------------------
// Parser determinístico de items desde raw_lines
// (soluciona el caso Chili's)
// ---------------------------------------------

const ITEM_LINE_REGEX = /^\s*(\d+(?:\.\d+)?)\s+(.+?)\s+(\d+\.\d{2})\s*$/;

const IGNORE_REGEX =
  /(OP\.?\s*GRAVADA|I\.?G\.?V\.?|RECARGO|ICBPER|IMPORTE\s+TOTAL|VISA|VUELTO|RUC|BOLETA|TICKET|MESA|CAJERO|FECHA)/i;

function inferirCategoria(nombre: string): LineaItem["categoria"] {
  const n = nombre.toLowerCase();
  if (/(cake|gallet|choco|oreo|molten|dessert|torta|helad)/.test(n)) return "postre";
  if (/(shake|straw|bliss|tropical|jugo|agua|cola|tea|bebida)/.test(n)) return "bebida";
  return "plato";
}

/**
 * ✅ Qty + Total-final => total de línea.
 * unit = total/qty
 */
export function parsearItemsDesdeLineas(rawLines: string[]): LineaItem[] {
  const items: LineaItem[] = [];

  for (const line of rawLines) {
    if (!line) continue;
    if (IGNORE_REGEX.test(line)) continue;

    const m = line.match(ITEM_LINE_REGEX);
    if (!m) continue;

    const qty = Number(m[1]);
    const name = m[2].trim();
    const lineTotal = Number(m[3]);

    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(lineTotal) || lineTotal < 0) continue;
    if (!name) continue;

    const unit = round2(lineTotal / qty);

    items.push({
      nombre: name,
      cantidad: qty,
      total: round2(lineTotal),
      precioUnitario: unit,
      categoria: inferirCategoria(name),
      esBonificacion: false,
    });
  }

  return items;
}

// ---------------------------------------------
// Paso B IA: raw_lines -> AnalisisTicketIA completo
// (OJO: NO se llama "parsearLineasATicket" para evitar colisiones)
// ---------------------------------------------

function buildParseUserPrompt(raw_lines: string[], contexto?: string) {
  return `
raw_lines:
${raw_lines.map((l) => `- ${l}`).join("\n")}

Contexto:
${contexto && contexto.trim() ? contexto : "(sin contexto)"}
`.trim();
}

export async function parsearLineasATicketConIA(
  raw_lines: string[],
  contexto?: string
): Promise<AnalisisTicketIA> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: PROMPT_SISTEMA },
      { role: "user", content: buildParseUserPrompt(raw_lines, contexto) },
    ],
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: ANALISIS_TICKET_SCHEMA as any,
    } as any,
  });

  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error("IA no devolvió contenido");

  const parsedRaw = JSON.parse(text);
  const normalizado = normalizarAnalisisMejorado(parsedRaw);
  const { recargos: _recargos, ...compatible } = normalizado as any;

  return compatible as AnalisisTicketIA;
}

// ---------------------------------------------
// Validación + retry
// ---------------------------------------------

function validarBasico(result: AnalisisTicketIA) {
  const total = Number((result as any).importeTotal ?? 0);
  const subtotal = Number((result as any).subtotal ?? 0);
  const igv = Number((result as any).igv ?? 0);
  const recargo = Number((result as any).recargoServicio ?? 0);

  if (total <= 0) return { ok: false, reason: "total_missing" };
  if (subtotal <= 0) return { ok: false, reason: "subtotal_missing" };

  const expected = round2(subtotal + igv + recargo);
  const diff = Math.abs(round2(total - expected));

  if (diff > 2.0) return { ok: false, reason: `totals_mismatch_${diff}` };

  return { ok: true, reason: "ok" };
}

const RETRY_PROMPT = `
Te voy a dar raw_lines y un JSON preliminar. Tu tarea es SOLO corregir:
- subtotal
- igv
- recargoServicio
- importeTotal
y recargos[] si aplica

NO cambies items salvo que estén claramente mal.
Devuelve SOLO JSON completo válido en el schema.
`;

// ---------------------------------------------
// Export principal (imagen -> AnalisisTicketIA)
// (solo IA directa a imagen)
// ---------------------------------------------

export async function analizarTicketConIA(file: File, contexto?: string): Promise<AnalisisTicketIA> {
  const base64 = await fileToBase64(file);
  const mimeType = file.type || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const promptUsuario = `
Analiza el ticket de restaurante de la imagen y devuelve SOLO el JSON del esquema solicitado.

Contexto adicional:
${contexto && contexto.trim() ? contexto : "(sin contexto)"}
`.trim();

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: PROMPT_SISTEMA },
      {
        role: "user",
        content: [
          { type: "text", text: promptUsuario },
          { type: "image_url", image_url: { url: dataUrl } },
        ] as any,
      },
    ],
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: ANALISIS_TICKET_SCHEMA as any,
    } as any,
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("La IA no devolvió contenido");

  const parsedRaw = JSON.parse(text);
  const normalizado = normalizarAnalisisMejorado(parsedRaw);
  const { recargos: _recargos, ...compatible } = normalizado as any;

  return compatible as AnalisisTicketIA;
}

// ---------------------------------------------
// Pipeline v2 (recomendado): Imagen -> raw_lines -> IA -> patch items -> retry
// ---------------------------------------------

export async function analizarTicketConIA_v2(
  file: File,
  contexto?: string
): Promise<{ parsed: AnalisisTicketIA; raw_lines: string[] }> {
  // A) transcribir
  const raw_lines = await transcribirTicketALineas(file);

  // B) IA: construir AnalisisTicketIA completo
  let analysis = await parsearLineasATicketConIA(raw_lines, contexto);

  // C) Patch determinístico de items (Chili's)
  const itemsFromLines = parsearItemsDesdeLineas(raw_lines);
  if (itemsFromLines.length >= 5) {
    analysis = { ...analysis, items: itemsFromLines };
  }

  // D) validar
  const v = validarBasico(analysis);

  // E) retry 1 vez
  if (!v.ok) {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: RETRY_PROMPT },
        { role: "user", content: JSON.stringify({ raw_lines, preliminar: analysis }) },
      ],
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: ANALISIS_TICKET_SCHEMA as any,
      } as any,
    });

    const text = res.choices[0]?.message?.content;
    if (text) {
      const retryParsedRaw = JSON.parse(text);
      const normalizado = normalizarAnalisisMejorado(retryParsedRaw);
      const { recargos: _recargos, ...compatible } = normalizado as any;

      // reaplicar patch items
      const patchedItems = parsearItemsDesdeLineas(raw_lines);
      analysis = {
        ...(compatible as AnalisisTicketIA),
        items: patchedItems.length >= 5 ? patchedItems : (compatible as any).items,
      };
    }
  }

  return { parsed: analysis, raw_lines };
}

// ---------------------------------------------
// Extra: Transcribir SOLO tabla de items (si lo quieres usar)
// ---------------------------------------------

const TABLE_ONLY_PROMPT = `
Eres un OCR especializado SOLO en la sección de ITEMS (productos) de un ticket de restaurante en Perú.

Devuelve SOLO JSON:
{ "items_lines": string[] }

Reglas:
- Incluye únicamente líneas de productos (no OP.GRAVADA, IGV, RECARGO, TOTAL, VISA, VUELTO, etc.)
- Mantén el orden
- No inventes
`;

const TABLE_ONLY_SCHEMA = {
  name: "items_lines",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["items_lines"],
    properties: {
      items_lines: { type: "array", items: { type: "string" } },
    },
  },
} as const;

export async function transcribirSoloTablaItems(file: File): Promise<string[]> {
  const base64 = await fileToBase64(file);
  const mimeType = file.type || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: TABLE_ONLY_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Extrae SOLO la tabla de items." },
          { type: "image_url", image_url: { url: dataUrl } },
        ] as any,
      },
    ],
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: TABLE_ONLY_SCHEMA as any,
    } as any,
  });

  const text = res.choices[0]?.message?.content;
  if (!text) return [];

  const parsed = JSON.parse(text);
  return (parsed.items_lines || []).map((s: any) => String(s).trim()).filter(Boolean);
}
