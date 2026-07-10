"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computeCategoryScoresFromResponses,
  computeSectionAverage,
  type DistrictAnalytics,
} from "@/lib/submission-analytics";
import type { SurveyData } from "@/lib/survey-data";
import { isRatingScored } from "@/lib/survey-data";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface AdminComparisonChartsProps {
  analytics: DistrictAnalytics | null;
  reportData: SurveyData | null;
  selectedSchool: string;
  selectedSubmissionId: string;
}

function scoreTone(score: number): string {
  if (score >= 4) return "text-green-600";
  if (score >= 3) return "text-yellow-600";
  if (score >= 2) return "text-orange-600";
  return "text-red-600";
}

function ComparisonBar({
  label,
  value,
  max = 5,
  highlight = false,
  reference,
}: {
  label: string;
  value: number;
  max?: number;
  highlight?: boolean;
  reference?: number;
}) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  const referenceWidth =
    reference !== undefined
      ? Math.max(0, Math.min(100, (reference / max) * 100))
      : undefined;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className={`shrink-0 font-semibold ${scoreTone(value)}`}>
          {value.toFixed(1)}
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
        {referenceWidth !== undefined && (
          <div
            className="absolute inset-y-0 w-0.5 bg-foreground/35"
            style={{ left: `${referenceWidth}%` }}
            title={`District avg ${reference.toFixed(1)}`}
          />
        )}
        <div
          className={`h-full rounded-full transition-all ${
            highlight ? "bg-primary" : "bg-primary/45"
          }`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.05) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        Even with district
      </span>
    );
  }

  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <TrendingUp className="h-3 w-3" />
        +{delta.toFixed(1)} vs district
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
      <TrendingDown className="h-3 w-3" />
      {delta.toFixed(1)} vs district
    </span>
  );
}

