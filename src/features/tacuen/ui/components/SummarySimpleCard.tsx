// src/features/tacuen/ui/components/SummarySimpleCard.tsx

"use client";

import type { ReceiptModel } from "../../model/types";
import { computeReceiptTotals } from "../../model/calculator";
import { formatCents } from "../../model/money";

interface SummarySimpleCardProps {
  model: ReceiptModel;
  currency?: string;
}

export function SummarySimpleCard({ model, currency = "PEN" }: SummarySimpleCardProps) {
  const totals = computeReceiptTotals(model, model.countryCode);
  const enabledFees = model.fees.filter((f) => f.enabled);

  return (
    <div className="w-full space-y-4">
      <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-800 space-y-2">
        <h2 className="text-lg font-semibold text-neutral-50 mb-3">Resumen global</h2>

        <div className="flex justify-between text-sm text-neutral-300">
          <span>Subtotal (Items):</span>
          <span className="font-medium">{formatCents(totals.itemsSubtotalCents, currency)}</span>
        </div>

        {enabledFees.map((fee, idx) => (
          <div key={`${fee.id || fee.key || "fee"}-${idx}`} className="flex justify-between text-sm text-neutral-300">
            <span>
              {fee.label}
              {fee.includedInItems ? " (incluido)" : ""}
            </span>
            <span className="font-medium">{formatCents(fee.amountCents, currency)}</span>
          </div>
        ))}

        <div className="flex justify-between text-sm text-neutral-300 pt-2 border-t border-neutral-800">
          <span>Total calculado:</span>
          <span className="font-medium">{formatCents(totals.computedGrandTotalCents, currency)}</span>
        </div>

        <div className="flex justify-between text-sm text-neutral-300">
          <span>Total detectado (OCR):</span>
          <span className="font-medium">{formatCents(model.totalDetectedCents, currency)}</span>
        </div>

        {Math.abs(totals.differenceCents) > 1 && (
          <div className="flex justify-between text-xs text-neutral-400 pt-2 border-t border-neutral-800">
            <span>Diferencia:</span>
            <span
              className={
                Math.abs(totals.differenceCents) < 10 ? "text-green-400" : "text-yellow-400"
              }
            >
              {formatCents(totals.differenceCents, currency)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
