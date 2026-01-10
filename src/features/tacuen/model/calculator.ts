// src/features/tacuen/model/calculator.ts

import type {
  ReceiptModel,
  PersonTotal,
  CalculationSummary,
  AllocationMode,
  FeeType,
  RoundingStrategy,
  MoneyCents,
} from "./types";
import { getCountryProfile } from "../country/profiles";
import { sumCents, multiplyCents, divideCents, fromCents } from "./money";

/**
 * Calcula los totales del receipt (sin repartir por persona)
 * IMPORTANTE: Para PERÚ, fees con includedInItems=true NO se suman al total
 */
export function computeReceiptTotals(
  model: ReceiptModel,
  countryCode: string = model.countryCode
): {
  itemsSubtotalCents: MoneyCents;
  feesToAddCents: MoneyCents;
  feesInformativeCents: MoneyCents;
  computedGrandTotalCents: MoneyCents;
  hasMismatch: boolean;
  differenceCents: MoneyCents;
} {
  const itemsSubtotalCents = model.items
    .filter((i) => !i.isFree)
    .reduce((sum, item) => sum + item.totalCents, 0);

  // Separar fees en dos grupos
  const feesToAddCents = model.fees
    .filter((fee) => fee.enabled && !fee.includedInItems)
    .reduce((sum, fee) => sum + fee.amountCents, 0);

  const feesInformativeCents = model.fees
    .filter((fee) => fee.enabled && fee.includedInItems)
    .reduce((sum, fee) => sum + fee.amountCents, 0);

  // Descuentos (si existen)
  const discountCents = model.fees
    .filter((fee) => fee.enabled && fee.type === "discount")
    .reduce((sum, fee) => sum + fee.amountCents, 0);

  // Total calculado: items + fees adicionales - descuentos
  // Fees informativos NO se suman (ya están incluidos en items)
  const computedGrandTotalCents = itemsSubtotalCents + feesToAddCents - Math.abs(discountCents);

  // Comparar con total detectado
  const differenceCents = model.totalDetectedCents - computedGrandTotalCents;
  const hasMismatch = Math.abs(differenceCents) > 10; // Threshold: 10 centavos

  return {
    itemsSubtotalCents,
    feesToAddCents,
    feesInformativeCents,
    computedGrandTotalCents,
    hasMismatch,
    differenceCents,
  };
}

/**
 * Calcula el reparto de la cuenta por persona
 */
