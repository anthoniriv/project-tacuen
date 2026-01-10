// src/features/tacuen/ui/components/PersonChips.tsx

"use client";

import type { Person } from "../../model/types";

interface PersonChipsProps {
  people: Person[];
  selectedIds?: string[];
  onToggle?: (personId: string) => void;
  onDelete?: (personId: string) => void;
  isSelectable?: boolean;
  isEditable?: boolean;
}

export function PersonChips({
  people,
  selectedIds = [],
  onToggle,
  onDelete,
  isSelectable = false,
  isEditable = false,
}: PersonChipsProps) {
  if (people.length === 0) {
    return (
      <div className="text-sm text-neutral-400 text-center py-4">
        No hay personas agregadas
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {people.map((person) => {
        const isSelected = selectedIds.includes(person.id);
        return (
          <div
            key={person.id}
            className={`
              relative px-4 py-2 rounded-full text-sm font-medium transition
              ${
                isSelectable
                  ? isSelected
                    ? "bg-emerald-500 text-neutral-950 border-2 border-emerald-400"
                    : "bg-neutral-800 text-neutral-300 border-2 border-neutral-700 hover:border-neutral-600"
                  : "bg-neutral-800 text-neutral-300 border-2 border-neutral-700"
              }
              ${isSelectable && onToggle ? "cursor-pointer" : ""}
            `}
            onClick={() => isSelectable && onToggle && onToggle(person.id)}
          >
            {person.name}
            {isEditable && onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(person.id);
                }}
                className="ml-2 text-neutral-500 hover:text-red-400 transition"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}