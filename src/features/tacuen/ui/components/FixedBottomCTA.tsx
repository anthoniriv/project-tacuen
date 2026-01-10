// src/features/tacuen/ui/components/FixedBottomCTA.tsx

"use client";

interface FixedBottomCTAProps {
  primaryLabel: string;
  primaryOnClick: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  secondaryOnClick?: () => void;
}

export function FixedBottomCTA({
  primaryLabel,
  primaryOnClick,
  primaryDisabled = false,
  secondaryLabel,
  secondaryOnClick,
}: FixedBottomCTAProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-neutral-950 border-t border-neutral-800 p-4 shadow-2xl">
      <div className="max-w-md mx-auto flex gap-3">
        {secondaryLabel && secondaryOnClick && (
          <button
            onClick={secondaryOnClick}
            className="flex-1 py-3 text-sm font-medium rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:bg-neutral-900 transition"
          >
            {secondaryLabel}
          </button>
        )}
        <button
          onClick={primaryOnClick}
          disabled={primaryDisabled}
          className={`
            flex-1 py-3 text-sm font-medium rounded-md transition
            ${
              primaryDisabled
                ? "bg-emerald-700/70 text-neutral-300 cursor-wait"
                : "bg-emerald-500 text-neutral-950 hover:bg-emerald-400 active:bg-emerald-600"
            }
          `}
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}