// src/features/tacuen/webmcp/tools.ts

import type {
  Allocation,
  AllocationMode,
  FeeModel,
  FeeType,
  Person,
  ReceiptItem,
  ReceiptModel,
  RoundingStrategy,
} from "../model/types";
import type { TacuenActions, TacuenState } from "../state/useTacuenStore";
import { computeTotalsByPerson } from "../model/calculator";
import { generateReceiptExcel, generateReceiptExcelSimple } from "../model/excel";
import { createMockReceiptModel } from "../model/adapter";
import { downloadXlsx } from "./client";

export type StoreHandles = {
  getState: () => TacuenState;
  getActions: () => TacuenActions;
};

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(message: string): ToolResult {
  return textResult(JSON.stringify({ ok: false, error: message }));
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Returns a structured error result when no model is loaded, otherwise null.
 * Every mutating tool (plus `calculate` / `export_excel`) starts with this guard.
 */
function requireModel(state: TacuenState): ToolResult | null {
  return state.model === null
    ? errorResult("No receipt model loaded. Upload a receipt first.")
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isIntegerCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

const ITEM_CATEGORIES = ["plato", "bebida", "postre", "otro"];
const ALLOCATION_MODES = ["all", "equal_selected", "portions", "fixed_amount"];
const FEE_TYPES = ["delivery", "tip", "service", "tax", "discount"];
const SPLIT_MODES = ["equal", "proportional"];
const ROUNDING_STRATEGIES = ["organizer", "split"];

function isItemCategory(value: unknown): value is ReceiptItem["category"] {
  return typeof value === "string" && (ITEM_CATEGORIES as string[]).includes(value);
}

function isAllocationMode(value: unknown): value is AllocationMode {
  return typeof value === "string" && (ALLOCATION_MODES as string[]).includes(value);
}

function isFeeType(value: unknown): value is FeeType {
  return typeof value === "string" && (FEE_TYPES as string[]).includes(value);
}

function isSplitMode(value: unknown): value is FeeModel["splitMode"] {
  return typeof value === "string" && (SPLIT_MODES as string[]).includes(value);
}

function isRoundingStrategy(value: unknown): value is RoundingStrategy {
  return typeof value === "string" && (ROUNDING_STRATEGIES as string[]).includes(value);
}

/** Guarantee a synchronous `execute` never throws unhandled. */
function safeResult(fn: () => ToolResult): ToolResult {
  try {
    return fn();
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : "Unexpected tool error");
  }
}

/** Guarantee an async `execute` never throws unhandled. */
async function safeAsyncResult(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : "Unexpected tool error");
  }
}

