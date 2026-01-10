// src/features/tacuen/model/adapter.ts

import type { AnalisisTicketIA, LineaItem } from "@/lib/excel/generarExcel";
import type { ReceiptItem, ReceiptModel, Person, Allocation, FeeModel, CountryCode } from "./types";
import { toCents } from "./money";
import { getCountryProfile, DEFAULT_COUNTRY_CODE } from "../country/profiles";
import type { CountryProfile } from "../country/types";

/**
 * Adapta el resultado del OCR (AnalisisTicketIA) al modelo intermedio ReceiptModel
 * Aplica el perfil de país y convierte todos los montos a centavos
 */
export function mapOcrToReceiptModel(
  ocrResult: AnalisisTicketIA,
  eventName: string = "División de cuenta",
  countryCode: CountryCode = DEFAULT_COUNTRY_CODE
): ReceiptModel {
  const now = Date.now();
  const receiptId = `receipt-${now}`;
  const countryProfile = getCountryProfile(countryCode);

  // Convertir items del OCR a ReceiptItem (en centavos)
  const items: ReceiptItem[] = ocrResult.items.map((item, index) => ({
    id: `item-${index}`,
    name: item.nombre,
    qty: item.cantidad || 1,
    unitPriceCents: toCents(item.precioUnitario || 0),
    totalCents: toCents(item.total || 0),
    category: item.categoria,
    isFree: item.esBonificacion || false,
  }));

  // Convertir personas del OCR a Person (si vienen)
  const people: Person[] =
    ocrResult.personas?.map((p, index) => ({
      id: `person-${index}`,
      name: p.nombre,
    })) ?? [];

  // Crear allocations iniciales basadas en el consumo del OCR
  const allocations: Allocation[] = items
    .filter((item) => !item.isFree)
    .map((item) => {
      // Buscar si hay consumo asignado en el OCR
      const ocrPerson = ocrResult.personas?.find((p) =>
        p.consumo.some((c) => c.item === item.name)
      );

      if (ocrPerson && ocrPerson.consumo.length > 0) {
        // Hay asignación del OCR: usar modo "portions" o "equal_selected"
        const consumo = ocrPerson.consumo.find((c) => c.item === item.name);
        if (consumo && consumo.cantidad > 0 && consumo.cantidad < item.qty) {
          // Porciones parciales: usar modo "portions"
          const personId = people.find((p) => p.name === ocrPerson.nombre)?.id ?? `person-0`;
          const portions: Record<string, number> = {};
          portions[personId] = consumo.cantidad;

          return {
            itemId: item.id,
            mode: "portions",
            participants: [personId],
            portions,
          };
        } else {
          // Cantidad igual al total o todo: usar "all" o "equal_selected"
          const participantIds = ocrResult.personas
            ?.filter((p) => p.consumo.some((c) => c.item === item.name))
            .map((p) => people.find((pp) => pp.name === p.nombre)?.id ?? "")
            .filter((id) => id !== "") ?? [];

          if (participantIds.length === people.length) {
            return {
              itemId: item.id,
              mode: "all",
              participants: participantIds,
            };
          } else {
            return {
              itemId: item.id,
              mode: "equal_selected",
              participants: participantIds.length > 0 ? participantIds : [people[0]?.id ?? ""],
            };
          }
        }
      } else {
        // No hay asignación del OCR: por defecto "all" (pero necesitamos personas primero)
        return {
          itemId: item.id,
          mode: "all",
          participants: [], // Se llenará cuando haya personas
        };
      }
    });

  // Crear fees del OCR según el perfil de país
  const fees: FeeModel[] = [];
  const feesMap = new Map<string, FeeModel>(); // Para evitar duplicados

  // IGV: Según el perfil de país, puede ser incluido o no
  if (ocrResult.igv && ocrResult.igv > 0) {
    const igvCents = toCents(ocrResult.igv);
    feesMap.set("igv", {
      id: "fee-igv",
      key: "igv",
      type: "tax",
      label: countryProfile.tax.label,
      amountCents: igvCents,
      enabled: true,
      includedInItems: countryProfile.tax.pricesIncludeTax, // Para PE = true
      splitMode: "proportional",
    });
  }

  // Recargo/servicio: Buscar el servicio charge config del país
  if (ocrResult.recargoServicio && ocrResult.recargoServicio > 0) {
    const recargoCents = toCents(ocrResult.recargoServicio);
    const serviceChargeConfig = countryProfile.serviceCharges.find(
      (sc) => sc.key === "recargo_consumo"
    ) || countryProfile.serviceCharges[0];

    if (serviceChargeConfig) {
      feesMap.set("recargo_consumo", {
        id: "fee-recargo",
        key: serviceChargeConfig.key,
        type: "service",
        label: serviceChargeConfig.label,
        amountCents: recargoCents,
        enabled: true,
        includedInItems: serviceChargeConfig.includedInItemsDefault, // Para PE = true
        splitMode: "proportional",
      });
    } else {
      // Fallback si no hay config
      feesMap.set("recargo_consumo", {
        id: "fee-recargo",
        key: "recargo_consumo",
        type: "service",
        label: "Recargo Servicio",
        amountCents: recargoCents,
        enabled: true,
        includedInItems: true, // Por defecto incluido para Perú
        splitMode: "proportional",
      });
    }
  }

  fees.push(...Array.from(feesMap.values()));

  // Calcular totales
  const itemsSubtotalCents = items
    .filter((i) => !i.isFree)
    .reduce((sum, item) => sum + item.totalCents, 0);

  // Solo sumar fees que NO están incluidos en items
  const feesToAddCents = fees
    .filter((fee) => fee.enabled && !fee.includedInItems)
    .reduce((sum, fee) => sum + fee.amountCents, 0);

  const subtotalCents = ocrResult.subtotal ? toCents(ocrResult.subtotal) : itemsSubtotalCents;
  const totalDetectedCents = ocrResult.importeTotal
    ? toCents(ocrResult.importeTotal)
    : itemsSubtotalCents + feesToAddCents;
  const computedTotalCents = itemsSubtotalCents + feesToAddCents;

  const model: ReceiptModel = {
    id: receiptId,
    name: eventName,
    countryCode,
    currency: countryProfile.currency,
    items,
    fees,
    people: people.length > 0 ? people : [], // Si no hay personas del OCR, se agregarán después
    allocations,
    roundingStep: 1, // Por defecto 1
    roundingStrategy: "organizer", // Por defecto organizador absorbe diferencia
    subtotalCents,
    totalDetectedCents,
    computedTotalCents,
    createdAt: now,
  };

  return model;
}

