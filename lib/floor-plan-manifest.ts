import { getSchoolByName } from "@/lib/schools-data";

/** Live Google Sheet (published CSV) — updated as floor plans are uploaded to Supabase. */
export const DEFAULT_FLOOR_PLAN_MANIFEST_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTGFUvsaGfYsp9TK7ZjHT8_ZHaUq4xqxiPSedQC9XeGpmY5QCS2rkcyGuZJm517sB4RWRsNqhmxFaW_/pub?output=csv";

/** Offline fallback when the live sheet cannot be fetched. */
export const FLOOR_PLAN_MANIFEST_PATH = "/aisd-floor-plan-manifest.csv";

export const FLOOR_LEVELS = [
  { id: "basement", column: "Basement", shortLabel: "B", fullLabel: "Basement" },
  { id: "floor-1", column: "Floor 1", shortLabel: "L1", fullLabel: "Floor 1" },
  { id: "floor-2", column: "Floor 2", shortLabel: "L2", fullLabel: "Floor 2" },
  { id: "floor-3", column: "Floor 3", shortLabel: "L3", fullLabel: "Floor 3" },
  { id: "floor-4", column: "Floor 4", shortLabel: "L4", fullLabel: "Floor 4" },
  { id: "floor-5", column: "Floor 5", shortLabel: "L5", fullLabel: "Floor 5" },
  {
    id: "mezzanine",
    column: "Mezzanine",
    shortLabel: "M",
    fullLabel: "Mezzanine",
  },
] as const;

export type FloorLevelId = (typeof FLOOR_LEVELS)[number]["id"];

export interface FloorPlanLevel {
  id: FloorLevelId;
  shortLabel: string;
  fullLabel: string;
  filename: string;
}

export interface FloorPlanManifestRow {
  schoolName: string;
  schoolLevel: string;
  classCode: string;
  campusId: string;
  floors: Partial<Record<FloorLevelId, string>>;
}

let manifestCache: FloorPlanManifestRow[] | null = null;
let manifestLoadPromise: Promise<FloorPlanManifestRow[]> | null = null;
let manifestLoadedSuccessfully = false;

function getManifestUrl(): string {
  return (
    process.env.NEXT_PUBLIC_FLOOR_PLAN_MANIFEST_URL ??
    DEFAULT_FLOOR_PLAN_MANIFEST_URL
  );
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

function parseManifestCsv(csvText: string): FloorPlanManifestRow[] {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const schoolNameIndex = headers.indexOf("school_name");
  if (schoolNameIndex === -1) return [];

  const schoolLevelIndex = headers.indexOf("school_level");
  const classCodeIndex = headers.indexOf("class_code");
  const campusIdIndex = headers.indexOf("campus_id");
  const floorColumnIndexes = FLOOR_LEVELS.map((level) => ({
    id: level.id,
    index: headers.indexOf(level.column),
  }));

  const rows: FloorPlanManifestRow[] = [];

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const schoolName = cells[schoolNameIndex]?.trim();
    if (!schoolName) continue;

    const floors: Partial<Record<FloorLevelId, string>> = {};
    for (const { id, index } of floorColumnIndexes) {
      if (index === -1) continue;
      const filename = cells[index]?.trim();
      if (filename) floors[id] = filename;
    }

    rows.push({
      schoolName,
      schoolLevel:
        schoolLevelIndex === -1 ? "" : cells[schoolLevelIndex]?.trim() ?? "",
      classCode: classCodeIndex === -1 ? "" : cells[classCodeIndex]?.trim() ?? "",
      campusId: campusIdIndex === -1 ? "" : cells[campusIdIndex]?.trim() ?? "",
      floors,
    });
  }

  return rows;
}