export function buildTools(handles: StoreHandles): ToolDefinition[] {
  const h = handles;

  const tools: ToolDefinition[] = [
    {
      name: "get_receipt_state",
      description:
        "Read the current receipt model, computed summary, and validation errors. Use this first to obtain stable item/person ids.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnly: true },
      execute: () =>
        safeResult(() => {
          const state = h.getState();
          return textResult(
            JSON.stringify({
              model: state.model,
              summary: state.summary,
              errors: state.errors,
            })
          );
        }),
    },
    {
      name: "get_summary",
      description:
        "Read the per-person split summary, computing it on demand if not yet calculated.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnly: true },
      execute: () =>
        safeResult(() => {
          const state = h.getState();
          const noModel = requireModel(state);
          if (noModel) return noModel;
          const model = state.model as ReceiptModel;
          const summary = state.summary ?? computeTotalsByPerson(model);
          return textResult(JSON.stringify(summary));
        }),
    },
    {
      name: "load_sample_receipt",
      description:
        "Load a sample receipt with demo data (items, people, allocations, fees) so the split can be demonstrated without uploading a photo. Call this first to bootstrap the wizard when no model is loaded yet.",
      inputSchema: {
        type: "object",
        properties: { eventName: { type: "string" } },
      },
      execute: (args) =>
        safeResult(() => {
          const model = createMockReceiptModel();
          const name = asString(args.eventName);
          if (name) model.name = name;
          h.getActions().setModel(model);
          return textResult(JSON.stringify({ ok: true, model }));
        }),
    },
    {
      name: "add_item",
      description: "Add a receipt item. All money values are integer cents.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          qty: { type: "number" },
          unitPriceCents: { type: "integer" },
          totalCents: { type: "integer" },
          category: { type: "string", enum: ITEM_CATEGORIES },
          isFree: { type: "boolean" },
        },
        required: ["name", "qty", "unitPriceCents", "totalCents", "category"],
      },
      execute: (args) =>
        safeResult(() => {
          const state = h.getState();
          const noModel = requireModel(state);
          if (noModel) return noModel;

          const name = asString(args.name);
          const qty = args.qty;
          const unitPriceCents = args.unitPriceCents;
          const totalCents = args.totalCents;
          const category = args.category;
          const isFree = args.isFree === true;

          if (!name) return errorResult("add_item requires a non-empty name");
          if (!isFinitePositiveNumber(qty))
            return errorResult("add_item requires qty to be a positive number");
          if (!isIntegerCents(unitPriceCents))
            return errorResult("add_item requires unitPriceCents as integer cents");
          if (!isIntegerCents(totalCents))
            return errorResult("add_item requires totalCents as integer cents");
          if (!isItemCategory(category))
            return errorResult("add_item category must be one of plato, bebida, postre, otro");

          const item: ReceiptItem = {
            id: newId(),
            name,
            qty,
            unitPriceCents,
            totalCents,
            category,
            isFree,
          };
          h.getActions().addItem(item);
          return textResult(JSON.stringify({ ok: true, item }));
        }),
    },
    {
      name: "update_item",
      description: "Update fields of an existing item by id.",
      inputSchema: {
        type: "object",
        properties: {
          itemId: { type: "string" },
          updates: { type: "object" },
        },
        required: ["itemId", "updates"],
      },
      execute: (args) =>
        safeResult(() => {
          const state = h.getState();
          const noModel = requireModel(state);
          if (noModel) return noModel;

          const itemId = asString(args.itemId);
          if (!itemId) return errorResult("update_item requires itemId");

          const updates = args.updates;
          if (typeof updates !== "object" || updates === null || Array.isArray(updates)) {
            return errorResult("update_item requires an updates object");
          }
          const record = updates as Record<string, unknown>;
          if ("unitPriceCents" in record && !isIntegerCents(record.unitPriceCents)) {
            return errorResult("update_item unitPriceCents must be integer cents");
          }
          if ("totalCents" in record && !isIntegerCents(record.totalCents)) {
            return errorResult("update_item totalCents must be integer cents");
          }

          h.getActions().updateItem(itemId, record as Partial<ReceiptItem>);
          return textResult(JSON.stringify({ ok: true }));
        }),
    },
    {
      name: "remove_item",
      description: "Remove an item (and its allocation) by id. Destructive.",
      inputSchema: {
        type: "object",
        properties: { itemId: { type: "string" } },
        required: ["itemId"],
      },
      annotations: { destructive: true },
      execute: (args) =>
        safeResult(() => {
          const state = h.getState();
          const noModel = requireModel(state);
          if (noModel) return noModel;

          const itemId = asString(args.itemId);
          if (!itemId) return errorResult("remove_item requires itemId");

          h.getActions().removeItem(itemId);
          return textResult(JSON.stringify({ ok: true }));
        }),
    },
    {
      name: "add_person",
      description:
        "Add a person to the split. Existing 'all' allocations automatically include the new person.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
      execute: (args) =>
        safeResult(() => {
          const state = h.getState();
          const noModel = requireModel(state);
          if (noModel) return noModel;

          const name = asString(args.name);
          if (!name) return errorResult("add_person requires a non-empty name");

          const person: Person = { id: newId(), name };
          h.getActions().addPerson(person);
          return textResult(JSON.stringify({ ok: true, person }));
        }),
    },
    {
      name: "update_person",
      description: "Rename a person by id.",
      inputSchema: {
        type: "object",
        properties: { personId: { type: "string" }, name: { type: "string" } },
        required: ["personId", "name"],
      },
      execute: (args) =>
        safeResult(() => {
          const state = h.getState();
          const noModel = requireModel(state);
          if (noModel) return noModel;

          const personId = asString(args.personId);
          const name = asString(args.name);
          if (!personId) return errorResult("update_person requires personId");
          if (!name) return errorResult("update_person requires a non-empty name");

          h.getActions().updatePerson(personId, { name });
          return textResult(JSON.stringify({ ok: true }));
        }),
    },
    {
      name: "remove_person",
      description: "Remove a person from the split and all allocations. Destructive.",
      inputSchema: {
        type: "object",
        properties: { personId: { type: "string" } },
        required: ["personId"],
      },
      annotations: { destructive: true },
      execute: (args) =>
        safeResult(() => {
          const state = h.getState();
          const noModel = requireModel(state);
          if (noModel) return noModel;

          const personId = asString(args.personId);
          if (!personId) return errorResult("remove_person requires personId");

          h.getActions().removePerson(personId);
          return textResult(JSON.stringify({ ok: true }));
        }),
    },
    {
      name: "update_allocation",
      description:
        "Replace an item's allocation (mode, participants, portions/fixedAmounts). Money values are integer cents.",
      inputSchema: {
        type: "object",
        properties: {
          itemId: { type: "string" },
          allocation: {
            type: "object",
            properties: {
              mode: { type: "string", enum: ALLOCATION_MODES },
              participants: { type: "array", items: { type: "string" } },
              portions: { type: "object" },
              fixedAmounts: { type: "object" },
            },
            required: ["mode", "participants"],
          },
        },
        required: ["itemId", "allocation"],
      },
      execute: (args) =>
        safeResult(() => {
          const state = h.getState();
          const noModel = requireModel(state);
          if (noModel) return noModel;

          const itemId = asString(args.itemId);
          if (!itemId) return errorResult("update_allocation requires itemId");

          const raw = args.allocation;
          if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
            return errorResult("update_allocation requires an allocation object");
          }
          const alloc = raw as Record<string, unknown>;

          if (!isAllocationMode(alloc.mode)) {
            return errorResult(
              "update_allocation mode must be one of all, equal_selected, portions, fixed_amount"
            );
          }
          if (
            !Array.isArray(alloc.participants) ||
            !alloc.participants.every((p) => typeof p === "string")
          ) {
            return errorResult("update_allocation participants must be an array of person ids");
          }
          if (alloc.portions !== undefined) {
            const portions = alloc.portions as Record<string, unknown>;
            for (const portion of Object.values(portions)) {
              if (typeof portion !== "number" || !Number.isFinite(portion)) {
                return errorResult("update_allocation portions must be numeric");
              }
            }
          }
          if (alloc.fixedAmounts !== undefined) {
            const fixed = alloc.fixedAmounts as Record<string, unknown>;
            for (const amount of Object.values(fixed)) {
              if (!isIntegerCents(amount)) {
                return errorResult("update_allocation fixedAmounts must be integer cents");
              }
            }
          }

          const allocation: Allocation = {
            itemId,
            mode: alloc.mode as AllocationMode,
            participants: alloc.participants as string[],
            ...(alloc.portions !== undefined
              ? { portions: alloc.portions as Record<string, number> }
              : {}),
            ...(alloc.fixedAmounts !== undefined
              ? { fixedAmounts: alloc.fixedAmounts as Record<string, number> }
              : {}),
          };

          h.getActions().updateAllocation(itemId, allocation);
          return textResult(JSON.stringify({ ok: true }));
        }),
    },
    {
      name: "add_fee",
      description:
        "Add a fee (delivery, tip, service, tax, discount). amountCents is integer cents.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          type: { type: "string", enum: FEE_TYPES },
          label: { type: "string" },
          amountCents: { type: "integer" },
          enabled: { type: "boolean" },
          includedInItems: { type: "boolean" },
          splitMode: { type: "string", enum: SPLIT_MODES },
        },
        required: ["key", "type", "label", "amountCents", "splitMode"],
      },
      execute: (args) =>
        safeResult(() => {
          const state = h.getState();
          const noModel = requireModel(state);
          if (noModel) return noModel;

          const key = asString(args.key);
          const type = args.type;
          const label = asString(args.label);
          const amountCents = args.amountCents;
          const enabled = args.enabled !== false;
          const includedInItems = args.includedInItems === true;
          const splitMode = args.splitMode;

          if (!key) return errorResult("add_fee requires a non-empty key");
          if (!isFeeType(type))
            return errorResult("add_fee type must be one of delivery, tip, service, tax, discount");
          if (!label) return errorResult("add_fee requires a non-empty label");
          if (!isIntegerCents(amountCents))
            return errorResult("add_fee requires amountCents as integer cents");
          if (!isSplitMode(splitMode))
            return errorResult("add_fee splitMode must be equal or proportional");

          const fee: FeeModel = {
            id: newId(),
            key,
            type,
            label,
            amountCents,
            enabled,
            includedInItems,
            splitMode,
          };
          h.getActions().addFee(fee);
          return textResult(JSON.stringify({ ok: true, fee }));
        }),
    },
    {
      name: "update_fee",
      description: "Replace a fee by its index in the fees list.",
      inputSchema: {
        type: "object",
        properties: { index: { type: "integer" }, fee: { type: "object" } },
        required: ["index", "fee"],
      },
      execute: (args) =>
        safeResult(() => {
          const state = h.getState();
          const noModel = requireModel(state);
          if (noModel) return noModel;

          const index = args.index;
          if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
            return errorResult("update_fee requires a non-negative integer index");
          }

          const fee = args.fee;
          if (typeof fee !== "object" || fee === null || Array.isArray(fee)) {
            return errorResult("update_fee requires a fee object");
          }
          const feeRecord = fee as Record<string, unknown>;
          if (feeRecord.amountCents !== undefined && !isIntegerCents(feeRecord.amountCents)) {
            return errorResult("update_fee amountCents must be integer cents");
          }

          h.getActions().updateFee(index, fee as FeeModel);
          return textResult(JSON.stringify({ ok: true }));
        }),
    },
    {
      name: "remove_fee",
      description: "Remove a fee by its index. Destructive.",
      inputSchema: {
        type: "object",
        properties: { index: { type: "integer" } },
        required: ["index"],
      },
      annotations: { destructive: true },
      execute: (args) =>
        safeResult(() => {
          const state = h.getState();
          const noModel = requireModel(state);
          if (noModel) return noModel;

          const index = args.index;
          if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
            return errorResult("remove_fee requires a non-negative integer index");
          }

          h.getActions().removeFee(index);
          return textResult(JSON.stringify({ ok: true }));
        }),
    },
    {
      name: "set_rounding",
      description: "Set the rounding step (0.5 or 1) and strategy (organizer or split).",
      inputSchema: {
        type: "object",
        properties: {
          step: { type: "number", enum: [0.5, 1] },
          strategy: { type: "string", enum: ROUNDING_STRATEGIES },
        },
        required: ["step", "strategy"],
      },
      execute: (args) =>
        safeResult(() => {
          const state = h.getState();
          const noModel = requireModel(state);
          if (noModel) return noModel;

          const step = args.step;
          const strategy = args.strategy;
          if (step !== 0.5 && step !== 1) {
            return errorResult("set_rounding step must be 0.5 or 1");
          }
          if (!isRoundingStrategy(strategy)) {
            return errorResult("set_rounding strategy must be organizer or split");
          }

          h.getActions().setRounding(step, strategy);
          return textResult(JSON.stringify({ ok: true }));
        }),
    },
    {
      name: "set_skip_people",
      description: "Toggle whether the people/split step is skipped.",
      inputSchema: {
        type: "object",
        properties: { skip: { type: "boolean" } },
        required: ["skip"],
      },
      execute: (args) =>
        safeResult(() => {
          const state = h.getState();
          const noModel = requireModel(state);
          if (noModel) return noModel;

          h.getActions().setSkipPeople(args.skip === true);
          return textResult(JSON.stringify({ ok: true }));
        }),
    },
    {
      name: "calculate",
      description: "Recompute the per-person split and return the summary.",
      inputSchema: { type: "object", properties: {} },
      execute: () =>
        safeResult(() => {
          const state = h.getState();
          const noModel = requireModel(state);
          if (noModel) return noModel;
          const model = state.model as ReceiptModel;

          h.getActions().calculate();
          const summary = computeTotalsByPerson(model);
          return textResult(JSON.stringify(summary));
        }),
    },
    {
      name: "export_excel",
      description:
        "Download an .xlsx receipt (client-side) and return per-person totals as JSON.",
      inputSchema: { type: "object", properties: {} },
      execute: () =>
        safeAsyncResult(async () => {
          const state = h.getState();
          const noModel = requireModel(state);
          if (noModel) return noModel;
          const model = state.model as ReceiptModel;

          if (model.skipPeople) {
            const buffer = await generateReceiptExcelSimple(model);
            downloadXlsx(buffer, `${model.name}.xlsx`);
            return textResult(JSON.stringify({ ok: true, skippedPeople: true }));
          }

          if (model.people.length === 0) {
            return errorResult("Cannot export: no people assigned. Add at least one person first.");
          }

          const summary = state.summary ?? computeTotalsByPerson(model);
          const buffer = await generateReceiptExcel(model, summary);
          downloadXlsx(buffer, `${model.name}.xlsx`);
          return textResult(
            JSON.stringify({
              ok: true,
              personTotals: summary.personTotals,
              totals: summary.totals,
            })
          );
        }),
    },
  ];

  // Assert a Set-deduped name list before returning (defense against #101).
  const names = new Set(tools.map((tool) => tool.name));
  if (names.size !== tools.length) {
    throw new Error("Duplicate tool names detected in buildTools");
  }

  return tools;
}
