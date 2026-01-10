// app/summary/page.tsx - Resumen + acciones

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTacuenStore } from "@/src/features/tacuen/state/useTacuenStore";
import { StepHeader } from "@/src/features/tacuen/ui/components/StepHeader";
import { FixedBottomCTA } from "@/src/features/tacuen/ui/components/FixedBottomCTA";
import { SummaryCard } from "@/src/features/tacuen/ui/components/SummaryCard";
import { generateReceiptExcel } from "@/src/features/tacuen/model/excel";

export default function SummaryPage() {
  const router = useRouter();
  const { state, actions } = useTacuenStore();
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!state.model) {
      router.push("/");
      return;
    }

    // Asegurar que el cálculo esté hecho
    if (!state.summary && state.model) {
      actions.calculate();
    }
  }, [state.model, state.summary, actions, router]);

  if (!state.model || !state.summary) {
    return (
      <main className="min-h-screen pb-24 px-4 py-8 max-w-md mx-auto">
        <div className="p-8 text-center text-sm text-neutral-400">
          Cargando resumen...
        </div>
      </main>
    );
  }

  const handleExportExcel = async () => {
    if (!state.model || !state.summary) return;

    setIsExporting(true);
    try {
      const buffer = await generateReceiptExcel(state.model, state.summary);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tacuen-${state.model.name.replace(/\s+/g, "-")}-${Date.now()}.xlsx`;
      // Establecer atributo para forzar descarga
      link.setAttribute("download", link.download);
      document.body.appendChild(link);
      link.click();
      // Esperar un poco antes de limpiar para asegurar que la descarga se inicie
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

      // Guardar en historial después de exportar
      actions.saveToHistory();
    } catch (error) {
      console.error("Error exportando Excel:", error);
      alert("Error al exportar Excel. Intenta nuevamente.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyMessage = async () => {
    if (!state.summary) return;

    // Generar mensajes individuales para cada persona
    const messages = state.summary.personTotals.map((personTotal) => {
      const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("es-PE", {
          style: "currency",
          currency: state.model!.currency || "PEN",
          minimumFractionDigits: 2,
        }).format(amount);
      };

      const detail = personTotal.itemsBreakdown
        .map((item) => `  - ${item.itemName} (x${item.qty.toFixed(1)}): ${formatCurrency(item.total)}`)
        .join("\n");

      const message = `Hola ${personTotal.personName}! Tu parte de la cuenta "${state.model!.name}" es ${formatCurrency(personTotal.total)}.\n\n${detail ? `Detalle:\n${detail}` : ""}\n\nGracias!`;

      return {
        person: personTotal.personName,
        message,
      };
    });

    // Si solo hay una persona, copiar ese mensaje
    // Si hay múltiples, crear un mensaje combinado o copiar el primero
    const messageToCopy =
      messages.length === 1
        ? messages[0].message
        : messages.map((m) => `${m.person}:\n${m.message}`).join("\n\n---\n\n");

    try {
      await navigator.clipboard.writeText(messageToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (error) {
      console.error("Error copiando mensaje:", error);
      alert("Error al copiar mensaje. Intenta seleccionar y copiar manualmente.");
    }
  };

  const handleBack = () => {
    actions.setStep(3);
    router.push("/split");
  };

  const handleNewEvent = () => {
    if (confirm("¿Empezar un nuevo evento? Los datos actuales se perderán.")) {
      actions.reset();
      router.push("/");
    }
  };

  return (
    <main className="min-h-screen pb-24 px-4 py-8 max-w-md mx-auto">
      <StepHeader
        currentStep={4}
        totalSteps={5}
        title="Resumen final"
        onBack={handleBack}
      />

      {/* Resumen */}
      <div className="mb-6">
        <SummaryCard summary={state.summary} currency={state.model.currency} />
      </div>

      {/* Acciones */}
      <div className="space-y-3 mb-6">
        <h2 className="text-base font-semibold text-neutral-50">Acciones</h2>

        <button
          onClick={handleExportExcel}
          disabled={isExporting}
          className={`
            w-full py-3 px-4 rounded-lg border transition
            ${
              isExporting
                ? "bg-emerald-700/70 text-neutral-300 cursor-wait border-emerald-700/50"
                : "bg-emerald-500 text-neutral-950 border-emerald-400 hover:bg-emerald-400 active:bg-emerald-600"
            }
          `}
        >
          {isExporting ? "Exportando..." : "📊 Exportar Excel"}
        </button>

        <button
          onClick={handleCopyMessage}
          className={`
            w-full py-3 px-4 rounded-lg border transition
            ${
              copied
                ? "bg-green-500 text-neutral-950 border-green-400"
                : "bg-neutral-800 text-neutral-200 border-neutral-700 hover:bg-neutral-700 active:bg-neutral-900"
            }
          `}
        >
          {copied ? "✓ Copiado!" : "📋 Copiar mensaje de pago"}
        </button>

        <button
          onClick={handleNewEvent}
          className="w-full py-3 px-4 rounded-lg border bg-neutral-800 text-neutral-200 border-neutral-700 hover:bg-neutral-700 active:bg-neutral-900 transition"
        >
          🆕 Nuevo evento
        </button>
      </div>

      {/* Información adicional */}
      <div className="p-4 rounded-lg bg-blue-500/20 border border-blue-500/30 text-sm text-blue-200 space-y-2">
        <p>
          <strong>Rounding:</strong> {state.model.roundingStep === 0.5 ? "0.5" : state.model.roundingStep === 1 ? "1" : state.model.roundingStep}
        </p>
        <p>
          <strong>Estrategia:</strong>{" "}
          {state.model.roundingStrategy === "organizer"
            ? "Organizador absorbe diferencia"
            : "Dividir diferencia entre todos"}
        </p>
        {Math.abs(state.summary.totals.difference) > 0.01 && (
          <p className="text-xs mt-2 text-blue-300">
            ⚠ Diferencia detectada:{" "}
            {new Intl.NumberFormat("es-PE", {
              style: "currency",
              currency: state.model.currency || "PEN",
            }).format(state.summary.totals.difference)}
          </p>
        )}
      </div>

      <FixedBottomCTA
        primaryLabel="Exportar Excel"
        primaryOnClick={handleExportExcel}
        primaryDisabled={isExporting}
        secondaryLabel="Atrás"
        secondaryOnClick={handleBack}
      />
    </main>
  );
}