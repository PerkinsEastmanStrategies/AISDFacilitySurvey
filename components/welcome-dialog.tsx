"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { MapPin, LayoutGrid } from "lucide-react";

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
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="border-b border-border/60 bg-muted/30 px-6 py-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-border/60">
            <Image
              src="/images/aisd-logo.jpg"
              alt="Austin Independent School District"
              width={72}
              height={72}
              className="h-16 w-auto object-contain"
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
            Facility Planning &amp; Capital Assessment
          </p>
        </div>

        <div className="space-y-4 px-6 py-6">
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

        <div className="border-t border-border/60 bg-muted/20 px-6 py-4">
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
