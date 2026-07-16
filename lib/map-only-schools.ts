/** Campuses that intentionally use the site map without loading a floor plan. */
const MAP_ONLY_SCHOOLS = new Set(["NOACK SPORTS"]);

export function isMapOnlySchool(schoolName: string): boolean {
  return MAP_ONLY_SCHOOLS.has(schoolName.trim().toUpperCase());
}
