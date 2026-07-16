"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { MapPin, LayoutGrid } from "lucide-react";
import { SURVEY_TITLE } from "@/lib/survey-data";

const STORAGE_KEY = "aisd-survey-welcome-seen";

interface WelcomeDialogProps {
  open: boolean;
  onClose: () => void;
}

export function WelcomeDialog({ open, onClose }: WelcomeDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative flex max-h-[min(92dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="shrink-0 border-b border-border/60 bg-muted/30 px-5 py-5 text-center sm:px-6 sm:py-8">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-border/60 sm:mb-4 sm:h-20 sm:w-20">
            <Image
              src="/images/aisd-logo.jpg"
              alt="Austin Independent School District"
              width={72}
              height={72}
              className="h-12 w-auto object-contain sm:h-16"
              priority
            />
          </div>
          <h2
            id="welcome-title"
            className="font-heading text-xl font-semibold text-foreground sm:text-2xl"
          >
            Welcome
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {SURVEY_TITLE}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
          <p className="text-sm leading-relaxed text-foreground">
            Thank you for taking the time to complete this survey. Your
            perspective is an essential part of a{" "}
            <span className="font-medium">districtwide assessment</span> to better
            understand campus conditions and educational suitability across AISD.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            In addition to traditional facility assessments, this survey captures
            the lived experience of your campus — the strengths, challenges, and
            details that only you and your team can share.
          </p>

          <div className="rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/40">
            <p className="text-sm font-semibold text-foreground">
              Best experienced on a computer
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              This survey works on mobile devices, but for full functionality and
              the best experience — especially floor plans, maps, and annotations —
              please complete it on a computer when you can.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="text-sm font-medium text-foreground">
              Mark your campus as you go
            </p>
            <ul className="mt-3 space-y-2.5">
              <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <LayoutGrid className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  Leave comments directly on your{" "}
                  <span className="font-medium text-foreground">floor plan</span>{" "}
                  to highlight specific rooms and interior areas.
                </span>
              </li>
              <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  Use the{" "}
                  <span className="font-medium text-foreground">site map</span>{" "}
                  to call out outdoor spaces, building exteriors, and campus-wide
                  conditions.
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="shrink-0 border-t border-border/60 bg-muted/20 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
          <Button size="lg" className="w-full" onClick={onClose}>
            Get Started
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function hasSeenWelcome(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(STORAGE_KEY) === "1";
}

export function markWelcomeSeen(): void {
  sessionStorage.setItem(STORAGE_KEY, "1");
}
