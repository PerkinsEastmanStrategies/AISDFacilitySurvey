import { createEmptyResponses, type Annotation, type SurveyData } from "@/lib/survey-data";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ReportSummary } from "@/lib/submit-survey";

export interface SubmissionListItem {
  id: string;
  school: string;
  role: string;
  respondentName: string;
  email: string;
  submittedAt: string;
  reportSummary: ReportSummary | null;
}

interface DbSubmissionRow {
  id: string;
  school: string;
  role: string;
  respondent_name: string;
  email: string;
  submitted_at: string;
  report_summary: ReportSummary | null;
  school_description: string | null;
  unique_features: string | null;
  community_partners: string | null;
  raw_payload: Omit<SurveyData, "svgContent"> | null;
}

interface DbQuestionResponse {
  question_id: number;
  rating: number;
  explanation: string;
  ranking: string[] | null;
}

interface DbAnnotation {
  client_id: string | null;
  id: string;
  question_id: number;
  type: Annotation["type"];
  view: Annotation["view"];
  classification: Annotation["classification"];
  x: number;
  y: number;
  radius: number | null;
  points: Annotation["points"];
  comment: string;
  color: string;
  floor_key: string | null;
  room_key: string | null;
  room_label: string | null;
  rooms_in_shape: Annotation["roomsInShape"];
}

interface DbSpaceAssignmentRoom {
  program_space: string;
  room_key: string;
  room_label: string | null;
  x: number;
  y: number;
}

function emptyResponses() {
  return createEmptyResponses();
}

function mapSubmissionListItem(row: DbSubmissionRow): SubmissionListItem {
  return {
    id: row.id,
    school: row.school,
    role: row.role,
    respondentName: row.respondent_name,
    email: row.email,
    submittedAt: row.submitted_at,
    reportSummary: row.report_summary,
  };
}

export async function listSurveySubmissions(): Promise<SubmissionListItem[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("survey_submissions")
    .select(
      "id, school, role, respondent_name, email, submitted_at, report_summary"
    )
    .order("submitted_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data as DbSubmissionRow[]).map(mapSubmissionListItem);
}

export async function loadSurveySubmission(
  submissionId: string
): Promise<{ data: SurveyData; meta: SubmissionListItem }> {
  const supabase = getSupabaseAdmin();

  const { data: submission, error: submissionError } = await supabase
    .from("survey_submissions")
    .select("*")
    .eq("id", submissionId)
    .single();

  if (submissionError || !submission) {
    throw new Error(submissionError?.message ?? "Submission not found.");
  }

  const row = submission as DbSubmissionRow;
  const meta = mapSubmissionListItem(row);

  if (row.raw_payload) {
    return {
      meta,
      data: {
        ...row.raw_payload,
        svgContent: null,
      },
    };
  }

  const [
    { data: questionRows, error: questionError },
    { data: annotationRows, error: annotationError },
    { data: spaceRows, error: spaceError },
  ] = await Promise.all([
    supabase
      .from("question_responses")
      .select("question_id, rating, explanation, ranking")
      .eq("submission_id", submissionId),
    supabase.from("annotations").select("*").eq("submission_id", submissionId),
    supabase
      .from("space_assignment_rooms")
      .select("program_space, room_key, room_label, x, y")
      .eq("submission_id", submissionId),
  ]);

  if (questionError) throw new Error(questionError.message);
  if (annotationError) throw new Error(annotationError.message);
  if (spaceError) throw new Error(spaceError.message);

  const responses = emptyResponses();
  for (const response of (questionRows ?? []) as DbQuestionResponse[]) {
    const index = responses.findIndex(
      (entry) => entry.questionId === response.question_id
    );
    if (index >= 0) {
      responses[index] = {
        questionId: response.question_id,
        rating: response.rating,
        explanation: response.explanation ?? "",
        ranking: response.ranking ?? undefined,
      };
    }
  }

  const annotations: Annotation[] = ((annotationRows ?? []) as DbAnnotation[]).map(
    (annotation) => ({
      id: annotation.client_id ?? annotation.id,
      questionId: annotation.question_id,
      type: annotation.type,
      x: annotation.x,
      y: annotation.y,
      radius: annotation.radius ?? undefined,
      points: annotation.points ?? undefined,
      comment: annotation.comment ?? "",
      classification: annotation.classification,
      color: annotation.color ?? "",
      view: annotation.view ?? "floorplan",
      floorKey: annotation.floor_key ?? undefined,
      roomKey: annotation.room_key ?? undefined,
      roomLabel: annotation.room_label ?? undefined,
      roomsInShape: annotation.rooms_in_shape ?? undefined,
    })
  );

  const spaceAssignments: SurveyData["spaceAssignments"] = {};
  for (const space of (spaceRows ?? []) as DbSpaceAssignmentRoom[]) {
    if (!spaceAssignments[space.program_space]) {
      spaceAssignments[space.program_space] = [];
    }
    spaceAssignments[space.program_space].push({
      roomKey: space.room_key,
      roomLabel: space.room_label ?? undefined,
      x: space.x,
      y: space.y,
    });
  }

  return {
    meta,
    data: {
      school: row.school,
      role: row.role as SurveyData["role"],
      principalName: row.respondent_name,
      email: row.email,
      schoolDescription: row.school_description ?? "",
      uniqueFeatures: row.unique_features ?? "",
      specialEducation: row.community_partners ?? "",
      responses,
      annotations,
      svgContent: null,
      spaceAssignments,
    },
  };
}
