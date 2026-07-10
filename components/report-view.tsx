"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FloorPlanViewer } from "./floor-plan-viewer";
import { MapViewer } from "./map-viewer";
import { SURVEY_QUESTIONS, PRIORITIZATION_CATEGORIES, DONT_KNOW_RATING, isRatingScored, formatRatingDisplay, type SurveyData } from "@/lib/survey-data";
import type { SurveySubmissionPayload } from "@/lib/submit-survey";
import { clearSurveyDraft } from "@/lib/survey-draft";
import { getSchoolByName } from "@/lib/schools-data";
import { getSpaceColor } from "@/lib/spaces-data";
import {
  fetchFloorPlanSvgByFilename,
  getAvailableFloors,
  prefetchFloorPlanSvgs,
  type FloorPlanLevel,
} from "@/lib/floor-plans";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  FileText,
  MapPin,
  Map as MapIcon,
  Building2,
  User,
  Mail,
  Star,
  Send,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface ReportViewProps {
  data: SurveyData;
  readOnly?: boolean;
  submissionMeta?: {
    id: string;
    submittedAt: string;
    respondentName: string;
    email: string;
  };
}

export function ReportView({
  data,
  readOnly = false,
  submissionMeta,
}: ReportViewProps) {
  const [filterQuestion, setFilterQuestion] = useState<string>("all");
  const [filterClassification, setFilterClassification] = useState<string>("all");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [availableFloors, setAvailableFloors] = useState<FloorPlanLevel[]>([]);
  const [activeFloorId, setActiveFloorId] = useState("floor-1");
  const [reportSvgContent, setReportSvgContent] = useState(data.svgContent);
  const [floorPlanLoading, setFloorPlanLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadReportFloorPlan() {
      if (!data.school) {
        setAvailableFloors([]);
        setReportSvgContent(data.svgContent);
        return;
      }

      const floors = await getAvailableFloors(data.school);
      if (cancelled) return;

      setAvailableFloors(floors);
      const initialFloor = floors[0];
      setActiveFloorId(initialFloor?.id ?? "floor-1");
      setFloorPlanLoading(true);

      if (initialFloor) {
        const svg = await fetchFloorPlanSvgByFilename(
          initialFloor.filename,
          data.svgContent
        );
        if (!cancelled) setReportSvgContent(svg);
        prefetchFloorPlanSvgs(
          floors.slice(1).map((floor) => floor.filename).filter(Boolean)
        );
      } else if (!cancelled) {
        setReportSvgContent(data.svgContent);
      }

      if (!cancelled) setFloorPlanLoading(false);
    }

    loadReportFloorPlan();
    return () => {
      cancelled = true;
    };
  }, [data.school, data.svgContent]);

  const handleFloorChange = useCallback(
    async (floorId: string) => {
      const floor = availableFloors.find((entry) => entry.id === floorId);
      if (!floor) return;
      setActiveFloorId(floorId);
      setFloorPlanLoading(true);
      const svg = await fetchFloorPlanSvgByFilename(floor.filename, data.svgContent);
      setReportSvgContent(svg);
      setFloorPlanLoading(false);
    },
    [availableFloors, data.svgContent]
  );

  const completedResponses = data.responses.filter((r) => isRatingScored(r.rating));
  const averageScore =
    completedResponses.length > 0
      ? completedResponses.reduce((sum, r) => sum + r.rating, 0) / completedResponses.length
      : 0;

  const strongestAreas = [...completedResponses]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3);

  const weakestAreas = [...completedResponses]
    .sort((a, b) => a.rating - b.rating)
    .slice(0, 3);

  const strengthAnnotations = data.annotations.filter(
    (a) => a.classification === "strength"
  );
  const weaknessAnnotations = data.annotations.filter(
    (a) => a.classification === "weakness"
  );

  const mapAnnotations = data.annotations.filter((a) => a.view === "map");
  const selectedSchool = getSchoolByName(data.school);

  const reportSpaceLabels = Object.entries(data.spaceAssignments || {}).flatMap(
    ([label, entries]) =>
      (entries || []).map((entry) => ({
        label,
        roomKey: entry.roomKey,
        x: entry.x,
        y: entry.y,
        color: getSpaceColor(label),
      }))
  );

  const getRatingColor = (rating: number) => {
    if (rating >= 4.5) return "text-green-600";
    if (rating >= 3.5) return "text-lime-600";
    if (rating >= 2.5) return "text-yellow-600";
    if (rating >= 1.5) return "text-orange-600";
    return "text-red-600";
  };

  const getRatingBg = (rating: number) => {
    if (rating === DONT_KNOW_RATING) return "bg-muted text-muted-foreground";
    if (rating >= 4) return "bg-green-100 text-green-800";
    if (rating >= 3) return "bg-yellow-100 text-yellow-800";
    if (rating >= 2) return "bg-orange-100 text-orange-800";
    return "bg-red-100 text-red-800";
  };

  const handleSubmitSurvey = async () => {
    if (isSubmitting || submissionId) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const { svgContent: _svgContent, ...payload } = data;
    const body: SurveySubmissionPayload = payload;

    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result = (await response.json()) as {
        submissionId?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to submit survey.");
      }

      if (!result.submissionId) {
        throw new Error("Submission saved but no confirmation id was returned.");
      }

      setSubmissionId(result.submissionId);
      setSubmitted(true);
      clearSurveyDraft();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to submit survey."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitDisabled = isSubmitting || Boolean(submissionId);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl p-6">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Building2 className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold text-foreground">
                Educational Suitability Assessment Report
              </h1>
            </div>
            <p className="text-muted-foreground">
              Comprehensive facility evaluation for {data.school || "School"}
              {readOnly && submissionMeta
                ? ` · Submitted ${new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(submissionMeta.submittedAt))}`
                : ""}
            </p>
          </div>
          {!readOnly && (
          <Button
            data-tour="submit-survey"
            size="lg"
            onClick={handleSubmitSurvey}
            disabled={submitDisabled}
            className="gap-2 px-8 py-6 text-base font-semibold shadow-lg shadow-primary/20"
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
            {submissionId ? "Submitted" : isSubmitting ? "Submitting…" : "Submit Survey"}
          </Button>
          )}
        </div>

        <Tabs defaultValue="summary" className="space-y-6">
          <TabsList data-tour="report-tabs" className="inline-flex h-10 w-auto items-center justify-start rounded-lg bg-muted p-1">
            <TabsTrigger value="summary" className="whitespace-nowrap">Executive Summary</TabsTrigger>
            <TabsTrigger value="ratings" className="whitespace-nowrap">Detailed Ratings</TabsTrigger>
            <TabsTrigger value="annotations" className="whitespace-nowrap">Floor Plan</TabsTrigger>
            <TabsTrigger value="sitemap" className="whitespace-nowrap">Site Map</TabsTrigger>
            <TabsTrigger value="info" className="whitespace-nowrap">School Info</TabsTrigger>
          </TabsList>

          {/* Executive Summary */}
          <TabsContent value="summary" className="space-y-6">
            {/* Score Overview */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="border-border">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="rounded-full bg-primary/10 p-3">
                      <Star className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Overall Score</p>
                      <p className={`text-3xl font-bold ${getRatingColor(averageScore)}`}>
                        {averageScore.toFixed(1)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="rounded-full bg-green-100 p-3">
                      <TrendingUp className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Strengths Noted</p>
                      <p className="text-3xl font-bold text-green-600">
                        {strengthAnnotations.length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="rounded-full bg-orange-100 p-3">
                      <TrendingDown className="h-6 w-6 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Challenges Noted</p>
                      <p className="text-3xl font-bold text-orange-600">
                        {weaknessAnnotations.length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="rounded-full bg-blue-100 p-3">
                      <MapPin className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Annotations</p>
                      <p className="text-3xl font-bold text-blue-600">
                        {data.annotations.length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Strongest and Weakest Areas */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    Strongest Areas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {strongestAreas.map((response) => {
                    const question = SURVEY_QUESTIONS.find(
                      (q) => q.id === response.questionId
                    );
                    return (
                      <div
                        key={response.questionId}
                        className="flex items-start justify-between gap-4 rounded-lg bg-green-50 p-3"
                      >
                        <div className="flex-1">
                          <Badge
                            style={{ backgroundColor: question?.color }}
                            className="mb-1 text-white"
                          >
                            {question?.category}
                            {question && "area" in question && question.area
                              ? ` · ${question.area}`
                              : ""}
                          </Badge>
                          <p className="text-sm text-foreground line-clamp-2">
                            {question?.text}
                          </p>
                        </div>
                        <span className="text-2xl font-bold text-green-600">
                          {response.rating}
                        </span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <TrendingDown className="h-5 w-5 text-orange-600" />
                    Areas for Improvement
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {weakestAreas.map((response) => {
                    const question = SURVEY_QUESTIONS.find(
                      (q) => q.id === response.questionId
                    );
                    return (
                      <div
                        key={response.questionId}
                        className="flex items-start justify-between gap-4 rounded-lg bg-orange-50 p-3"
                      >
                        <div className="flex-1">
                          <Badge
                            style={{ backgroundColor: question?.color }}
                            className="mb-1 text-white"
                          >
                            {question?.category}
                            {question && "area" in question && question.area
                              ? ` · ${question.area}`
                              : ""}
                          </Badge>
                          <p className="text-sm text-foreground line-clamp-2">
                            {question?.text}
                          </p>
                        </div>
                        <span className="text-2xl font-bold text-orange-600">
                          {response.rating}
                        </span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            {/* Recurring Themes */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <FileText className="h-5 w-5 text-primary" />
                  Key Facility Themes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="mb-2 font-medium text-green-700">Facility Strengths</h4>
                    <ScrollArea className="h-40">
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        {strengthAnnotations.slice(0, 5).map((annotation) => (
                          <li key={annotation.id} className="flex items-start gap-2">
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-green-500" />
                            <span>
                              {annotation.roomKey && (
                                <span className="font-semibold text-foreground">
                                  Room {annotation.roomKey}:{" "}
                                </span>
                              )}
                              {annotation.comment || "No comment provided"}
                            </span>
                          </li>
                        ))}
                        {strengthAnnotations.length === 0 && (
                          <li className="italic">No strength annotations recorded</li>
                        )}
                      </ul>
                    </ScrollArea>
                  </div>
                  <div>
                    <h4 className="mb-2 font-medium text-orange-700">Facility Challenges</h4>
                    <ScrollArea className="h-40">
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        {weaknessAnnotations.slice(0, 5).map((annotation) => (
                          <li key={annotation.id} className="flex items-start gap-2">
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                            <span>
                              {annotation.roomKey && (
                                <span className="font-semibold text-foreground">
                                  Room {annotation.roomKey}:{" "}
                                </span>
                              )}
                              {annotation.comment || "No comment provided"}
                            </span>
                          </li>
                        ))}
                        {weaknessAnnotations.length === 0 && (
                          <li className="italic">No challenge annotations recorded</li>
                        )}
                      </ul>
                    </ScrollArea>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Detailed Ratings */}
          <TabsContent value="ratings" className="space-y-4">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  All Survey Responses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {Array.from(
                    new Set(SURVEY_QUESTIONS.map((q) => q.section))
                  ).map((section) => (
                    <div key={section} className="space-y-4">
                      <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {section}
                      </h3>
                      {SURVEY_QUESTIONS.filter((q) => q.section === section).map(
                        (question) => {
                          const response = data.responses.find(
                            (r) => r.questionId === question.id
                          );

                          if (question.type === "spaces") {
                            const assignments = Object.entries(
                              data.spaceAssignments || {}
                            ).filter(([, entries]) => entries.length > 0);
                            return (
                              <div key={question.id} className="rounded-lg border border-border p-4">
                                <div className="mb-3 flex items-center gap-2">
                                  <Badge
                                    style={{ backgroundColor: question.color }}
                                    className="text-white"
                                  >
                                    Q{question.id}
                                  </Badge>
                                  <Badge variant="outline">{question.category}</Badge>
                                </div>
                                <p className="mb-3 text-sm text-foreground">{question.text}</p>
                                {assignments.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    No program spaces were assigned to rooms.
                                  </p>
                                ) : (
                                  <ul className="space-y-2">
                                    {assignments.map(([space, entries]) => (
                                      <li
                                        key={space}
                                        className="rounded-md bg-muted/50 px-3 py-2"
                                      >
                                        <p className="text-sm font-medium text-foreground">
                                          {space}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          {entries
                                            .map((e) => e.roomLabel || e.roomKey)
                                            .join(", ")}
                                        </p>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          }

                          if (question.type === "ranking") {
                            const selected = response?.ranking ?? [];
                            return (
                              <div key={question.id} className="rounded-lg border border-border p-4">
                                <div className="mb-3 flex items-center gap-2">
                                  <Badge
                                    style={{ backgroundColor: question.color }}
                                    className="text-white"
                                  >
                                    Q{question.id}
                                  </Badge>
                                  <Badge variant="outline">{question.category}</Badge>
                                </div>
                                <p className="mb-3 text-sm text-foreground">{question.text}</p>
                                <p className="mb-2 text-sm font-medium text-muted-foreground">
                                  Selected priorities (up to 5):
                                </p>
                                {selected.length === 0 ? (
                                  <p className="text-sm italic text-muted-foreground">
                                    No priorities selected
                                  </p>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {selected.map((category) => (
                                      <li
                                        key={category}
                                        className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2"
                                      >
                                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                                        <span className="text-sm text-foreground">{category}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          }

                          if (question.type === "text") {
                            return (
                              <div key={question.id} className="rounded-lg border border-border p-4">
                                <div className="mb-3 flex items-center gap-2">
                                  <Badge
                                    style={{ backgroundColor: question.color }}
                                    className="text-white"
                                  >
                                    Q{question.id}
                                  </Badge>
                                  <Badge variant="outline">{question.category}</Badge>
                                </div>
                                <p className="mb-3 text-sm text-foreground">{question.text}</p>
                                {response?.explanation ? (
                                  <div className="rounded-md bg-muted/50 p-3">
                                    <p className="text-sm text-foreground whitespace-pre-wrap">
                                      {response.explanation}
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-sm italic text-muted-foreground">
                                    No response provided
                                  </p>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div key={question.id} className="rounded-lg border border-border p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <Badge
                                      style={{ backgroundColor: question.color }}
                                      className="text-white"
                                    >
                                      {question.category}
                                    </Badge>
                                    {"area" in question && question.area && (
                                      <Badge variant="outline">{question.area}</Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-foreground">{question.text}</p>
                                </div>
                                <div
                                  className={`rounded-lg px-4 py-2 text-center min-w-[5rem] ${getRatingBg(
                                    response?.rating || 0
                                  )}`}
                                >
                                  {response?.rating === DONT_KNOW_RATING ? (
                                    <span className="text-sm font-semibold leading-tight">
                                      I don&apos;t know
                                    </span>
                                  ) : isRatingScored(response?.rating ?? 0) ? (
                                    <>
                                      <span className="text-2xl font-bold">
                                        {response?.rating}
                                      </span>
                                      <span className="text-sm">/5</span>
                                    </>
                                  ) : (
                                    <span className="text-2xl font-bold">-</span>
                                  )}
                                </div>
                              </div>
                              {response?.explanation && (
                                <>
                                  <Separator className="my-3" />
                                  <div className="rounded-md bg-muted/50 p-3">
                                    <p className="text-sm font-medium text-muted-foreground mb-1">
                                      Explanation:
                                    </p>
                                    <p className="text-sm text-foreground">{response.explanation}</p>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        }
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Floor Plan Annotations */}
          <TabsContent value="annotations" className="space-y-4">
            <Card className="border-border">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <MapPin className="h-5 w-5 text-primary" />
                      Floor Plan Annotations
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Click on any annotation to view its comment
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Select value={filterQuestion} onValueChange={setFilterQuestion}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Filter by question" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Questions</SelectItem>
                {SURVEY_QUESTIONS.map((q) => (
                  <SelectItem key={q.id} value={q.id.toString()}>
                    {"area" in q && q.area ? `${q.category}: ${q.area}` : q.category}
                  </SelectItem>
                ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={filterClassification}
                      onValueChange={setFilterClassification}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Filter type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="strength">Strengths</SelectItem>
                        <SelectItem value="weakness">Challenges</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[600px]">
                  <FloorPlanViewer
                    svgContent={reportSvgContent}
                    annotations={data.annotations}
                    currentQuestionId={1}
                    currentColor="hsl(220, 70%, 50%)"
                    tool="pan"
                    classification="strength"
                    onAddAnnotation={() => {}}
                    onRemoveAnnotation={() => {}}
                    onToolChange={() => {}}
                    filterQuestionId={
                      filterQuestion === "all" ? null : parseInt(filterQuestion)
                    }
                    filterClassification={
                      filterClassification === "all"
                        ? null
                        : (filterClassification as "strength" | "weakness")
                    }
                    annotationsEnabled={false}
                    readOnly={true}
                    spaceLabels={reportSpaceLabels}
                    buildingName={data.school || undefined}
                    availableFloors={availableFloors}
                    activeFloorId={activeFloorId}
                    onFloorChange={handleFloorChange}
                    isLoading={floorPlanLoading}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Site Map Annotations */}
          <TabsContent value="sitemap" className="space-y-4">
            <Card className="border-border">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <MapIcon className="h-5 w-5 text-primary" />
                      Site Map Annotations
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Click any pin or area on the map to view its comment
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[600px]">
                  <MapViewer
                    annotations={data.annotations}
                    currentQuestionId={1}
                    tool="pan"
                    classification="strength"
                    onAddAnnotation={() => {}}
                    onRemoveAnnotation={() => {}}
                    annotationsEnabled={false}
                    readOnly={true}
                    focusLocation={selectedSchool?.coordinates ?? null}
                    focusLabel={selectedSchool?.buildingName ?? null}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Printable list of map comments */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <FileText className="h-5 w-5 text-primary" />
                  Map Comments ({mapAnnotations.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {mapAnnotations.length === 0 ? (
                  <p className="text-sm italic text-muted-foreground">
                    No site map annotations recorded
                  </p>
                ) : (
                  <div className="space-y-3">
                    {mapAnnotations.map((annotation) => {
                      const question = SURVEY_QUESTIONS.find(
                        (q) => q.id === annotation.questionId
                      );
                      const isStrength = annotation.classification === "strength";
                      return (
                        <div
                          key={annotation.id}
                          className={`flex items-start gap-3 rounded-lg border p-3 ${
                            isStrength
                              ? "border-green-200 bg-green-50"
                              : "border-orange-200 bg-orange-50"
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                              isStrength ? "bg-green-600" : "bg-orange-600"
                            }`}
                          >
                            {annotation.questionId}
                          </span>
                          <div className="flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              {question && (
                                <Badge
                                  style={{ backgroundColor: question.color }}
                                  className="text-white"
                                >
                                  {question.category}
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className={
                                  isStrength ? "text-green-700" : "text-orange-700"
                                }
                              >
                                {isStrength ? "Strength" : "Area of Concern"}
                              </Badge>
                              <Badge variant="outline" className="capitalize">
                                {annotation.type}
                              </Badge>
                            </div>
                            <p className="text-sm text-foreground">
                              {annotation.comment || (
                                <span className="italic text-muted-foreground">
                                  No comment provided
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* School Info */}
          <TabsContent value="info" className="space-y-4">            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Building2 className="h-5 w-5 text-primary" />
                  School Profile
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg bg-muted/50 p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Building2 className="h-4 w-4" />
                      <span className="text-sm font-medium">School</span>
                    </div>
                    <p className="text-foreground">{data.school || "Not specified"}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <User className="h-4 w-4" />
                      <span className="text-sm font-medium">Principal</span>
                    </div>
                    <p className="text-foreground">{data.principalName || "Not specified"}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4 md:col-span-2">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Mail className="h-4 w-4" />
                      <span className="text-sm font-medium">Email</span>
                    </div>
                    <p className="text-foreground">{data.email || "Not specified"}</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">What Makes This School Special &amp; Unique</h4>
                    <p className="text-sm text-muted-foreground">
                      {data.schoolDescription || "No description provided"}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Specialty Programs or Pathways</h4>
                    <p className="text-sm text-muted-foreground">
                      {data.uniqueFeatures || "Not specified"}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-2">
                      Community Partners on Campus
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {data.specialEducation || "Not specified"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {!readOnly && (
        <div className="mt-10 rounded-2xl border-2 border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="text-2xl font-bold text-foreground">
            Ready to submit your assessment?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            Review your responses above, then submit when you&apos;re finished.
            Your evaluation for {data.school || "this school"} will be recorded.
          </p>
          {submitError && (
            <p className="mx-auto mt-4 max-w-xl rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {submitError}
            </p>
          )}
          <Button
            size="lg"
            onClick={handleSubmitSurvey}
            disabled={submitDisabled}
            className="mt-6 gap-2 px-10 py-6 text-lg font-semibold shadow-lg shadow-primary/20"
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
            {submissionId ? "Submitted" : isSubmitting ? "Submitting…" : "Submit Survey"}
          </Button>
        </div>
        )}
      </div>

      {/* Submission confirmation popup */}
      {!readOnly && submitted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-foreground">
              Thanks for your response!
            </h3>
            <p className="mb-2 text-sm text-muted-foreground">
              Your assessment for {data.school || "this school"} has been saved.
            </p>
            {submissionId && (
              <p className="mb-6 font-mono text-xs text-muted-foreground">
                Reference: {submissionId}
              </p>
            )}
            {!submissionId && <div className="mb-6" />}
            <Button className="w-full" onClick={() => setSubmitted(false)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