/**
 * Crea un modelo vacío para empezar desde cero
 */
export function createEmptyReceiptModel(
  name: string = "Nueva división",
  countryCode: CountryCode = DEFAULT_COUNTRY_CODE
): ReceiptModel {
  const now = Date.now();
  const countryProfile = getCountryProfile(countryCode);
  return {
    id: `receipt-${now}`,
    name,
    countryCode,
    currency: countryProfile.currency,
    items: [],
    fees: [],
    people: [],
    allocations: [],
    roundingStep: 1,
    roundingStrategy: "organizer",
    subtotalCents: 0,
    totalDetectedCents: 0,
    computedTotalCents: 0,
    createdAt: now,
  };
}

/**
 * Crea items mock para desarrollo/testing - Caso real Chili's
 * Total detectado: 349.00 PEN
 * IGV: 49.09 (incluido)
 * Recargo consumo: 27.25 (incluido)
 */
export function createMockReceiptModel(): ReceiptModel {
  const now = Date.now();
  const countryCode: CountryCode = "PE";
  const countryProfile = getCountryProfile(countryCode);

  const mockItems: ReceiptItem[] = [
    {
      id: "item-1",
      name: "BASIL PASTA",
      qty: 1,
      unitPriceCents: toCents(35.0),
      totalCents: toCents(35.0),
      category: "plato",
      isFree: false,
    },
    {
      id: "item-2",
      name: "Molten Choc Cake",
      qty: 1,
      unitPriceCents: toCents(26.0),
      totalCents: toCents(26.0),
      category: "postre",
      isFree: false,
    },
  ];

  const mockPeople: Person[] = [
    { id: "person-1", name: "Persona 1" },
    { id: "person-2", name: "Persona 2" },
  ];

  const mockAllocations: Allocation[] = [
    {
      itemId: "item-1",
      mode: "all",
      participants: ["person-1", "person-2"],
    },
    {
      itemId: "item-2",
      mode: "all",
      participants: ["person-1", "person-2"],
    },
  ];

  const itemsSubtotalCents = mockItems.reduce((sum, item) => sum + item.totalCents, 0);

  // Fees informativos (incluidos en items, no se suman)
  const igvCents = toCents(49.09);
  const recargoCents = toCents(27.25);
  const totalDetectedCents = toCents(349.0);

  const fees: FeeModel[] = [
    {
      id: "fee-igv",
      key: "igv",
      type: "tax",
      label: "IGV",
      amountCents: igvCents,
      enabled: true,
      includedInItems: true, // Ya incluido en precios
      splitMode: "proportional",
    },
    {
      id: "fee-recargo",
      key: "recargo_consumo",
      type: "service",
      label: "Recargo Consumo",
      amountCents: recargoCents,
      enabled: true,
      includedInItems: true, // Ya incluido en total
      splitMode: "proportional",
    },
  ];

  // El computed total solo incluye items (fees ya están incluidos)
  const computedTotalCents = itemsSubtotalCents;

  return {
    id: `receipt-${now}`,
    name: "Cena Chili's",
    countryCode,
    currency: countryProfile.currency,
    items: mockItems,
    fees,
    people: mockPeople,
    allocations: mockAllocations,
    roundingStep: 1,
    roundingStrategy: "organizer",
    subtotalCents: itemsSubtotalCents,
    totalDetectedCents,
    computedTotalCents, // Debe ser diferente de totalDetected, pero se ajustará
    createdAt: now,
  };
}
