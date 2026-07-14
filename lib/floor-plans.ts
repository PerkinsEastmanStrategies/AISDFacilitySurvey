import {
  getAvailableFloors,
  getDefaultFloorFilename,
  type FloorLevelId,
  type FloorPlanLevel,
} from "@/lib/floor-plan-manifest";
import { getSchoolByName } from "@/lib/schools-data";

export type { FloorLevelId, FloorPlanLevel };
export {
  FLOOR_LEVELS,
  FLOOR_PLAN_MANIFEST_PATH,
  DEFAULT_FLOOR_PLAN_MANIFEST_URL,
  getAvailableFloors,
  getAvailableFloorsForSchool,
  loadFloorPlanManifest,
} from "@/lib/floor-plan-manifest";

/**
 * Legacy default filename: `{BUILDING_NAME} {SUFFIX}.svg`
 * (e.g. `PILLOW ES.svg`). Used when manifest Floor 1 cell is empty.
 */
export function getFloorPlanFilename(buildingName: string): string | null {
  return getDefaultFloorFilename(buildingName);
}

export function getFloorPlanPublicPathForFilename(filename: string): string {
  return `/floor-plans/${encodeURIComponent(filename)}`;
}

/**
 * Lightweight mobile variant naming: `SCHOOL L1.svg` → `SCHOOL L1.mobile.svg`.
 * Desktop keeps the original filename from the manifest.
 */
export function toMobileFloorPlanFilename(filename: string): string {
  if (!filename) return filename;
  if (/\.mobile\.svg$/i.test(filename)) return filename;
  return filename.replace(/\.svg$/i, ".mobile.svg");
}

/** Local public URL path for a school's default floor plan SVG. */
export function getFloorPlanPublicPath(buildingName: string): string | null {
  const filename = getFloorPlanFilename(buildingName);
  if (!filename) return null;
  return getFloorPlanPublicPathForFilename(filename);
}

/** Supabase Storage public URL for a floor plan SVG filename. */
export function getSupabaseFloorPlanUrlForFilename(filename: string): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_FLOOR_PLANS_BUCKET;
  if (!supabaseUrl || !bucket || !filename) return null;

  const base = supabaseUrl.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${bucket}/${encodeURIComponent(filename)}`;
}

export function getSupabaseFloorPlanUrl(buildingName: string): string | null {
  const filename = getFloorPlanFilename(buildingName);
  if (!filename) return null;
  return getSupabaseFloorPlanUrlForFilename(filename);
}

const svgCache = new Map<string, string>();
const svgInflight = new Map<string, Promise<string | null>>();
/** Bump when floor-plan fetch rules change so stale Cache API entries are ignored. */
const FLOOR_PLAN_CACHE_NAME = "aisd-floor-plans-v3";

/**
 * True when an SVG includes architectural (or room-boundary) geometry — not
 * just floating CAFM labels. Used to reject incomplete `*.mobile.svg` exports
 * that would otherwise show room names with no walls.
 */
export function svgHasFloorPlanGeometry(svg: string): boolean {
  if (!svg) return false;
  if (/id\s*=\s*["']A-WALLS["']/i.test(svg)) return true;
  if (/id\s*=\s*["']CAFM_BLDG_OTLN["']/i.test(svg)) return true;
  if (/id\s*=\s*["']CAFM_SPACE["']/i.test(svg)) return true;
  if (/id\s*=\s*["']planWalls["']/i.test(svg)) return true;
  if (/id\s*=\s*["']planDetail["']/i.test(svg)) return true;
  return false;
}

async function openFloorPlanCache(): Promise<Cache | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;
  try {
    return await caches.open(FLOOR_PLAN_CACHE_NAME);
  } catch {
    return null;
  }
}

async function readCachedFloorPlan(url: string): Promise<string | null> {
  const cache = await openFloorPlanCache();
  if (!cache) return null;

  try {
    const response = await cache.match(url);
    if (!response?.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function writeCachedFloorPlan(url: string, svgText: string): Promise<void> {
  const cache = await openFloorPlanCache();
  if (!cache) return;

  try {
    await cache.put(
      url,
      new Response(svgText, {
        headers: { "Content-Type": "image/svg+xml" },
      })
    );
  } catch {
    // Quota exceeded or storage unavailable — memory cache still applies.
  }
}

async function fetchFloorPlanSvgFromSources(
  filename: string
): Promise<string | null> {
  const sources = [
    getSupabaseFloorPlanUrlForFilename(filename),
    getFloorPlanPublicPathForFilename(filename),
  ].filter((url): url is string => Boolean(url));

  for (const url of sources) {
    const cached = await readCachedFloorPlan(url);
    if (cached) return cached;
  }

  for (const url of sources) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      const text = await response.text();
      void writeCachedFloorPlan(url, text);
      return text;
    } catch {
      // Try the next source.
    }
  }

  return null;
}

export async function fetchFloorPlanSvgByFilename(
  filename: string,
  fallbackSvg?: string | null,
  _options?: { preferMobile?: boolean }
): Promise<string | null> {
  if (!filename) return fallbackSvg ?? null;

  // Always load the full (non-mobile) SVG — mobile variants are often labels-only.
  const candidate = filename;
  const cached = svgCache.get(candidate);
  if (cached) return cached;

  let inflight = svgInflight.get(candidate);
  if (!inflight) {
    inflight = fetchFloorPlanSvgFromSources(candidate).finally(() => {
      svgInflight.delete(candidate);
    });
    svgInflight.set(candidate, inflight);
  }

  const svg = await inflight;
  if (svg) {
    svgCache.set(candidate, svg);
    return svg;
  }

  return fallbackSvg ?? null;
}

/** Warm the cache for other floors without blocking the UI. */
export function prefetchFloorPlanSvgs(filenames: string[]): void {
  for (const filename of filenames) {
    if (!filename || svgCache.has(filename) || svgInflight.has(filename)) continue;
    void fetchFloorPlanSvgByFilename(filename);
  }
}

export async function fetchFloorPlanSvgForLevel(
  buildingName: string,
  floor: FloorPlanLevel,
  fallbackSvg?: string | null,
  options?: { preferMobile?: boolean }
): Promise<string | null> {
  if (!getSchoolByName(buildingName)) return fallbackSvg ?? null;
  return fetchFloorPlanSvgByFilename(floor.filename, fallbackSvg, options);
}

/** Load the default/first available floor for a school. */
export async function fetchFloorPlanSvg(
  buildingName: string,
  fallbackSvg?: string | null,
  options?: { preferMobile?: boolean }
): Promise<string | null> {
  const floors = await getAvailableFloors(buildingName);
  if (floors.length === 0) return fallbackSvg ?? null;
  return fetchFloorPlanSvgForLevel(buildingName, floors[0], fallbackSvg, options);
}

export async function fetchFloorPlanSvgForFloorId(
  buildingName: string,
  floorId: FloorLevelId,
  fallbackSvg?: string | null,
  options?: { preferMobile?: boolean }
): Promise<string | null> {
  const floors = await getAvailableFloors(buildingName);
  const floor = floors.find((entry) => entry.id === floorId) ?? floors[0];
  if (!floor) return fallbackSvg ?? null;
  return fetchFloorPlanSvgForLevel(buildingName, floor, fallbackSvg, options);
}
