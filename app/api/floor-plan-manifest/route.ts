import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { DEFAULT_FLOOR_PLAN_MANIFEST_URL } from "@/lib/floor-plan-manifest";

export const dynamic = "force-dynamic";

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

/**
 * Serves the filtered Google Sheet floor-plan list when available.
 * Fetched server-side so school/corporate filters that block docs.google.com
 * in the browser do not prevent the dropdown from updating.
 */
export async function GET() {
  const liveCsv = await fetchLiveSheetCsv();
  if (liveCsv) {
    return new NextResponse(liveCsv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "X-Manifest-Source": "google-sheet",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  }

  const localCsv = await readLocalManifestCsv();
  return new NextResponse(localCsv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "X-Manifest-Source": "local-fallback",
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
    },
  });
}
