"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import type { SurveyRole } from "@/lib/survey-data";

interface SchoolInfo {
  school: string;
  role: SurveyRole | "";
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

  const handleChange = (field: keyof SchoolInfo, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const isOperations = data.role === "operations";

  return (
    <Card className="gap-2 border-border/60 py-2.5 shadow-sm">
      <CardHeader className="px-2.5 pb-1.5">
        <CardTitle className="font-heading text-sm font-bold text-foreground">School Information</CardTitle>
        <p className="mt-px text-[11px] text-muted-foreground">
          Please provide details about your school to begin the assessment
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-2.5">
        <div className="space-y-1" data-tour="school-select">
          <Label htmlFor="school" className="text-[11px] font-semibold text-foreground">Select School</Label>
          <Select value={data.school} onValueChange={(v) => handleChange("school", v)}>
            <SelectTrigger id="school" size="sm" className="h-7 w-full text-xs">
              <SelectValue
                placeholder={
                  manifestSchools === null
                    ? "Loading schools..."
                    : "Select a school..."
                }
              />
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
                    {school.name}
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
          <Label htmlFor="role" className="text-[11px] font-semibold text-foreground">Your Role</Label>
          <Select value={data.role} onValueChange={(v) => handleChange("role", v)}>
            <SelectTrigger
              id="role"
              size="sm"
              className="h-auto w-full min-h-7 py-1.5 text-xs whitespace-normal [&_[data-slot=select-value]]:line-clamp-none [&_[data-slot=select-value]]:whitespace-normal"
            >
              <SelectValue placeholder="Select your role..." />
            </SelectTrigger>
            <SelectContent className="min-w-[var(--anchor-width)] text-xs">
              <SelectItem value="school_leader">School Leader (Principal/AP)</SelectItem>
              <SelectItem value="operations">Operations Staff</SelectItem>
            </SelectContent>
          </Select>
          {data.role === "school_leader" && (
            <p className="text-xs text-muted-foreground">
              School Leaders complete Educational Suitability plus six campus
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

        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="principalName" className="text-[11px] font-semibold text-foreground">Name</Label>
            <Input
              id="principalName"
              value={data.principalName}
              onChange={(e) => handleChange("principalName", e.target.value)}
              placeholder="Enter your name"
              className="h-7 text-xs md:text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email" className="text-[11px] font-semibold text-foreground">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={data.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="Enter email address"
              className="h-7 text-xs md:text-xs"
            />
          </div>
        </div>

        {!isOperations && (
          <>
            <div className="space-y-1">
              <Label htmlFor="schoolDescription" className="text-xs font-semibold leading-snug text-foreground">
                In two or three sentences, what makes your school special and
                unique? Consider your school&apos;s culture, sense of place, or
                what students and staff connect with most.
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
                STEM, arts, music, dual language)? If so, please describe.
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

            <div className="space-y-1">
              <Label htmlFor="specialEducation" className="text-xs font-semibold leading-snug text-foreground">
                Does your school have any community partners that occupy space on
                campus? If so, please describe.
              </Label>
              <Textarea
                id="specialEducation"
                value={data.specialEducation}
                onChange={(e) => handleChange("specialEducation", e.target.value)}
                placeholder="Describe any community partners on campus..."
                rows={2}
                className="text-xs md:text-xs"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
