// lib/excel/generarExcel.ts
import ExcelJS from "exceljs";

export type Categoria = "plato" | "bebida" | "postre" | "otro";

export type LineaItem = {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
  categoria: Categoria;
  esBonificacion: boolean;
};

export type ConsumoPersonaItem = {
  item: string;      // nombre del producto tal como aparece en items.nombre
  cantidad: number;  // puede ser 1, 2, 0.5, etc.
};

export type PersonaConsumo = {
  nombre: string;
  consumo: ConsumoPersonaItem[];
};

export type AnalisisTicketIA = {
  moneda: string;
  subtotal: number;
  igv: number;
  recargoServicio: number;
  importeTotal: number;
  items: LineaItem[];
  personas?: PersonaConsumo[]; // puede venir vacío si la IA no asigna nada
};

/** Versión plantilla: fallback por si la IA falla o no hay info */
export async function generarExcelPorPersonas(cantidadPersonas: number) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Resumen por persona");

  sheet.columns = [
    { header: "Persona", key: "persona", width: 15 },
    { header: "Plato", key: "plato", width: 12 },
    { header: "Bebida", key: "bebida", width: 12 },
    { header: "Postre", key: "postre", width: 12 },
    { header: "Propina", key: "propina", width: 12 },
    { header: "Total", key: "total", width: 12 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (let i = 1; i <= cantidadPersonas; i++) {
    sheet.addRow({
      persona: `Persona ${i}`,
      plato: 0,
      bebida: 0,
      postre: 0,
      propina: 0,
      total: 0,
    });
  }

  const filaTotal = sheet.addRow({
    persona: "TOTAL",
    plato: 0,
    bebida: 0,
    postre: 0,
    propina: 0,
    total: 0,
  });
  filaTotal.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * Genera Excel usando:
 *  - analisis.items (detalle del ticket)
 *  - analisis.personas (distribución de consumo)
 */
export async function generarExcelDesdeAnalisis(
  analisis: AnalisisTicketIA,
  _cantidadPersonas: number, // ya no lo usamos directamente, confiamos en analisis.personas
) {
  const { items, recargoServicio, moneda, importeTotal, subtotal, igv } =
    analisis;

  const personas = analisis.personas ?? [];

  const workbook = new ExcelJS.Workbook();

  /* ---------- Hoja 1: Resumen por persona ---------- */
  const resumenSheet = workbook.addWorksheet("Resumen por persona");

  resumenSheet.columns = [
    { header: "Persona", key: "persona", width: 18 },
    { header: "Plato", key: "plato", width: 14 },
    { header: "Bebida", key: "bebida", width: 14 },
    { header: "Postre", key: "postre", width: 14 },
    { header: "Adicionales", key: "adicionales", width: 14 }, // 👈 nueva
    { header: "Propina", key: "propina", width: 14 },
    { header: "Total", key: "total", width: 14 },
  ];

  resumenSheet.getRow(1).font = { bold: true };

  resumenSheet.getRow(1).font = { bold: true };

  // Mapa nombreItem -> LineaItem
  const mapaItems = new Map<string, LineaItem>();
  for (const it of items) {
    mapaItems.set(it.nombre.toLowerCase(), it);
  }

  let sumaGlobalPlatos = 0;
  let sumaGlobalBebidas = 0;
  let sumaGlobalPostres = 0;
  let sumaGlobalAdicionales = 0; // 👈 nuevo
  let sumaGlobalPropina = 0;


  const numPersonas = personas.length || 1;
  const propinaPorPersona =
    numPersonas > 0 ? recargoServicio / numPersonas : 0;

  for (const persona of personas) {
    let totalPlato = 0;
    let totalBebida = 0;
    let totalPostre = 0;
    let totalAdicionales = 0; // 👈 nuevo

    for (const c of persona.consumo) {
      const item = mapaItems.get(c.item.toLowerCase());
      if (!item) continue;

      // saltar bonificaciones (costo 0)
      if (item.esBonificacion) continue;

      const unidadesTotales = item.cantidad || 1;
      const totalItem = item.total;
      const precioReal =
        unidadesTotales > 0 ? totalItem / unidadesTotales : 0;

      const parcial = precioReal * c.cantidad;

      // 👇 clasificación GENÉRICA por categoría
      switch (item.categoria) {
        case "plato":
          totalPlato += parcial;
          break;
        case "bebida":
          totalBebida += parcial;
          break;
        case "postre":
          totalPostre += parcial;
          break;
        default:
          // cualquier otra categoría (incl. "otro") va a Adicionales
          totalAdicionales += parcial;
          break;
      }
    }

    const propina = propinaPorPersona;
    const totalPersona =
      totalPlato +
      totalBebida +
      totalPostre +
      totalAdicionales +
      propina;

    sumaGlobalPlatos += totalPlato;
    sumaGlobalBebidas += totalBebida;
    sumaGlobalPostres += totalPostre;
    sumaGlobalAdicionales += totalAdicionales; // 👈 añade esta variable global
    sumaGlobalPropina += propina;

    resumenSheet.addRow({
      persona: persona.nombre,
      plato: totalPlato,
      bebida: totalBebida,
      postre: totalPostre,
      adicionales: totalAdicionales,
      propina,
      total: totalPersona,
    });
  }

  const filaTotal = resumenSheet.addRow({
    persona: "TOTAL",
    plato: sumaGlobalPlatos,
    bebida: sumaGlobalBebidas,
    postre: sumaGlobalPostres,
    adicionales: sumaGlobalAdicionales,
    propina: sumaGlobalPropina,
    total: importeTotal,
  });
  filaTotal.font = { bold: true };


  /* ---------- Hoja 2: Detalle ticket ---------- */
  const detalleSheet = workbook.addWorksheet("Detalle ticket");

  detalleSheet.columns = [
    { header: "Producto", key: "nombre", width: 28 },
    { header: "Categoría", key: "categoria", width: 14 },
    { header: "Bonificación", key: "bonificacion", width: 14 },
    { header: "Cantidad", key: "cantidad", width: 10 },
    { header: "Precio unitario", key: "precioUnitario", width: 16 },
    { header: "Total", key: "total", width: 12 },
  ];

  detalleSheet.getRow(1).font = { bold: true };

  items.forEach((item) => {
    detalleSheet.addRow({
      nombre: item.nombre,
      categoria: item.categoria,
      bonificacion: item.esBonificacion ? "Sí" : "No",
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      total: item.total,
    });
  });

  detalleSheet.addRow({});
  detalleSheet.addRow({ nombre: "Subtotal", total: subtotal });
  detalleSheet.addRow({ nombre: "IGV", total: igv });
  detalleSheet.addRow({
    nombre: "Recargo/Servicio",
    total: recargoServicio,
  });
  detalleSheet.addRow({
    nombre: `Importe total (${moneda})`,
    total: importeTotal,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}
