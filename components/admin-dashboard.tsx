"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminComparisonCharts } from "@/components/admin-comparison-charts";
import { ReportView } from "@/components/report-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SchoolMatrixRow } from "@/lib/admin-school-matrix";
import { ADMIN_KEY_HEADER, ADMIN_KEY_STORAGE } from "@/lib/admin-constants";
import type { SubmissionListItem } from "@/lib/load-submission";
import type { DistrictAnalytics } from "@/lib/submission-analytics";
import type { SurveyData } from "@/lib/survey-data";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Circle,
  Loader2,
  Lock,
  RefreshCw,
  Search,
} from "lucide-react";

type AdminView = "matrix" | "detail";

function formatSubmittedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function adminFetch(path: string, adminKey: string, init?: RequestInit) {
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      [ADMIN_KEY_HEADER]: adminKey,
    },
  });
}

function RoleStatusCell({
  count,
  latest,
}: {
  count: number;
  latest: SubmissionListItem | null;
}) {
  if (count <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Circle className="h-3.5 w-3.5" />
        None
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {count === 1 ? "1 response" : `${count} responses`}
      </span>
      {latest && (
        <span className="text-[10px] text-muted-foreground">
          Latest: {formatSubmittedAt(latest.submittedAt)}
        </span>
      )}
    </span>
  );
}

