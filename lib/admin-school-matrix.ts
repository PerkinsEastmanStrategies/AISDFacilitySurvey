import {
  loadManifestServer,
  toManifestSchoolOptions,
} from "@/lib/floor-plan-manifest-server";
import type { SubmissionListItem } from "@/lib/load-submission";

export interface SchoolMatrixRow {
  school: string;
  /** Friendly display name from sheet UpdatedName when available. */
  displayName: string;
  schoolLevel: string;
  hasFloorPlans: boolean;
  schoolLeaderCount: number;
  operationsCount: number;
  /** Most recent school-leader submission, if any. */
  latestSchoolLeader: SubmissionListItem | null;
  /** Most recent operations submission, if any. */
  latestOperations: SubmissionListItem | null;
}

/**
 * Build an admin coverage matrix: every school from the live floor-plan sheet
 * (filtered Google Sheet preferred) joined to current submissions by role.
 */
export async function buildSchoolMatrix(
  submissions: SubmissionListItem[]
): Promise<{ rows: SchoolMatrixRow[]; source: string }> {
  const manifest = await loadManifestServer();
  const options = toManifestSchoolOptions(manifest.rows);
  const levelBySchool = new Map(
    manifest.rows.map((row) => [row.schoolName, row.schoolLevel])
  );
  const labelBySchool = new Map(
    options.map((school) => [school.name, school.label])
  );

  const bySchool = new Map<string, SubmissionListItem[]>();
  for (const item of submissions) {
    const list = bySchool.get(item.school) ?? [];
    list.push(item);
    bySchool.set(item.school, list);
  }

  const sheetSchools = new Set(options.map((school) => school.name));

  // Include any submitted school not on the sheet so nothing is orphaned.
  const extraSchools = Array.from(bySchool.keys())
    .filter((name) => !sheetSchools.has(name))
    .sort((a, b) => a.localeCompare(b));

  const rows: SchoolMatrixRow[] = [
    ...options.map((school) => {
      const items = bySchool.get(school.name) ?? [];
      const leaders = items.filter((item) => item.role === "school_leader");
      const ops = items.filter((item) => item.role === "operations");
      return {
        school: school.name,
        displayName: school.label,
        schoolLevel: levelBySchool.get(school.name) ?? "",
        hasFloorPlans: school.hasFloorPlans,
        schoolLeaderCount: leaders.length,
        operationsCount: ops.length,
        latestSchoolLeader: leaders[0] ?? null,
        latestOperations: ops[0] ?? null,
      };
    }),
    ...extraSchools.map((name) => {
      const items = bySchool.get(name) ?? [];
      const leaders = items.filter((item) => item.role === "school_leader");
      const ops = items.filter((item) => item.role === "operations");
      return {
        school: name,
        displayName: labelBySchool.get(name) ?? name,
        schoolLevel: "",
        hasFloorPlans: false,
        schoolLeaderCount: leaders.length,
        operationsCount: ops.length,
        latestSchoolLeader: leaders[0] ?? null,
        latestOperations: ops[0] ?? null,
      };
    }),
  ].sort((a, b) =>
    (a.displayName || a.school).localeCompare(
      b.displayName || b.school,
      undefined,
      { sensitivity: "base" }
    )
  );

  return { rows, source: manifest.source };
}
