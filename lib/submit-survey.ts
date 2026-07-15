import {
  isRatingAnswered,
  isRatingScored,
  SURVEY_QUESTIONS,
  type Annotation,
  type QuestionResponse,
  type SurveyData,
  type SurveyRole,
} from "@/lib/survey-data";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type SurveySubmissionPayload = Omit<SurveyData, "svgContent">;

export interface ReportSummary {
  overallAvgScore: number;
  strengthCount: number;
  weaknessCount: number;
  annotationCount: number;
  topQuestions: Array<{
    questionId: number;
    category: string;
    rating: number;
  }>;
  bottomQuestions: Array<{
    questionId: number;
    category: string;
    rating: number;
  }>;
}

export interface SubmitSurveyResult {
  submissionId: string;
}

function getQuestionCategory(questionId: number): string {
  return (
    SURVEY_QUESTIONS.find((question) => question.id === questionId)?.category ??
    `Question ${questionId}`
  );
}

export function buildReportSummary(
  payload: SurveySubmissionPayload
): ReportSummary {
  const scoredResponses = payload.responses.filter((response) =>
    isRatingScored(response.rating)
  );

  const overallAvgScore =
    scoredResponses.length > 0
      ? scoredResponses.reduce((sum, response) => sum + response.rating, 0) /
        scoredResponses.length
      : 0;

  const strengthCount = payload.annotations.filter(
    (annotation) => annotation.classification === "strength"
  ).length;

  const weaknessCount = payload.annotations.filter(
    (annotation) => annotation.classification === "weakness"
  ).length;

  const toQuestionSummary = (response: QuestionResponse) => ({
    questionId: response.questionId,
    category: getQuestionCategory(response.questionId),
    rating: response.rating,
  });

  const topQuestions = [...scoredResponses]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3)
    .map(toQuestionSummary);

  const bottomQuestions = [...scoredResponses]
    .sort((a, b) => a.rating - b.rating)
    .slice(0, 3)
    .map(toQuestionSummary);

  return {
    overallAvgScore: Number(overallAvgScore.toFixed(2)),
    strengthCount,
    weaknessCount,
    annotationCount: payload.annotations.length,
    topQuestions,
    bottomQuestions,
  };
}

function responseHasContent(response: QuestionResponse): boolean {
  if (isRatingAnswered(response.rating)) return true;
  if (response.explanation.trim()) return true;
  if (response.ranking && response.ranking.length > 0) return true;
  return false;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validateSubmissionPayload(payload: SurveySubmissionPayload): string | null {
  if (!payload.school?.trim()) return "School is required.";
  if (payload.role !== "school_leader" && payload.role !== "operations") {
    return "Role is required.";
  }
  if (!payload.principalName?.trim()) return "Name is required.";
  if (!payload.positionTitle?.trim()) return "Position title is required.";
  if (!payload.email?.trim()) return "Email is required.";
  if (!isValidEmail(payload.email)) {
    return "A valid email address is required.";
  }
  if (!Array.isArray(payload.responses)) return "Responses are missing.";
  if (!Array.isArray(payload.annotations)) return "Annotations are missing.";
  if (!payload.spaceAssignments || typeof payload.spaceAssignments !== "object") {
    return "Space assignments are missing.";
  }
  return null;
}

function mapAnnotationRow(submissionId: string, annotation: Annotation) {
  return {
    submission_id: submissionId,
    client_id: annotation.id,
    question_id: annotation.questionId,
    type: annotation.type,
    view: annotation.view ?? "floorplan",
    classification: annotation.classification,
    x: annotation.x,
    y: annotation.y,
    radius: annotation.radius ?? null,
    points: annotation.points ?? null,
    comment: annotation.comment ?? "",
    color: annotation.color ?? "",
    floor_key: annotation.floorKey ?? null,
    room_key: annotation.roomKey ?? null,
    room_label: annotation.roomLabel ?? null,
    rooms_in_shape: annotation.roomsInShape ?? null,
  };
}

export async function submitSurveyToSupabase(
  payload: SurveySubmissionPayload
): Promise<SubmitSurveyResult> {
  const validationError = validateSubmissionPayload(payload);
  if (validationError) {
    throw new Error(validationError);
  }

  const supabase = getSupabaseAdmin();
  const reportSummary = buildReportSummary(payload);
  const rawPayload = {
    ...payload,
    svgContent: undefined,
  };

  const { data: submission, error: submissionError } = await supabase
    .from("survey_submissions")
    .insert({
      school: payload.school.trim(),
      role: payload.role as SurveyRole,
      respondent_name: payload.principalName.trim(),
      email: payload.email.trim(),
      position_title: payload.positionTitle?.trim() || null,
      school_description: payload.schoolDescription?.trim() || null,
      unique_features: payload.uniqueFeatures?.trim() || null,
      community_partners: payload.specialEducation?.trim() || null,
      report_summary: reportSummary,
      raw_payload: rawPayload,
    })
    .select("id")
    .single();

  if (submissionError || !submission) {
    throw new Error(submissionError?.message ?? "Failed to create submission.");
  }

  const submissionId = submission.id as string;

  try {
    const questionRows = payload.responses
      .filter(responseHasContent)
      .map((response) => ({
        submission_id: submissionId,
        question_id: response.questionId,
        rating: response.rating,
        explanation: response.explanation ?? "",
        ranking:
          response.ranking && response.ranking.length > 0
            ? response.ranking
            : null,
      }));

    if (questionRows.length > 0) {
      const { error } = await supabase
        .from("question_responses")
        .insert(questionRows);
      if (error) throw error;
    }

    if (payload.annotations.length > 0) {
      const { error } = await supabase
        .from("annotations")
        .insert(payload.annotations.map((a) => mapAnnotationRow(submissionId, a)));
      if (error) throw error;
    }

    const spaceRows = Object.entries(payload.spaceAssignments).flatMap(
      ([programSpace, entries]) =>
        (entries ?? []).map((entry) => ({
          submission_id: submissionId,
          program_space: programSpace,
          room_key: entry.roomKey,
          room_label: entry.roomLabel ?? null,
          x: entry.x,
          y: entry.y,
          floor_key: null,
        }))
    );

    if (spaceRows.length > 0) {
      const { error } = await supabase
        .from("space_assignment_rooms")
        .insert(spaceRows);
      if (error) throw error;
    }
  } catch (error) {
    await supabase.from("survey_submissions").delete().eq("id", submissionId);
    throw error instanceof Error
      ? error
      : new Error("Failed to save submission details.");
  }

  return { submissionId };
}
