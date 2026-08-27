// src/features/tacuen/webmcp/WebMCPBootstrap.tsx

"use client";

import { useEffect, useRef } from "react";
import { useTacuenStore } from "../state/useTacuenStore";
import { detectWebMCPBackend } from "./client";
import { buildTools } from "./tools";

/**
 * Progressive-enhancement bootstrap for WebMCP. Mounted inside <TacuenProvider>.
 * Feature-detects the API once on mount, registers tools a single time, and keeps
 * a useRef snapshot of { state, actions } updated every render so execute
 * closures always read the latest store without ever re-registering.
 */
export function WebMCPBootstrap() {
  const { state, actions } = useTacuenStore();

  const stateRef = useRef(state);
  const actionsRef = useRef(actions);

  // Keep the refs current every render (after commit) without re-registering.
  useEffect(() => {
    stateRef.current = state;
    actionsRef.current = actions;
  });

  useEffect(() => {
    const backend = detectWebMCPBackend();
    if (backend.kind === "none") return;

    const tools = buildTools({
      getState: () => stateRef.current,
      getActions: () => actionsRef.current,
    });

    if (backend.kind === "registerTool") {
      for (const tool of tools) {
        void backend.modelContext.registerTool(tool).catch(() => {
          // Swallow NotAllowedError / duplicate-name conflicts — progressive enhancement no-op.
        });
      }
    } else {
      try {
        backend.modelContext.provideContext({ tools });
      } catch {
        // WebMCP unavailable or rejected — progressive enhancement no-op.
      }
    }
  }, []);

  return null;
}
