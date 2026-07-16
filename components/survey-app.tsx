"use client";

import { useState, useMemo, useEffect, useCallback, useLayoutEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IntroForm } from "@/components/intro-form";
import { QuestionForm } from "@/components/question-form";
import { FloorPlanViewer } from "@/components/floor-plan-viewer";
import { MapViewer } from "@/components/map-viewer";
import { SpaceAssignmentForm } from "@/components/space-assignment-form";
import { getSchoolByName } from "@/lib/schools-data";
import { fetchFloorPlanSvgByFilename, getAvailableFloors, prefetchFloorPlanSvgs, type FloorPlanLevel } from "@/lib/floor-plans";
import { pickDefaultFloor } from "@/lib/floor-plan-manifest";
import { extractRoomsFromSvg, getSpaceColor, type RoomInfo } from "@/lib/spaces-data";
import {
  getQuestionsForRole,
  getQuestionNavLabel,
  FCA_LIKERT_SCALE_NOTE,
  isQuestionResponseComplete,
  SCHOOL_LEADER_FCA_QUESTION_IDS,
  createEmptyResponses,
  mergeSurveyResponses,
  SURVEY_TITLE,
  type SurveyData,
  type QuestionResponse,
  type Annotation,
  type SpaceRoomEntry,
} from "@/lib/survey-data";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  Map as MapIcon,
  LayoutGrid,
  HelpCircle,
  Filter,
  Send,
  Loader2,
  CheckCircle2,
  MessageSquareWarning,
} from "lucide-react";
import { AnnotationToolbar, type Tool, type Classification } from "@/components/annotation-toolbar";
import { GuidedTour } from "@/components/guided-tour";
import {
  INTRO_TOUR_STEPS,
  MINI_QUESTION_TOUR_STEPS,
  getQuestionTourSteps,
} from "@/lib/guided-tour-steps";
import { useIsMobile, usePrefersMobileFloorPlan } from "@/hooks/use-mobile";
import {
  WelcomeDialog,
  hasSeenWelcome,
  markWelcomeSeen,
} from "@/components/welcome-dialog";
import {
  loadSurveyDraft,
  saveSurveyDraft,
  clearSurveyDraft,
  type SurveyStep,
} from "@/lib/survey-draft";
import {
  seedFloorPlanManifest,
  type FloorPlanManifestRow,
  type ManifestSchoolOption,
} from "@/lib/floor-plan-manifest";
import { isValidEmail, type SurveySubmissionPayload } from "@/lib/submit-survey";
import { parsePopupNote } from "@/lib/deferred-survey-schools";
import Image from "next/image";

type Step = SurveyStep;
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
  /** Full category / area name (panel header, tooltips). */
  label: string;
  /** Short chip label for progress nav. */
  navLabel: string;
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

function StepSection({
  letter,
  title,
  children,
}: {
  letter: "A" | "B" | "C" | "D";
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
          {letter}
        </span>
        <p className="text-[11px] font-semibold text-foreground">{title}</p>
      </div>
      {children}
    </section>
  );
}

