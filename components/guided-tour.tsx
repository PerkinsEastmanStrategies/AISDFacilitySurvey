"use client";

import { useEffect, useLayoutEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface TourStep {
  /** The data-tour attribute value of the element to highlight. */
  target: string;
  title: string;
  body: string;
  /** Preferred placement of the tooltip relative to the target. */
  placement?: "top" | "bottom" | "left" | "right";
}

interface GuidedTourProps {
  steps: TourStep[];
  /** Whether the tour is currently running. */
  run: boolean;
  onClose: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;
const TOOLTIP_WIDTH = 320;
const TOOLTIP_GAP = 14;

export function GuidedTour({ steps, run, onClose }: GuidedTourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Reset to first step whenever the tour (re)starts.
  useEffect(() => {
    if (run) setIndex(0);
  }, [run]);

  const step = steps[index];

  const measure = useCallback(() => {
    if (!run || !step) return;
    const el = document.querySelector<HTMLElement>(
      `[data-tour="${step.target}"]`
    );
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Measure after the scroll settles.
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    });
  }, [run, step]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (!run) return;
    const handler = () => measure();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    const interval = window.setInterval(measure, 400);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
      window.clearInterval(interval);
    };
  }, [run, measure]);

  // Keyboard navigation
  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, index]);

  if (!run || !mounted || !step) return null;

  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  const goNext = () => {
    if (isLast) {
      onClose();
    } else {
      setIndex((i) => Math.min(i + 1, steps.length - 1));
    }
  };

  const goBack = () => setIndex((i) => Math.max(i - 1, 0));

  // Compute tooltip position from the target rect.
  const placement = step.placement ?? "right";
  let tooltipStyle: React.CSSProperties = {
    width: TOOLTIP_WIDTH,
    maxWidth: "calc(100vw - 24px)",
  };

  if (rect) {
    const spotlight = {
      top: rect.top - PADDING,
      left: rect.left - PADDING,
      width: rect.width + PADDING * 2,
      height: rect.height + PADDING * 2,
    };
    let top = spotlight.top;
    let left = spotlight.left;

    switch (placement) {
      case "right":
        top = spotlight.top;
        left = spotlight.left + spotlight.width + TOOLTIP_GAP;
        break;
      case "left":
        top = spotlight.top;
        left = spotlight.left - TOOLTIP_WIDTH - TOOLTIP_GAP;
        break;
      case "bottom":
        top = spotlight.top + spotlight.height + TOOLTIP_GAP;
        left = spotlight.left;
        break;
      case "top":
        top = spotlight.top - TOOLTIP_GAP;
        left = spotlight.left;
        break;
    }

    // Keep tooltip within the viewport horizontally.
    const maxLeft = window.innerWidth - TOOLTIP_WIDTH - 12;
    left = Math.max(12, Math.min(left, maxLeft));
    // Keep tooltip within the viewport vertically.
    const maxTop = window.innerHeight - 220;
    top = Math.max(12, Math.min(top, maxTop));

    tooltipStyle = { ...tooltipStyle, top, left };
  } else {
    // Center the tooltip when no target is found.
    tooltipStyle = {
      ...tooltipStyle,
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  return createPortal(
    <div className="fixed inset-0 z-[100]" aria-live="polite">
      {/* Dimmed overlay with a transparent spotlight cut-out */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl transition-all duration-300"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.65)",
            outline: "3px solid var(--primary, #2563eb)",
            outlineOffset: "2px",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-900/65" />
      )}

      {/* Click-catcher to advance / dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Tooltip card */}
      <div
        className="absolute rounded-xl border border-border bg-card p-5 shadow-2xl transition-all duration-200"
        style={tooltipStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
          aria-label="Close tour"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-1.5 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {index + 1}
          </span>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Step {index + 1} of {steps.length}
          </span>
        </div>

        <h3 className="font-heading text-base font-semibold text-foreground">
          {step.title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {step.body}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-muted-foreground"
          >
            Skip
          </Button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button variant="outline" size="sm" onClick={goBack}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            )}
            <Button size="sm" onClick={goNext}>
              {isLast ? "Got it" : "Next"}
              {!isLast && <ChevronRight className="ml-1 h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
