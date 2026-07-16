import { readFile } from "fs/promises";
import path from "path";
import {
  DEFAULT_FLOOR_PLAN_MANIFEST_URL,
  getManifestSchoolDisplayLabel,
  parseManifestCsv,
  rowHasFloorPlans,
  type FloorPlanManifestRow,
  type ManifestSchoolOption,
} from "@/lib/floor-plan-manifest";

export type ManifestSource = "google-sheet" | "local-fallback";

export interface ServerManifestResult {
  rows: FloorPlanManifestRow[];
  source: ManifestSource;
  csvText: string;
}

function getLiveManifestUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_FLOOR_PLAN_MANIFEST_URL?.trim();
  return fromEnv || DEFAULT_FLOOR_PLAN_MANIFEST_URL;
}

async function fetchLiveSheetCsv(): Promise<string | null> {
  const liveUrl = getLiveManifestUrl();
  if (!liveUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(liveUrl, {
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
    if (!response.ok) return null;
    const text = await response.text();
    // Published Google sheets sometimes return an HTML interstitial.
    if (!text.includes("school_name")) return null;
    if (text.trim().split(/\r?\n/).length < 2) return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readLocalManifestCsv(): Promise<string> {
  const localPath = path.join(
    process.cwd(),
    "public",
    "aisd-floor-plan-manifest.csv"
  );
  return readFile(localPath, "utf-8");
}

/** Google Sheet first, bundled CSV only if the sheet cannot be fetched. */
export async function loadManifestServer(): Promise<ServerManifestResult> {
  const liveCsv = await fetchLiveSheetCsv();
  if (liveCsv) {
    return {
      csvText: liveCsv,
      rows: parseManifestCsv(liveCsv),
      source: "google-sheet",
    };
  }

  const localCsv = await readLocalManifestCsv();
  return {
    csvText: localCsv,
    rows: parseManifestCsv(localCsv),
    source: "local-fallback",
  };
}

export function toManifestSchoolOptions(
  rows: FloorPlanManifestRow[]
): ManifestSchoolOption[] {
  return rows
    .map((row) => ({
      name: row.schoolName,
      label: getManifestSchoolDisplayLabel(row),
      hasFloorPlans: rowHasFloorPlans(row),
      popupNote: row.popupNote,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}
