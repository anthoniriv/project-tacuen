// src/features/tacuen/model/excel.ts

import ExcelJS from "exceljs";
import type { ReceiptModel, CalculationSummary, AllocationMode } from "./types";

/**
 * Genera un Excel con 3 hojas según la especificación:
 * - Sheet1: Items (name, qty, unitPrice, total, allocationMode, participants)
 * - Sheet2: Personas (person, subtotal, fees, discount, total)
 * - Sheet3: Summary (totals, rounding, difference)
 */
export async function generateReceiptExcel(
  model: ReceiptModel,
  summary: CalculationSummary
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();

  // Sheet1: Items
  const itemsSheet = workbook.addWorksheet("Items");
  itemsSheet.columns = [
    { header: "Nombre", key: "name", width: 40 },
    { header: "Cantidad", key: "qty", width: 12 },
    { header: "Precio Unitario", key: "unitPrice", width: 16 },
    { header: "Total", key: "total", width: 14 },
    { header: "Modo Asignación", key: "allocationMode", width: 18 },
    { header: "Participantes", key: "participants", width: 30 },
  ];

  itemsSheet.getRow(1).font = { bold: true };
  itemsSheet.getRow(1).alignment = { horizontal: "center" };

  for (const item of model.items) {
    const allocation = model.allocations.find((a) => a.itemId === item.id);
    const mode = allocation
      ? formatAllocationMode(allocation.mode)
      : item.isFree
      ? "Bonificación"
      : "Sin asignar";
    
    const participants = allocation
      ? allocation.participants
          .map((pid) => {
            const person = model.people.find((p) => p.id === pid);
            return person?.name || pid;
          })
          .join(", ")
      : "";

    itemsSheet.addRow({
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
      total: item.total,
      allocationMode: mode,
      participants,
    });
  }

  // Sheet2: Personas
  const personasSheet = workbook.addWorksheet("Personas");
  personasSheet.columns = [
    { header: "Persona", key: "person", width: 20 },
    { header: "Subtotal Items", key: "itemsSubtotal", width: 16 },
    { header: "Delivery", key: "delivery", width: 14 },
    { header: "Tip", key: "tip", width: 14 },
    { header: "Service", key: "service", width: 14 },
    { header: "Tax", key: "tax", width: 14 },
    { header: "Descuento", key: "discount", width: 14 },
    { header: "Total", key: "total", width: 16 },
  ];

  personasSheet.getRow(1).font = { bold: true };
  personasSheet.getRow(1).alignment = { horizontal: "center" };

  for (const personTotal of summary.personTotals) {
    personasSheet.addRow({
      person: personTotal.personName,
      itemsSubtotal: personTotal.itemsSubtotal,
      delivery: personTotal.fees.delivery,
      tip: personTotal.fees.tip,
      service: personTotal.fees.service,
      tax: personTotal.fees.tax,
      discount: personTotal.discount,
      total: personTotal.total,
    });
  }

  // Fila total
  const totalRow = personasSheet.addRow({
    person: "TOTAL",
    itemsSubtotal: summary.totals.itemsSubtotal,
    delivery: summary.totals.fees.delivery,
    tip: summary.totals.fees.tip,
    service: summary.totals.fees.service,
    tax: summary.totals.fees.tax,
    discount: summary.totals.discount,
    total: summary.totals.total,
  });
  totalRow.font = { bold: true };
  totalRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };

  // Sheet3: Summary
  const summarySheet = workbook.addWorksheet("Summary");
  
  // Información general
  summarySheet.addRow(["Nombre del evento", model.name]);
  summarySheet.addRow(["Moneda", model.currency]);
  summarySheet.addRow(["Fecha", new Date(model.createdAt).toLocaleString("es-PE")]);
  summarySheet.addRow([]);

  // Totales
  summarySheet.addRow(["TOTALES", ""]);
  summarySheet.addRow(["Subtotal (Items)", summary.totals.itemsSubtotal]);
  summarySheet.addRow(["Delivery", summary.totals.fees.delivery]);
  summarySheet.addRow(["Tip", summary.totals.fees.tip]);
  summarySheet.addRow(["Service", summary.totals.fees.service]);
  summarySheet.addRow(["Tax (IGV)", summary.totals.fees.tax]);
  summarySheet.addRow(["Descuento", -summary.totals.discount]); // Negativo porque es descuento
  summarySheet.addRow(["Subtotal (Items + Fees)", summary.totals.subtotal]);
  summarySheet.addRow(["Total Final", summary.totals.total]);
  summarySheet.addRow(["Total Original", summary.totals.originalTotal]);
  summarySheet.addRow([]);

  // Rounding
  summarySheet.addRow(["ROUNDING", ""]);
  summarySheet.addRow(["Estrategia", formatRoundingStrategy(summary.totals.rounding.strategy)]);
  summarySheet.addRow(["Step", summary.totals.rounding.step]);
  summarySheet.addRow(["Aplicado", summary.totals.rounding.applied]);
  summarySheet.addRow(["Diferencia", summary.totals.difference]);
  summarySheet.addRow([]);

  // Resumen por persona (compacto)
  summarySheet.addRow(["RESUMEN POR PERSONA", ""]);
  summarySheet.addRow(["Persona", "Total"]);
  for (const personTotal of summary.personTotals) {
    summarySheet.addRow([personTotal.personName, personTotal.total]);
  }

  // Estilos para Summary
  summarySheet.getColumn(1).width = 25;
  summarySheet.getColumn(2).width = 20;
  summarySheet.getColumn(2).numFmt = "#,##0.00";

  const titleRows = [5, 14, 21];
  for (const rowNum of titleRows) {
    const row = summarySheet.getRow(rowNum);
    row.font = { bold: true };
    row.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
  }

  // Formato numérico para todas las hojas
  for (const sheet of [itemsSheet, personasSheet, summarySheet]) {
    const numCols = ["qty", "unitPrice", "total", "itemsSubtotal", "delivery", "tip", "service", "tax", "discount"];
    for (const col of sheet.columns) {
      if (col.key && numCols.includes(col.key as string)) {
        col.numFmt = "#,##0.00";
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

function formatAllocationMode(mode: AllocationMode): string {
  switch (mode) {
    case "all":
      return "Todos";
    case "equal_selected":
      return "Igual (Seleccionados)";
    case "portions":
      return "Porciones";
    case "fixed_amount":
      return "Monto Fijo";
    default:
      return mode;
  }
}

function formatRoundingStrategy(strategy: string): string {
  switch (strategy) {
    case "organizer":
      return "Organizador absorbe";
    case "split":
      return "Dividir entre todos";
    default:
      return strategy;
  }
}