export default function SurveyApp({
  defaultSvg,
  initialManifest = [],
  initialSchools = [],
}: {
  defaultSvg: string;
  initialManifest?: FloorPlanManifestRow[];
  initialSchools?: ManifestSchoolOption[];
}) {
  const [step, setStep] = useState<Step>("intro");
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0);
  const [annotationTool, setAnnotationTool] = useState<Tool>("pan");
  const [annotationClassification, setAnnotationClassification] = useState<Classification>("strength");
  // Prefer floor plan by default — Mapbox WebGL is a common mobile tab-kill trigger.
  const [rightView, setRightView] = useState<RightView>("map");
  const [annotationFilterMode, setAnnotationFilterMode] =
    useState<AnnotationFilterMode>("current");
  const [activeSpace, setActiveSpace] = useState<string | null>(null);
  const [availableFloors, setAvailableFloors] = useState<FloorPlanLevel[]>([]);
  const [activeFloorId, setActiveFloorId] = useState<string>("floor-1");
  const [floorPlanLoading, setFloorPlanLoading] = useState(false);
  const [runTour, setRunTour] = useState(false);
  /** Auto first-question walkthrough vs full Tour button walkthrough. */
  const [tourVariant, setTourVariant] = useState<"intro" | "mini" | "full">(
    "intro"
  );
  const [tourIntroSeen, setTourIntroSeen] = useState(false);
  const [tourQuestionsSeen, setTourQuestionsSeen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [missingFeedbackOpen, setMissingFeedbackOpen] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  // On phones, keep map/plan collapsed until the user opens it so WebGL/SVG
  // don't load while they are still answering the first question.
  const [mobileViewerOpen, setMobileViewerOpen] = useState(false);
  const isMobile = useIsMobile();
  const { ready: floorPlanDeviceReady, preferMobile } =
    usePrefersMobileFloorPlan();

  useLayoutEffect(() => {
    if (initialManifest.length > 0) {
      seedFloorPlanManifest(initialManifest);
    }
  }, [initialManifest]);

  const [surveyData, setSurveyData] = useState<SurveyData>({
    school: "",
    role: "",
    positionTitle: "",
    principalName: "",
    email: "",
    schoolDescription: "",
    uniqueFeatures: "",
    specialEducation: "",
    responses: createEmptyResponses(),
    annotations: [],
    svgContent: defaultSvg,
    spaceAssignments: {},
  });

  // Restore in-progress survey after a mobile reload / tab discard.
  useEffect(() => {
    const draft = loadSurveyDraft();
    if (draft) {
      setStep(draft.step);
      setCurrentPanelIndex(draft.currentPanelIndex);
      setRightView(draft.rightView);
      setActiveFloorId(draft.activeFloorId);
      setSurveyData((prev) => ({
        ...draft.surveyData,
        positionTitle: draft.surveyData.positionTitle ?? "",
        // Fill any questions added after the draft was saved (P6/P7, etc.).
        responses: mergeSurveyResponses(draft.surveyData.responses),
        svgContent: prev.svgContent,
      }));
      if (draft.step === "questions" || draft.step === "done") {
        setTourIntroSeen(true);
        setTourQuestionsSeen(draft.step === "done");
      }
      if (draft.step === "done") {
        // Incomplete "done" drafts shouldn't lock users out; resume at last question.
        setStep("questions");
      }
    }
    setDraftReady(true);
  }, []);

  // Persist draft (without the large SVG) so a phone reload can resume.
  useEffect(() => {
    if (!draftReady || step === "done") return;
    const timer = window.setTimeout(() => {
      saveSurveyDraft({
        step,
        currentPanelIndex,
        rightView,
        activeFloorId,
        surveyData,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    draftReady,
    step,
    currentPanelIndex,
    rightView,
    activeFloorId,
    surveyData,
  ]);

  // The set of questions the current respondent answers, based on their role.
  const activeQuestions = useMemo(
    () => getQuestionsForRole(surveyData.role),
    [surveyData.role]
  );

  // Group the active questions into "panels". Educational Suitability questions
  // that share a category (e.g. Safety rating + open-ended priorities) are
  // kept together. Operations Facility Condition questions are grouped by
  // category so an entire category is rated within one panel. School Leader
  // campus-condition prompts stay one question per step.
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
          navLabel: category,
          color: q.color,
          questions: group,
        });
      } else if (q.section === "Educational Suitability") {
        // ESA: group consecutive items that share a category (Safety rating +
        // open-ended priorities). All other ESA topics stay one per panel.
        const category = q.category;
        const group = [];
        while (
          i < activeQuestions.length &&
          activeQuestions[i].section === "Educational Suitability" &&
          activeQuestions[i].category === category
        ) {
          group.push(activeQuestions[i]);
          i += 1;
        }
        const primary =
          group.find((item) => item.type === "rating") ?? group[0];
        const areaLabel =
          "area" in primary && typeof primary.area === "string"
            ? primary.area
            : undefined;
        result.push({
          kind: "question",
          section: q.section,
          label: areaLabel || category,
          navLabel: getQuestionNavLabel(primary),
          color: primary.color,
          questions: group,
        });
      } else {
        const areaLabel =
          "area" in q && typeof q.area === "string" ? q.area : undefined;
        result.push({
          kind: "question",
          section: q.section,
          label: areaLabel || q.category,
          navLabel: getQuestionNavLabel(q),
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

  // Representative question for the right-hand annotation surface (prefer rating).
  const currentQuestion =
    currentPanel?.questions.find((q) => q.type === "rating") ??
    currentPanel?.questions[0];
  const currentResponse =
    surveyData.responses.find((r) => r.questionId === currentQuestion?.id) ?? {
      questionId: currentQuestion?.id ?? 0,
      rating: 0,
      explanation: "",
    };
  const companionTextQuestion = currentPanel?.questions.find(
    (q) => q.type === "text" && q.id !== currentQuestion?.id
  );
  const companionTextResponse = companionTextQuestion
    ? surveyData.responses.find((r) => r.questionId === companionTextQuestion.id) ?? {
        questionId: companionTextQuestion.id,
        rating: 0,
        explanation: "",
      }
    : null;

  // Whether we're on the dedicated "program space locations" question (Q14).
  const isSpacesQuestion = currentQuestion?.type === "spaces";
  const isRankingPanel = currentQuestion?.type === "ranking";
  const isTextPanel =
    currentQuestion?.type === "text" && !companionTextQuestion;
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
    if (isSpacesQuestion) {
      setRightView("floorplan");
      setMobileViewerOpen(true);
    }
  }, [isSpacesQuestion]);

  // Load floor plan manifest + default floor when a school is selected.
  // On phones/tablets, prefer `*.mobile.svg` when present; desktop keeps the full plan.
  useEffect(() => {
    let cancelled = false;

    async function loadSchoolPlans() {
      if (!floorPlanDeviceReady) return;

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
      const initialFloor = pickDefaultFloor(floors);
      setActiveFloorId(initialFloor?.id ?? "floor-1");
      setFloorPlanLoading(true);

      const svg = initialFloor
        ? await fetchFloorPlanSvgByFilename(initialFloor.filename, defaultSvg, {
            preferMobile,
          })
        : defaultSvg;
      if (cancelled) return;

      // Prefetching every floor doubles memory; skip on phones/tablets.
      if (!preferMobile) {
        prefetchFloorPlanSvgs(
          floors
            .filter((floor) => floor.id !== initialFloor?.id)
            .map((floor) => floor.filename)
            .filter(Boolean)
        );
      }

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
  }, [surveyData.school, defaultSvg, floorPlanDeviceReady, preferMobile]);

  const handleFloorChange = useCallback(
    async (floorId: string) => {
      const floor = availableFloors.find((entry) => entry.id === floorId);
      if (!floor) return;

      setActiveFloorId(floorId);
      setFloorPlanLoading(true);
      const svg = await fetchFloorPlanSvgByFilename(floor.filename, defaultSvg, {
        preferMobile,
      });
      setSurveyData((prev) => ({ ...prev, svgContent: svg }));
      setFloorPlanLoading(false);
    },
    [availableFloors, defaultSvg, preferMobile]
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
      : step === "done"
      ? 100
      : ((currentPanelIndex + 1) / panels.length) * 100;

  const handleIntroChange = (intro: Omit<SurveyData, "responses" | "annotations" | "svgContent">) => {
    setSurveyData((prev) => ({ ...prev, ...intro }));
  };

  const handleResponseChange = (response: QuestionResponse) => {
    setSurveyData((prev) => {
      const hasResponse = prev.responses.some(
        (r) => r.questionId === response.questionId
      );
      return {
        ...prev,
        responses: hasResponse
          ? prev.responses.map((r) =>
              r.questionId === response.questionId ? response : r
            )
          : [...prev.responses, response],
      };
    });
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

  const handleUpdateAnnotation = (
    id: string,
    updates: Partial<Pick<Annotation, "comment" | "classification" | "color">>
  ) => {
    setSurveyData((prev) => ({
      ...prev,
      annotations: prev.annotations.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    }));
  };

  const questionTourSteps = useMemo(
    () => getQuestionTourSteps(availableFloors.length),
    [availableFloors.length]
  );

  const activeTourSteps =
    tourVariant === "intro"
      ? INTRO_TOUR_STEPS
      : tourVariant === "mini"
        ? MINI_QUESTION_TOUR_STEPS
        : questionTourSteps;

  const startTour = (variant: "intro" | "mini" | "full") => {
    setTourVariant(variant);
    setRunTour(true);
  };

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
    if (!isMobile) return;
    // Still skip the long intro auto-tour on phones; the short questions
    // mini-tour below is allowed so annotation guidance still appears.
    setTourIntroSeen(true);
    setRunTour(false);
  }, [isMobile]);

  useEffect(() => {
    // Auto-tours fight with mobile scrolling and can stress the viewer; skip them.
    if (isMobile || !draftReady) return;
    if (step !== "intro" || tourIntroSeen || showWelcome) return;
    // Mark seen only when the tour actually starts so React Strict Mode
    // remounts do not cancel the scheduled auto-tour permanently.
    const timer = window.setTimeout(() => {
      setTourIntroSeen(true);
      startTour("intro");
    }, 450);
    return () => window.clearTimeout(timer);
  }, [step, tourIntroSeen, showWelcome, isMobile, draftReady]);

  useEffect(() => {
    if (!draftReady) return;
    if (step !== "questions" || tourQuestionsSeen) return;
    // Resume mid-survey: skip the mini tour rather than showing it later.
    if (currentPanelIndex !== 0) {
      setTourQuestionsSeen(true);
      return;
    }
    // Only auto-run on the first rating panel (ESA or FCA).
    if (isSpacesQuestion || isRankingPanel || isTextPanel) {
      setTourQuestionsSeen(true);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let pollTimer: number | undefined;
    let startTimer: number | undefined;

    const tryStartMiniTour = () => {
      if (cancelled) return;
      // Annotation toolbar is required; view-toggle exists on desktop and in
      // the expanded mobile viewer (tour can still center if missing).
      const toolbar = document.querySelector('[data-tour="annotation-toolbar"]');
      if (toolbar) {
        setTourQuestionsSeen(true);
        // Ensure floor plan / map chrome is visible so step 2 can highlight it.
        setMobileViewerOpen(true);
        startTour("mini");
        return;
      }
      attempts += 1;
      if (attempts > 40) {
        setTourQuestionsSeen(true);
        return;
      }
      pollTimer = window.setTimeout(tryStartMiniTour, 150);
    };

    startTimer = window.setTimeout(tryStartMiniTour, 400);
    return () => {
      cancelled = true;
      if (startTimer) window.clearTimeout(startTimer);
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [
    step,
    tourQuestionsSeen,
    draftReady,
    currentPanelIndex,
    isSpacesQuestion,
    isRankingPanel,
    isTextPanel,
  ]);

  const handleSubmitSurvey = async () => {
    if (isSubmitting || submissionId) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const { svgContent: _svgContent, ...payload } = surveyData;
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
      clearSurveyDraft();
      setStep("done");
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to submit survey."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const annotationsEnabledForViewer =
    step === "questions" &&
    !isSpacesQuestion &&
    !isRankingPanel &&
    !isTextPanel;

  const panelHasCommentsOrAnnotations = useMemo(() => {
    if (!currentPanel || !annotationsEnabledForViewer) return true;
    const hasNotes = currentPanel.questions.some((q) => {
      const response = surveyData.responses.find((r) => r.questionId === q.id);
      return Boolean(response?.explanation?.trim());
    });
    if (hasNotes) return true;
    return surveyData.annotations.some((a) =>
      panelQuestionIds.includes(a.questionId)
    );
  }, [
    annotationsEnabledForViewer,
    currentPanel,
    panelQuestionIds,
    surveyData.annotations,
    surveyData.responses,
  ]);

  const advanceFromCurrentPanel = () => {
    if (currentPanelIndex < panels.length - 1) {
      setCurrentPanelIndex((prev) => prev + 1);
    } else {
      void handleSubmitSurvey();
    }
  };

  const handleNext = () => {
    if (step === "intro") {
      setStep("questions");
      setCurrentPanelIndex(0);
      return;
    }
    if (step === "questions") {
      if (annotationsEnabledForViewer && !panelHasCommentsOrAnnotations) {
        setMissingFeedbackOpen(true);
        return;
      }
      advanceFromCurrentPanel();
    }
  };

  const handleContinueWithoutFeedback = () => {
    setMissingFeedbackOpen(false);
    advanceFromCurrentPanel();
  };

  const handleBack = () => {
    if (step === "questions") {
      if (currentPanelIndex > 0) {
        setCurrentPanelIndex((prev) => prev - 1);
      } else {
        setStep("intro");
      }
    }
  };

  const canProceed = () => {
    if (step === "intro") {
      const selectedSchool = initialSchools.find(
        (school) => school.name === surveyData.school
      );
      const popup = parsePopupNote(selectedSchool?.popupNote);
      return Boolean(
        surveyData.school &&
          !(popup?.blocksSurvey) &&
          surveyData.role &&
          surveyData.positionTitle.trim() &&
          surveyData.principalName.trim() &&
          isValidEmail(surveyData.email)
      );
    }
    if (step === "questions") {
      // Ranking and space-location questions have a valid default state.
      if (isRankingPanel || isSpacesQuestion) return true;
      // Every question in the current panel must be answered (ratings + any
      // required open-ended text such as Safety priorities).
      return currentPanel.questions.every((q) => {
        const r = surveyData.responses.find((res) => res.questionId === q.id);
        return isQuestionResponseComplete(q, r);
      });
    }
    return true;
  };

  const isLastPanel =
    step === "questions" && currentPanelIndex === panels.length - 1;
  const primaryActionDisabled = !canProceed() || isSubmitting;

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
        onUpdateAnnotation={handleUpdateAnnotation}
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
        onUpdateAnnotation={handleUpdateAnnotation}
        onToolChange={setAnnotationTool}
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
            variant="secondary"
            className="w-fit px-1.5 py-px text-[10px]"
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
        <button
          type="button"
          onClick={() => setMobileViewerOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-left transition-colors hover:bg-muted/70"
        >
          <span className="text-[11px] font-semibold text-foreground">
            Floor plan &amp; site map
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {mobileViewerOpen ? "Hide" : "Show"}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${
                mobileViewerOpen ? "rotate-180" : ""
              }`}
            />
          </span>
        </button>
        {mobileViewerOpen && (
          <>
            <div className="mt-1.5">{renderViewerHeader(true)}</div>
            <div
              data-tour="viewer"
              className="mt-1.5 aspect-square w-full overflow-hidden rounded-md border border-border/60 bg-card"
            >
              {renderViewerContent()}
            </div>
          </>
        )}
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

  if (step === "done") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-600" />
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            Thank you
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your {SURVEY_TITLE} has been submitted successfully.
          </p>
          {submissionId && (
            <p className="mt-4 text-xs text-muted-foreground">
              Reference:{" "}
              <span className="font-mono text-foreground">{submissionId}</span>
            </p>
          )}
          <SurveyCredit />
        </div>
        <WelcomeDialog open={showWelcome} onClose={handleWelcomeClose} />
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
                {SURVEY_TITLE}
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
                  data-tour="tour-help"
                  onClick={() => startTour("full")}
                  className="hidden h-6 gap-0.5 text-[11px] sm:ml-2 sm:flex"
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
                data-tour="tour-help"
                onClick={() => startTour("intro")}
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
                data-tour="tour-help"
                onClick={() => startTour("full")}
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
                data-tour="tour-help"
                onClick={() => startTour("intro")}
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
        <div className="flex min-h-0 w-full flex-col border-b border-border/60 bg-card md:w-[36%] md:max-w-xl md:border-b-0 md:border-r lg:w-[34%]">
          <ScrollArea className="min-h-0 flex-1 overscroll-contain">
            <div className="space-y-2.5 p-2">
              {step === "intro" ? (
                <>
                  <IntroForm
                    data={{
                      school: surveyData.school,
                      role: surveyData.role,
                      positionTitle: surveyData.positionTitle,
                      principalName: surveyData.principalName,
                      email: surveyData.email,
                      schoolDescription: surveyData.schoolDescription,
                      uniqueFeatures: surveyData.uniqueFeatures,
                      specialEducation: surveyData.specialEducation,
                    }}
                    onChange={handleIntroChange}
                    initialSchools={initialSchools}
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
                          const r = surveyData.responses.find(
                            (res) => res.questionId === q.id
                          );
                          return isQuestionResponseComplete(q, r);
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
                                  const r = surveyData.responses.find(
                                    (res) => res.questionId === q.id
                                  );
                                  return isQuestionResponseComplete(q, r);
                                });
                                const isCurrent = idx === currentPanelIndex;
                                // Category-style chips for every panel (short
                                // navLabel for ESA so the strip stays scannable).
                                return (
                                  <button
                                    key={`${section}-${idx}`}
                                    onClick={() => setCurrentPanelIndex(idx)}
                                    title={p.label}
                                    className={`flex h-6 max-w-[6.75rem] items-center justify-center truncate rounded px-1.5 text-[10px] font-medium transition-all ${
                                      isCurrent
                                        ? "scale-105 bg-primary text-primary-foreground shadow-sm"
                                        : isComplete
                                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                        : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
                                    }`}
                                  >
                                    <span className="truncate">{p.navLabel}</span>
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
                        <div className="space-y-3">
                          {/* Category header (shown once for the whole panel) */}
                          <div className="space-y-0.5">
                            <Badge
                              variant="secondary"
                              className="px-1.5 py-px text-[9px]"
                            >
                              {currentPanel.section}
                            </Badge>
                            <h2 className="font-sans text-sm font-bold text-foreground">
                              {currentPanel.label}
                            </h2>
                            <p className="text-[11px] text-muted-foreground">
                              {currentPanel.section === "Facility Condition"
                                ? FCA_LIKERT_SCALE_NOTE
                                : "Rate each statement from 1 (Strongly Disagree) to 5 (Strongly Agree)."}
                            </p>
                          </div>
                          <StepSection
                            letter="A"
                            title={
                              <>
                                Rate each statement{" "}
                                <span className="text-destructive">*</span>
                              </>
                            }
                          >
                            <div className="space-y-2">
                              {currentPanel.questions.map((q) => {
                                const response =
                                  surveyData.responses.find(
                                    (r) => r.questionId === q.id
                                  ) ?? {
                                    questionId: q.id,
                                    rating: 0,
                                    explanation: "",
                                  };
                                return (
                                  <QuestionForm
                                    key={q.id}
                                    questionId={q.id}
                                    response={response}
                                    onChange={handleResponseChange}
                                    compact
                                    parts="full"
                                    annotationToolsPosition="below"
                                  />
                                );
                              })}
                            </div>
                          </StepSection>
                          <StepSection
                            letter="B"
                            title={
                              <>
                                Mark locations on the floor plan or site map{" "}
                                <span className="font-normal text-muted-foreground">
                                  (optional)
                                </span>
                              </>
                            }
                          >
                            <div data-tour="annotation-toolbar">
                              <AnnotationToolbar
                                tool={annotationTool}
                                classification={annotationClassification}
                                currentColor={currentPanel.color}
                                onToolChange={setAnnotationTool}
                                onClassificationChange={setAnnotationClassification}
                                disabled={!surveyData.svgContent}
                                showHeading={false}
                              />
                            </div>
                          </StepSection>
                        </div>
                      ) : isRankingPanel || isTextPanel ? (
                        <div className="space-y-3">
                          <div className="space-y-0.5">
                            <Badge
                              variant="secondary"
                              className="px-1.5 py-px text-[9px]"
                            >
                              {currentPanel.section}
                            </Badge>
                            <h2 className="font-sans text-sm font-bold text-foreground">
                              {currentPanel.label}
                            </h2>
                          </div>
                          <QuestionForm
                            questionId={currentQuestion.id}
                            response={currentResponse}
                            onChange={handleResponseChange}
                            omitMetaHeader
                          />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="space-y-0.5">
                            <Badge
                              variant="secondary"
                              className="px-1.5 py-px text-[9px]"
                            >
                              {currentPanel.section}
                            </Badge>
                            <h2 className="font-sans text-sm font-bold text-foreground">
                              {currentPanel.label}
                            </h2>
                            <p className="text-[11px] text-muted-foreground">
                              {currentPanel.section === "Facility Condition"
                                ? FCA_LIKERT_SCALE_NOTE
                                : "Rate this statement from 1 (Strongly Disagree) to 5 (Strongly Agree)."}
                            </p>
                          </div>
                          <StepSection
                            letter="A"
                            title={
                              <>
                                Rate this statement{" "}
                                <span className="text-destructive">*</span>
                              </>
                            }
                          >
                            <QuestionForm
                              questionId={currentQuestion.id}
                              response={currentResponse}
                              onChange={handleResponseChange}
                              parts="prompt-rating"
                              omitMetaHeader
                            />
                          </StepSection>
                          {companionTextQuestion && companionTextResponse && (
                            <StepSection
                              letter="B"
                              title={
                                <>
                                  {companionTextQuestion.text}{" "}
                                  <span className="text-destructive">*</span>
                                </>
                              }
                            >
                              <QuestionForm
                                questionId={companionTextQuestion.id}
                                response={companionTextResponse}
                                onChange={handleResponseChange}
                                omitMetaHeader
                                textRequired
                              />
                            </StepSection>
                          )}
                          <StepSection
                            letter={companionTextQuestion ? "C" : "B"}
                            title={
                              <>
                                Mark locations on the floor plan or site map{" "}
                                <span className="font-normal text-muted-foreground">
                                  (optional)
                                </span>
                              </>
                            }
                          >
                            <div data-tour="annotation-toolbar">
                              <AnnotationToolbar
                                tool={annotationTool}
                                classification={annotationClassification}
                                currentColor={currentPanel.color}
                                onToolChange={setAnnotationTool}
                                onClassificationChange={setAnnotationClassification}
                                disabled={!surveyData.svgContent}
                                showHeading={false}
                              />
                            </div>
                          </StepSection>
                          <StepSection
                            letter={companionTextQuestion ? "D" : "C"}
                            title={
                              <>
                                Explain your rating{" "}
                                <span className="font-normal text-muted-foreground">
                                  (optional)
                                </span>
                              </>
                            }
                          >
                            <QuestionForm
                              questionId={currentQuestion.id}
                              response={currentResponse}
                              onChange={handleResponseChange}
                              parts="explanation"
                            />
                          </StepSection>
                        </div>
                      )}

                      {!isRankingPanel && !isTextPanel && (
                        <>
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
            <div className="flex flex-col gap-1.5">
              {submitError && (
                <p className="text-center text-[11px] text-destructive">{submitError}</p>
              )}
              {step === "intro" && primaryActionDisabled && (
                <p className="text-center text-[10px] text-muted-foreground">
                  Complete all required fields marked{" "}
                  <span className="text-destructive">*</span>, including a valid
                  email address, to continue.
                </p>
              )}
              <div className="flex justify-between gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBack}
                  disabled={step === "intro" || isSubmitting}
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
                  title={
                    step === "intro" && primaryActionDisabled
                      ? "Complete all required fields, including a valid email"
                      : undefined
                  }
                >
                  {isLastPanel ? (
                    <>
                      {isSubmitting ? (
                        <Loader2 className="mr-0.5 h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="mr-0.5 h-3 w-3" />
                      )}
                      {isSubmitting ? "Submitting…" : "Submit"}
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
        </div>

        {/* Right Panel - Floor Plan / Map (desktop) */}
        {renderDesktopViewerPanel()}
      </div>

      <GuidedTour
        key={`${step}-${tourVariant}`}
        steps={activeTourSteps}
        run={runTour}
        onClose={() => setRunTour(false)}
      />
      <WelcomeDialog open={showWelcome} onClose={handleWelcomeClose} />

      {missingFeedbackOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="missing-feedback-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl sm:p-6">
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                <MessageSquareWarning className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3
                  id="missing-feedback-title"
                  className="font-heading text-base font-semibold text-foreground"
                >
                  No comments or plan markings yet
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  You haven&apos;t added a written comment or marked anything on
                  the floor plan / site map for this step. Stay to add feedback,
                  or continue without it.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setMissingFeedbackOpen(false)}
              >
                Stay and add feedback
              </Button>
              <Button onClick={handleContinueWithoutFeedback}>
                {isLastPanel ? "Submit anyway" : "Continue anyway"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