async function fetchManifestCsv(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export async function loadFloorPlanManifest(
  forceReload = false
): Promise<FloorPlanManifestRow[]> {
  if (manifestCache && !forceReload) return manifestCache;
  if (manifestLoadPromise && !forceReload) return manifestLoadPromise;

  manifestLoadPromise = (async () => {
    try {
      const liveCsv = await fetchManifestCsv(getManifestUrl());
      if (liveCsv) {
        const liveRows = parseManifestCsv(liveCsv);
        if (liveRows.length > 0) {
          manifestCache = liveRows;
          manifestLoadedSuccessfully = true;
          return manifestCache;
        }
      }

      const localCsv = await fetchManifestCsv(FLOOR_PLAN_MANIFEST_PATH);
      if (localCsv) {
        const localRows = parseManifestCsv(localCsv);
        if (localRows.length > 0) {
          manifestCache = localRows;
          manifestLoadedSuccessfully = true;
          return manifestCache;
        }
      }

      manifestCache = [];
      manifestLoadedSuccessfully = false;
      return manifestCache;
    } catch {
      manifestCache = [];
      manifestLoadedSuccessfully = false;
      return manifestCache;
    } finally {
      manifestLoadPromise = null;
    }
  })();

  return manifestLoadPromise;
}

export function getManifestRowForSchool(
  manifest: FloorPlanManifestRow[],
  buildingName: string
): FloorPlanManifestRow | undefined {
  return manifest.find((row) => row.schoolName === buildingName);
}

export function rowHasFloorPlans(row: FloorPlanManifestRow): boolean {
  return FLOOR_LEVELS.some((level) => Boolean(row.floors[level.id]?.trim()));
}

export function getSchoolsWithFloorPlans(
  manifest: FloorPlanManifestRow[]
): Set<string> {
  const schools = new Set<string>();
  for (const row of manifest) {
    if (rowHasFloorPlans(row)) schools.add(row.schoolName);
  }
  return schools;
}

/** Schools with at least one filename in the live manifest. Null if manifest unavailable. */
export async function loadSchoolsWithFloorPlans(): Promise<Set<string> | null> {
  const manifest = await loadFloorPlanManifest();
  if (!manifestLoadedSuccessfully || manifest.length === 0) return null;
  return getSchoolsWithFloorPlans(manifest);
}

export interface ManifestSchoolOption {
  name: string;
  hasFloorPlans: boolean;
}

/** Schools listed in the live manifest CSV, in sheet order. Null if manifest unavailable. */
export async function loadManifestSchoolOptions(): Promise<
  ManifestSchoolOption[] | null
> {
  const manifest = await loadFloorPlanManifest();
  if (!manifestLoadedSuccessfully || manifest.length === 0) return null;

  return manifest.map((row) => ({
    name: row.schoolName,
    hasFloorPlans: rowHasFloorPlans(row),
  }));
}

/** Default single-floor filename when manifest is unavailable. */
export function getDefaultFloorFilename(buildingName: string): string | null {
  const school = getSchoolByName(buildingName);
  if (!school) return null;
  return `${school.buildingName} ${school.planSuffix}.svg`;
}

export function getAvailableFloorsForSchool(
  buildingName: string,
  manifest: FloorPlanManifestRow[],
  options?: { allowDefaultFallback?: boolean }
): FloorPlanLevel[] {
  const row = getManifestRowForSchool(manifest, buildingName);
  const floors: FloorPlanLevel[] = [];

  if (row) {
    for (const level of FLOOR_LEVELS) {
      const filename = row.floors[level.id]?.trim();
      if (filename) {
        floors.push({
          id: level.id,
          shortLabel: level.shortLabel,
          fullLabel: level.fullLabel,
          filename,
        });
      }
    }
    return floors;
  }

  if (!options?.allowDefaultFallback) return floors;

  const fallbackFilename = getDefaultFloorFilename(buildingName);
  if (!fallbackFilename) return [];

  return [
    {
      id: "floor-1",
      shortLabel: "L1",
      fullLabel: "Floor 1",
      filename: fallbackFilename,
    },
  ];
}

export async function getAvailableFloors(
  buildingName: string
): Promise<FloorPlanLevel[]> {
  const manifest = await loadFloorPlanManifest();
  return getAvailableFloorsForSchool(buildingName, manifest, {
    allowDefaultFallback: !manifestLoadedSuccessfully || manifest.length === 0,
  });
}

export function getFloorLevelMeta(id: FloorLevelId) {
  return FLOOR_LEVELS.find((level) => level.id === id);
}