export function computeTotalsByPerson(model: ReceiptModel): CalculationSummary {
  const personTotals: PersonTotal[] = model.people.map((person) => ({
    personId: person.id,
    personName: person.name,
    itemsSubtotalCents: 0,
    feesCents: {
      delivery: 0,
      tip: 0,
      service: 0,
      tax: 0,
      discount: 0,
    },
    feesToAddCents: 0, // Solo fees que se suman
    feesInformativeCents: 0, // Fees informativos (no se suman)
    discountCents: 0,
    subtotalCents: 0,
    totalCents: 0,
    itemsBreakdown: [],
  }));

  // Paso 1: Calcular reparto de items (en centavos)
  for (const allocation of model.allocations) {
    const item = model.items.find((i) => i.id === allocation.itemId);
    if (!item || item.isFree) continue;

    const itemAmountPerPerson = computeItemAmountPerPerson(item, allocation);

    for (const personTotal of personTotals) {
      const amountCents = itemAmountPerPerson[personTotal.personId] || 0;
      if (amountCents > 0) {
        personTotal.itemsSubtotalCents += amountCents;
        personTotal.itemsBreakdown.push({
          itemId: item.id,
          itemName: item.name,
          qty:
            allocation.mode === "portions"
              ? allocation.portions?.[personTotal.personId] || 0
              : allocation.mode === "equal_selected" || allocation.mode === "all"
              ? item.qty / allocation.participants.length
              : 0,
          unitPriceCents: item.unitPriceCents,
          totalCents: amountCents,
        });
      }
    }
  }

  // Paso 2: Calcular reparto de fees
  const totalItemsSubtotalCents = personTotals.reduce(
    (sum, p) => sum + p.itemsSubtotalCents,
    0
  );

  for (const fee of model.fees) {
    if (!fee.enabled) continue;

    const feeAmounts = computeFeeAmountPerPerson(
      fee,
      personTotals,
      totalItemsSubtotalCents,
      model.people.length
    );

    for (const personTotal of personTotals) {
      const amountCents = feeAmounts[personTotal.personId] || 0;
      personTotal.feesCents[fee.type] += amountCents;

      if (fee.includedInItems) {
        // Fee informativo: no se suma al total, solo se muestra
        personTotal.feesInformativeCents += amountCents;
      } else {
        // Fee adicional: se suma al total
        personTotal.feesToAddCents += amountCents;
      }

      if (fee.type === "discount") {
        personTotal.discountCents += Math.abs(amountCents);
      }
    }
  }

  // Paso 3: Calcular subtotales y totales (antes de rounding)
  for (const personTotal of personTotals) {
    personTotal.subtotalCents = personTotal.itemsSubtotalCents + personTotal.feesToAddCents;
    personTotal.totalCents = personTotal.subtotalCents - personTotal.discountCents;
  }

  // Paso 4: Aplicar rounding (en unidades, luego convertir de vuelta)
  const roundingStepUnits = model.roundingStep; // 0.5 o 1 en unidades
  const roundingStepCents = Math.round(roundingStepUnits * 100); // convertir a centavos

  const roundedTotals = applyRounding(
    personTotals.map((p) => p.totalCents),
    roundingStepCents,
    model.roundingStrategy,
    model.computedTotalCents
  );

  // Actualizar totales redondeados
  for (let i = 0; i < personTotals.length; i++) {
    personTotals[i].totalCents = roundedTotals[i];
  }

  // Paso 5: Calcular totales globales usando computeReceiptTotals
  const receiptTotals = computeReceiptTotals(model);
  const totalsItemsSubtotalCents = receiptTotals.itemsSubtotalCents;
  const totalsFeesCents: Record<FeeType, MoneyCents> = {
    delivery: 0,
    tip: 0,
    service: 0,
    tax: 0,
    discount: 0,
  };

  // Sumar todos los fees (informativos + adicionales) por tipo
  for (const fee of model.fees) {
    if (fee.enabled) {
      totalsFeesCents[fee.type] += fee.amountCents;
    }
  }

  const totalsSubtotalCents = personTotals.reduce((sum, p) => sum + p.subtotalCents, 0);
  const totalsTotalCents = personTotals.reduce((sum, p) => sum + p.totalCents, 0);
  const totalsDiscountCents = Math.abs(totalsFeesCents.discount);
  const totalsFeesToAddCents = receiptTotals.feesToAddCents;
  const totalsFeesInformativeCents = receiptTotals.feesInformativeCents;

  const roundingAppliedCents = totalsTotalCents - totalsSubtotalCents + totalsDiscountCents;
  const computedTotalCents = receiptTotals.computedGrandTotalCents;
  const differenceCents = model.totalDetectedCents - computedTotalCents;

  return {
    personTotals,
    totals: {
      itemsSubtotalCents: totalsItemsSubtotalCents,
      feesCents: totalsFeesCents,
      feesToAddCents: totalsFeesToAddCents,
      feesInformativeCents: totalsFeesInformativeCents,
      discountCents: totalsDiscountCents,
      subtotalCents: totalsSubtotalCents,
      totalCents: totalsTotalCents,
      totalDetectedCents: model.totalDetectedCents,
      computedTotalCents,
      rounding: {
        appliedCents: roundingAppliedCents,
        strategy: model.roundingStrategy,
        step: model.roundingStep,
      },
      differenceCents,
      hasMismatch: receiptTotals.hasMismatch,
    },
  };
}

/**
 * Calcula cuánto le corresponde a cada persona de un ítem según su allocation (en centavos)
 */
