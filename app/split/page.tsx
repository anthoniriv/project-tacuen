// app/split/page.tsx - Asignación por item

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTacuenStore } from "@/src/features/tacuen/state/useTacuenStore";
import { StepHeader } from "@/src/features/tacuen/ui/components/StepHeader";
import { FixedBottomCTA } from "@/src/features/tacuen/ui/components/FixedBottomCTA";
import { AllocationEditor } from "@/src/features/tacuen/ui/components/AllocationEditor";
import { ItemCard } from "@/src/features/tacuen/ui/components/ItemCard";
import type { ReceiptItem, Allocation } from "@/src/features/tacuen/model/types";
import { formatCents } from "@/src/features/tacuen/model/money";

export default function SplitPage() {
  const router = useRouter();
  const { state, actions } = useTacuenStore();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    state.model?.items.filter((i) => !i.isFree)[0]?.id || null
  );

  if (!state.model) {
    router.push("/");
    return null;
  }

  const items = state.model.items.filter((i) => !i.isFree);
  const selectedItem = items.find((i) => i.id === selectedItemId);
  const selectedAllocation =
    state.model.allocations.find((a) => a.itemId === selectedItemId) || null;

  const canContinue = items.length > 0 && state.errors.length === 0;

  const handleUpdateAllocation = (allocation: Allocation) => {
    if (selectedItemId) {
      actions.updateAllocation(selectedItemId, allocation);
    }
  };

  const handleNext = () => {
    if (canContinue) {
      actions.calculate(); // Asegurar cálculo antes de ir a summary
      actions.setStep(4);
      router.push("/summary");
    }
  };

  const handleBack = () => {
    actions.setStep(2);
    router.push("/people");
  };

  if (items.length === 0) {
    return (
      <main className="min-h-screen pb-24 px-4 py-8 max-w-md mx-auto">
        <StepHeader
          currentStep={3}
          totalSteps={5}
          title="Asignación de ítems"
          onBack={handleBack}
        />
        <div className="p-8 text-center text-sm text-neutral-400 rounded-lg bg-neutral-900 border border-neutral-800">
          No hay ítems para asignar. Ve a la página anterior y agrega ítems.
        </div>
        <FixedBottomCTA
          primaryLabel="Atrás"
          primaryOnClick={handleBack}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-24 px-4 py-8 max-w-md mx-auto">
      <StepHeader
        currentStep={3}
        totalSteps={5}
        title="Asignar ítems"
        onBack={handleBack}
      />

      {/* Errores */}
      {state.errors.length > 0 && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/20 border border-red-500/30">
          <h3 className="text-sm font-semibold text-red-300 mb-2">Errores de validación:</h3>
          <ul className="space-y-1 text-xs text-red-200">
            {state.errors.map((error, idx) => (
              <li key={idx}>• {error.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Lista de ítems (selector) */}
      <div className="mb-6">
        <h2 className="text-base font-semibold text-neutral-50 mb-3">Seleccionar ítem</h2>
        <div className="space-y-2">
          {items.map((item) => {
            const isSelected = item.id === selectedItemId;
            const allocation = state.model!.allocations.find((a) => a.itemId === item.id);
            const hasAllocation = allocation && allocation.participants.length > 0;

            return (
              <button
                key={item.id}
                onClick={() => setSelectedItemId(item.id)}
                className={`
                  w-full p-3 rounded-lg border transition text-left
                  ${
                    isSelected
                      ? "bg-emerald-500/20 border-emerald-500/50"
                      : "bg-neutral-900 border-neutral-800 hover:border-neutral-700"
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neutral-50 truncate">
                      {item.name}
                    </div>
                    <div className="text-xs text-neutral-400 mt-1">
                      {item.qty} x {formatCents(item.unitPriceCents, state.model.currency)} = {formatCents(item.totalCents, state.model.currency)}
                    </div>
                  </div>
                  <div className="ml-3">
                    {hasAllocation ? (
                      <span className="px-2 py-1 text-xs font-medium rounded bg-green-500/20 text-green-300 border border-green-500/30">
                        ✓
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-medium rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                        ⚠
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor de asignación */}
      {selectedItem && selectedAllocation && (
        <div className="mb-6 p-4 rounded-lg bg-neutral-900 border border-neutral-800">
          <h2 className="text-base font-semibold text-neutral-50 mb-4">Asignación</h2>
          <ItemCard item={selectedItem} isEditable={false} />
          <div className="mt-4">
            <AllocationEditor
              item={selectedItem}
              allocation={selectedAllocation}
              people={state.model.people}
              onUpdate={handleUpdateAllocation}
            />
          </div>
        </div>
      )}

      {/* Resumen de asignaciones */}
      {state.model.allocations.length > 0 && (
        <div className="mb-6 p-4 rounded-lg bg-neutral-900 border border-neutral-800">
          <h2 className="text-base font-semibold text-neutral-50 mb-3">Resumen</h2>
          <div className="space-y-2 text-xs text-neutral-400">
            {state.model.allocations.map((alloc) => {
              const item = items.find((i) => i.id === alloc.itemId);
              if (!item) return null;
              const participants = alloc.participants
                .map((pid) => state.model!.people.find((p) => p.id === pid)?.name)
                .filter(Boolean)
                .join(", ");
              return (
                <div key={alloc.itemId} className="flex justify-between">
                  <span className="truncate flex-1">{item.name}:</span>
                  <span className="ml-2 text-neutral-300">{participants}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <FixedBottomCTA
        primaryLabel="Ver Resumen"
        primaryOnClick={handleNext}
        primaryDisabled={!canContinue}
        secondaryLabel="Atrás"
        secondaryOnClick={handleBack}
      />
    </main>
  );
}