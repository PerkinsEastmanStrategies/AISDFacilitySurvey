/**
 * Schools that should not complete the survey yet (e.g. full modernization).
 * Keys are canonical `school_name` values from the floor-plan manifest.
 */
export interface DeferredSurveyNotice {
  title: string;
  note: string;
}

export const DEFERRED_SURVEY_SCHOOLS: Record<string, DeferredSurveyNotice> = {
  ANDREWS: {
    title: "Future Full Modernization",
    note: "This survey will be distributed after your full modernization project has been completed and the campus is occupying the new facility.",
  },
};

export function getDeferredSurveyNotice(
  schoolName: string
): DeferredSurveyNotice | null {
  return DEFERRED_SURVEY_SCHOOLS[schoolName] ?? null;
}

export function isDeferredSurveySchool(schoolName: string): boolean {
  return schoolName in DEFERRED_SURVEY_SCHOOLS;
}
