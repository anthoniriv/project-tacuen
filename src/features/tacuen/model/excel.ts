// src/features/tacuen/model/excel.ts

import ExcelJS from "exceljs";
import type { ReceiptModel, CalculationSummary, AllocationMode } from "./types";
import { fromCents } from "./money";
import { computeReceiptTotals } from "./calculator";

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
      unitPrice: fromCents(item.unitPriceCents),
      total: fromCents(item.totalCents),
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
      itemsSubtotal: fromCents(personTotal.itemsSubtotalCents),
      delivery: personTotal.feesCents ? fromCents(personTotal.feesCents.delivery) : 0,
      tip: personTotal.feesCents ? fromCents(personTotal.feesCents.tip) : 0,
      service: personTotal.feesCents ? fromCents(personTotal.feesCents.service) : 0,
      tax: personTotal.feesCents ? fromCents(personTotal.feesCents.tax) : 0,
      discount: fromCents(personTotal.discountCents),
      total: fromCents(personTotal.totalCents),
    });
  }

  // Fila total
  const totalRow = personasSheet.addRow({
    person: "TOTAL",
    itemsSubtotal: fromCents(summary.totals.itemsSubtotalCents),
    delivery: summary.totals.feesCents ? fromCents(summary.totals.feesCents.delivery) : 0,
    tip: summary.totals.feesCents ? fromCents(summary.totals.feesCents.tip) : 0,
    service: summary.totals.feesCents ? fromCents(summary.totals.feesCents.service) : 0,
    tax: summary.totals.feesCents ? fromCents(summary.totals.feesCents.tax) : 0,
    discount: fromCents(summary.totals.discountCents),
    total: fromCents(summary.totals.totalCents),
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
  summarySheet.addRow(["Subtotal (Items)", fromCents(summary.totals.itemsSubtotalCents)]);
  if (summary.totals.feesCents) {
    summarySheet.addRow(["Delivery", fromCents(summary.totals.feesCents.delivery)]);
    summarySheet.addRow(["Tip", fromCents(summary.totals.feesCents.tip)]);
    summarySheet.addRow(["Service", fromCents(summary.totals.feesCents.service)]);
    summarySheet.addRow(["Tax (IGV)", fromCents(summary.totals.feesCents.tax)]);
  }
  summarySheet.addRow(["Descuento", -fromCents(summary.totals.discountCents)]); // Negativo porque es descuento
  summarySheet.addRow(["Subtotal (Items + Fees)", fromCents(summary.totals.subtotalCents)]);
  summarySheet.addRow(["Total Final", fromCents(summary.totals.totalCents)]);
  summarySheet.addRow(["Total Original", fromCents(summary.totals.totalDetectedCents)]);
  summarySheet.addRow([]);

  // Rounding
  summarySheet.addRow(["ROUNDING", ""]);
  summarySheet.addRow(["Estrategia", formatRoundingStrategy(summary.totals.rounding.strategy)]);
  summarySheet.addRow(["Step", summary.totals.rounding.step]);
  summarySheet.addRow(["Aplicado", fromCents(summary.totals.rounding.appliedCents)]);
  summarySheet.addRow(["Diferencia", fromCents(summary.totals.differenceCents)]);
  summarySheet.addRow([]);

  // Resumen por persona (compacto)
  summarySheet.addRow(["RESUMEN POR PERSONA", ""]);
  summarySheet.addRow(["Persona", "Total"]);
  for (const personTotal of summary.personTotals) {
    summarySheet.addRow([personTotal.personName, fromCents(personTotal.totalCents)]);
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

/**
 * Genera un Excel simple (sin personas): Items + Summary global
 */
export async function generateReceiptExcelSimple(model: ReceiptModel): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();

  // Sheet1: Items
  const itemsSheet = workbook.addWorksheet("Items");
  itemsSheet.columns = [
    { header: "Nombre", key: "name", width: 40 },
    { header: "Cantidad", key: "qty", width: 12 },
    { header: "Precio Unitario", key: "unitPrice", width: 16 },
    { header: "Total", key: "total", width: 14 },
  ];

  itemsSheet.getRow(1).font = { bold: true };
  itemsSheet.getRow(1).alignment = { horizontal: "center" };

  for (const item of model.items) {
    itemsSheet.addRow({
      name: item.name,
      qty: item.qty,
      unitPrice: fromCents(item.unitPriceCents),
      total: fromCents(item.totalCents),
    });
  }

  // Sheet2: Summary
  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.addRow(["Nombre del evento", model.name]);
  summarySheet.addRow(["Moneda", model.currency]);
  summarySheet.addRow(["Fecha", new Date(model.createdAt).toLocaleString("es-PE")]);
  summarySheet.addRow([]);

  const totals = computeReceiptTotals(model, model.countryCode);

  summarySheet.addRow(["TOTALES", ""]);
  summarySheet.addRow(["Subtotal (Items)", fromCents(totals.itemsSubtotalCents)]);

  const enabledFees = model.fees.filter((f) => f.enabled);
  for (const fee of enabledFees) {
    summarySheet.addRow([
      `${fee.label}${fee.includedInItems ? " (incluido)" : ""}`,
      fromCents(fee.amountCents),
    ]);
  }

  summarySheet.addRow(["Total Calculado", fromCents(totals.computedGrandTotalCents)]);
  summarySheet.addRow(["Total Original", fromCents(model.totalDetectedCents)]);
  summarySheet.addRow(["Diferencia", fromCents(totals.differenceCents)]);

  summarySheet.getColumn(1).width = 30;
  summarySheet.getColumn(2).width = 20;
  summarySheet.getColumn(2).numFmt = "#,##0.00";

  return workbook.xlsx.writeBuffer();
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
