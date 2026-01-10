// src/features/tacuen/ui/components/SummaryCard.tsx

"use client";

import type { PersonTotal, CalculationSummary, FeeType } from "../../model/types";
import { formatCents } from "../../model/money";

interface SummaryCardProps {
  summary: CalculationSummary;
  currency?: string;
}

export function SummaryCard({ summary, currency = "PEN" }: SummaryCardProps) {
  return (
    <div className="w-full space-y-4">
      {/* Totales por persona */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-50">Resumen por persona</h2>
        {summary.personTotals.map((personTotal) => (
          <PersonSummaryCard
            key={personTotal.personId}
            personTotal={personTotal}
            currency={currency}
          />
        ))}
      </div>

      {/* Totales globales */}
      <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-800 space-y-2">
        <h2 className="text-lg font-semibold text-neutral-50 mb-3">Totales</h2>
        
        <div className="flex justify-between text-sm text-neutral-300">
          <span>Subtotal (Items):</span>
          <span className="font-medium">{formatCents(summary.totals.itemsSubtotalCents, currency)}</span>
        </div>

        {summary.totals.feesCents && Object.entries(summary.totals.feesCents).map(([type, amountCents]) => {
          if (Math.abs(amountCents) < 1) return null; // 1 centavo = 0.01
          const feeLabels: Record<FeeType, string> = {
            delivery: "Delivery:",
            tip: "Propina:",
            service: "Servicio:",
            tax: "Impuesto (IGV):",
            discount: "Descuento:",
          };
          return (
            <div key={type} className="flex justify-between text-sm text-neutral-300">
              <span>{feeLabels[type as FeeType] || `${type}:`}</span>
              <span className="font-medium">{formatCents(amountCents, currency)}</span>
            </div>
          );
        })}

        <div className="flex justify-between text-sm text-neutral-300 pt-2 border-t border-neutral-800">
          <span>Subtotal:</span>
          <span className="font-medium">{formatCents(summary.totals.subtotalCents, currency)}</span>
        </div>

        <div className="flex justify-between text-sm font-semibold text-neutral-50 pt-2 border-t border-neutral-700">
          <span>Total Final:</span>
          <span>{formatCents(summary.totals.totalCents, currency)}</span>
        </div>

        {/* Rounding info */}
        {Math.abs(summary.totals.rounding.appliedCents) > 1 && (
          <div className="pt-2 border-t border-neutral-800 space-y-1">
            <div className="flex justify-between text-xs text-neutral-400">
              <span>Rounding aplicado:</span>
              <span>{formatCents(summary.totals.rounding.appliedCents, currency)}</span>
            </div>
            <div className="flex justify-between text-xs text-neutral-400">
              <span>Estrategia:</span>
              <span>
                {summary.totals.rounding.strategy === "organizer"
                  ? "Organizador absorbe"
                  : "Dividir entre todos"}
              </span>
            </div>
          </div>
        )}

        {/* Diferencia */}
        {Math.abs(summary.totals.differenceCents) > 1 && (
          <div className="pt-2 border-t border-neutral-800">
            <div className="flex justify-between text-xs text-neutral-400">
              <span>Diferencia:</span>
              <span
                className={
                  Math.abs(summary.totals.differenceCents) < 10
                    ? "text-green-400"
                    : "text-yellow-400"
                }
              >
                {formatCents(summary.totals.differenceCents, currency)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PersonSummaryCard({
  personTotal,
  currency,
}: {
  personTotal: PersonTotal;
  currency: string;
}) {
  return (
    <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-800">
      <h3 className="text-base font-semibold text-neutral-50 mb-3">{personTotal.personName}</h3>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-neutral-300">
          <span>Items:</span>
          <span className="font-medium">{formatCents(personTotal.itemsSubtotalCents, currency)}</span>
        </div>

        {personTotal.feesCents && Object.entries(personTotal.feesCents).map(([type, amountCents]) => {
          if (Math.abs(amountCents) < 1) return null; // 1 centavo = 0.01
          const feeLabels: Record<FeeType, string> = {
            delivery: "Delivery:",
            tip: "Propina:",
            service: "Servicio:",
            tax: "Impuesto:",
            discount: "Descuento:",
          };
          return (
            <div key={type} className="flex justify-between text-neutral-400 text-xs ml-2">
              <span>{feeLabels[type as FeeType] || type}:</span>
              <span>{formatCents(amountCents, currency)}</span>
            </div>
          );
        })}

        {personTotal.discountCents > 0 && (
          <div className="flex justify-between text-neutral-400 text-xs ml-2">
            <span>Descuento:</span>
            <span className="text-green-400">-{formatCents(personTotal.discountCents, currency)}</span>
          </div>
        )}

        <div className="flex justify-between text-neutral-200 font-semibold pt-2 border-t border-neutral-800">
          <span>Total:</span>
          <span>{formatCents(personTotal.totalCents, currency)}</span>
        </div>
      </div>

      {/* Breakdown de items (colapsable) */}
      {personTotal.itemsBreakdown.length > 0 && (
        <details className="mt-3 pt-3 border-t border-neutral-800">
          <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-300 transition">
            Ver detalle de items ({personTotal.itemsBreakdown.length})
          </summary>
          <div className="mt-2 space-y-1">
            {personTotal.itemsBreakdown.map((item, idx) => (
              <div key={idx} className="flex justify-between text-xs text-neutral-400 ml-2">
                <span className="truncate flex-1">{item.itemName} (x{item.qty.toFixed(1)})</span>
                <span className="ml-2">{formatCents(item.totalCents, currency)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}