"use client";

import { Button } from "@/components/ui/button";
import {
  MapPin,
  Circle,
  Pencil,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Tool = "pan" | "pin" | "circle" | "freeform";
export type Classification = "strength" | "weakness";

interface AnnotationToolbarProps {
  tool: Tool;
  classification: Classification;
  currentColor: string;
  onToolChange: (tool: Tool) => void;
  onClassificationChange: (classification: Classification) => void;
  disabled?: boolean;
  /** When false, omit the built-in heading (parent provides step label). */
  showHeading?: boolean;
}

export function AnnotationToolbar({
  tool,
  classification,
  currentColor,
  onToolChange,
  onClassificationChange,
  disabled = false,
  showHeading = true,
}: AnnotationToolbarProps) {
  return (
    <div className={cn(
      "rounded-md border border-border/60 bg-gradient-to-br from-muted/50 to-muted/30 p-2",
      disabled && "opacity-50 pointer-events-none"
    )}>
      <div className="space-y-2">
        {showHeading && (
          <div>
            <p className="mb-px text-[11px] font-medium text-foreground">
              Mark Locations on Floor Plan{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </p>
            <p className="mb-1 text-[9px] leading-snug text-muted-foreground">
              Identify specific areas that are positive strengths or areas of concern related to this question.
            </p>
          </div>
        )}
        {!showHeading && (
          <p className="text-[9px] leading-snug text-muted-foreground">
            Identify specific areas that are positive strengths or areas of
            concern related to this question.
          </p>
        )}

        <div>
          <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Annotation Tool
          </p>
          <div className="flex items-center gap-0.5">
            <Button
              variant={tool === "pin" ? "default" : "outline"}
              size="sm"
              onClick={() => onToolChange("pin")}
              title="Drop Pin"
              className={cn(
                "h-6 flex-1 gap-0.5",
                tool === "pin" && "shadow-sm"
              )}
              style={tool === "pin" ? { backgroundColor: currentColor } : undefined}
            >
              <MapPin className="h-3 w-3" />
              <span className="hidden text-[10px] lg:inline">Pin</span>
            </Button>
            <Button
              variant={tool === "circle" ? "default" : "outline"}
              size="sm"
              onClick={() => onToolChange("circle")}
              title="Draw Circle"
              className={cn(
                "h-6 flex-1 gap-0.5",
                tool === "circle" && "shadow-sm"
              )}
              style={tool === "circle" ? { backgroundColor: currentColor } : undefined}
            >
              <Circle className="h-3 w-3" />
              <span className="hidden text-[10px] lg:inline">Circle</span>
            </Button>
            <Button
              variant={tool === "freeform" ? "default" : "outline"}
              size="sm"
              onClick={() => onToolChange("freeform")}
              title="Freeform"
              className={cn(
                "h-6 flex-1 gap-0.5",
                tool === "freeform" && "shadow-sm"
              )}
              style={tool === "freeform" ? { backgroundColor: currentColor } : undefined}
            >
              <Pencil className="h-3 w-3" />
              <span className="hidden text-[10px] lg:inline">Draw</span>
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Classification
          </p>
          <div className="flex items-center gap-0.5">
            <Button
              variant={classification === "strength" ? "default" : "outline"}
              size="sm"
              onClick={() => onClassificationChange("strength")}
              className={cn(
                "h-6 flex-1 gap-0.5 text-[10px] transition-all",
                classification === "strength" && "border-emerald-600 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
              )}
            >
              <ThumbsUp className="h-2.5 w-2.5" />
              Strength
            </Button>
            <Button
              variant={classification === "weakness" ? "default" : "outline"}
              size="sm"
              onClick={() => onClassificationChange("weakness")}
              className={cn(
                "h-6 flex-1 gap-0.5 text-[10px] transition-all",
                classification === "weakness" && "border-rose-600 bg-rose-600 text-white shadow-sm hover:bg-rose-700"
              )}
            >
              <ThumbsDown className="h-2.5 w-2.5" />
              Challenge
            </Button>
          </div>
        </div>

        <p className="text-center text-[9px] text-muted-foreground">
          Click on the floor plan to annotate. Click existing marks to remove them.
        </p>
      </div>
    </div>
  );
}