function computeItemAmountPerPerson(
  item: ReceiptModel["items"][0],
  allocation: ReceiptModel["allocations"][0]
): Record<string, MoneyCents> {
  const result: Record<string, MoneyCents> = {};

  switch (allocation.mode) {
    case "all":
      // Todos dividen igual
      if (allocation.participants.length > 0) {
        const amountPerPersonCents = divideCents(
          item.totalCents,
          allocation.participants.length
        );
        for (const personId of allocation.participants) {
          result[personId] = amountPerPersonCents;
        }
      }
      break;

    case "equal_selected":
      // Solo los seleccionados dividen igual
      if (allocation.participants.length > 0) {
        const amountPerPersonSelectedCents = divideCents(
          item.totalCents,
          allocation.participants.length
        );
        for (const personId of allocation.participants) {
          result[personId] = amountPerPersonSelectedCents;
        }
      }
      break;

    case "portions":
      // Porciones específicas
      if (allocation.portions) {
        const unitPriceCents = item.unitPriceCents || divideCents(item.totalCents, item.qty);
        for (const [personId, portion] of Object.entries(allocation.portions)) {
          result[personId] = multiplyCents(unitPriceCents, portion);
        }
      }
      break;

    case "fixed_amount":
      // Montos fijos
      if (allocation.fixedAmounts) {
        for (const [personId, amountCents] of Object.entries(allocation.fixedAmounts)) {
          result[personId] = amountCents;
        }
      }
      break;
  }

  return result;
}

/**
 * Calcula el reparto de un fee entre las personas (en centavos)
 */
function computeFeeAmountPerPerson(
  fee: ReceiptModel["fees"][0],
  personTotals: PersonTotal[],
  totalItemsSubtotalCents: MoneyCents,
  totalPeople: number
): Record<string, MoneyCents> {
  const result: Record<string, MoneyCents> = {};

  if (fee.splitMode === "equal") {
    // Reparto igual entre todas las personas
    const amountPerPersonCents = divideCents(fee.amountCents, totalPeople);
    for (const personTotal of personTotals) {
      result[personTotal.personId] = amountPerPersonCents;
    }
  } else {
    // Reparto proporcional al consumo
    if (totalItemsSubtotalCents === 0) {
      // Si no hay consumo, dividir igual
      const amountPerPersonCents = divideCents(fee.amountCents, totalPeople);
      for (const personTotal of personTotals) {
        result[personTotal.personId] = amountPerPersonCents;
      }
    } else {
      // Proporcional al consumo
      for (const personTotal of personTotals) {
        const proportion = personTotal.itemsSubtotalCents / totalItemsSubtotalCents;
        result[personTotal.personId] = multiplyCents(fee.amountCents, proportion);
      }
    }
  }

  // Si es discount, asegurar que sea positivo (se resta después)
  if (fee.type === "discount") {
    for (const key of Object.keys(result)) {
      result[key] = Math.abs(result[key]);
    }
  }

  return result;
}

/**
 * Aplica rounding a los totales según la estrategia (en centavos)
 */
function applyRounding(
  totalsCents: MoneyCents[],
  stepCents: MoneyCents,
  strategy: RoundingStrategy,
  targetTotalCents: MoneyCents
): MoneyCents[] {
  if (stepCents <= 0) {
    return totalsCents; // Sin rounding
  }

  const rounded = totalsCents.map((totalCents) => {
    if (stepCents === 100) {
      // Rounding a 1 unidad (100 centavos)
      return Math.round(fromCents(totalCents)) * 100;
    } else if (stepCents === 50) {
      // Rounding a 0.5 unidades (50 centavos)
      return Math.round(fromCents(totalCents) * 2) * 50;
    } else {
      // Rounding genérico
      return Math.round(fromCents(totalCents) / fromCents(stepCents)) * stepCents;
    }
  });

  const sumRounded = sumCents(...rounded);
  const difference = targetTotalCents - sumRounded;

  if (Math.abs(difference) < 10) {
    // Diferencia menor a 10 centavos, ya está bien
    return rounded;
  }

  // Ajustar según estrategia
  if (strategy === "organizer") {
    // Organizador absorbe la diferencia
    rounded[0] += difference;
  } else {
    // Split: distribuir la diferencia entre todos
    const perPerson = divideCents(difference, rounded.length);
    for (let i = 0; i < rounded.length; i++) {
      rounded[i] += perPerson;
    }
    // Asegurar que la suma sea exacta
    const finalSum = sumCents(...rounded);
    const finalDiff = targetTotalCents - finalSum;
    rounded[0] += finalDiff;
  }

  return rounded;
}
