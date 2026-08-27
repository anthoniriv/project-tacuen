// src/features/tacuen/webmcp/client.ts

export type WebMCPBackend =
  | { kind: "registerTool"; modelContext: ModelContext }
  | { kind: "provideContext"; modelContext: LegacyModelContext }
  | { kind: "none" };

/**
 * Feature-detect the WebMCP imperative API. Gated on SecureContext so we never
 * touch the API (or throw) when it is absent or the page is not a secure context.
 * Canonical `document.modelContext.registerTool` is preferred; legacy
 * `navigator.modelContext.provideContext` is a fallback.
 */
export function detectWebMCPBackend(): WebMCPBackend {
  if (typeof document === "undefined") return { kind: "none" };
  if (typeof window !== "undefined" && !window.isSecureContext) return { kind: "none" };

  if (document.modelContext?.registerTool) {
    return { kind: "registerTool", modelContext: document.modelContext };
  }
  if (navigator.modelContext?.provideContext) {
    return { kind: "provideContext", modelContext: navigator.modelContext };
  }
  return { kind: "none" };
}

/**
 * Trigger a client-side download of an Excel (.xlsx) buffer via a Blob + anchor.
 * No server round-trip.
 */
export function downloadXlsx(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
