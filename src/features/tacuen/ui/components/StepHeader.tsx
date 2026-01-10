// src/features/tacuen/ui/components/StepHeader.tsx

"use client";

interface StepHeaderProps {
  currentStep: number;
  totalSteps: number;
  title: string;
  onBack?: () => void;
}

export function StepHeader({ currentStep, totalSteps, title, onBack }: StepHeaderProps) {
  return (
    <div className="w-full mb-6">
      {/* Progreso */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          disabled={!onBack || currentStep === 0}
          className={`
            px-3 py-1.5 text-sm rounded-md transition
            ${
              onBack && currentStep > 0
                ? "bg-neutral-800 text-neutral-200 hover:bg-neutral-700 active:bg-neutral-900"
                : "bg-neutral-900 text-neutral-600 cursor-not-allowed"
            }
          `}
        >
          ← Atrás
        </button>
        <span className="text-sm font-medium text-neutral-400">
          Paso {currentStep + 1} de {totalSteps}
        </span>
      </div>

      {/* Barra de progreso */}
      <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
        />
      </div>

      {/* Título */}
      <h1 className="text-xl font-semibold text-neutral-50">{title}</h1>
    </div>
  );
}