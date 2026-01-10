// lib/ia/analizarTicket.ts
import { openai } from "./openaiClient";
import type { AnalisisTicketIA, LineaItem } from "@/lib/excel/generarExcel";

/**
 * ✅ MEJORAS INCLUIDAS
 * - Structured Outputs con JSON Schema (evita JSON roto)
 * - recargos[] detallados (servicio, delivery, propina, redondeo, descuento, otro)
 * - Normalización más robusta (redondeo PEN, tolerancias, cuadre)
 * - Limpieza de nombres y combinación de duplicados más tolerante
 *
 * Nota:
 * - Mantengo compatibilidad: sigo devolviendo AnalisisTicketIA (con recargoServicio).
 * - Además adjunto `recargos` (si tu tipo aún no lo tiene, puedes ignorarlo o actualizar el type).
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

/** Normaliza nombre para keys (sin perder el original final) */
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
  monto: number; // puede ser negativo si es descuento
};

// ---------------------------------------------
// Combinar duplicados (más tolerante)
// ---------------------------------------------

/**
 * Combina ítems duplicados por:
 * - nombre normalizado
 * - categoria
 * - esBonificacion
 * - precioUnitario (2 decimales)
 */
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
// Normalización principal (cuadre, tolerancias)
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

    // Si parece bonificación por precio/total 0
    if (precioUnitario === 0 || total === 0) {
      // OJO: puede existir item real de 0.00; pero en tickets suele ser bonificación/promo
      // Si quieres ser más estricto, quita esta línea y deja que IA lo marque.
      // Aquí respetamos el flag si vino true, y si no, lo inferimos suave:
      esBonificacion = esBonificacion || true;
    }

    // Regla: bonificación => total 0
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

    // Limpieza numérica
    cantidad = clampNonNegative(cantidad);
    precioUnitario = round2(precioUnitario);
    total = round2(total);

    // Coherencia con tolerancia:
    // - Si total está presente (no 0) se respeta.
    // - Si total es 0 pero precio*cantidad > 0, recalcular.
    const calculado = round2(precioUnitario * cantidad);
    const diff = Math.abs(calculado - total);

    // Si total parece "inconsistente" por error OCR, arreglar con reglas:
    // - Si total está vacío/cero => usar calculado
    // - Si diff es grande => prioriza total (porque suele ser la columna más confiable)
    if (total === 0 && calculado > 0) {
      total = calculado;
    } else if (diff > 0.05 && precioUnitario > 0 && cantidad > 0) {
      // Intentar ajustar cantidad si total/precio da entero o algo cercano a x.0 / x.5
      const posible = total / precioUnitario;
      const posibleRounded = Math.round(posible * 2) / 2; // permite 0.5
      if (Math.abs(posible - posibleRounded) <= 0.01) {
        cantidad = posibleRounded;
      } else {
        // Si no, mantén total y deja calculado como está (total manda)
        // (no tocamos total)
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

/**
 * Normaliza analisis completo.
 * - Genera recargoServicio como suma de recargos tipo "servicio" si existe
 * - Hace cuadre suave con tolerancia (no revienta, solo corrige redondeos)
 */
function normalizarAnalisisMejorado(analisis: any): AnalisisTicketIA & { recargos?: Recargo[] } {
  const moneda = analisis?.moneda === "PEN" ? "PEN" : "PEN";

  const subtotal = round2(Number(analisis?.subtotal ?? 0));
  const igv = round2(Number(analisis?.igv ?? 0));
  const importeTotal = round2(Number(analisis?.importeTotal ?? 0));

  const recargos = normalizarRecargos(analisis?.recargos);
  const recargoServicioIA = round2(Number(analisis?.recargoServicio ?? 0));

  // Derivar recargoServicio desde recargos[] si existe, sino usa el campo antiguo
  const recargoServicioDerivado = round2(
    recargos.filter((r) => r.tipo === "servicio" && r.monto > 0).reduce((a, r) => a + r.monto, 0)
  );

  const recargoServicio = recargoServicioDerivado !== 0 ? recargoServicioDerivado : recargoServicioIA;

  const items = normalizarItems(Array.isArray(analisis?.items) ? analisis.items : []);

  // Cuadre (soft):
  // totalEsperado = subtotal + igv + recargosPositivos - descuentos
  const recargosPositivos = round2(recargos.filter((r) => r.monto > 0).reduce((a, r) => a + r.monto, 0));
  const descuentos = round2(
    recargos.filter((r) => r.tipo === "descuento" && r.monto < 0).reduce((a, r) => a + Math.abs(r.monto), 0)
  );

  const totalEsperado = round2(subtotal + igv + recargosPositivos - descuentos);

  // Si la diferencia es pequeña, ajusta por redondeo:
  const delta = round2(importeTotal - totalEsperado);
  const tolerancia = 0.2;

  let importeTotalFinal = importeTotal;
  if (importeTotalFinal === 0 && totalEsperado > 0) {
    importeTotalFinal = totalEsperado;
  } else if (Math.abs(delta) <= tolerancia && totalEsperado > 0) {
    // En tickets reales, a veces hay redondeo +/- 0.01–0.10
    importeTotalFinal = totalEsperado;
  }

  // Personas (mantener)
  const personas = Array.isArray(analisis?.personas) ? analisis.personas : [];

  // Retorno compatible con tu tipo + extra recargos
  return {
    moneda,
    subtotal,
    igv,
    recargoServicio: round2(recargoServicio),
    importeTotal: round2(importeTotalFinal),
    items,
    personas,
    recargos, // extra útil (si tu type no lo tiene, no pasa nada en runtime)
  } as any;
}

// ---------------------------------------------
// Prompt + Schema (Structured Outputs)
// ---------------------------------------------

const PROMPT_SISTEMA = `
Eres un asistente experto en analizar tickets y boletas de consumo de restaurantes en Perú.

Tu tarea tiene DOS objetivos principales:

1) ANALIZAR EL TICKET DE LA IMAGEN
Debes identificar:
- Moneda (PEN)
- Subtotal (op. gravada)
- IGV
- Recargos o cargos adicionales (si existen) DESGLOSADOS
- Importe total
- Lista COMPLETA de productos

Productos:
- nombre: string (NO resumir, NO corregir, NO reordenar)
- cantidad: number
- precioUnitario: number
- total: number
- categoria: "plato" | "bebida" | "postre" | "otro"
- esBonificacion: boolean

REGLAS IMPORTANTES PARA LOS PRODUCTOS:
1. NO RESUMAS NI ACORTES LOS NOMBRES. Une líneas consecutivas con " + ".
2. COPIA LOS NOMBRES LITERALMENTE: mismo orden y texto.
3. BONIFICACIONES: si aparece bonificación/desc/0.00 o unitario cero:
   - esBonificacion = true
   - total = 0
4. COHERENCIA:
   - total ≈ cantidad × precioUnitario
   - si hay confusión, respeta SIEMPRE la columna de total.

RECARGOS:
Devuelve un arreglo recargos[] con objetos { tipo, monto }.
- tipo: "servicio" | "delivery" | "propina" | "redondeo" | "descuento" | "otro"
- monto: number (descuento puede ser negativo o positivo; si es descuento, usa negativo idealmente)

2) DISTRIBUCIÓN POR PERSONA (CON CONTEXTO)
- SOLO generar "personas" si el usuario da nombres o contexto.
- Si NO hay contexto → "personas": [].
- NO usar nombres administrativos del ticket.
- NO inventar items: item debe coincidir EXACTO con items[].nombre.
`;

/**
 * JSON Schema para Structured Outputs.
 * OJO: para maximizar estabilidad, permite números, arrays, enums.
 */
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
      // Mantengo recargoServicio por compatibilidad, pero se recomienda usar recargos[]
      recargoServicio: { type: "number" },
      importeTotal: { type: "number" },
      recargos: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["tipo", "monto"],
          properties: {
            tipo: {
              type: "string",
              enum: ["servicio", "delivery", "propina", "redondeo", "descuento", "otro"],
            },
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
// Export principal
// ---------------------------------------------

export async function analizarTicketConIA(
  file: File,
  contexto?: string
): Promise<AnalisisTicketIA> {
  const base64 = await fileToBase64(file);
  const mimeType = file.type || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const promptUsuario = `
Analiza el ticket de restaurante de la imagen y devuelve SOLO el JSON del esquema solicitado.

Contexto adicional proporcionado por el usuario (descripción de quién pidió qué):
${contexto && contexto.trim().length > 0 ? contexto : "(sin contexto específico)"}
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
    // ✅ Structured Outputs
    response_format: {
      type: "json_schema",
      json_schema: ANALISIS_TICKET_SCHEMA as any,
    } as any,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("La IA no devolvió contenido");

  // Con json_schema normalmente ya viene JSON puro en string.
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
      ? content.map((c: any) => (typeof c === "string" ? c : c.text ?? "")).join("\n")
      : String(content);

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Por si alguna vez viene con fences (raro con json_schema)
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error("Error parseando JSON de la IA:", text);
      throw new Error("La IA no devolvió un JSON válido");
    }
  }

  const normalizado = normalizarAnalisisMejorado(parsed);

  // Si tu tipo AnalisisTicketIA no contempla `recargos`, aquí lo “quitamos” al devolver:
  // (De lo contrario, puedes devolverlo y actualizar tu type)
  const { recargos: _recargos, ...compatible } = normalizado as any;

  return compatible as AnalisisTicketIA;
}
