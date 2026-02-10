// src/features/tacuen/ui/components/AllocationEditor.tsx

"use client";

import { useState } from "react";
import type { Allocation, Person, ReceiptItem, AllocationMode } from "../../model/types";
import { PersonChips } from "./PersonChips";
import { fromCents, toCents } from "../../model/money";

interface AllocationEditorProps {
  item: ReceiptItem;
  allocation: Allocation;
  people: Person[];
  onUpdate: (allocation: Allocation) => void;
}

export function AllocationEditor({
  item,
  allocation,
  people,
  onUpdate,
}: AllocationEditorProps) {
  const [mode, setMode] = useState<AllocationMode>(allocation.mode);

  const handleModeChange = (newMode: AllocationMode) => {
    setMode(newMode);
    let newAllocation: Allocation;

    switch (newMode) {
      case "all":
        newAllocation = {
          itemId: item.id,
          mode: "all",
          participants: people.map((p) => p.id),
        };
        break;
      case "equal_selected":
        newAllocation = {
          itemId: item.id,
          mode: "equal_selected",
          participants: allocation.participants.length > 0 ? allocation.participants : [people[0]?.id].filter(Boolean),
        };
        break;
      case "portions":
        const defaultPortions: Record<string, number> = {};
        if (people.length > 0) {
          defaultPortions[people[0].id] = item.qty;
        }
        newAllocation = {
          itemId: item.id,
          mode: "portions",
          participants: Object.keys(defaultPortions),
          portions: defaultPortions,
        };
        break;
      case "fixed_amount":
        const defaultAmounts: Record<string, number> = {};
        if (people.length > 0) {
          defaultAmounts[people[0].id] = item.totalCents;
        }
        newAllocation = {
          itemId: item.id,
          mode: "fixed_amount",
          participants: Object.keys(defaultAmounts),
          fixedAmounts: defaultAmounts,
        };
        break;
      default:
        newAllocation = allocation;
    }

    onUpdate(newAllocation);
  };

  const handleToggleParticipant = (personId: string) => {
    if (mode === "all") return; // "all" no se puede editar

    const isSelected = allocation.participants.includes(personId);
    let newParticipants: string[];

    if (isSelected) {
      newParticipants = allocation.participants.filter((id) => id !== personId);
    } else {
      newParticipants = [...allocation.participants, personId];
    }

    if (newParticipants.length === 0) {
      return; // No permitir 0 participantes
    }

    let newAllocation: Allocation = {
      ...allocation,
      participants: newParticipants,
    };

    // Limpiar portions/fixedAmounts de personas no seleccionadas
    if (mode === "portions" && allocation.portions) {
      newAllocation.portions = Object.fromEntries(
        Object.entries(allocation.portions).filter(([pid]) => newParticipants.includes(pid))
      );
    }
    if (mode === "fixed_amount" && allocation.fixedAmounts) {
      newAllocation.fixedAmounts = Object.fromEntries(
        Object.entries(allocation.fixedAmounts).filter(([pid]) => newParticipants.includes(pid))
      );
    }

    onUpdate(newAllocation);
  };

  const handlePortionChange = (personId: string, portion: number) => {
    if (mode !== "portions") return;

    const portions = {
      ...(allocation.portions || {}),
      [personId]: Math.max(0, portion),
    };

    onUpdate({
      ...allocation,
      portions,
    });
  };

  const handleFixedAmountChange = (personId: string, amountDecimal: number) => {
    if (mode !== "fixed_amount") return;

    // Convertir de decimal a centavos
    const amountCents = toCents(Math.max(0, amountDecimal));

    const fixedAmounts = {
      ...(allocation.fixedAmounts || {}),
      [personId]: amountCents,
    };

    onUpdate({
      ...allocation,
      fixedAmounts,
    });
  };

  const modeLabels: Record<AllocationMode, string> = {
    all: "Todos",
    equal_selected: "Igual (Seleccionados)",
    portions: "Porciones",
    fixed_amount: "Monto Fijo",
  };

  return (
    <div className="w-full space-y-4">
      {/* Selector de modo */}
      <div>
        <label className="block text-xs font-medium text-neutral-400 mb-2">Modo de asignación</label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(modeLabels) as AllocationMode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`
                px-3 py-2 text-xs font-medium rounded-md transition
                ${
                  mode === m
                    ? "bg-emerald-500 text-neutral-950"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                }
              `}
            >
              {modeLabels[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Participantes (excepto "all") */}
      {mode !== "all" && (
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-2">Participantes</label>
          <PersonChips
            people={people}
            selectedIds={allocation.participants}
            onToggle={handleToggleParticipant}
            isSelectable={true}
          />
        </div>
      )}

      {/* Editor de porciones */}
      {mode === "portions" && allocation.portions && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-neutral-400 mb-2">
            Porciones (Total disponible: {item.qty})
          </label>
          {allocation.participants.map((personId) => {
            const person = people.find((p) => p.id === personId);
            if (!person) return null;
            return (
              <div key={personId} className="flex items-center gap-2">
                <span className="text-sm text-neutral-300 w-24 truncate">{person.name}:</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max={item.qty}
                  value={allocation.portions?.[personId] || 0}
                  onChange={(e) =>
                    handlePortionChange(personId, parseFloat(e.target.value) || 0)
                  }
                  className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  inputMode="decimal"
                  placeholder="0"
                />
                <span className="text-xs text-neutral-400">/ {item.qty}</span>
              </div>
            );
          })}
          <div className="text-xs text-neutral-400 mt-2">
            Suma:{" "}
            {Object.values(allocation.portions || {}).reduce((a, b) => a + b, 0).toFixed(1)} / {item.qty}
          </div>
        </div>
      )}

      {/* Editor de montos fijos */}
      {mode === "fixed_amount" && allocation.fixedAmounts && (() => {
        const totalAvailable = fromCents(item.totalCents);
        return (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-neutral-400 mb-2">
              Montos fijos (Total disponible: {totalAvailable.toFixed(2)})
            </label>
            {allocation.participants.map((personId) => {
              const person = people.find((p) => p.id === personId);
              if (!person) return null;
              const amountCents = allocation.fixedAmounts?.[personId] || 0;
              const amountDecimal = fromCents(amountCents);
              return (
                <div key={personId} className="flex items-center gap-2">
                  <span className="text-sm text-neutral-300 w-24 truncate">{person.name}:</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={totalAvailable}
                    value={amountDecimal}
                    onChange={(e) =>
                      handleFixedAmountChange(personId, parseFloat(e.target.value) || 0)
                    }
                    className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                  <span className="text-xs text-neutral-400">PEN</span>
                </div>
              );
            })}
            <div className="text-xs text-neutral-400 mt-2">
              Suma:{" "}
              {Object.values(allocation.fixedAmounts || {})
                .reduce((a, b) => a + fromCents(b), 0)
                .toFixed(2)}{" "}
              / {totalAvailable.toFixed(2)}
            </div>
          </div>
        );
      })()}
    </div>
  );
}