// src/features/tacuen/ui/components/FeeEditor.tsx

"use client";

import type { FeeModel, FeeType } from "../../model/types";

interface FeeEditorProps {
  fee: FeeModel;
  index: number;
  onUpdate: (index: number, fee: FeeModel) => void;
  onDelete?: (index: number) => void;
}

export function FeeEditor({ fee, index, onUpdate, onDelete }: FeeEditorProps) {
  const feeTypeLabels: Record<FeeType, string> = {
    delivery: "Delivery",
    tip: "Propina",
    service: "Servicio",
    tax: "Impuesto (IGV)",
    discount: "Descuento",
  };

  return (
    <div className="w-full p-4 rounded-lg bg-neutral-900 border border-neutral-800">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-neutral-400 mb-1">Tipo</label>
          <select
            value={fee.type}
            onChange={(e) =>
              onUpdate(index, { ...fee, type: e.target.value as FeeType })
            }
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          >
            {Object.entries(feeTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {onDelete && (
          <button
            onClick={() => onDelete(index)}
            className="mt-6 px-3 py-2 text-sm font-medium rounded-md bg-red-500/20 text-red-300 hover:bg-red-500/30 active:bg-red-500/40 transition border border-red-500/30"
          >
            ×
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">Etiqueta</label>
          <input
            type="text"
            value={fee.label}
            onChange={(e) => onUpdate(index, { ...fee, label: e.target.value })}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            placeholder="Ej: Propina"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">Monto</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={fee.amount}
            onChange={(e) =>
              onUpdate(index, { ...fee, amount: parseFloat(e.target.value) || 0 })
            }
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            placeholder="0.00"
            inputMode="decimal"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-400 mb-1">
          Modo de reparto
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => onUpdate(index, { ...fee, splitMode: "equal" })}
            className={`
              flex-1 px-3 py-2 text-sm font-medium rounded-md transition
              ${
                fee.splitMode === "equal"
                  ? "bg-emerald-500 text-neutral-950"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }
            `}
          >
            Igual
          </button>
          <button
            onClick={() => onUpdate(index, { ...fee, splitMode: "proportional" })}
            className={`
              flex-1 px-3 py-2 text-sm font-medium rounded-md transition
              ${
                fee.splitMode === "proportional"
                  ? "bg-emerald-500 text-neutral-950"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }
            `}
          >
            Proporcional
          </button>
        </div>
      </div>
    </div>
  );
}