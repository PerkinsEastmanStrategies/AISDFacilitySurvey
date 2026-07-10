import {
  isRatingScored,
  SURVEY_QUESTIONS,
  type QuestionResponse,
} from "@/lib/survey-data";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ReportSummary } from "@/lib/submit-survey";

export interface CategoryAverage {
  category: string;
  section: string;
  districtAvg: number;
  responseCount: number;
}

export interface SchoolScoreSummary {
  school: string;
  avgScore: number;
  submissionCount: number;
}

export interface SubmissionScorePoint {
  id: string;
  school: string;
  respondentName: string;
  submittedAt: string;
  overallAvgScore: number;
}

export interface DistrictAnalytics {
  submissionCount: number;
  districtOverallAvg: number;
  districtEsaAvg: number;
  districtFcaAvg: number;
  schoolScores: SchoolScoreSummary[];
  categoryAverages: CategoryAverage[];
  submissionScores: SubmissionScorePoint[];
}

interface DbQuestionResponse {
  question_id: number;
  rating: number;
}

interface DbSubmissionRow {
  id: string;
  school: string;
  respondent_name: string;
  submitted_at: string;
  report_summary: ReportSummary | null;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundScore(value: number): number {
  return Number(value.toFixed(2));
}

function getQuestionMeta(questionId: number) {
  return SURVEY_QUESTIONS.find((question) => question.id === questionId);
}

export function computeCategoryScoresFromResponses(
  responses: QuestionResponse[]
): Array<{ category: string; section: string; avgScore: number }> {
  const buckets = new Map<
    string,
    { category: string; section: string; ratings: number[] }
  >();

  for (const response of responses) {
    if (!isRatingScored(response.rating)) continue;
    const meta = getQuestionMeta(response.questionId);
    if (!meta || meta.type !== "rating") continue;

    const key = `${meta.section}::${meta.category}`;
    const bucket = buckets.get(key) ?? {
      category: meta.category,
      section: meta.section,
      ratings: [],
    };
    bucket.ratings.push(response.rating);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      category: bucket.category,
      section: bucket.section,
      avgScore: roundScore(average(bucket.ratings)),
    }))
    .sort((a, b) => {
      const sectionOrder =
        a.section === b.section
          ? 0
          : a.section === "Educational Suitability"
            ? -1
            : 1;
      if (sectionOrder !== 0) return sectionOrder;
      return a.category.localeCompare(b.category);
    });
}

export function computeSectionAverage(
  responses: QuestionResponse[],
  section: "Educational Suitability" | "Facility Condition"
): number {
  const ratings = responses
    .filter((response) => {
      if (!isRatingScored(response.rating)) return false;
      const meta = getQuestionMeta(response.questionId);
      return meta?.section === section && meta.type === "rating";
    })
    .map((response) => response.rating);

  return roundScore(average(ratings));
}

export async function getDistrictAnalytics(): Promise<DistrictAnalytics> {
  const supabase = getSupabaseAdmin();

  const [{ data: submissions, error: submissionsError }, { data: questionRows, error: questionsError }] =
    await Promise.all([
      supabase
        .from("survey_submissions")
        .select("id, school, respondent_name, submitted_at, report_summary")
        .order("submitted_at", { ascending: false }),
      supabase
        .from("question_responses")
        .select("question_id, rating")
        .gt("rating", 0),
    ]);

  if (submissionsError) throw new Error(submissionsError.message);
  if (questionsError) throw new Error(questionsError.message);

  const submissionList = (submissions ?? []) as DbSubmissionRow[];
  const responses = (questionRows ?? []) as DbQuestionResponse[];

  const overallScores = submissionList
    .map((row) => row.report_summary?.overallAvgScore)
    .filter((score): score is number => typeof score === "number" && score > 0);

  const districtOverallAvg = roundScore(average(overallScores));

  const esaRatings: number[] = [];
  const fcaRatings: number[] = [];
  const categoryBuckets = new Map<
    string,
    { category: string; section: string; ratings: number[] }
  >();

  for (const response of responses) {
    const meta = getQuestionMeta(response.question_id);
    if (!meta || meta.type !== "rating") continue;

    if (meta.section === "Educational Suitability") {
      esaRatings.push(response.rating);
    } else if (meta.section === "Facility Condition") {
      fcaRatings.push(response.rating);
    }

    const key = `${meta.section}::${meta.category}`;
    const bucket = categoryBuckets.get(key) ?? {
      category: meta.category,
      section: meta.section,
      ratings: [],
    };
    bucket.ratings.push(response.rating);
    categoryBuckets.set(key, bucket);
  }

  const schoolMap = new Map<string, { scores: number[]; count: number }>();
  for (const row of submissionList) {
    const score = row.report_summary?.overallAvgScore;
    if (typeof score !== "number" || score <= 0) continue;
    const bucket = schoolMap.get(row.school) ?? { scores: [], count: 0 };
    bucket.scores.push(score);
    bucket.count += 1;
    schoolMap.set(row.school, bucket);
  }

  const schoolScores = Array.from(schoolMap.entries())
    .map(([school, bucket]) => ({
      school,
      avgScore: roundScore(average(bucket.scores)),
      submissionCount: bucket.count,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  const categoryAverages = Array.from(categoryBuckets.values())
    .map((bucket) => ({
      category: bucket.category,
      section: bucket.section,
      districtAvg: roundScore(average(bucket.ratings)),
      responseCount: bucket.ratings.length,
    }))
    .sort((a, b) => {
      const sectionOrder =
        a.section === b.section
          ? 0
          : a.section === "Educational Suitability"
            ? -1
            : 1;
      if (sectionOrder !== 0) return sectionOrder;
      return a.category.localeCompare(b.category);
    });

  const submissionScores = submissionList
    .filter(
      (row) =>
        typeof row.report_summary?.overallAvgScore === "number" &&
        row.report_summary.overallAvgScore > 0
    )
    .map((row) => ({
      id: row.id,
      school: row.school,
      respondentName: row.respondent_name,
      submittedAt: row.submitted_at,
      overallAvgScore: row.report_summary!.overallAvgScore,
    }));

  return {
    submissionCount: submissionList.length,
    districtOverallAvg,
    districtEsaAvg: roundScore(average(esaRatings)),
    districtFcaAvg: roundScore(average(fcaRatings)),
    schoolScores,
    categoryAverages,
    submissionScores,
  };
}
