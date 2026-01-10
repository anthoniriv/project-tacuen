// lib/ia/analizarTicket.ts
import { openai } from "./openaiClient";
import type {
  AnalisisTicketIA,
  LineaItem,
} from "@/lib/excel/generarExcel";

/** Convierte un File (Web API) a base64 */
async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64");
}

/** Combina ítems duplicados (mismo nombre + categoría + bonificación + precioUnitario) */
function combinarItemsDuplicados(items: LineaItem[]): LineaItem[] {
  const map = new Map<string, LineaItem>();

  for (const item of items) {
    const key = `${item.nombre.toLowerCase()}|${item.categoria}|${item.esBonificacion}|${item.precioUnitario}`;

    const existente = map.get(key);
    if (!existente) {
      map.set(key, { ...item });
    } else {
      existente.cantidad += item.cantidad;
      existente.total += item.total;
    }
  }

  return Array.from(map.values());
}

/** Normaliza la salida de la IA para forzar coherencia y manejar bonificaciones */
function normalizarAnalisis(analisis: AnalisisTicketIA): AnalisisTicketIA {
  const itemsNormalizados: LineaItem[] = analisis.items.map((item) => {
    let { cantidad, precioUnitario, total, esBonificacion } = item;

    // 1) Si es bonificación: total siempre 0
    if (esBonificacion) {
      return {
        ...item,
        total: 0,
      };
    }

    // 2) Forzar total ≈ cantidad * precioUnitario cuando sea posible
    if (precioUnitario > 0 && cantidad > 0) {
      const calculado = precioUnitario * cantidad;

      if (Math.abs(calculado - total) > 0.01) {
        const posibleCantidad = total / precioUnitario;

        if (Number.isInteger(posibleCantidad)) {
          cantidad = posibleCantidad;
        } else {
          total = calculado;
        }
      }
    }

    return {
      ...item,
      cantidad,
      total,
      precioUnitario,
    };
  });

  const combinados = combinarItemsDuplicados(itemsNormalizados);

  return {
    ...analisis,
    items: combinados,
    personas: analisis.personas ?? [],
  };
}

export async function analizarTicketConIA(
  file: File,
  contexto?: string
): Promise<AnalisisTicketIA> {
  const base64 = await fileToBase64(file);
  const mimeType = file.type || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${base64}`;

const promptSistema = `
Eres un asistente experto en analizar tickets y boletas de consumo de restaurantes en Perú.

Tu tarea tiene DOS objetivos principales:

────────────────────────────────────────
─── 1) ANALIZAR EL TICKET DE LA IMAGEN ─
────────────────────────────────────────

Debes identificar:
- Moneda
- Subtotal (op. gravada)
- IGV
- Recargos o cargos adicionales (si existen)
- Importe total
- Lista COMPLETA de productos

Cada producto debe incluir:
- nombre: string
- cantidad: number
- precioUnitario: number
- total: number
- categoria: "plato" | "bebida" | "postre" | "otro"
- esBonificacion: boolean

REGLAS IMPORTANTES PARA LOS PRODUCTOS:

1. **NO RESUMAS NI ACORTES LOS NOMBRES**
   Los nombres deben incluir TODAS las palabras asociadas al producto.
   Si en la boleta un producto aparece en varias líneas, debes unirlas.

   Ejemplo:
     FILETE DE POLLO (PEC)
     + PAPAS FRITAS REGULAR
     + ENSALADA COCIDA REGULAR

   Debe quedar así:
     "FILETE DE POLLO (PEC) + PAPAS FRITAS REGULAR + ENSALADA COCIDA REGULAR"

2. **CONCATENA TODAS LAS LÍNEAS DE UN MISMO PRODUCTO**
   Si un ítem aparece en varias líneas consecutivas, únelas en un único nombre usando " + ".

3. **COPIA LOS NOMBRES LITERALMENTE**
   No cambies palabras, no reordenes, no simplifiques. Mantén el orden y texto original.

4. **BONIFICACIONES**
   Si aparece “bonificación”, “desc”, “0.00”, o precio unitario cero, marca:
   - esBonificacion = true
   - total = 0
   (Aunque la boleta muestre un precio de referencia.)

5. **CATEGORÍAS**
   Usa sentido común:
   - platos → platos fuertes, pollos, carnes, menús, entradas
   - bebidas → gaseosas, jarra, jugos, cervezas, agua, etc.
   - postres → helados, tortas, dulces
   - otro → conceptos no comestibles, servicios, cargos, empaques

6. **COHERENCIA**
   total ≈ cantidad × precioUnitario
   Si la boleta es confusa, respeta SIEMPRE la columna de total.


──────────────────────────────────────────────
─── 2) DISTRIBUCIÓN POR PERSONA (CON CONTEXTO) ─
──────────────────────────────────────────────

- SOLO generar "personas" si el usuario da nombres o contexto.
- Si NO hay contexto → "personas": [].

REGLAS IMPORTANTES:

1. **NO USAR NOMBRES DEL TICKET**
   No uses cliente, cajero, colaborador ni nombres administrativos como consumidores.

2. **CONSUMO POR PERSONA**
   El usuario puede indicar quién pidió qué, cantidades, o particiones.
   Debes asignar consumos exactos según ese contexto.

3. **CANTIDADES EXACTAS**
   - Soporta cantidades decimales (ej. 0.5 para “mitad y mitad”).
   - No inventes consumos para ítems no mencionados por el usuario.

4. **NO INVENTES ITEMS**
   Todo item en personas[].consumo debe existir exactamente en items[].nombre.

5. **COINCIDENCIA EXACTA**
   El valor de "item" dentro de cada consumo debe ser EXACTAMENTE igual (misma cadena)
   a items[i].nombre (sin resumir, sin corregir, sin cambiar nada).


───────────────────────────
─── FORMATO DE RESPUESTA ──
───────────────────────────

Devuelve SIEMPRE un JSON válido con esta estructura EXACTA:

{
  "moneda": "PEN",
  "subtotal": number,
  "igv": number,
  "recargoServicio": number,
  "importeTotal": number,

  "items": [
    {
      "nombre": string,
      "cantidad": number,
      "precioUnitario": number,
      "total": number,
      "categoria": "plato" | "bebida" | "postre" | "otro",
      "esBonificacion": boolean
    }
  ],

  "personas": [
    {
      "nombre": string,
      "consumo": [
        {
          "item": string,
          "cantidad": number
        }
      ]
    }
  ]
}

No incluyas explicaciones, comentarios, texto adicional, markdown ni nada fuera del JSON.
`;

  const promptUsuario = `
Analiza el ticket de restaurante de la imagen y devuelve SOLO el JSON descrito.

Contexto adicional proporcionado por el usuario (descripción de quién pidió qué):
${contexto && contexto.trim().length > 0 ? contexto : "(sin contexto específico)"}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: promptSistema },
      {
        role: "user",
        content: [
          { type: "text", text: promptUsuario },
          {
            type: "image_url",
            image_url: { url: dataUrl },
          },
        ] as any,
      },
    ],
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("La IA no devolvió contenido");
  }

  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
      ? content
          .map((c: any) => (typeof c === "string" ? c : c.text ?? ""))
          .join("\n")
      : String(content);

  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  let parsed: AnalisisTicketIA;

  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("Error parseando JSON de la IA:", cleaned);
    throw new Error("La IA no devolvió un JSON válido");
  }

  const normalizado = normalizarAnalisis(parsed);
  return normalizado;
}
