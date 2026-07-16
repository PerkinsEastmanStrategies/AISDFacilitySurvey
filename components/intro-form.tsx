"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  loadManifestSchoolOptions,
  type ManifestSchoolOption,
} from "@/lib/floor-plan-manifest";
import { SURVEY_TITLE, type SurveyRole } from "@/lib/survey-data";
import { isValidEmail } from "@/lib/submit-survey";
import {
  parsePopupNote,
  type DeferredSurveyNotice,
} from "@/lib/deferred-survey-schools";

interface SchoolInfo {
  school: string;
  role: SurveyRole | "";
  positionTitle: string;
  principalName: string;
  email: string;
  schoolDescription: string;
  uniqueFeatures: string;
  specialEducation: string;
}

interface IntroFormProps {
  data: SchoolInfo;
  onChange: (data: SchoolInfo) => void;
  /** Prefetched from the server (filtered Google Sheet). Avoids client Loading state. */
  initialSchools?: ManifestSchoolOption[];
}

export function IntroForm({
  data,
  onChange,
  initialSchools = [],
}: IntroFormProps) {
  const [manifestSchools, setManifestSchools] = useState<
    ManifestSchoolOption[] | null
  >(initialSchools.length > 0 ? initialSchools : null);
  const [deferredNotice, setDeferredNotice] =
    useState<DeferredSurveyNotice | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    let cancelled = false;

    // If SSR already gave us schools, keep them and only replace if a newer
    // client fetch returns a non-empty list (filtered sheet refresh).
    loadManifestSchoolOptions()
      .then((schools) => {
        if (cancelled || schools.length === 0) return;
        setManifestSchools(schools);
      })
      .catch(() => {
        if (cancelled) return;
        setManifestSchools((prev) => prev ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!manifestSchools || !data.school) return;
    const match = manifestSchools.find((school) => school.name === data.school);
    if (!match || !match.hasFloorPlans) {
      onChange({ ...data, school: "" });
    }
    // Only re-check when manifest availability loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifestSchools]);

  const isOperations = data.role === "operations";
  const isSchoolLeader = data.role === "school_leader";

  const roleLabel =
    data.role === "school_leader"
      ? "School Leader (Principal/AP)"
      : data.role === "operations"
        ? "Operations Staff"
        : null;

  const handleChange = (field: keyof SchoolInfo, value: string) => {
    if (field === "school") {
      const selected = manifestSchools?.find((school) => school.name === value);
      const notice = parsePopupNote(selected?.popupNote);
      if (notice) {
        setDeferredNotice(notice);
        // Blocking notices (future modernization, not yet ready, etc.) cannot
        // stay selected — same behavior as the original Andrews popup.
        if (notice.blocksSurvey) {
          onChange({ ...data, school: "" });
          return;
        }
      }
    }
    onChange({ ...data, [field]: value });
  };

  const emailLooksInvalid =
    data.email.trim().length > 0 && !isValidEmail(data.email);

  const requiredMark = (
    <span className="text-destructive" aria-hidden="true">
      *
    </span>
  );

  const dismissDeferredNotice = () => setDeferredNotice(null);

  return (
    <>
    <Card className="gap-2 border-border/60 py-2.5 shadow-sm">
      <CardHeader className="px-2.5 pb-1.5">
        <CardTitle className="font-heading text-sm font-bold text-foreground">School Information</CardTitle>
        <p className="mt-px text-[11px] text-muted-foreground">
          Please provide details about your school to begin the assessment. Fields
          marked with <span className="text-destructive">*</span> are required.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-2.5">
        <div className="space-y-1" data-tour="school-select">
          <Label htmlFor="school" className="text-[11px] font-semibold text-foreground">
            Select School {requiredMark}
          </Label>
          <Select value={data.school} onValueChange={(v) => handleChange("school", v)}>
            <SelectTrigger id="school" size="sm" className="h-7 w-full text-xs">
              <SelectValue
                placeholder={
                  manifestSchools === null
                    ? "Loading schools..."
                    : "Select a school..."
                }
              >
                {manifestSchools?.find((school) => school.name === data.school)
                  ?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="text-xs">
              {manifestSchools === null ? (
                <SelectItem value="__loading" disabled>
                  Loading school list…
                </SelectItem>
              ) : manifestSchools.length === 0 ? (
                <SelectItem value="__empty" disabled>
                  No schools found in floor plan list
                </SelectItem>
              ) : (
                manifestSchools.map((school) => (
                  <SelectItem
                    key={school.name}
                    value={school.name}
                    disabled={!school.hasFloorPlans}
                    className={
                      school.hasFloorPlans
                        ? undefined
                        : "text-muted-foreground opacity-50"
                    }
                  >
                    {school.label}
                    {!school.hasFloorPlans ? " (no floor plan yet)" : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {manifestSchools && (
            <p className="text-[10px] text-muted-foreground">
              Schools are loaded from the live floor plan list. Schools without
              uploaded floor plans are shown in gray and cannot be selected yet.
            </p>
          )}
        </div>

        <div className="space-y-1" data-tour="role-select">
          <Label htmlFor="role" className="text-[11px] font-semibold text-foreground">
            Your Role {requiredMark}
          </Label>
          <Select value={data.role || null} onValueChange={(v) => handleChange("role", v ?? "")}>
            <SelectTrigger
              id="role"
              size="sm"
              className="h-auto w-full min-h-7 py-1.5 text-xs whitespace-normal [&_[data-slot=select-value]]:line-clamp-none [&_[data-slot=select-value]]:whitespace-normal"
            >
              <SelectValue placeholder="Select your role...">
                {roleLabel}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-[var(--anchor-width)] text-xs">
              <SelectItem value="school_leader">School Leader (Principal/AP)</SelectItem>
              <SelectItem value="operations">Operations Staff</SelectItem>
            </SelectContent>
          </Select>
          {isSchoolLeader && (
            <p className="text-xs text-muted-foreground">
              School Leaders complete Educational Suitability plus seven campus
              condition questions covering the same key facility categories as
              the Operations survey.
            </p>
          )}
          {isOperations && (
            <p className="text-xs text-muted-foreground">
              Operations Staff complete only the detailed Facility Condition
              Assessment questions.
            </p>
          )}
        </div>

        <div className="space-y-1" data-tour="position-title">
          <Label
            htmlFor="positionTitle"
            className="text-[11px] font-semibold text-foreground"
          >
            Position Title {requiredMark}
          </Label>
          <Input
            id="positionTitle"
            value={data.positionTitle}
            onChange={(e) => handleChange("positionTitle", e.target.value)}
            disabled={!data.role}
            placeholder={
              !data.role
                ? "Select a role first..."
                : isOperations
                  ? "e.g. Facility Manager, Custodial Supervisor"
                  : "e.g. Principal, Assistant Principal"
            }
            className="h-7 text-xs md:text-xs"
          />
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="principalName" className="text-[11px] font-semibold text-foreground">
              Name {requiredMark}
            </Label>
            <Input
              id="principalName"
              value={data.principalName}
              onChange={(e) => handleChange("principalName", e.target.value)}
              placeholder="Enter your name"
              className="h-7 text-xs md:text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email" className="text-[11px] font-semibold text-foreground">
              Email Address {requiredMark}
            </Label>
            <Input
              id="email"
              type="email"
              value={data.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="name@example.com"
              aria-invalid={emailLooksInvalid}
              className="h-7 text-xs md:text-xs"
            />
            {emailLooksInvalid && (
              <p className="text-[10px] text-destructive">
                Enter a valid email address (for example, name@austinisd.org).
              </p>
            )}
          </div>
        </div>

        {isSchoolLeader && (
          <>
            <div className="space-y-1">
              <Label htmlFor="schoolDescription" className="text-xs font-semibold leading-snug text-foreground">
                In two or three sentences, what makes your school special and
                unique? Consider your school&apos;s culture, sense of place, or
                what students and staff connect with most.{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="schoolDescription"
                value={data.schoolDescription}
                onChange={(e) => handleChange("schoolDescription", e.target.value)}
                placeholder="Describe your school..."
                rows={2}
                className="text-xs md:text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="uniqueFeatures" className="text-xs font-semibold leading-snug text-foreground">
                Does your school have any specialty programs or pathways (e.g.,
                STEM, arts, music, dual language)? If so, please describe.{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="uniqueFeatures"
                value={data.uniqueFeatures}
                onChange={(e) => handleChange("uniqueFeatures", e.target.value)}
                placeholder="Describe any specialty programs or pathways..."
                rows={2}
                className="text-xs md:text-xs"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>

    {portalReady &&
      deferredNotice &&
      createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center p-3 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deferred-survey-title"
        >
          <div
            className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
            onClick={dismissDeferredNotice}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="space-y-3 px-5 py-5 sm:px-6 sm:py-6">
              {deferredNotice.blocksSurvey && (
                <p className="text-sm font-medium text-foreground">
                  Thank you for your interest in the {SURVEY_TITLE}.
                </p>
              )}
              <h2
                id="deferred-survey-title"
                className="font-heading text-lg font-bold underline decoration-2 underline-offset-4 text-foreground"
              >
                {deferredNotice.title}
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Note:</span>{" "}
                {deferredNotice.note}
              </p>
            </div>
            <div className="border-t border-border/60 bg-muted/20 px-5 py-3 sm:px-6 sm:py-4">
              <Button className="w-full" onClick={dismissDeferredNotice}>
                Got it!
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
