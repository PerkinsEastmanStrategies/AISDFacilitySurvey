"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IntroForm } from "@/components/intro-form";
import { QuestionForm } from "@/components/question-form";
import { FloorPlanViewer } from "@/components/floor-plan-viewer";
import { MapViewer } from "@/components/map-viewer";
import { ReportView } from "@/components/report-view";
import { SpaceAssignmentForm } from "@/components/space-assignment-form";
import { getSchoolByName } from "@/lib/schools-data";
import { fetchFloorPlanSvgByFilename, getAvailableFloors, prefetchFloorPlanSvgs, type FloorPlanLevel } from "@/lib/floor-plans";
import { extractRoomsFromSvg, getSpaceColor, type RoomInfo } from "@/lib/spaces-data";
import {
  SURVEY_QUESTIONS,
  getQuestionsForRole,
  FCA_LIKERT_SCALE_NOTE,
  isRatingAnswered,
  SCHOOL_LEADER_FCA_QUESTION_IDS,
  type SurveyData,
  type QuestionResponse,
  type Annotation,
  type SpaceRoomEntry,
} from "@/lib/survey-data";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  ClipboardList,
  Map as MapIcon,
  LayoutGrid,
  HelpCircle,
  Filter,
} from "lucide-react";
import { AnnotationToolbar, type Tool, type Classification } from "@/components/annotation-toolbar";
import { GuidedTour } from "@/components/guided-tour";
import {
  INTRO_TOUR_STEPS,
  REPORT_TOUR_STEPS,
  getQuestionTourSteps,
} from "@/lib/guided-tour-steps";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  WelcomeDialog,
  hasSeenWelcome,
  markWelcomeSeen,
} from "@/components/welcome-dialog";
import Image from "next/image";

type Step = "intro" | "questions" | "report";
type RightView = "floorplan" | "map";
type AnnotationFilterMode = "current" | "all";

type ActiveQuestion = ReturnType<typeof getQuestionsForRole>[number];

/**
 * A single step in the survey. Educational Suitability questions are shown one
 * per panel ("question"); Facility Condition questions are grouped by category
 * so an entire category is rated within one panel ("category").
 */
type Panel = {
  kind: "question" | "category";
  section: string;
  label: string;
  color: string;
  questions: ActiveQuestion[];
};

function SurveyCredit() {
  return (
    <p className="border-t border-border/60 pt-2.5 text-[10px] leading-snug text-muted-foreground">
      This survey tool was developed by{" "}
      <span className="font-medium text-foreground">Perkins Eastman</span>. Survey
      content was developed in collaboration with{" "}
      <span className="font-medium text-foreground">AISD</span>,{" "}
      <span className="font-medium text-foreground">AECOM</span>, and{" "}
      <span className="font-medium text-foreground">Cushing Terrell</span>.
    </p>
  );
}

