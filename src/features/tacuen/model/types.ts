// src/features/tacuen/model/types.ts

/**
 * Modelo intermedio validado para el cálculo de división de cuenta
 * IMPORTANTE: Todos los montos se manejan en centavos (integers) para evitar floating point errors
 */

export type MoneyCents = number; // Siempre en centavos (ej: 34900 = 349.00 PEN)

export type ReceiptItem = {
  id: string;
  name: string;
  qty: number;
  unitPriceCents: MoneyCents; // Precio unitario en centavos
  totalCents: MoneyCents; // Total en centavos
  category: "plato" | "bebida" | "postre" | "otro";
  isFree: boolean;
};

export type Person = {
  id: string;
  name: string;
};

export type AllocationMode = "all" | "equal_selected" | "portions" | "fixed_amount";

export type Allocation = {
  itemId: string;
  mode: AllocationMode;
  participants: string[]; // personIds
  portions?: Record<string, number>; // personId -> portion (solo si mode === "portions")
  fixedAmounts?: Record<string, MoneyCents>; // personId -> amountCents (solo si mode === "fixed_amount")
};

export type FeeType = "delivery" | "tip" | "service" | "tax" | "discount";

export type FeeModel = {
  id: string;
  key: string; // "igv", "recargo_consumo", "propina", etc.
  type: FeeType;
  label: string;
  amountCents: MoneyCents;
  enabled: boolean;
  includedInItems: boolean; // true = ya está incluido en los items, no se suma al total
  splitMode: "equal" | "proportional"; // igual o proporcional al consumo
};

export type RoundingStrategy = "organizer" | "split";

export type CountryCode = "PE" | "US" | "MX" | "CL";

export type ReceiptModel = {
  id: string;
  name: string; // nombre del evento (ej: "Cena en X restaurante")
  countryCode: CountryCode; // Perfil de país
  currency: string; // "PEN", "USD", etc.
  items: ReceiptItem[];
  fees: FeeModel[];
  people: Person[];
  allocations: Allocation[];
  roundingStep: number; // 0.5 o 1 (en unidades, no centavos)
  roundingStrategy: RoundingStrategy;
  subtotalCents: MoneyCents; // Subtotal detectado del OCR
  totalDetectedCents: MoneyCents; // Total detectado del OCR (importe total)
  computedTotalCents: MoneyCents; // Total calculado (items + fees no incluidos - discounts)
  createdAt: number;
};

/**
 * Resultado del cálculo por persona (en centavos)
 */
export type PersonTotal = {
  personId: string;
  personName: string;
  itemsSubtotalCents: MoneyCents; // suma de items asignados
  feesCents: Record<FeeType, MoneyCents>; // desglose de fees (incluye informativos)
  feesToAddCents: MoneyCents; // solo fees que se suman al total
  feesInformativeCents: MoneyCents; // fees que NO se suman (solo informativos)
  discountCents: MoneyCents; // descuento total (siempre positivo)
  subtotalCents: MoneyCents; // itemsSubtotal + feesToAdd
  totalCents: MoneyCents; // subtotal + discount (después de rounding)
  itemsBreakdown: Array<{
    itemId: string;
    itemName: string;
    qty: number;
    unitPriceCents: MoneyCents;
    totalCents: MoneyCents;
  }>;
};

/**
 * Resumen final del cálculo
 */
export type CalculationSummary = {
  personTotals: PersonTotal[];
  totals: {
    itemsSubtotalCents: MoneyCents;
    feesCents: Record<FeeType, MoneyCents>; // todos los fees
    feesToAddCents: MoneyCents; // fees que se suman
    feesInformativeCents: MoneyCents; // fees informativos
    discountCents: MoneyCents;
    subtotalCents: MoneyCents;
    totalCents: MoneyCents; // suma de personTotals[].totalCents
    totalDetectedCents: MoneyCents; // total del receipt original (OCR)
    computedTotalCents: MoneyCents; // items + feesToAdd - discount
    rounding: {
      appliedCents: MoneyCents; // diferencia por rounding
      strategy: RoundingStrategy;
      step: number;
    };
    differenceCents: MoneyCents; // totalDetected - computedTotal (debe ser ~0 después de ajustes)
    hasMismatch: boolean; // true si difference > threshold
  };
};
