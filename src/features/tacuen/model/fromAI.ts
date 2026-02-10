import type { ReceiptModel, ReceiptItem, FeeModel, FeeType } from "./types";

const toCents = (n: any) => Math.round((Number(n) || 0) * 100);

function feeTypeFromKey(key: string): FeeType {
  if (key === "igv") return "tax";
  if (key === "recargo_consumo") return "service";
  if (key === "servicio") return "service";
  if (key === "delivery") return "delivery";
  if (key === "propina") return "tip";
  if (key === "descuento") return "discount";
  return "service";
}

export function receiptModelFromAI(ai: any): ReceiptModel {
  const receiptId = `receipt-${Date.now()}`;

  const items: ReceiptItem[] = (ai.items ?? []).map((it: any, i: number) => {
    const total = Number(it.total) || 0;
    const qty = Number(it.cantidad) || 1;
    const unit = Number(it.precioUnitario) || (qty ? total / qty : 0);

    return {
      id: `item-${i}-${Date.now()}`,
      name: String(it.nombre ?? "").trim(),
      qty,
      unitPriceCents: toCents(unit),
      totalCents: toCents(total),
      category: it.categoria ?? "otro",
      isFree: Boolean(it.esBonificacion),
    };
  });

  // fees: IGV + recargo consumo (si vienen)
  const fees: FeeModel[] = [];

  if (toCents(ai.igv) > 0) {
    fees.push({
      id: `fee-igv-${Date.now()}`,
      key: "igv",
      type: "tax",
      label: "IGV",
      amountCents: toCents(ai.igv),
      enabled: true,
      includedInItems: true, // normalmente IGV ya está incluido en precios
      splitMode: "proportional",
    });
  }

  // Si tu IA retorna recargoConsumo separado mejor; si no, usa recargoServicio como fallback
  const recargoConsumo = toCents(ai.recargoConsumo ?? 0);
  const recargoServicio = toCents(ai.recargoServicio ?? 0);

  const recargo = recargoConsumo > 0 ? recargoConsumo : recargoServicio;

  if (recargo > 0) {
    fees.push({
      id: `fee-recargo-${Date.now()}`,
      key: "recargo_consumo",
      type: "service",
      label: "Recargo Consumo",
      amountCents: recargo,
      enabled: true,
      includedInItems: false,
      splitMode: "proportional",
    });
  }

  const subtotalCents = toCents(ai.subtotal);
  const totalDetectedCents = toCents(ai.importeTotal);

  return {
    id: receiptId,
    name: ai?.nombreEvento ?? "Ticket",
    countryCode: "PE",
    currency: "PEN",
    items,
    fees,
    people: [],
    allocations: [],
    roundingStep: 0.5,
    roundingStrategy: "split",
    subtotalCents,
    totalDetectedCents,
    computedTotalCents: 0, // lo recalcula tu calculator.ts
    createdAt: Date.now(),
  };
}
