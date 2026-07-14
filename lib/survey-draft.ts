import type { SurveyData } from "@/lib/survey-data";

const STORAGE_KEY = "aisd-survey-draft-v1";

export type SurveyStep = "intro" | "questions" | "done";

export interface SurveyDraft {
  version: 1;
  step: SurveyStep;
  currentPanelIndex: number;
  rightView: "floorplan" | "map";
  activeFloorId: string;
  surveyData: Omit<SurveyData, "svgContent">;
}

function stripSvg(data: SurveyData): Omit<SurveyData, "svgContent"> {
  const { svgContent: _svg, ...rest } = data;
  return rest;
}

export function loadSurveyDraft(): SurveyDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SurveyDraft & { step?: string };
    if (parsed?.version !== 1 || !parsed.surveyData) return null;
    // Migrate older drafts that used the pre-submit report step.
    if (parsed.step === "report") {
      parsed.step = "questions";
    }
    if (parsed.step !== "intro" && parsed.step !== "questions" && parsed.step !== "done") {
      return null;
    }
    return parsed as SurveyDraft;
  } catch {
    return null;
  }
}

export function saveSurveyDraft(draft: {
  step: SurveyStep;
  currentPanelIndex: number;
  rightView: "floorplan" | "map";
  activeFloorId: string;
  surveyData: SurveyData;
}): void {
  if (typeof window === "undefined") return;
  try {
    const payload: SurveyDraft = {
      version: 1,
      step: draft.step,
      currentPanelIndex: draft.currentPanelIndex,
      rightView: draft.rightView,
      activeFloorId: draft.activeFloorId,
      surveyData: stripSvg(draft.surveyData),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota or private mode — ignore; draft is best-effort.
  }
}

export function clearSurveyDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
