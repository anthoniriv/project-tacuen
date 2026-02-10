// src/features/tacuen/country/profiles.ts

import type { CountryCode, CountryProfile } from "./types";

/**
 * Perfil de configuración para PERÚ
 * - Precios incluyen IGV
 * - Recargo consumo está incluido en el total
 */
export const PE_PROFILE: CountryProfile = {
  code: "PE",
  currency: "PEN",
  tax: {
    label: "IGV",
    pricesIncludeTax: true, // Los precios de items ya incluyen IGV
  },
  serviceCharges: [
    {
      key: "recargo_consumo",
      label: "Recargo Consumo",
      includedInItemsDefault: true, // No se suma al total, ya está incluido
    },
    {
      key: "propina",
      label: "Propina",
      includedInItemsDefault: false, // Se suma al total
    },
  ],
  parsingHints: {
    taxPatterns: ["IGV", "I.G.V.", "I G V", "IMPUESTO GENERAL A LAS VENTAS"],
    serviceChargePatterns: ["RECARGO CONSUMO", "RECARGO", "SERVICIO", "SERV."],
    totalPatterns: ["IMPORTE TOTAL", "TOTAL A PAGAR", "TOTAL", "MONTO TOTAL"],
  },
};

/**
 * Perfil para Estados Unidos (ejemplo futuro)
 * - Precios NO incluyen tax
 * - Service charge y tip son adicionales
 */
export const US_PROFILE: CountryProfile = {
  code: "US",
  currency: "USD",
  tax: {
    label: "Sales Tax",
    pricesIncludeTax: false, // Se suma al total
  },
  serviceCharges: [
    {
      key: "service_charge",
      label: "Service Charge",
      includedInItemsDefault: false,
    },
    {
      key: "tip",
      label: "Tip",
      includedInItemsDefault: false,
    },
  ],
  parsingHints: {
    taxPatterns: ["TAX", "SALES TAX", "STATE TAX"],
    serviceChargePatterns: ["SERVICE CHARGE", "SERVICE", "SC"],
    totalPatterns: ["TOTAL", "AMOUNT DUE", "GRAND TOTAL"],
  },
};

/**
 * Mapa de perfiles por código de país
 */
export const COUNTRY_PROFILES: Record<CountryCode, CountryProfile> = {
  PE: PE_PROFILE,
  US: US_PROFILE,
  MX: PE_PROFILE, // Temporalmente igual a PE hasta implementar
  CL: PE_PROFILE, // Temporalmente igual a PE hasta implementar
};

/**
 * Obtiene el perfil de un país
 */
export function getCountryProfile(code: CountryCode): CountryProfile {
  return COUNTRY_PROFILES[code] || PE_PROFILE;
}

/**
 * Perfil por defecto (PERÚ)
 */
export const DEFAULT_COUNTRY_CODE: CountryCode = "PE";
export const DEFAULT_COUNTRY_PROFILE = PE_PROFILE;
