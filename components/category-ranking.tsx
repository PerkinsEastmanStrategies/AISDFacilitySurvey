"use client";

import { Check } from "lucide-react";
import { MAX_PRIORITIES } from "@/lib/survey-data";

interface CategoryRankingProps {
  /** The full list of selectable categories. */
  categories: string[];
  /** The currently selected priorities (unordered). */
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
        {selected.length} / {max} selected
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {categories.map((category) => {
          const isSelected = selected.includes(category);
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
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border"
                  }`}
                >
                  {isSelected && <Check className="h-4 w-4" />}
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
