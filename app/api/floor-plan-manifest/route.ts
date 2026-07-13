import { NextResponse } from "next/server";
import { loadManifestServer } from "@/lib/floor-plan-manifest-server";

export const dynamic = "force-dynamic";

/**
 * Serves the filtered Google Sheet floor-plan list when available.
 * Fetched server-side so school/corporate filters that block docs.google.com
 * in the browser do not prevent the dropdown from updating.
 */
export async function GET() {
  const { csvText, source } = await loadManifestServer();
  return new NextResponse(csvText, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "X-Manifest-Source": source,
      // Avoid CDN/browser serving a stale local-fallback after a sheet failure.
      "Cache-Control": "no-store",
    },
  });
}