export function AdminComparisonCharts({
  analytics,
  reportData,
  selectedSchool,
  selectedSubmissionId,
}: AdminComparisonChartsProps) {
  const selectedScores = useMemo(() => {
    if (!reportData) return new Map<string, number>();
    return new Map(
      computeCategoryScoresFromResponses(reportData.responses).map((entry) => [
        `${entry.section}::${entry.category}`,
        entry.avgScore,
      ])
    );
  }, [reportData]);

  const selectedEsa = reportData
    ? computeSectionAverage(reportData.responses, "Educational Suitability")
    : 0;
  const selectedFca = reportData
    ? computeSectionAverage(reportData.responses, "Facility Condition")
    : 0;

  const esaCategories = useMemo(() => {
    if (!analytics) return [];
    return analytics.categoryAverages
      .filter((entry) => entry.section === "Educational Suitability")
      .map((entry) => {
        const key = `${entry.section}::${entry.category}`;
        const selected = selectedScores.get(key) ?? 0;
        return {
          ...entry,
          selected,
          delta: selected > 0 ? selected - entry.districtAvg : 0,
        };
      })
      .filter((entry) => entry.selected > 0 || entry.districtAvg > 0);
  }, [analytics, selectedScores]);

  const fcaCategories = useMemo(() => {
    if (!analytics) return [];
    const grouped = new Map<string, { ratings: number[]; districtRatings: number[] }>();

    for (const entry of analytics.categoryAverages.filter(
      (item) => item.section === "Facility Condition"
    )) {
      const bucket = grouped.get(entry.category) ?? {
        ratings: [],
        districtRatings: [],
      };
      bucket.districtRatings.push(entry.districtAvg);
      grouped.set(entry.category, bucket);
    }

    if (reportData) {
      for (const entry of computeCategoryScoresFromResponses(reportData.responses)) {
        if (entry.section !== "Facility Condition") continue;
        const bucket = grouped.get(entry.category) ?? {
          ratings: [],
          districtRatings: [],
        };
        bucket.ratings.push(entry.avgScore);
        grouped.set(entry.category, bucket);
      }
    }

    return Array.from(grouped.entries())
      .map(([category, bucket]) => {
        const districtAvg =
          bucket.districtRatings.reduce((sum, value) => sum + value, 0) /
          Math.max(bucket.districtRatings.length, 1);
        const selected =
          bucket.ratings.reduce((sum, value) => sum + value, 0) /
          Math.max(bucket.ratings.length, 1);
        return {
          category,
          districtAvg: Number(districtAvg.toFixed(2)),
          selected: bucket.ratings.length > 0 ? Number(selected.toFixed(2)) : 0,
          delta:
            bucket.ratings.length > 0
              ? Number((selected - districtAvg).toFixed(2))
              : 0,
        };
      })
      .filter((entry) => entry.selected > 0 || entry.districtAvg > 0)
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [analytics, reportData]);

  const currentSubmissionScore = useMemo(() => {
    const fromAnalytics = analytics?.submissionScores.find(
      (item) => item.id === selectedSubmissionId
    )?.overallAvgScore;
    if (typeof fromAnalytics === "number" && fromAnalytics > 0) {
      return fromAnalytics;
    }
    if (!reportData) return 0;
    const scored = reportData.responses.filter((response) =>
      isRatingScored(response.rating)
    );
    if (scored.length === 0) return 0;
    return (
      Math.round(
        (scored.reduce((sum, response) => sum + response.rating, 0) /
          scored.length) *
          100
      ) / 100
    );
  }, [analytics, reportData, selectedSubmissionId]);

  if (!analytics || analytics.submissionCount === 0) {
    return null;
  }

  const overallDelta = currentSubmissionScore - analytics.districtOverallAvg;
  const selectedSchoolSummary = analytics.schoolScores.find(
    (item) => item.school === selectedSchool
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">District Comparison</h2>
        <p className="text-sm text-muted-foreground">
          Based on {analytics.submissionCount} submission
          {analytics.submissionCount === 1 ? "" : "s"} across{" "}
          {analytics.schoolScores.length} school
          {analytics.schoolScores.length === 1 ? "" : "s"}. Vertical ticks mark district
          averages.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Selected Submission
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${scoreTone(currentSubmissionScore)}`}>
              {currentSubmissionScore > 0 ? currentSubmissionScore.toFixed(1) : "—"}
            </p>
            <div className="mt-2">
              <DeltaBadge delta={overallDelta} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              District Average
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${scoreTone(analytics.districtOverallAvg)}`}>
              {analytics.districtOverallAvg.toFixed(1)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              ESA {analytics.districtEsaAvg.toFixed(1)} · FCA{" "}
              {analytics.districtFcaAvg.toFixed(1)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {selectedSchool || "School"} Average
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-3xl font-bold ${
                selectedSchoolSummary
                  ? scoreTone(selectedSchoolSummary.avgScore)
                  : "text-muted-foreground"
              }`}
            >
              {selectedSchoolSummary
                ? selectedSchoolSummary.avgScore.toFixed(1)
                : "—"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {selectedSchoolSummary
                ? `${selectedSchoolSummary.submissionCount} submission${
                    selectedSchoolSummary.submissionCount === 1 ? "" : "s"
                  } at this school`
                : "No scored submissions for this school yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Schools vs District Average</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ComparisonBar
              label="District average"
              value={analytics.districtOverallAvg}
              highlight={false}
            />
            {analytics.schoolScores.map((school) => (
              <ComparisonBar
                key={school.school}
                label={school.school}
                value={school.avgScore}
                highlight={school.school === selectedSchool}
                reference={analytics.districtOverallAvg}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Section Scores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Educational Suitability
              </p>
              <ComparisonBar
                label="This submission"
                value={selectedEsa}
                highlight
                reference={analytics.districtEsaAvg}
              />
              <div className="mt-2">
                <ComparisonBar
                  label="District average"
                  value={analytics.districtEsaAvg}
                />
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Facility Condition (FCA)
              </p>
              <ComparisonBar
                label="This submission"
                value={selectedFca}
                highlight
                reference={analytics.districtFcaAvg}
              />
              <div className="mt-2">
                <ComparisonBar
                  label="District average"
                  value={analytics.districtFcaAvg}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Educational Suitability Categories
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[28rem] space-y-4 overflow-y-auto pr-1">
            {esaCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No category data yet.</p>
            ) : (
              esaCategories.map((entry) => (
                <ComparisonBar
                  key={entry.category}
                  label={entry.category}
                  value={entry.selected > 0 ? entry.selected : entry.districtAvg}
                  highlight={entry.selected > 0}
                  reference={entry.districtAvg}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">FCA Categories</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[28rem] space-y-4 overflow-y-auto pr-1">
            {fcaCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No FCA category data yet.</p>
            ) : (
              fcaCategories.map((entry) => (
                <ComparisonBar
                  key={entry.category}
                  label={entry.category}
                  value={entry.selected > 0 ? entry.selected : entry.districtAvg}
                  highlight={entry.selected > 0}
                  reference={entry.districtAvg}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
