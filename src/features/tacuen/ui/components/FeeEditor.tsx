// src/features/tacuen/ui/components/FeeEditor.tsx
"use client";

import type { FeeModel, FeeType } from "../../model/types";

interface FeeEditorProps {
  fee: FeeModel;
  index: number;
  onUpdate: (index: number, fee: FeeModel) => void;
  onDelete?: (index: number) => void;
}

const feeTypeLabels: Record<FeeType, string> = {
  delivery: "Delivery",
  tip: "Propina",
  service: "Servicio",
  tax: "Impuesto (IGV)",
  discount: "Descuento",
};

const formatPEN = (amountCents: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format((Number.isFinite(amountCents) ? amountCents : 0) / 100);

function parseToCents(input: string): number {
  // Permite coma o punto
  const normalized = (input ?? "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function FeeEditor({ fee, index, onUpdate, onDelete }: FeeEditorProps) {
  // ✅ Evita uncontrolled -> controlled
  const safeLabel = fee.label ?? "";
  const safeAmountCents = Number.isFinite(fee.amountCents) ? fee.amountCents : 0;

  // Para el input mostramos siempre positivo (más friendly),
  // pero internamente descuento se guarda negativo.
  const displayAmountCents =
    fee.type === "discount" ? Math.abs(safeAmountCents) : safeAmountCents;

  const amountValue = displayAmountCents / 100;

  const safeEnabled = fee.enabled ?? true;
  const safeIncludedInItems = fee.includedInItems ?? false;
  const safeSplitMode = fee.splitMode ?? "proportional";

  return (
    <div className="w-full p-4 rounded-lg bg-neutral-900 border border-neutral-800">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-neutral-400 mb-1">
            Tipo
          </label>
          <select
            value={fee.type}
            onChange={(e) => {
              const type = e.target.value as FeeType;

              // Si el label está vacío o era un label por defecto, lo recalculamos
              const nextLabel =
                !safeLabel.trim() || Object.values(feeTypeLabels).includes(safeLabel)
                  ? feeTypeLabels[type]
                  : safeLabel;

              // Descuento => monto negativo interno
              const nextAmountCents =
                type === "discount"
                  ? -Math.abs(safeAmountCents)
                  : Math.abs(safeAmountCents);

              onUpdate(index, {
                ...fee,
                type,
                label: nextLabel,
                amountCents: nextAmountCents,
                enabled: safeEnabled,
                includedInItems: safeIncludedInItems,
                splitMode: safeSplitMode,
              });
            }}
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
            aria-label="Eliminar fee"
          >
            ×
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">
            Etiqueta
          </label>
          <input
            type="text"
            value={safeLabel}
            onChange={(e) =>
              onUpdate(index, {
                ...fee,
                label: e.target.value,
                enabled: safeEnabled,
                includedInItems: safeIncludedInItems,
                splitMode: safeSplitMode,
                amountCents: safeAmountCents,
              })
            }
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            placeholder="Ej: IGV"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-neutral-400 mb-1">
              Monto
            </label>
            <span className="text-[11px] text-neutral-500">
              {formatPEN(fee.type === "discount" ? -Math.abs(safeAmountCents) : safeAmountCents)}
            </span>
          </div>

          <input
            type="number"
            step="0.01"
            min="0"
            value={Number.isFinite(amountValue) ? amountValue : 0}
            onChange={(e) => {
              const cents = parseToCents(e.target.value);
              const nextAmountCents =
                fee.type === "discount" ? -Math.abs(cents) : Math.abs(cents);

              onUpdate(index, {
                ...fee,
                amountCents: nextAmountCents,
                label: safeLabel,
                enabled: safeEnabled,
                includedInItems: safeIncludedInItems,
                splitMode: safeSplitMode,
              });
            }}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            placeholder="0.00"
            inputMode="decimal"
          />

          {fee.type === "discount" && (
            <p className="mt-1 text-[11px] text-neutral-500">
              Descuento se guarda como monto negativo internamente.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">
            Activo
          </label>
          <button
            onClick={() =>
              onUpdate(index, {
                ...fee,
                enabled: !safeEnabled,
                label: safeLabel,
                amountCents: safeAmountCents,
                includedInItems: safeIncludedInItems,
                splitMode: safeSplitMode,
              })
            }
            className={`w-full px-3 py-2 text-sm font-medium rounded-md transition ${
              safeEnabled
                ? "bg-emerald-500 text-neutral-950"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            {safeEnabled ? "Habilitado" : "Deshabilitado"}
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">
            ¿Incluido en ítems?
          </label>
          <button
            onClick={() =>
              onUpdate(index, {
                ...fee,
                includedInItems: !safeIncludedInItems,
                label: safeLabel,
                amountCents: safeAmountCents,
                enabled: safeEnabled,
                splitMode: safeSplitMode,
              })
            }
            className={`w-full px-3 py-2 text-sm font-medium rounded-md transition ${
              safeIncludedInItems
                ? "bg-neutral-700 text-neutral-100"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            {safeIncludedInItems ? "Sí (solo informativo)" : "No (se suma)"}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-400 mb-1">
          Modo de reparto
        </label>
        <div className="flex gap-2">
          <button
            onClick={() =>
              onUpdate(index, {
                ...fee,
                splitMode: "equal",
                label: safeLabel,
                amountCents: safeAmountCents,
                enabled: safeEnabled,
                includedInItems: safeIncludedInItems,
              })
            }
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition ${
              safeSplitMode === "equal"
                ? "bg-emerald-500 text-neutral-950"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            Igual
          </button>

          <button
            onClick={() =>
              onUpdate(index, {
                ...fee,
                splitMode: "proportional",
                label: safeLabel,
                amountCents: safeAmountCents,
                enabled: safeEnabled,
                includedInItems: safeIncludedInItems,
              })
            }
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition ${
              safeSplitMode === "proportional"
                ? "bg-emerald-500 text-neutral-950"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            Proporcional
          </button>
        </div>
      </div>
    </div>
  );
}
