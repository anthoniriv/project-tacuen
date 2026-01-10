// src/features/tacuen/country/types.ts

export type CountryCode = "PE" | "US" | "MX" | "CL";

export type TaxConfig = {
  label: string;
  pricesIncludeTax: boolean; // true = los precios ya incluyen el impuesto
};

export type ServiceChargeConfig = {
  key: string; // "recargo_consumo", "service_charge", etc.
  label: string;
  includedInItemsDefault: boolean; // si true, no se suma al total
};

export type CountryProfile = {
  code: CountryCode;
  currency: string;
  tax: TaxConfig;
  serviceCharges: ServiceChargeConfig[];
  parsingHints?: {
    taxPatterns?: string[]; // ["IGV", "I.G.V.", "TAX"]
    serviceChargePatterns?: string[]; // ["RECARGO", "SERVICIO", "SERVICE"]
    totalPatterns?: string[]; // ["IMPORTE TOTAL", "TOTAL", "AMOUNT"]
  };
};