export function AdminDashboard() {
  const [adminKey, setAdminKey] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [view, setView] = useState<AdminView>("matrix");
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([]);
  const [schoolMatrix, setSchoolMatrix] = useState<SchoolMatrixRow[]>([]);
  const [manifestSource, setManifestSource] = useState<string>("");
  const [matrixFilter, setMatrixFilter] = useState("");
  const [coverageFilter, setCoverageFilter] = useState<
    "all" | "complete" | "partial" | "none"
  >("all");
  const [selectedSchool, setSelectedSchool] = useState("");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [reportData, setReportData] = useState<SurveyData | null>(null);
  const [activeMeta, setActiveMeta] = useState<SubmissionListItem | null>(null);
  const [analytics, setAnalytics] = useState<DistrictAnalytics | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(ADMIN_KEY_STORAGE);
    if (stored) {
      setAdminKey(stored);
      setIsAuthenticated(true);
    }
  }, []);

  const schools = useMemo(() => {
    if (schoolMatrix.length > 0) {
      return schoolMatrix.map((row) => row.school);
    }
    return Array.from(new Set(submissions.map((item) => item.school))).sort(
      (a, b) => a.localeCompare(b)
    );
  }, [schoolMatrix, submissions]);

  const schoolSubmissions = useMemo(
    () =>
      submissions.filter((item) =>
        selectedSchool ? item.school === selectedSchool : false
      ),
    [submissions, selectedSchool]
  );

  const filteredMatrix = useMemo(() => {
    const query = matrixFilter.trim().toLowerCase();
    return schoolMatrix.filter((row) => {
      if (query && !row.school.toLowerCase().includes(query)) return false;
      const hasLeader = row.schoolLeaderCount > 0;
      const hasOps = row.operationsCount > 0;
      if (coverageFilter === "complete") return hasLeader && hasOps;
      if (coverageFilter === "partial") return (hasLeader || hasOps) && !(hasLeader && hasOps);
      if (coverageFilter === "none") return !hasLeader && !hasOps;
      return true;
    });
  }, [coverageFilter, matrixFilter, schoolMatrix]);

  const coverageSummary = useMemo(() => {
    let complete = 0;
    let partial = 0;
    let none = 0;
    for (const row of schoolMatrix) {
      const hasLeader = row.schoolLeaderCount > 0;
      const hasOps = row.operationsCount > 0;
      if (hasLeader && hasOps) complete += 1;
      else if (hasLeader || hasOps) partial += 1;
      else none += 1;
    }
    return { complete, partial, none, total: schoolMatrix.length };
  }, [schoolMatrix]);

  const loadAnalytics = useCallback(async (key: string) => {
    try {
      const response = await adminFetch("/api/admin/analytics", key);
      const result = (await response.json()) as DistrictAnalytics & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Failed to load analytics.");
      }
      setAnalytics(result);
    } catch (loadError) {
      console.error(loadError);
      setAnalytics(null);
    }
  }, []);

  const loadSubmissions = useCallback(async (key: string) => {
    setListLoading(true);
    setError(null);

    try {
      const response = await adminFetch("/api/admin/submissions", key);
      const result = (await response.json()) as {
        submissions?: SubmissionListItem[];
        schoolMatrix?: SchoolMatrixRow[];
        manifestSource?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to load submissions.");
      }

      setSubmissions(result.submissions ?? []);
      setSchoolMatrix(result.schoolMatrix ?? []);
      setManifestSource(result.manifestSource ?? "");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load submissions."
      );
      setSubmissions([]);
      setSchoolMatrix([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadReport = useCallback(async (submissionId: string, key: string) => {
    if (!submissionId) {
      setReportData(null);
      setActiveMeta(null);
      return;
    }

    setReportLoading(true);
    setError(null);

    try {
      const response = await adminFetch(
        `/api/admin/submissions/${submissionId}`,
        key
      );
      const result = (await response.json()) as {
        data?: SurveyData;
        meta?: SubmissionListItem;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to load submission report.");
      }

      setReportData(result.data ?? null);
      setActiveMeta(result.meta ?? null);
    } catch (loadError) {
      setReportData(null);
      setActiveMeta(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load submission report."
      );
    } finally {
      setReportLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !adminKey) return;
    loadSubmissions(adminKey);
    loadAnalytics(adminKey);
  }, [adminKey, isAuthenticated, loadAnalytics, loadSubmissions]);

  useEffect(() => {
    if (!isAuthenticated || !adminKey || view !== "detail") return;
    if (!selectedSubmissionId) {
      setReportData(null);
      setActiveMeta(null);
      return;
    }
    loadReport(selectedSubmissionId, adminKey);
  }, [
    adminKey,
    isAuthenticated,
    loadReport,
    selectedSubmissionId,
    view,
  ]);

  useEffect(() => {
    if (view !== "detail" || !selectedSchool) return;
    const stillValid = schoolSubmissions.some(
      (item) => item.id === selectedSubmissionId
    );
    if (!stillValid) {
      setSelectedSubmissionId(schoolSubmissions[0]?.id ?? "");
    }
  }, [schoolSubmissions, selectedSchool, selectedSubmissionId, view]);

  const openSchoolDetail = (
    school: string,
    preferredSubmissionId?: string
  ) => {
    const forSchool = submissions.filter((item) => item.school === school);
    setSelectedSchool(school);
    setSelectedSubmissionId(
      preferredSubmissionId ?? forSchool[0]?.id ?? ""
    );
    setView("detail");
  };

  const handleUnlock = async () => {
    const trimmed = draftKey.trim();
    if (!trimmed) return;

    setError(null);
    setListLoading(true);

    try {
      const response = await adminFetch("/api/admin/submissions", trimmed);
      if (!response.ok) {
        throw new Error("Invalid admin access key.");
      }

      sessionStorage.setItem(ADMIN_KEY_STORAGE, trimmed);
      setAdminKey(trimmed);
      setIsAuthenticated(true);
      setDraftKey("");
    } catch (unlockError) {
      setError(
        unlockError instanceof Error
          ? unlockError.message
          : "Invalid admin access key."
      );
    } finally {
      setListLoading(false);
    }
  };

  const handleSignOut = () => {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey("");
    setIsAuthenticated(false);
    setView("matrix");
    setSubmissions([]);
    setSchoolMatrix([]);
    setSelectedSchool("");
    setSelectedSubmissionId("");
    setReportData(null);
    setActiveMeta(null);
    setAnalytics(null);
    setError(null);
  };

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Admin Access
              </h1>
              <p className="text-sm text-muted-foreground">
                Enter the admin key to review submitted assessments.
              </p>
            </div>
          </div>
          <Input
            type="password"
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
            placeholder="Admin access key"
            onKeyDown={(event) => {
              if (event.key === "Enter") handleUnlock();
            }}
          />
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          <Button
            className="mt-4 w-full"
            onClick={handleUnlock}
            disabled={listLoading}
          >
            {listLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking…
              </>
            ) : (
              "Continue"
            )}
          </Button>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link href="/" className="underline underline-offset-2">
              Back to survey
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end gap-4 p-4">
          <div className="min-w-[12rem] flex-1">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
              <Building2 className="h-4 w-4 text-primary" />
              {view === "matrix" ? "School Coverage" : "Submission Review"}
            </div>
            <p className="text-xs text-muted-foreground">
              {view === "matrix"
                ? `${coverageSummary.total} schools · ${submissions.length} submission${
                    submissions.length === 1 ? "" : "s"
                  }${
                    manifestSource
                      ? ` · list from ${
                          manifestSource === "google-sheet"
                            ? "Google Sheet"
                            : "local CSV"
                        }`
                      : ""
                  }`
                : `${submissions.length} submission${
                    submissions.length === 1 ? "" : "s"
                  } total`}
            </p>
          </div>

          {view === "detail" && (
            <>
              <div className="w-full min-w-[12rem] sm:w-56">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  School
                </label>
                <Select
                  value={selectedSchool || null}
                  onValueChange={(value) => {
                    if (!value) return;
                    openSchoolDetail(value);
                  }}
                  disabled={listLoading || schools.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a school" />
                  </SelectTrigger>
                  <SelectContent>
                    {schools.map((school) => (
                      <SelectItem key={school} value={school}>
                        {school}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full min-w-[16rem] sm:w-72">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Submission
                </label>
                <Select
                  value={selectedSubmissionId || null}
                  onValueChange={(value) => {
                    if (value) setSelectedSubmissionId(value);
                  }}
                  disabled={listLoading || schoolSubmissions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a submission" />
                  </SelectTrigger>
                  <SelectContent>
                    {schoolSubmissions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.role === "school_leader"
                          ? "School Leader"
                          : item.role === "operations"
                            ? "Operations"
                            : item.role}{" "}
                        · {formatSubmittedAt(item.submittedAt)} ·{" "}
                        {item.respondentName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="flex flex-wrap gap-2">
            {view === "detail" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setView("matrix");
                  setReportData(null);
                  setActiveMeta(null);
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                All schools
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadSubmissions(adminKey);
                loadAnalytics(adminKey);
              }}
              disabled={listLoading}
            >
              {listLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
            <Button variant="ghost" size="sm" render={<Link href="/" />}>
              Survey
            </Button>
          </div>
        </div>

        {view === "detail" && activeMeta && (
          <div className="mx-auto max-w-7xl px-4 pb-4">
            <div className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {activeMeta.respondentName}
              </span>
              {" · "}
              {activeMeta.role === "school_leader"
                ? "School Leader"
                : activeMeta.role === "operations"
                  ? "Operations Staff"
                  : activeMeta.role}
              {" · "}
              {activeMeta.email}
              {" · "}
              Submitted {formatSubmittedAt(activeMeta.submittedAt)}
              {activeMeta.reportSummary && (
                <>
                  {" · "}
                  Score {activeMeta.reportSummary.overallAvgScore.toFixed(1)}
                  {" · "}
                  {activeMeta.reportSummary.annotationCount} annotations
                </>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mx-auto max-w-7xl px-4 pb-4">
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          </div>
        )}
      </div>

      {view === "matrix" ? (
        <div className="mx-auto max-w-7xl space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Both roles
              </p>
              <p className="mt-1 text-2xl font-semibold text-emerald-700">
                {coverageSummary.complete}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Partial
              </p>
              <p className="mt-1 text-2xl font-semibold text-amber-700">
                {coverageSummary.partial}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                No responses
              </p>
              <p className="mt-1 text-2xl font-semibold text-muted-foreground">
                {coverageSummary.none}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={matrixFilter}
                onChange={(event) => setMatrixFilter(event.target.value)}
                placeholder="Search schools…"
                className="pl-8"
              />
            </div>
            <Select
              value={coverageFilter}
              onValueChange={(value) => {
                if (
                  value === "all" ||
                  value === "complete" ||
                  value === "partial" ||
                  value === "none"
                ) {
                  setCoverageFilter(value);
                }
              }}
            >
              <SelectTrigger className="w-[11rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All schools</SelectItem>
                <SelectItem value="complete">Both roles</SelectItem>
                <SelectItem value="partial">Partial only</SelectItem>
                <SelectItem value="none">No responses</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
            {listLoading && schoolMatrix.length === 0 ? (
              <div className="flex min-h-[40vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary/70" />
              </div>
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium">School</th>
                      <th className="px-4 py-3 font-medium">Level</th>
                      <th className="px-4 py-3 font-medium">School Leader</th>
                      <th className="px-4 py-3 font-medium">Operations</th>
                      <th className="px-4 py-3 font-medium">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMatrix.map((row) => {
                      const hasAny =
                        row.schoolLeaderCount > 0 || row.operationsCount > 0;
                      return (
                        <tr
                          key={row.school}
                          className="border-b border-border/50 hover:bg-muted/30"
                        >
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className="text-left font-medium text-foreground hover:underline"
                              onClick={() => openSchoolDetail(row.school)}
                            >
                              {row.school}
                            </button>
                            {!row.hasFloorPlans && (
                              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                No floor plan uploaded yet
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {row.schoolLevel || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <RoleStatusCell
                              count={row.schoolLeaderCount}
                              latest={row.latestSchoolLeader}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <RoleStatusCell
                              count={row.operationsCount}
                              latest={row.latestOperations}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {row.latestSchoolLeader && (
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={() =>
                                    openSchoolDetail(
                                      row.school,
                                      row.latestSchoolLeader!.id
                                    )
                                  }
                                >
                                  Leader
                                </Button>
                              )}
                              {row.latestOperations && (
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={() =>
                                    openSchoolDetail(
                                      row.school,
                                      row.latestOperations!.id
                                    )
                                  }
                                >
                                  Ops
                                </Button>
                              )}
                              {!hasAny && (
                                <span className="text-xs text-muted-foreground">
                                  —
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredMatrix.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-12 text-center text-muted-foreground"
                        >
                          No schools match this filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <AdminComparisonCharts
            analytics={analytics}
            reportData={reportData}
            selectedSchool={selectedSchool}
            selectedSubmissionId={selectedSubmissionId}
          />

          {reportLoading ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary/70" />
            </div>
          ) : reportData ? (
            <ReportView
              data={reportData}
              readOnly
              submissionMeta={
                activeMeta
                  ? {
                      id: activeMeta.id,
                      submittedAt: activeMeta.submittedAt,
                      respondentName: activeMeta.respondentName,
                      email: activeMeta.email,
                    }
                  : undefined
              }
            />
          ) : (
            <div className="flex min-h-[40vh] items-center justify-center p-8 text-center text-muted-foreground">
              {schoolSubmissions.length === 0
                ? "No submissions yet for this school."
                : "Select a submission to view the report."}
            </div>
          )}
        </>
      )}
    </div>
  );
}
