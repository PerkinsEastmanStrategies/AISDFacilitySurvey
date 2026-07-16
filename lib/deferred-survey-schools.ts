/**
 * Popup notices from the Google Sheet `Popup up note` column.
 * Values of N/n (or empty) mean no popup. Other values show the Andrews-style
 * notice. Notes that ask the respondent to complete the survey are
 * informational only; all others block selection until another school is chosen.
 */

export interface DeferredSurveyNotice {
  title: string;
  note: string;
  /** When true, the school is cleared and the survey cannot continue for it. */
  blocksSurvey: boolean;
}

/** True when the sheet value should show a popup (anything other than blank/N/n). */
export function hasPopupNote(raw: string | null | undefined): boolean {
  const text = raw?.trim() ?? "";
  if (!text) return false;
  return !/^n$/i.test(text);
}

/**
 * Parse the sheet's multiline popup text into title + note body.
 * First line = title; remaining lines (after stripping a leading "Note:") = body.
 */
export function parsePopupNote(
  raw: string | null | undefined
): DeferredSurveyNotice | null {
  if (!hasPopupNote(raw)) return null;

  const text = raw!.trim();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const title = lines[0] ?? "Campus notice";
  const body = lines
    .slice(1)
    .join("\n\n")
    .replace(/^Note:\s*/i, "")
    .trim();

  // Phased modernization notes explicitly ask campuses to complete the survey.
  const blocksSurvey = !/please complete this survey/i.test(text);

  return {
    title,
    note: body || text,
    blocksSurvey,
  };
}

/** @deprecated Prefer parsePopupNote(school.popupNote) from the live sheet. */
export function getDeferredSurveyNotice(
  _schoolName: string
): DeferredSurveyNotice | null {
  return null;
}

export function isDeferredSurveySchool(_schoolName: string): boolean {
  return false;
}
