// app/items/page.tsx - Items detectados + edición + extras

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTacuenStore } from "@/src/features/tacuen/state/useTacuenStore";
import { StepHeader } from "@/src/features/tacuen/ui/components/StepHeader";
import { FixedBottomCTA } from "@/src/features/tacuen/ui/components/FixedBottomCTA";
import { ItemCard } from "@/src/features/tacuen/ui/components/ItemCard";
import { FeeEditor } from "@/src/features/tacuen/ui/components/FeeEditor";
import type { ReceiptItem, FeeModel, FeeType } from "@/src/features/tacuen/model/types";

export default function ItemsPage() {
  const router = useRouter();
  const { state, actions } = useTacuenStore();
  const [editingItem, setEditingItem] = useState<ReceiptItem | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    name: "",
    qty: 1,
    unitPrice: 0,
    total: 0,
    category: "plato" as ReceiptItem["category"],
    isFree: false,
  });

  if (!state.model) {
    router.push("/");
    return null;
  }

  const canContinue = state.model.items.length > 0 && state.errors.length === 0;

  const handleUpdateItem = (itemId: string, updates: Partial<ReceiptItem>) => {
    actions.updateItem(itemId, updates);
    setEditingItem(null);
  };

  const handleDeleteItem = (itemId: string) => {
    if (confirm("¿Eliminar este ítem?")) {
      actions.removeItem(itemId);
    }
  };

  const handleAddItem = () => {
    const newItem: ReceiptItem = {
      id: `item-${Date.now()}`,
      ...newItemForm,
      total: newItemForm.qty * newItemForm.unitPrice || newItemForm.total,
    };
    actions.addItem(newItem);
    setNewItemForm({
      name: "",
      qty: 1,
      unitPrice: 0,
      total: 0,
      category: "plato",
      isFree: false,
    });
    setShowAddItem(false);
  };

  const handleUpdateFee = (index: number, fee: FeeModel) => {
    actions.updateFee(index, fee);
  };

  const handleAddFee = () => {
    const newFee: FeeModel = {
      type: "service",
      label: "Servicio",
      amount: 0,
      splitMode: "proportional",
    };
    actions.addFee(newFee);
  };

  const handleNext = () => {
    if (canContinue) {
      actions.setStep(2);
      router.push("/people");
    }
  };

  const handleBack = () => {
    router.push("/");
  };

  return (
    <main className="min-h-screen pb-24 px-4 py-8 max-w-md mx-auto">
      <StepHeader
        currentStep={1}
        totalSteps={5}
        title="Editar ítems y fees"
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

      {/* Items */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-50">Ítems</h2>
          <button
            onClick={() => setShowAddItem(!showAddItem)}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-500 text-neutral-950 hover:bg-emerald-400 active:bg-emerald-600 transition"
          >
            + Agregar
          </button>
        </div>

        {showAddItem && (
          <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-800 space-y-3">
            <input
              type="text"
              placeholder="Nombre del ítem"
              value={newItemForm.name}
              onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })}
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="Cantidad"
                value={newItemForm.qty || ""}
                onChange={(e) =>
                  setNewItemForm({ ...newItemForm, qty: parseFloat(e.target.value) || 0 })
                }
                className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                inputMode="decimal"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Precio unit."
                value={newItemForm.unitPrice || ""}
                onChange={(e) =>
                  setNewItemForm({
                    ...newItemForm,
                    unitPrice: parseFloat(e.target.value) || 0,
                  })
                }
                className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                inputMode="decimal"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Total"
                value={newItemForm.total || ""}
                onChange={(e) =>
                  setNewItemForm({ ...newItemForm, total: parseFloat(e.target.value) || 0 })
                }
                className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder-neutral-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                inputMode="decimal"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={newItemForm.category}
                onChange={(e) =>
                  setNewItemForm({
                    ...newItemForm,
                    category: e.target.value as ReceiptItem["category"],
                  })
                }
                className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              >
                <option value="plato">Plato</option>
                <option value="bebida">Bebida</option>
                <option value="postre">Postre</option>
                <option value="otro">Otro</option>
              </select>
              <label className="flex items-center gap-2 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newItemForm.isFree}
                  onChange={(e) =>
                    setNewItemForm({ ...newItemForm, isFree: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-emerald-500 focus:ring-emerald-500"
                />
                Gratis
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddItem(false)}
                className="flex-1 px-3 py-2 text-sm font-medium rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddItem}
                disabled={!newItemForm.name.trim()}
                className="flex-1 px-3 py-2 text-sm font-medium rounded-md bg-emerald-500 text-neutral-950 hover:bg-emerald-400 disabled:bg-emerald-700/70 disabled:text-neutral-300 transition"
              >
                Agregar
              </button>
            </div>
          </div>
        )}

        {state.model.items.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400 rounded-lg bg-neutral-900 border border-neutral-800">
            No hay ítems. Agrega uno para continuar.
          </div>
        ) : (
          state.model.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onEdit={() => setEditingItem(item)}
              onDelete={handleDeleteItem}
            />
          ))
        )}
      </div>

      {/* Modal de edición */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-semibold text-neutral-50">Editar ítem</h3>
            <input
              type="text"
              value={editingItem.name}
              onChange={(e) =>
                setEditingItem({ ...editingItem, name: e.target.value })
              }
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="Cantidad"
                value={editingItem.qty}
                onChange={(e) =>
                  setEditingItem({
                    ...editingItem,
                    qty: parseFloat(e.target.value) || 0,
                  })
                }
                className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                inputMode="decimal"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Precio unit."
                value={editingItem.unitPrice}
                onChange={(e) =>
                  setEditingItem({
                    ...editingItem,
                    unitPrice: parseFloat(e.target.value) || 0,
                  })
                }
                className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                inputMode="decimal"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Total"
                value={editingItem.total}
                onChange={(e) =>
                  setEditingItem({
                    ...editingItem,
                    total: parseFloat(e.target.value) || 0,
                  })
                }
                className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                inputMode="decimal"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={editingItem.category}
                onChange={(e) =>
                  setEditingItem({
                    ...editingItem,
                    category: e.target.value as ReceiptItem["category"],
                  })
                }
                className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              >
                <option value="plato">Plato</option>
                <option value="bebida">Bebida</option>
                <option value="postre">Postre</option>
                <option value="otro">Otro</option>
              </select>
              <label className="flex items-center gap-2 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingItem.isFree}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, isFree: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-emerald-500 focus:ring-emerald-500"
                />
                Gratis
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditingItem(null)}
                className="flex-1 px-3 py-2 text-sm font-medium rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleUpdateItem(editingItem.id, editingItem)}
                className="flex-1 px-3 py-2 text-sm font-medium rounded-md bg-emerald-500 text-neutral-950 hover:bg-emerald-400 transition"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fees */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-50">Fees adicionales</h2>
          <button
            onClick={handleAddFee}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-500 text-neutral-950 hover:bg-emerald-400 active:bg-emerald-600 transition"
          >
            + Agregar
          </button>
        </div>

        {state.model.fees.length === 0 ? (
          <div className="p-4 text-center text-sm text-neutral-400 rounded-lg bg-neutral-900 border border-neutral-800">
            No hay fees adicionales. Opcional.
          </div>
        ) : (
          state.model.fees.map((fee, index) => (
            <FeeEditor
              key={index}
              fee={fee}
              index={index}
              onUpdate={handleUpdateFee}
              onDelete={actions.removeFee}
            />
          ))
        )}
      </div>

      <FixedBottomCTA
        primaryLabel="Continuar a Personas"
        primaryOnClick={handleNext}
        primaryDisabled={!canContinue}
        secondaryLabel="Atrás"
        secondaryOnClick={handleBack}
      />
    </main>
  );
}