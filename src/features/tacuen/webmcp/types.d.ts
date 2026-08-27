// src/features/tacuen/webmcp/types.d.ts

// Ambient global WebMCP types.
// NOTE: this file intentionally has NO top-level import/export, which makes it a
// global script. Every declaration below is therefore global and merges with
// lib.dom (Document / Navigator) where applicable. Hand-maintained to avoid a
// runtime/dev dependency on the experimental `webmcp-types` package.

type ToolResult = { content: Array<{ type: "text"; text: string }> };

type ToolAnnotation = {
  destructive?: boolean;
  readOnly?: boolean;
  idempotent?: boolean;
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
  annotations?: ToolAnnotation;
  execute: (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
};

interface ModelContext {
  registerTool(
    tool: ToolDefinition,
    options?: { signal?: AbortSignal }
  ): Promise<void>;
}

interface LegacyModelContext {
  provideContext(input: { tools: ToolDefinition[] }): void;
}

interface Document {
  modelContext?: ModelContext;
}

interface Navigator {
  modelContext?: LegacyModelContext;
}
