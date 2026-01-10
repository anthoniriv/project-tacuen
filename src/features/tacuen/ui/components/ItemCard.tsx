// src/features/tacuen/ui/components/ItemCard.tsx

"use client";

import type { ReceiptItem } from "../../model/types";
import { fromCents, formatCents } from "../../model/money";

interface ItemCardProps {
  item: ReceiptItem;
  onEdit?: (item: ReceiptItem) => void;
  onDelete?: (itemId: string) => void;
  isEditable?: boolean;
  currency?: string;
}

export function ItemCard({ item, onEdit, onDelete, isEditable = true, currency = "PEN" }: ItemCardProps) {
  const categoryColors: Record<ReceiptItem["category"], string> = {
    plato: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    bebida: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    postre: "bg-pink-500/20 text-pink-300 border-pink-500/30",
    otro: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  };

  const categoryLabels: Record<ReceiptItem["category"], string> = {
    plato: "Plato",
    bebida: "Bebida",
    postre: "Postre",
    otro: "Otro",
  };

  return (
    <div
      className={`
        w-full p-4 rounded-lg border
        ${item.isFree ? "bg-neutral-800/50 border-neutral-700" : "bg-neutral-900 border-neutral-800"}
      `}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-neutral-50 truncate">{item.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`
                px-2 py-0.5 text-xs font-medium rounded border
                ${categoryColors[item.category]}
              `}
            >
              {categoryLabels[item.category]}
            </span>
            {item.isFree && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-500/20 text-green-300 border border-green-500/30">
                Gratis
              </span>
            )}
          </div>
        </div>
        {isEditable && (onEdit || onDelete) && (
          <div className="flex gap-2">
            {onEdit && (
              <button
                onClick={() => onEdit(item)}
                className="px-2 py-1 text-xs font-medium rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:bg-neutral-900 transition"
              >
                Editar
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(item.id)}
                className="px-2 py-1 text-xs font-medium rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 active:bg-red-500/40 transition border border-red-500/30"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-400 mt-2 pt-2 border-t border-neutral-800">
        <div className="flex gap-4">
          <span>Cantidad: {item.qty}</span>
          <span>Unit: {formatCents(item.unitPriceCents, currency)}</span>
        </div>
        <span className="text-sm font-semibold text-neutral-200">
          Total: {formatCents(item.totalCents, currency)}
        </span>
      </div>
    </div>
  );
}
