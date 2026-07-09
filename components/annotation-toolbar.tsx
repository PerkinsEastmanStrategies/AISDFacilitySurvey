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
}

export function AnnotationToolbar({
  tool,
  classification,
  currentColor,
  onToolChange,
  onClassificationChange,
  disabled = false,
}: AnnotationToolbarProps) {
  return (
    <div className={cn(
      "rounded-xl border border-border/60 bg-gradient-to-br from-muted/50 to-muted/30 p-4",
      disabled && "opacity-50 pointer-events-none"
    )}>
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground mb-1">
            Mark Locations on Floor Plan
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Identify specific areas that are positive strengths or areas of concern related to this question.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Annotation Tool
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant={tool === "pin" ? "default" : "outline"}
              size="sm"
              onClick={() => onToolChange("pin")}
              title="Drop Pin"
              className={cn(
                "h-9 gap-1.5 flex-1",
                tool === "pin" && "shadow-md"
              )}
              style={tool === "pin" ? { backgroundColor: currentColor } : undefined}
            >
              <MapPin className="h-4 w-4" />
              <span className="hidden lg:inline">Pin</span>
            </Button>
            <Button
              variant={tool === "circle" ? "default" : "outline"}
              size="sm"
              onClick={() => onToolChange("circle")}
              title="Draw Circle"
              className={cn(
                "h-9 gap-1.5 flex-1",
                tool === "circle" && "shadow-md"
              )}
              style={tool === "circle" ? { backgroundColor: currentColor } : undefined}
            >
              <Circle className="h-4 w-4" />
              <span className="hidden lg:inline">Circle</span>
            </Button>
            <Button
              variant={tool === "freeform" ? "default" : "outline"}
              size="sm"
              onClick={() => onToolChange("freeform")}
              title="Freeform"
              className={cn(
                "h-9 gap-1.5 flex-1",
                tool === "freeform" && "shadow-md"
              )}
              style={tool === "freeform" ? { backgroundColor: currentColor } : undefined}
            >
              <Pencil className="h-4 w-4" />
              <span className="hidden lg:inline">Draw</span>
            </Button>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Classification
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant={classification === "strength" ? "default" : "outline"}
              size="sm"
              onClick={() => onClassificationChange("strength")}
              className={cn(
                "h-9 gap-1.5 flex-1 transition-all",
                classification === "strength" && "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-md"
              )}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              Strength
            </Button>
            <Button
              variant={classification === "weakness" ? "default" : "outline"}
              size="sm"
              onClick={() => onClassificationChange("weakness")}
              className={cn(
                "h-9 gap-1.5 flex-1 transition-all",
                classification === "weakness" && "bg-rose-600 hover:bg-rose-700 text-white border-rose-600 shadow-md"
              )}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              Challenge
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center pt-1">
          Click on the floor plan to annotate. Click existing marks to remove them.
        </p>
      </div>
    </div>
  );
}
