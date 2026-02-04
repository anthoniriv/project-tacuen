// app/page.tsx - Home: Captura de foto (con pipeline receipts)

"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTacuenStore } from "@/src/features/tacuen/state/useTacuenStore";
import { mapOcrToReceiptModel, createMockReceiptModel } from "@/src/features/tacuen/model/adapter";
import { StepHeader } from "@/src/features/tacuen/ui/components/StepHeader";
import type { AnalisisTicketIA } from "@/lib/excel/generarExcel";

type Status = "idle" | "loading" | "error";

type ReceiptStatus =
  | "uploaded"
  | "processing"
  | "retrying"
  | "done"
  | "needs_review"
  | "error";

async function createReceipt(file: File) {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch("/api/receipts", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Error creando receipt");
  return json as { id: string };
}

async function processReceipt(id: string, contexto?: string) {
  const res = await fetch(`/api/receipts/${id}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contexto: contexto ?? "" }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Error procesando receipt");
  return json as { status: string };
}

async function getReceipt(id: string) {
  const res = await fetch(`/api/receipts/${id}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Error obteniendo receipt");
  return json as {
    id: string;
    status: ReceiptStatus;
    parsed_json: AnalisisTicketIA | null;
    difference_cents: number | null;
    error_reason: string | null;
  };
}

export default function HomePage() {
  const router = useRouter();
  const { actions } = useTacuenStore();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [eventName, setEventName] = useState<string>("");
  const [useMock, setUseMock] = useState<boolean>(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("imagenTicket") as File | null;

    if (!file && !useMock) {
      setErrorMessage("Debes seleccionar una imagen o usar datos mock.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    try {
      let receiptModel;

      if (useMock) {
        receiptModel = createMockReceiptModel();
        if (eventName.trim()) receiptModel.name = eventName.trim();
      } else {
        // ✅ Nuevo flujo: upload -> process -> poll -> parsed_json -> model
        const { id } = await createReceipt(file!);

        // Dispara procesamiento (no bloquea UI con el resultado final)
        await processReceipt(id, "");

        // Polling simple
        const start = Date.now();
        const pollEveryMs = 1200;
        const timeoutMs = 60000;

        let lastStatus: ReceiptStatus = "uploaded";

        while (true) {
          const r = await getReceipt(id);
          lastStatus = r.status;

          if (r.status === "done" || r.status === "needs_review") {
            if (!r.parsed_json) throw new Error("No se obtuvo parsed_json del receipt");

            // Reutilizamos tu adapter actual (AnalisisTicketIA -> ReceiptModel)
            receiptModel = mapOcrToReceiptModel(
              r.parsed_json,
              eventName.trim() || "División de cuenta"
            );

            // Opcional: si quieres mostrar aviso en UI cuando hay mismatch:
            // if (r.status === "needs_review") { ... }

            break;
          }

          if (r.status === "error") {
            throw new Error(r.error_reason || "Error procesando el ticket");
          }

          if (Date.now() - start > timeoutMs) {
            throw new Error(
              `El análisis tardó demasiado (último estado: ${lastStatus}). Intenta nuevamente.`
            );
          }

          await new Promise((resolve) => setTimeout(resolve, pollEveryMs));
        }
      }

      // Cargar el modelo en el store
      actions.setModel(receiptModel);
      actions.setStep(1);

      // Guardar en localStorage
      actions.saveToHistory();

      // Navegar a items
      router.push("/items");
    } catch (error: any) {
      console.error(error);
      setStatus("error");
      setErrorMessage(
        error?.message ?? "Ocurrió un error al procesar la imagen. Intenta nuevamente."
      );
    } finally {
      // vuelve a idle si no hubo error
      // (si hubo error, dejamos status en error para que se muestre el mensaje)
      // Si prefieres: setStatus("idle") siempre y manejar el mensaje aparte.
      // Aquí solo reseteo si no es error:
      // pero simple: si status era loading y no error, vuelve a idle.
      // (si quieres que siga mostrando "Procesando..." hasta /items, deja esto)
      // setStatus("idle");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <StepHeader currentStep={0} totalSteps={5} title="Sube la foto de la boleta" />

        <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl p-6 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="eventName" className="text-sm font-medium text-neutral-200">
                Nombre del evento (opcional)
              </label>
              <input
                id="eventName"
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm text-neutral-50 placeholder-neutral-500 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="Ej: Cena en Restaurante X"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="imagenTicket" className="text-sm font-medium text-neutral-200">
                Imagen del comprobante (PNG o JPG)
              </label>
              <input
                id="imagenTicket"
                name="imagenTicket"
                type="file"
                accept="image/png, image/jpeg"
                disabled={useMock}
                className={`
                  text-sm text-neutral-200
                  file:mr-3 file:py-2 file:px-3 file:border-0 file:rounded-md
                  file:bg-neutral-800 file:text-neutral-50 file:cursor-pointer
                  ${useMock ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                `}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useMock"
                checked={useMock}
                onChange={(e) => setUseMock(e.target.checked)}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 focus:ring-offset-neutral-950 focus:ring-2"
              />
              <label htmlFor="useMock" className="text-sm text-neutral-300">
                Usar datos de ejemplo (desarrollo)
              </label>
            </div>

            {status === "error" && errorMessage && (
              <div className="p-3 rounded-md bg-red-500/20 border border-red-500/30 text-sm text-red-300">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className={`
                w-full py-3 text-sm font-medium rounded-md transition
                ${
                  status === "loading"
                    ? "bg-emerald-700/70 text-neutral-300 cursor-wait"
                    : "bg-emerald-500 text-neutral-950 hover:bg-emerald-400 active:bg-emerald-600"
                }
              `}
            >
              {status === "loading" ? "Procesando..." : "Continuar"}
            </button>
          </form>

          <div className="pt-4 border-t border-neutral-800">
            <button
              onClick={() => {
                actions.loadFromLocalStorage();
                router.push("/items");
              }}
              className="w-full py-2 text-sm font-medium rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:bg-neutral-900 transition"
            >
              Cargar último evento
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
