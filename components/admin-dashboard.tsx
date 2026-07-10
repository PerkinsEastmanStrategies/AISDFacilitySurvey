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
import { ADMIN_KEY_HEADER, ADMIN_KEY_STORAGE } from "@/lib/admin-constants";
import type { SubmissionListItem } from "@/lib/load-submission";
import type { DistrictAnalytics } from "@/lib/submission-analytics";
import type { SurveyData } from "@/lib/survey-data";
import { Building2, Loader2, Lock, RefreshCw } from "lucide-react";

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

export function AdminDashboard() {
  const [adminKey, setAdminKey] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([]);
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
    const unique = Array.from(new Set(submissions.map((item) => item.school)));
    return unique.sort((a, b) => a.localeCompare(b));
  }, [submissions]);

  const schoolSubmissions = useMemo(
    () =>
      submissions.filter((item) =>
        selectedSchool ? item.school === selectedSchool : false
      ),
    [submissions, selectedSchool]
  );

  const loadAnalytics = useCallback(async (key: string) => {
    try {
      const response = await adminFetch("/api/admin/analytics", key);
      const result = (await response.json()) as DistrictAnalytics & { error?: string };
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
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to load submissions.");
      }

      const items = result.submissions ?? [];
      setSubmissions(items);

      if (items.length > 0) {
        const firstSchool = Array.from(new Set(items.map((item) => item.school))).sort(
          (a, b) => a.localeCompare(b)
        )[0];
        setSelectedSchool(firstSchool);
        const firstForSchool = items.find((item) => item.school === firstSchool);
        if (firstForSchool) {
          setSelectedSubmissionId(firstForSchool.id);
        }
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load submissions."
      );
      setSubmissions([]);
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
      const response = await adminFetch(`/api/admin/submissions/${submissionId}`, key);
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
        loadError instanceof Error ? loadError.message : "Failed to load submission report."
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
    if (!isAuthenticated || !adminKey || !selectedSubmissionId) return;
    loadReport(selectedSubmissionId, adminKey);
  }, [adminKey, isAuthenticated, loadReport, selectedSubmissionId]);

  useEffect(() => {
    if (!selectedSchool) return;
    const stillValid = schoolSubmissions.some(
      (item) => item.id === selectedSubmissionId
    );
    if (!stillValid && schoolSubmissions[0]) {
      setSelectedSubmissionId(schoolSubmissions[0].id);
    }
  }, [schoolSubmissions, selectedSchool, selectedSubmissionId]);

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
        unlockError instanceof Error ? unlockError.message : "Invalid admin access key."
      );
    } finally {
      setListLoading(false);
    }
  };

  const handleSignOut = () => {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey("");
    setIsAuthenticated(false);
    setSubmissions([]);
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
              <h1 className="text-xl font-semibold text-foreground">Admin Access</h1>
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
          {error && (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          )}
          <Button className="mt-4 w-full" onClick={handleUnlock} disabled={listLoading}>
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
              Submission Review
            </div>
            <p className="text-xs text-muted-foreground">
              {submissions.length} submission{submissions.length === 1 ? "" : "s"} total
            </p>
          </div>

          <div className="w-full min-w-[12rem] sm:w-56">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              School
            </label>
            <Select
              value={selectedSchool}
              onValueChange={setSelectedSchool}
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
              value={selectedSubmissionId}
              onValueChange={setSelectedSubmissionId}
              disabled={listLoading || schoolSubmissions.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a submission" />
              </SelectTrigger>
              <SelectContent>
                {schoolSubmissions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {formatSubmittedAt(item.submittedAt)} · {item.respondentName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
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
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">Survey</Link>
            </Button>
          </div>
        </div>

        {activeMeta && (
          <div className="mx-auto max-w-7xl px-4 pb-4">
            <div className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{activeMeta.respondentName}</span>
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
          {submissions.length === 0
            ? "No submissions yet."
            : "Select a school and submission to view the report."}
        </div>
      )}
    </div>
  );
}