export default function SurveyApp({ defaultSvg }: { defaultSvg: string }) {
  const [step, setStep] = useState<Step>("intro");
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0);
  const [annotationTool, setAnnotationTool] = useState<Tool>("pan");
  const [annotationClassification, setAnnotationClassification] = useState<Classification>("strength");
  const [rightView, setRightView] = useState<RightView>("map");
  const [annotationFilterMode, setAnnotationFilterMode] =
    useState<AnnotationFilterMode>("current");
  const [activeSpace, setActiveSpace] = useState<string | null>(null);
  const [availableFloors, setAvailableFloors] = useState<FloorPlanLevel[]>([]);
  const [activeFloorId, setActiveFloorId] = useState<string>("floor-1");
  const [floorPlanLoading, setFloorPlanLoading] = useState(false);
  const [runTour, setRunTour] = useState(false);
  const [tourIntroSeen, setTourIntroSeen] = useState(false);
  const [tourQuestionsSeen, setTourQuestionsSeen] = useState(false);
  const [tourReportSeen, setTourReportSeen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const isMobile = useIsMobile();
  const [surveyData, setSurveyData] = useState<SurveyData>({
    school: "",
    role: "",
    principalName: "",
    email: "",
    schoolDescription: "",
    uniqueFeatures: "",
    specialEducation: "",
    responses: SURVEY_QUESTIONS.map((q) => ({
      questionId: q.id,
      rating: 0,
      explanation: "",
    })),
    annotations: [],
    svgContent: defaultSvg,
    spaceAssignments: {},
  });

  // The set of questions the current respondent answers, based on their role.
  const activeQuestions = useMemo(
    () => getQuestionsForRole(surveyData.role),
    [surveyData.role]
  );

  // Group the active questions into "panels". Educational Suitability and
  // School Leader campus-condition questions are each their own panel (one
  // question per step). Operations Facility Condition questions are grouped
  // by category so an entire category is rated within one panel.
  const panels = useMemo<Panel[]>(() => {
    const result: Panel[] = [];
    let i = 0;
    while (i < activeQuestions.length) {
      const q = activeQuestions[i];
      const isPrincipalFca = SCHOOL_LEADER_FCA_QUESTION_IDS.has(q.id);

      if (q.section === "Facility Condition" && !isPrincipalFca) {
        // Operations FCA: gather consecutive questions sharing this category.
        const category = q.category;
        const group = [];
        while (
          i < activeQuestions.length &&
          activeQuestions[i].section === "Facility Condition" &&
          !SCHOOL_LEADER_FCA_QUESTION_IDS.has(activeQuestions[i].id) &&
          activeQuestions[i].category === category
        ) {
          group.push(activeQuestions[i]);
          i += 1;
        }
        result.push({
          kind: "category",
          section: q.section,
          label: category,
          color: q.color,
          questions: group,
        });
      } else {
        const areaLabel =
          "area" in q && typeof q.area === "string" ? q.area : undefined;
        result.push({
          kind: "question",
          section: q.section,
          label: areaLabel || q.category,
          color: q.color,
          questions: [q],
        });
        i += 1;
      }
    }
    return result;
  }, [activeQuestions]);

  const currentPanel = panels[currentPanelIndex];

  // The navigation is an accordion: only the section that contains the active
  // panel is expanded, so e.g. the Facility Condition categories stay hidden
  // while working through Educational Suitability.
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  useEffect(() => {
    if (currentPanel?.section) {
      setExpandedSection(currentPanel.section);
    }
  }, [currentPanel?.section]);

  // Representative question for the right-hand annotation surface.
  const currentQuestion = currentPanel?.questions[0];
  const currentResponse = surveyData.responses.find(
    (r) => r.questionId === currentQuestion?.id
  )!;

  // Whether we're on the dedicated "program space locations" question (Q14).
  const isSpacesQuestion = currentQuestion?.type === "spaces";
  const isRankingPanel = currentQuestion?.type === "ranking";
  const isTextPanel = currentQuestion?.type === "text";
  // All question ids belonging to the current panel (used to tally annotations).
  const panelQuestionIds = useMemo<number[]>(
    () => (currentPanel ? currentPanel.questions.map((q) => q.id) : []),
    [currentPanel]
  );

  const annotationQuestionFilter =
    step === "questions" && annotationFilterMode === "current"
      ? panelQuestionIds
      : null;

  // When navigating to a question, default to showing only its spatial comments.
  useEffect(() => {
    setAnnotationFilterMode("current");
  }, [currentPanelIndex]);

  // Force the floor plan into view for the spaces question (room placement
  // only happens on the plan, not the map).
  useEffect(() => {
    if (isSpacesQuestion) setRightView("floorplan");
  }, [isSpacesQuestion]);

  // Load floor plan manifest + default floor when a school is selected.
  useEffect(() => {
    let cancelled = false;

    async function loadSchoolPlans() {
      if (!surveyData.school) {
        setAvailableFloors([]);
        setActiveFloorId("floor-1");
        setFloorPlanLoading(false);
        setSurveyData((prev) =>
          prev.svgContent === defaultSvg ? prev : { ...prev, svgContent: defaultSvg }
        );
        return;
      }

      const floors = await getAvailableFloors(surveyData.school);
      if (cancelled) return;

      setAvailableFloors(floors);
      const initialFloor = floors[0];
      setActiveFloorId(initialFloor?.id ?? "floor-1");
      setFloorPlanLoading(true);

      const svg = initialFloor
        ? await fetchFloorPlanSvgByFilename(initialFloor.filename, defaultSvg)
        : defaultSvg;
      if (cancelled) return;

      prefetchFloorPlanSvgs(
        floors.slice(1).map((floor) => floor.filename).filter(Boolean)
      );

      setSurveyData((prev) => {
        if (prev.school !== surveyData.school) return prev;
        return {
          ...prev,
          svgContent: svg,
          spaceAssignments: {},
          annotations: prev.annotations.filter((a) => a.view === "map"),
        };
      });
      setFloorPlanLoading(false);
    }

    loadSchoolPlans();
    return () => {
      cancelled = true;
      setFloorPlanLoading(false);
    };
  }, [surveyData.school, defaultSvg]);

  const handleFloorChange = useCallback(
    async (floorId: string) => {
      const floor = availableFloors.find((entry) => entry.id === floorId);
      if (!floor) return;

      setActiveFloorId(floorId);
      setFloorPlanLoading(true);
      const svg = await fetchFloorPlanSvgByFilename(floor.filename, defaultSvg);
      setSurveyData((prev) => ({ ...prev, svgContent: svg }));
      setFloorPlanLoading(false);
    },
    [availableFloors, defaultSvg]
  );

  const selectedSchool = getSchoolByName(surveyData.school);

  // Extract room numbers from the uploaded floor plan SVG
  const rooms = useMemo(
    () =>
      isSpacesQuestion ? extractRoomsFromSvg(surveyData.svgContent) : [],
    [isSpacesQuestion, surveyData.svgContent]
  );

  // Compute the labels to render on the floor plan from current assignments.
  // Each program space can have multiple rooms; each becomes its own colored label.
  const spaceLabels = useMemo(() => {
    return Object.entries(surveyData.spaceAssignments).flatMap(([label, entries]) =>
      entries.map((entry) => ({
        label,
        roomKey: entry.roomKey,
        x: entry.x,
        y: entry.y,
        color: getSpaceColor(label),
      }))
    );
  }, [surveyData.spaceAssignments]);

  // Place a clicked room into the currently active program space (toggles off if already present)
  const handlePlaceRoom = (room: RoomInfo) => {
    if (!activeSpace) return;
    setSurveyData((prev) => {
      const existing = prev.spaceAssignments[activeSpace] ?? [];
      const alreadyThere = existing.some((e) => e.roomKey === room.key);
      const nextEntries: SpaceRoomEntry[] = alreadyThere
        ? existing.filter((e) => e.roomKey !== room.key)
        : [
            ...existing,
            { roomKey: room.key, roomLabel: room.label, x: room.x, y: room.y },
          ];
      const next = { ...prev.spaceAssignments };
      if (nextEntries.length === 0) {
        delete next[activeSpace];
      } else {
        next[activeSpace] = nextEntries;
      }
      return { ...prev, spaceAssignments: next };
    });
  };

  const handleRemoveSpaceRoom = (space: string, roomKey: string) => {
    setSurveyData((prev) => {
      const existing = prev.spaceAssignments[space] ?? [];
      const nextEntries = existing.filter((e) => e.roomKey !== roomKey);
      const next = { ...prev.spaceAssignments };
      if (nextEntries.length === 0) {
        delete next[space];
      } else {
        next[space] = nextEntries;
      }
      return { ...prev, spaceAssignments: next };
    });
  };

  const progressPercent =
    step === "intro"
      ? 0
      : step === "report"
      ? 100
      : ((currentPanelIndex + 1) / panels.length) * 100;

  const handleIntroChange = (intro: Omit<SurveyData, "responses" | "annotations" | "svgContent">) => {
    setSurveyData((prev) => ({ ...prev, ...intro }));
  };

  const handleResponseChange = (response: QuestionResponse) => {
    setSurveyData((prev) => ({
      ...prev,
      responses: prev.responses.map((r) =>
        r.questionId === response.questionId ? response : r
      ),
    }));
  };

  const handleAddAnnotation = (annotation: Omit<Annotation, "id">) => {
    const newAnnotation: Annotation = {
      ...annotation,
      id: `annotation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    setSurveyData((prev) => ({
      ...prev,
      annotations: [...prev.annotations, newAnnotation],
    }));
  };

  const handleRemoveAnnotation = (id: string) => {
    setSurveyData((prev) => ({
      ...prev,
      annotations: prev.annotations.filter((a) => a.id !== id),
    }));
  };

  const handleViewReport = () => {
    setStep("report");
  };

  const questionTourSteps = useMemo(
    () => getQuestionTourSteps(availableFloors.length),
    [availableFloors.length]
  );

  const activeTourSteps =
    step === "intro"
      ? INTRO_TOUR_STEPS
      : step === "questions"
        ? questionTourSteps
        : REPORT_TOUR_STEPS;

  useEffect(() => {
    if (!hasSeenWelcome()) setShowWelcome(true);
  }, []);

  const handleWelcomeClose = () => {
    markWelcomeSeen();
    setShowWelcome(false);
  };

  useEffect(() => {
    setRunTour(false);
  }, [step]);

  useEffect(() => {
    if (step !== "intro" || tourIntroSeen || showWelcome) return;
    setTourIntroSeen(true);
    const timer = window.setTimeout(() => setRunTour(true), 450);
    return () => window.clearTimeout(timer);
  }, [step, tourIntroSeen, showWelcome]);

  useEffect(() => {
    if (step !== "questions" || tourQuestionsSeen) return;
    setTourQuestionsSeen(true);
    const timer = window.setTimeout(() => setRunTour(true), 450);
    return () => window.clearTimeout(timer);
  }, [step, tourQuestionsSeen]);

  useEffect(() => {
    if (step !== "report" || tourReportSeen) return;
    setTourReportSeen(true);
    const timer = window.setTimeout(() => setRunTour(true), 450);
    return () => window.clearTimeout(timer);
  }, [step, tourReportSeen]);

  const handleNext = () => {
    if (step === "intro") {
      setStep("questions");
      setCurrentPanelIndex(0);
    } else if (step === "questions") {
      if (currentPanelIndex < panels.length - 1) {
        setCurrentPanelIndex((prev) => prev + 1);
      } else {
        setStep("report");
      }
    }
  };

  const handleBack = () => {
    if (step === "questions") {
      if (currentPanelIndex > 0) {
        setCurrentPanelIndex((prev) => prev - 1);
      } else {
        setStep("intro");
      }
    } else if (step === "report") {
      setStep("questions");
      setCurrentPanelIndex(panels.length - 1);
    }
  };

  const canProceed = () => {
    if (step === "intro") {
      return surveyData.school && surveyData.role && surveyData.principalName && surveyData.email;
    }
    if (step === "questions") {
      // Ranking, open-ended text, and space-location questions have a valid
      // default state, so respondents can always proceed past them.
      if (isRankingPanel || isSpacesQuestion || isTextPanel) return true;
      // Every rating question in the current panel must be answered.
      return currentPanel.questions.every((q) => {
        const r = surveyData.responses.find((res) => res.questionId === q.id);
        return r && isRatingAnswered(r.rating);
      });
    }
    return true;
  };

  const isLastPanel =
    step === "questions" && currentPanelIndex === panels.length - 1;
  const primaryActionDisabled =
    isLastPanel ? false : !canProceed();

  const viewerSubtitle =
    isSpacesQuestion
      ? "Assign each program space to a room — labels appear on the plan"
      : isRankingPanel || isTextPanel
        ? "Reference the floor plan and site map for context"
        : step === "intro"
          ? rightView === "floorplan"
            ? "Review the floor plan for this school"
            : "Locate the school site and surrounding context"
          : rightView === "floorplan"
            ? `Annotate areas related to: ${currentPanel.label}`
            : `Drop pins on the map related to: ${currentPanel.label}`;

  const annotationsEnabledForViewer =
    step === "questions" &&
    !isSpacesQuestion &&
    !isRankingPanel &&
    !isTextPanel;

  const renderViewToggle = (compact = false) => (
    <div
      data-tour="view-toggle"
      className={`flex overflow-hidden rounded-lg border border-border bg-card shadow-sm ${compact ? "w-full" : ""}`}
    >
      <button
        type="button"
        onClick={() => setRightView("floorplan")}
        className={`flex flex-1 items-center justify-center gap-0.5 px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
          rightView === "floorplan"
            ? "bg-primary text-primary-foreground"
            : "text-foreground hover:bg-muted"
        }`}
      >
        <LayoutGrid className="h-3 w-3" />
        {compact ? "Plan" : "Floor Plan"}
      </button>
      <button
        type="button"
        onClick={() => setRightView("map")}
        className={`flex flex-1 items-center justify-center gap-0.5 px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
          rightView === "map"
            ? "bg-primary text-primary-foreground"
            : "text-foreground hover:bg-muted"
        }`}
      >
        <MapIcon className="h-3 w-3" />
        Map
      </button>
    </div>
  );

  const renderViewerContent = () =>
    rightView === "floorplan" ? (
      <FloorPlanViewer
        svgContent={surveyData.svgContent}
        annotations={surveyData.annotations}
        currentQuestionId={currentQuestion?.id || 1}
        currentColor={currentQuestion?.color || "hsl(220, 70%, 50%)"}
        tool={annotationTool}
        classification={annotationClassification}
        onAddAnnotation={handleAddAnnotation}
        onRemoveAnnotation={handleRemoveAnnotation}
        onToolChange={setAnnotationTool}
        annotationsEnabled={annotationsEnabledForViewer}
        spaceLabels={spaceLabels}
        spacePlacementActive={isSpacesQuestion && !!activeSpace}
        onPlaceRoom={handlePlaceRoom}
        filterQuestionIds={annotationQuestionFilter}
        buildingName={surveyData.school || undefined}
        availableFloors={availableFloors}
        activeFloorId={activeFloorId}
        onFloorChange={handleFloorChange}
        isLoading={floorPlanLoading}
        loadingMessage={
          floorPlanLoading ? "Downloading floor plan…" : undefined
        }
      />
    ) : (
      <MapViewer
        annotations={surveyData.annotations}
        currentQuestionId={currentQuestion?.id || 1}
        tool={annotationTool}
        classification={annotationClassification}
        onAddAnnotation={handleAddAnnotation}
        onRemoveAnnotation={handleRemoveAnnotation}
        annotationsEnabled={annotationsEnabledForViewer}
        focusLocation={selectedSchool?.coordinates ?? null}
        focusLabel={selectedSchool?.buildingName ?? null}
        filterQuestionIds={annotationQuestionFilter}
      />
    );

  const renderViewerHeader = (compact = false) => (
    <div
      className={
        compact
          ? "flex flex-col gap-1.5"
          : "mb-1 flex items-center justify-between gap-2"
      }
    >
      <div className={compact ? "space-y-px" : undefined}>
        <h2 className="font-sans text-xs font-semibold text-foreground md:text-sm">
          {rightView === "floorplan" ? "Floor Plan" : "Site Map"}
        </h2>
        <p className="text-[10px] text-muted-foreground">{viewerSubtitle}</p>
      </div>
      <div
        className={
          compact
            ? "flex flex-col gap-1"
            : "flex items-center gap-1.5"
        }
      >
        {step === "questions" &&
          !isSpacesQuestion &&
          !isRankingPanel &&
          !isTextPanel && (
            <div className="flex overflow-hidden rounded border border-border bg-card shadow-sm" data-tour="annotation-filter">
              <button
                type="button"
                onClick={() => setAnnotationFilterMode("current")}
                className={`flex flex-1 items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium transition-colors sm:px-2 ${
                  annotationFilterMode === "current"
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted"
                }`}
                title="Show spatial comments for this question only"
              >
                <Filter className="h-2.5 w-2.5" />
                This Question
              </button>
              <button
                type="button"
                onClick={() => setAnnotationFilterMode("all")}
                className={`flex flex-1 items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium transition-colors sm:px-2 ${
                  annotationFilterMode === "all"
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted"
                }`}
                title="Show spatial comments from all questions"
              >
                All Comments
              </button>
            </div>
          )}
        {step === "questions" && (
          <Badge
            style={{ backgroundColor: currentPanel.color }}
            className="w-fit px-1.5 py-px text-[10px] text-white"
          >
            {currentPanel.label}
          </Badge>
        )}
        {renderViewToggle(compact)}
      </div>
    </div>
  );

  const renderMobileViewerWindow = () => {
    if (!isMobile) return null;

    return (
      <div className="mt-3 flex flex-col overflow-hidden rounded-lg border border-border/60 bg-gradient-to-br from-background to-muted/30 p-2 shadow-sm">
        {renderViewerHeader(true)}
        <div
          data-tour="viewer"
          className="mt-1.5 aspect-square w-full overflow-hidden rounded-md border border-border/60 bg-card"
        >
          {renderViewerContent()}
        </div>
      </div>
    );
  };

  const renderDesktopViewerPanel = () => {
    if (isMobile) return null;

    return (
      <div className="flex flex-1 flex-col bg-gradient-to-br from-background to-muted/30 p-1 md:p-1.5">
        {renderViewerHeader(false)}
        <div data-tour="viewer" className="min-h-0 flex-1 overflow-hidden">
          {renderViewerContent()}
        </div>
      </div>
    );
  };

  if (step === "report") {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border/60 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex w-full items-center justify-between px-4 py-3">
            <div className="flex items-center gap-4">
              <Image
                src="/images/aisd-logo.jpg"
                alt="Austin Independent School District"
                width={48}
                height={48}
                className="h-10 w-auto object-contain"
              />
              <div className="h-8 w-px bg-border/60" />
              <h1 className="font-heading text-xl font-semibold text-foreground">Assessment Report</h1>
              <div className="h-8 w-px bg-border/60" />
              <Button variant="outline" onClick={handleBack} className="gap-2">
                <ChevronLeft className="h-4 w-4" />
                Back to Survey
              </Button>
              <Button variant="outline" onClick={() => window.print()} className="gap-2">
                <FileText className="h-4 w-4" />
                Print Report
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRunTour(true)}
              className="gap-1.5"
            >
              <HelpCircle className="h-4 w-4" />
              Tour
            </Button>
          </div>
        </div>
        <ReportView data={surveyData} />
        <WelcomeDialog open={showWelcome} onClose={handleWelcomeClose} />
        <GuidedTour
          key="report"
          steps={REPORT_TOUR_STEPS}
          run={runTour}
          onClose={() => setRunTour(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border/60 bg-card/80 px-2.5 py-1 backdrop-blur-sm sm:px-3 sm:py-1.5">
        <div className="flex w-full flex-wrap items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Image
              src="/images/aisd-logo.jpg"
              alt="Austin Independent School District"
              width={64}
              height={64}
              className="h-7 w-auto shrink-0 object-contain sm:h-9"
            />
            <div className="hidden h-5 w-px bg-border/60 sm:block md:h-7" />
            <div className="min-w-0">
              <h1 className="truncate font-sans text-xs font-semibold tracking-tight text-foreground sm:text-sm">
                Educational Suitability and Facility Condition Survey
              </h1>
              <p className="hidden text-[10px] text-muted-foreground sm:block">
                Facility Planning &amp; Capital Assessment
              </p>
            </div>
            <div className="hidden h-5 w-px bg-border/60 sm:ml-2 sm:block md:h-7" />
            <div className="hidden text-right sm:block">
              <p className="text-[11px] font-medium text-foreground">
                {step === "intro"
                  ? "Introduction"
                  : `Step ${currentPanelIndex + 1} of ${panels.length}`}
              </p>
              <Progress value={progressPercent} className="mt-0.5 h-1 w-24 md:w-32" />
            </div>
            {step === "questions" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleViewReport}
                  data-tour="preview-report"
                  className="hidden h-6 gap-0.5 text-[11px] sm:ml-2 sm:flex"
                >
                  <FileText className="h-3 w-3" />
                  Preview Report
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRunTour(true)}
                  className="hidden h-6 gap-0.5 text-[11px] sm:flex"
                >
                  <HelpCircle className="h-3 w-3" />
                  Tour
                </Button>
              </>
            )}
            {step === "intro" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRunTour(true)}
                className="hidden h-6 gap-0.5 text-[11px] sm:ml-2 sm:flex"
              >
                <HelpCircle className="h-3 w-3" />
                Tour
              </Button>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:hidden">
            <p className="text-[10px] font-medium text-foreground">
              {step === "intro"
                ? "Intro"
                : `${currentPanelIndex + 1}/${panels.length}`}
            </p>
            {step === "questions" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRunTour(true)}
                className="h-6 px-1"
                aria-label="Take a tour"
              >
                <HelpCircle className="h-3 w-3" />
              </Button>
            )}
            {step === "intro" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRunTour(true)}
                className="h-6 px-1"
                aria-label="Take a tour"
              >
                <HelpCircle className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        {/* Left Panel - Survey Form */}
        <div className="flex min-h-0 w-full flex-col border-b border-border/60 bg-card md:w-[28%] md:max-w-md md:border-b-0 md:border-r lg:w-[26%]">
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2.5 p-2">
              {step === "intro" ? (
                <>
                  <IntroForm
                    data={{
                      school: surveyData.school,
                      role: surveyData.role,
                      principalName: surveyData.principalName,
                      email: surveyData.email,
                      schoolDescription: surveyData.schoolDescription,
                      uniqueFeatures: surveyData.uniqueFeatures,
                      specialEducation: surveyData.specialEducation,
                    }}
                    onChange={handleIntroChange}
                  />
                  {renderMobileViewerWindow()}
                </>
              ) : (
                <div className="space-y-2.5">
                  <div className="space-y-1" data-tour="progress-nav">
                    {Array.from(
                      new Set(panels.map((p) => p.section))
                    ).map((section) => {
                      const isExpanded = expandedSection === section;
                      const sectionPanels = panels.filter(
                        (p) => p.section === section
                      );
                      const completedCount = sectionPanels.filter((p) =>
                        p.questions.every((q) => {
                          if (q.type === "ranking" || q.type === "spaces")
                            return true;
                          const r = surveyData.responses.find(
                            (res) => res.questionId === q.id
                          );
                          return r && isRatingAnswered(r.rating);
                        })
                      ).length;
                      return (
                        <div
                          key={section}
                          className="overflow-hidden rounded-md border border-border/60"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedSection((prev) =>
                                prev === section ? null : section
                              )
                            }
                            aria-expanded={isExpanded}
                            className="flex w-full items-center justify-between gap-1.5 bg-muted/50 px-2 py-1 text-left transition-colors hover:bg-muted"
                          >
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {section}
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="text-[9px] font-medium text-muted-foreground">
                                {completedCount}/{sectionPanels.length}
                              </span>
                              <ChevronDown
                                className={`h-3 w-3 text-muted-foreground transition-transform ${
                                  isExpanded ? "rotate-180" : ""
                                }`}
                              />
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="flex flex-wrap gap-0.5 p-1">
                              {panels.map((p, idx) => {
                                if (p.section !== section) return null;
                                const isComplete = p.questions.every((q) => {
                                  if (
                                    q.type === "ranking" ||
                                    q.type === "spaces"
                                  )
                                    return true;
                                  const r = surveyData.responses.find(
                                    (res) => res.questionId === q.id
                                  );
                                  return r && isRatingAnswered(r.rating);
                                });
                                const isCurrent = idx === currentPanelIndex;
                                // Category panels show the category name; single
                                // question panels show their sequence number.
                                const chipLabel =
                                  p.kind === "category"
                                    ? p.label
                                    : String(
                                        panels
                                          .slice(0, idx + 1)
                                          .filter(
                                            (pp) =>
                                              pp.section === section &&
                                              pp.kind === "question"
                                          ).length
                                      );
                                return (
                                  <button
                                    key={`${section}-${idx}`}
                                    onClick={() => setCurrentPanelIndex(idx)}
                                    title={p.label}
                                    className={`flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-[11px] font-medium transition-all ${
                                      isCurrent
                                        ? "scale-105 bg-primary text-primary-foreground shadow-sm"
                                        : isComplete
                                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                        : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
                                    }`}
                                  >
                                    {chipLabel}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {isSpacesQuestion ? (
                    <>
                      <SpaceAssignmentForm
                        rooms={rooms}
                        assignments={surveyData.spaceAssignments}
                        activeSpace={activeSpace}
                        onActiveSpaceChange={setActiveSpace}
                        onRemoveRoom={handleRemoveSpaceRoom}
                        hasSvg={!!surveyData.svgContent}
                      />
                      {renderMobileViewerWindow()}
                      {isLastPanel && <SurveyCredit />}
                    </>
                  ) : (
                    <>
                      {currentPanel.kind === "category" ? (
                        <div className="space-y-2">
                          {/* Category header (shown once for the whole panel) */}
                          <div className="space-y-0.5">
                            <Badge
                              style={{ backgroundColor: currentPanel.color }}
                              className="px-1.5 py-px text-[9px] text-white"
                            >
                              {currentPanel.section}
                            </Badge>
                            <h2 className="font-sans text-sm font-bold text-foreground">
                              {currentPanel.label}
                            </h2>
                            <p className="text-[11px] text-muted-foreground">
                              {currentPanel.section === "Facility Condition"
                                ? FCA_LIKERT_SCALE_NOTE
                                : "Rate each item from 1 (very poor) to 5 (excellent)."}
                            </p>
                          </div>
                          {currentPanel.questions.map((q) => {
                            const response = surveyData.responses.find(
                              (r) => r.questionId === q.id
                            )!;
                            return (
                              <QuestionForm
                                key={q.id}
                                questionId={q.id}
                                response={response}
                                onChange={handleResponseChange}
                                compact
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <QuestionForm
                          questionId={currentQuestion.id}
                          response={currentResponse}
                          onChange={handleResponseChange}
                        />
                      )}

                      {!isRankingPanel && !isTextPanel && (
                        <>
                          {/* Annotation Toolbar - Under Questions */}
                          <div data-tour="annotation-toolbar">
                            <AnnotationToolbar
                              tool={annotationTool}
                              classification={annotationClassification}
                              currentColor={currentPanel.color}
                              onToolChange={setAnnotationTool}
                              onClassificationChange={setAnnotationClassification}
                              disabled={!surveyData.svgContent}
                            />
                          </div>

                          {renderMobileViewerWindow()}

                          {/* Annotation Summary for Current Panel */}
                          <div className="rounded-md border border-border/60 bg-gradient-to-br from-muted/50 to-muted/30 p-2">
                            <div className="mb-1 flex items-center gap-1">
                              <ClipboardList className="h-3 w-3 text-primary" />
                              <span className="text-[11px] font-semibold text-foreground">
                                Annotations for {currentPanel.label}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[9px] text-emerald-700">
                                {surveyData.annotations.filter(
                                  (a) =>
                                    panelQuestionIds.includes(a.questionId) &&
                                    a.classification === "strength"
                                ).length}{" "}
                                Strengths
                              </Badge>
                              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[9px] text-rose-700">
                                {surveyData.annotations.filter(
                                  (a) =>
                                    panelQuestionIds.includes(a.questionId) &&
                                    a.classification === "weakness"
                                ).length}{" "}
                                Challenges
                              </Badge>
                            </div>
                          </div>
                          {isLastPanel && <SurveyCredit />}
                        </>
                      )}

                      {(isRankingPanel || isTextPanel) && (
                        <>
                          {renderMobileViewerWindow()}
                          {isLastPanel && <SurveyCredit />}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Navigation Buttons */}
          <div className="shrink-0 border-t border-border/60 bg-card p-2" data-tour="survey-navigation">
            <div className="flex justify-between gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBack}
                disabled={step === "intro"}
                className="h-7 text-xs"
              >
                <ChevronLeft className="mr-0.5 h-3 w-3" />
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleNext}
                disabled={primaryActionDisabled}
                className="h-7 text-xs"
              >
                {step === "questions" &&
                currentPanelIndex === panels.length - 1 ? (
                  <>
                    View Report
                    <FileText className="ml-0.5 h-3 w-3" />
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="ml-0.5 h-3 w-3" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Right Panel - Floor Plan / Map (desktop) */}
        {renderDesktopViewerPanel()}
      </div>

      <GuidedTour
        key={step}
        steps={activeTourSteps}
        run={runTour}
        onClose={() => setRunTour(false)}
      />
      <WelcomeDialog open={showWelcome} onClose={handleWelcomeClose} />
    </div>
  );
}
