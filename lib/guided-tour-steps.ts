import type { TourStep } from "@/components/guided-tour";

export const INTRO_TOUR_STEPS: TourStep[] = [
  {
    target: "school-select",
    title: "Select your school",
    body: "Choose your campus from the live floor plan list. Only schools with uploaded plans can be selected; others appear grayed out until plans are added.",
    placement: "right",
  },
  {
    target: "role-select",
    title: "Choose your role",
    body: "School Leaders complete Educational Suitability plus seven campus condition questions covering key facility categories. Operations Staff complete only the detailed Facility Condition (FCA) questions.",
    placement: "right",
  },
  {
    target: "survey-navigation",
    title: "Begin the assessment",
    body: "Fill in your name and email, then click Next to start. Use the floor plan or site map on the right to orient yourself to the campus while you work.",
    placement: "top",
  },
];

export const QUESTION_TOUR_STEPS: TourStep[] = [
  {
    target: "progress-nav",
    title: "Jump between sections",
    body: "Expand a section and click any step chip to jump directly to that topic. Green chips are complete; the highlighted chip is where you are now.",
    placement: "bottom",
  },
  {
    target: "rating",
    title: "Rate each statement",
    body: "Rate each statement from 1 (Strongly Disagree) to 5 (Strongly Agree) using the number buttons. Facility Condition questions also include an “I don’t know” option.",
    placement: "right",
  },
  {
    target: "fca-dont-know",
    title: "“I don’t know” on FCA questions",
    body: "On Facility Condition questions, choose “I don’t know” if you cannot answer. It counts as answered but is excluded from scoring.",
    placement: "right",
  },
  {
    target: "explanation",
    title: "Explain your rating",
    body: "Add optional written context for your score. This helps the planning team understand the story behind each rating.",
    placement: "right",
  },
  {
    target: "ranking",
    title: "Rank modernization priorities",
    body: "On Campus Improvement Priorities, select up to five categories in order of priority (first = highest). Add optional notes in the text box.",
    placement: "right",
  },
  {
    target: "annotation-toolbar",
    title: "Spatial comment tools",
    body: "Use Pin, Circle, or Freeform to mark strengths and challenges on the plan or map. Toggle Strength vs Challenge before you draw. Pins identify room numbers when the floor plan supports it.",
    placement: "right",
  },
  {
    target: "annotation-filter",
    title: "Filter annotations",
    body: "Show comments for This Question only, or switch to All Comments to see everything you have marked so far across the survey.",
    placement: "bottom",
  },
  {
    target: "floor-toggle",
    title: "Switch floors",
    body: "Schools with multiple floor plans show L1, L2, B, etc. Switch levels to annotate the correct floor. Annotations stay tied to the floor where you placed them.",
    placement: "bottom",
  },
  {
    target: "view-toggle",
    title: "Floor plan & site map",
    body: "Toggle between the interior Floor Plan and the aerial Site Map. You can leave spatial comments on either view.",
    placement: "bottom",
  },
  {
    target: "viewer",
    title: "Click to annotate",
    body: "Click or draw directly on the plan or map. After placing a pin or shape, add a comment describing the strength or challenge at that location.",
    placement: "left",
  },
  {
    target: "preview-report",
    title: "Preview your report",
    body: "At any time, open Preview Report to review your scores, annotations, and school info before finishing.",
    placement: "bottom",
  },
];

export const REPORT_TOUR_STEPS: TourStep[] = [
  {
    target: "report-tabs",
    title: "Explore your report",
    body: "Use the tabs to review the Executive Summary, Detailed Ratings, interactive Floor Plan, Site Map, and School Info — the same views you saw while completing the survey.",
    placement: "bottom",
  },
  {
    target: "submit-survey",
    title: "Submit when ready",
    body: "When you have reviewed everything, click Submit Survey to save your assessment. Your responses, ratings, and annotations are stored for the district planning team.",
    placement: "left",
  },
];

export function getQuestionTourSteps(floorCount: number): TourStep[] {
  return QUESTION_TOUR_STEPS.filter(
    (step) => step.target !== "floor-toggle" || floorCount > 1
  );
}
