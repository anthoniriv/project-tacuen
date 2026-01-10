// src/features/tacuen/model/money.ts

import type { MoneyCents } from "./types";

/**
 * Convierte un monto decimal a centavos (integer)
 */
export function toCents(amount: number): MoneyCents {
  return Math.round(amount * 100);
}

/**
 * Convierte centavos a decimal (para mostrar en UI)
 */
export function fromCents(cents: MoneyCents): number {
  return cents / 100;
}

/**
 * Formatea centavos como moneda para mostrar
 */
export function formatCents(
  cents: MoneyCents,
  currency: string = "PEN",
  locale: string = "es-PE"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fromCents(cents));
}

/**
 * Suma arrays de centavos
 */
export function sumCents(...amounts: MoneyCents[]): MoneyCents {
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

/**
 * Multiplica centavos por un factor (por ejemplo, para proporciones)
 * Retorna redondeado
 */
export function multiplyCents(cents: MoneyCents, factor: number): MoneyCents {
  return Math.round(cents * factor);
}

/**
 * Divide centavos por un divisor
 * Retorna redondeado
 */
export function divideCents(cents: MoneyCents, divisor: number): MoneyCents {
  if (divisor === 0) return 0;
  return Math.round(cents / divisor);
}
