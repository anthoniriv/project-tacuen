// app/people/page.tsx - Comensales

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTacuenStore } from "@/src/features/tacuen/state/useTacuenStore";
import { StepHeader } from "@/src/features/tacuen/ui/components/StepHeader";
import { FixedBottomCTA } from "@/src/features/tacuen/ui/components/FixedBottomCTA";
import { PersonChips } from "@/src/features/tacuen/ui/components/PersonChips";
import type { Person } from "@/src/features/tacuen/model/types";
import { trackEvent } from "@/src/features/tacuen/analytics/client";

export default function PeoplePage() {
  const router = useRouter();
  const { state, actions } = useTacuenStore();
  const [newPersonName, setNewPersonName] = useState("");
  const [showDecision, setShowDecision] = useState(false);

  if (!state.model) {
    router.push("/");
    return null;
  }

  useEffect(() => {
    if (
      state.model &&
      state.model.people.length === 0 &&
      typeof state.model.skipPeople === "undefined"
    ) {
      setShowDecision(true);
    }
  }, [state.model]);

  const canContinue = state.model.people.length > 0 && state.errors.length === 0;

  const handleAddPerson = () => {
    if (!newPersonName.trim()) return;

    const newPerson: Person = {
      id: `person-${Date.now()}`,
      name: newPersonName.trim(),
    };

    actions.addPerson(newPerson);
    setNewPersonName("");
  };

  const handleDeletePerson = (personId: string) => {
    if (confirm("¿Eliminar esta persona?")) {
      actions.removePerson(personId);
    }
  };

  const handleNext = () => {
    if (canContinue) {
      actions.setStep(3);
      router.push("/split");
    }
  };

  const handleBack = () => {
    actions.setStep(1);
    router.push("/items");
  };

  const handleChooseAssign = () => {
    actions.setSkipPeople(false);
    setShowDecision(false);
    if (state.model) {
      void trackEvent("people_assign", { receipt_id: state.model.id });
    }
  };

  const handleChooseSkip = () => {
    actions.setSkipPeople(true);
    actions.setStep(4);
    router.push("/summary");
    if (state.model) {
      void trackEvent("people_skipped", { receipt_id: state.model.id });
    }
  };

  return (
    <main className="min-h-screen pb-24 px-4 py-8 max-w-md mx-auto">
      <StepHeader
        currentStep={2}
        totalSteps={5}
        title="Agregar personas"
        onBack={handleBack}
      />

      {showDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-neutral-50">
              ¿Deseas asignar comensales?
            </h2>
            <p className="mt-2 text-sm text-neutral-300">
              Si eliges <strong>no</strong>, irás directo al resumen y podrás exportar el
              Excel sin repartir por persona.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={handleChooseAssign}
                className="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 active:bg-emerald-600 transition"
              >
                Sí, asignar personas
              </button>
              <button
                onClick={handleChooseSkip}
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700 active:bg-neutral-900 transition"
              >
                No, ir al resumen
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Agregar persona */}
      <div className="mb-6 p-4 rounded-lg bg-neutral-900 border border-neutral-800 space-y-3">
        <h2 className="text-base font-semibold text-neutral-50">Agregar persona</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newPersonName}
            onChange={(e) => setNewPersonName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddPerson();
              }
            }}
            placeholder="Nombre de la persona"
            className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          />
          <button
            onClick={handleAddPerson}
            disabled={!newPersonName.trim()}
            className="px-4 py-2 text-sm font-medium rounded-md bg-emerald-500 text-neutral-950 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-emerald-700/70 disabled:text-neutral-300 transition"
          >
            + Agregar
          </button>
        </div>
      </div>

      {/* Lista de personas */}
      <div className="mb-6">
        <h2 className="text-base font-semibold text-neutral-50 mb-3">Personas agregadas</h2>
        {state.model.people.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400 rounded-lg bg-neutral-900 border border-neutral-800">
            No hay personas agregadas. Agrega al menos una para continuar.
          </div>
        ) : (
          <PersonChips
            people={state.model.people}
            onDelete={handleDeletePerson}
            isEditable={true}
          />
        )}
      </div>

      {/* Información */}
      {state.model.people.length > 0 && (
        <div className="p-4 rounded-lg bg-blue-500/20 border border-blue-500/30 text-sm text-blue-200">
          <p>
            Agregadas: <strong>{state.model.people.length}</strong> persona
            {state.model.people.length !== 1 ? "s" : ""}
          </p>
          <p className="text-xs mt-1 text-blue-300">
            En el siguiente paso podrás asignar los ítems a cada persona.
          </p>
        </div>
      )}

      <FixedBottomCTA
        primaryLabel="Continuar a Asignación"
        primaryOnClick={handleNext}
        primaryDisabled={!canContinue}
        secondaryLabel="Atrás"
        secondaryOnClick={handleBack}
      />
    </main>
  );
}
