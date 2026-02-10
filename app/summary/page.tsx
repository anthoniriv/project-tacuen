// app/summary/page.tsx - Resumen + acciones

"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTacuenStore } from "@/src/features/tacuen/state/useTacuenStore";
import { StepHeader } from "@/src/features/tacuen/ui/components/StepHeader";
import { FixedBottomCTA } from "@/src/features/tacuen/ui/components/FixedBottomCTA";
import { SummaryCard } from "@/src/features/tacuen/ui/components/SummaryCard";
import { SummarySimpleCard } from "@/src/features/tacuen/ui/components/SummarySimpleCard";
import { generateReceiptExcel, generateReceiptExcelSimple } from "@/src/features/tacuen/model/excel";
import { formatCents } from "@/src/features/tacuen/model/money";
import { getDeviceId, trackEvent } from "@/src/features/tacuen/analytics/client";

export default function SummaryPage() {
  const router = useRouter();
  const { state, actions } = useTacuenStore();
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackContact, setFeedbackContact] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const didTrackSummary = useRef(false);

  useEffect(() => {
    if (!state.model) {
      router.push("/");
      return;
    }

    const isSkip = state.model.skipPeople === true || state.model.people.length === 0;
    // Asegurar que el cálculo esté hecho (solo cuando hay personas)
    if (!isSkip && !state.summary && state.model) {
      actions.calculate();
    }

    if (state.model && !didTrackSummary.current) {
      didTrackSummary.current = true;
      void trackEvent("summary_view", { receipt_id: state.model.id, skip_people: isSkip });
    }
  }, [state.model, state.summary, actions, router]);

  if (!state.model) {
    return (
      <main className="min-h-screen pb-24 px-4 py-8 max-w-md mx-auto">
        <div className="p-8 text-center text-sm text-neutral-400">
          Cargando resumen...
        </div>
      </main>
    );
  }

  const isSkip = state.model.skipPeople === true || state.model.people.length === 0;

  if (!isSkip && !state.summary) {
    return (
      <main className="min-h-screen pb-24 px-4 py-8 max-w-md mx-auto">
        <div className="p-8 text-center text-sm text-neutral-400">
          Cargando resumen...
        </div>
      </main>
    );
  }

  const handleExportExcel = async () => {
    if (!state.model) return;

    setIsExporting(true);
    try {
      const buffer = isSkip
        ? await generateReceiptExcelSimple(state.model)
        : await generateReceiptExcel(state.model, state.summary!);
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
      void trackEvent("export_excel", { receipt_id: state.model.id, skip_people: isSkip });
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
      const currency = state.model!.currency || "PEN";

      const detail = personTotal.itemsBreakdown
        .map((item) => `  - ${item.itemName} (x${item.qty.toFixed(1)}): ${formatCents(item.totalCents, currency)}`)
        .join("\n");

      const message = `Hola ${personTotal.personName}! Tu parte de la cuenta "${state.model!.name}" es ${formatCents(personTotal.totalCents, currency)}.\n\n${detail ? `Detalle:\n${detail}` : ""}\n\nGracias!`;

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
    if (isSkip) {
      actions.setStep(2);
      router.push("/people");
    } else {
      actions.setStep(3);
      router.push("/split");
    }
  };

  const handleNewEvent = () => {
    if (confirm("¿Empezar un nuevo evento? Los datos actuales se perderán.")) {
      actions.reset();
      router.push("/");
    }
  };

  const handleSubmitFeedback = async () => {
    const deviceId = getDeviceId();
    if (!deviceId) return;
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceId,
          rating: feedbackRating,
          comment: feedbackText,
          contact: feedbackContact,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Error enviando feedback");
      }
      setFeedbackSent(true);
      setTimeout(() => {
        setShowFeedback(false);
        setFeedbackSent(false);
        setFeedbackText("");
        setFeedbackContact("");
      }, 1200);
      void trackEvent("feedback_submitted", { rating: feedbackRating });
    } catch (e) {
      console.error(e);
      alert("No se pudo enviar el feedback. Intenta nuevamente.");
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
        {isSkip ? (
          <SummarySimpleCard model={state.model} currency={state.model.currency} />
        ) : (
          <SummaryCard summary={state.summary!} currency={state.model.currency} />
        )}
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

        {!isSkip && (
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
        )}

        <button
          onClick={handleNewEvent}
          className="w-full py-3 px-4 rounded-lg border bg-neutral-800 text-neutral-200 border-neutral-700 hover:bg-neutral-700 active:bg-neutral-900 transition"
        >
          🆕 Nuevo evento
        </button>

        <button
          onClick={() => setShowFeedback(true)}
          className="w-full py-3 px-4 rounded-lg border bg-neutral-900 text-neutral-200 border-neutral-800 hover:bg-neutral-800 active:bg-neutral-900 transition"
        >
          🗣️ Enviar feedback
        </button>
      </div>

      {/* Información adicional */}
      {!isSkip && (
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
          {Math.abs(state.summary!.totals.differenceCents) > 1 && (
            <p className="text-xs mt-2 text-blue-300">
              ⚠ Diferencia detectada:{" "}
              {formatCents(state.summary!.totals.differenceCents, state.model.currency)}
            </p>
          )}
        </div>
      )}

      <FixedBottomCTA
        primaryLabel="Exportar Excel"
        primaryOnClick={handleExportExcel}
        primaryDisabled={isExporting}
        secondaryLabel="Atrás"
        secondaryOnClick={handleBack}
      />

      {showFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-neutral-50">Feedback</h2>
            <p className="mt-2 text-sm text-neutral-300">
              Tu comentario nos ayuda a mejorar. El contacto es opcional.
            </p>

            <div className="mt-4 space-y-3">
              <label className="text-sm text-neutral-300">Calificación (1-5)</label>
              <input
                type="number"
                min={1}
                max={5}
                value={feedbackRating}
                onChange={(e) => setFeedbackRating(Number(e.target.value) || 5)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
              />

              <label className="text-sm text-neutral-300">Comentario</label>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="¿Qué mejorarías?"
              />

              <label className="text-sm text-neutral-300">Contacto (opcional)</label>
              <input
                type="text"
                value={feedbackContact}
                onChange={(e) => setFeedbackContact(e.target.value)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Email o WhatsApp"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowFeedback(false)}
                className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitFeedback}
                className="flex-1 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
                disabled={feedbackSent}
              >
                {feedbackSent ? "Enviado" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
