"use client";

import { MAX_PRIORITIES } from "@/lib/survey-data";

interface CategoryRankingProps {
  /** The full list of selectable categories. */
  categories: string[];
  /**
   * Selected priorities in rank order (index 0 = #1 priority).
   * Selecting a category appends it; deselecting removes it.
   */
  value?: string[];
  onChange: (selected: string[]) => void;
  /** Maximum number of priorities that may be selected. */
  max?: number;
}

export function CategoryRanking({
  categories,
  value,
  onChange,
  max = MAX_PRIORITIES,
}: CategoryRankingProps) {
  const selected = value ?? [];
  const atLimit = selected.length >= max;

  const toggle = (category: string) => {
    if (selected.includes(category)) {
      onChange(selected.filter((c) => c !== category));
    } else if (!atLimit) {
      onChange([...selected, category]);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">
        {selected.length} / {max} ranked — select in order of priority (#1 first)
      </p>
      {selected.length > 0 && (
        <ol className="space-y-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-foreground">
          {selected.map((category, index) => (
            <li key={category} className="flex gap-2">
              <span className="w-5 shrink-0 font-semibold text-primary">
                {index + 1}.
              </span>
              <span>{category}</span>
            </li>
          ))}
        </ol>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {categories.map((category) => {
          const rank = selected.indexOf(category);
          const isSelected = rank !== -1;
          const isDisabled = !isSelected && atLimit;
          return (
            <li key={category}>
              <button
                type="button"
                onClick={() => toggle(category)}
                disabled={isDisabled}
                aria-pressed={isSelected}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : isDisabled
                      ? "border-border/40 opacity-50"
                      : "border-border/60 hover:border-primary/50 hover:bg-muted/50"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-bold transition-colors ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border"
                  }`}
                >
                  {isSelected ? rank + 1 : ""}
                </span>
                <span className="flex-1 text-sm font-medium text-foreground">
                  {category}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
