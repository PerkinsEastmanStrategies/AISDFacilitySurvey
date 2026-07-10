import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const geoPath = path.resolve(
  projectRoot,
  "../AISDSite/public/data/aisd-schools.geojson"
);
const schoolsDataPath = path.resolve(projectRoot, "lib/schools-data.ts");
const checklistPath = path.resolve(
  projectRoot,
  "public/aisd-floor-plan-upload-checklist.csv"
);
const lookupPath = path.resolve(projectRoot, "public/aisd-school-lookup.csv");
const manifestPath = path.resolve(
  projectRoot,
  "public/aisd-floor-plan-manifest.csv"
);

const FLOOR_COLUMNS = [
  "Basement",
  "Floor 1",
  "Floor 2",
  "Floor 3",
  "Floor 4",
  "Floor 5",
  "Mezzanine",
];

/** Live lookup sheet (canonical). Local CSVs are offline fallbacks only. */
const LIVE_MANIFEST_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTGFUvsaGfYsp9TK7ZjHT8_ZHaUq4xqxiPSedQC9XeGpmY5QCS2rkcyGuZJm517sB4RWRsNqhmxFaW_/pub?output=csv";

function classToLevel(cls) {
  switch (cls) {
    case "ELEM":
      return "Elementary School";
    case "MID":
      return "Middle School";
    case "HIGH":
      return "High School";
    case "ALT ED 1":
      return "Alternative Education";
    case "ATHLETIC":
      return "Athletic Facility";
    case "DISTRICT":
      return "District Facility";
    default:
      return cls;
  }
}

function classToPlanSuffix(cls) {
  switch (cls) {
    case "ELEM":
      return "ES";
    case "MID":
      return "MS";
    case "HIGH":
      return "HS";
    case "ALT ED 1":
      return "ALT";
    case "ATHLETIC":
      return "ATH";
    case "DISTRICT":
      return "DIST";
    default:
      return cls;
  }
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(filePath, headers, rows) {
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(",")),
  ].join("\n");

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `\uFEFF${csv}\n`, "utf8");
}

function getDropdownNames() {
  const source = fs.readFileSync(schoolsDataPath, "utf8");
  const rawBlock = source.match(
    /const RAW_FEATURES:[\s\S]*?\] = \[([\s\S]*?)\];/
  );
  if (!rawBlock) {
    throw new Error("Could not parse RAW_FEATURES from schools-data.ts");
  }

  return [...rawBlock[1].matchAll(/name: "([^"]+)"/g)]
    .map((match) => match[1])
    .sort((a, b) => a.localeCompare(b));
}

const dropdownNames = new Set(getDropdownNames());
const geo = JSON.parse(fs.readFileSync(geoPath, "utf8"));

const rows = geo.features
  .map((feature) => {
    const props = feature.properties;
    const [longitude, latitude] = feature.geometry.coordinates;
    const schoolName = props.NAME;
    const planSuffix = classToPlanSuffix(props.CLASS);
    const defaultFilename = `${schoolName} ${planSuffix}.svg`;

    return {
      school_name: schoolName,
      school_level: classToLevel(props.CLASS),
      class_code: props.CLASS,
      campus_id: props.CAMPUS_ID,
      address: props.ADDRESS,
      city: props.CITY,
      state: props.STATE,
      zip: props.ZIP,
      Basement: "",
      "Floor 1": defaultFilename,
      "Floor 2": "",
      "Floor 3": "",
      "Floor 4": "",
      "Floor 5": "",
      Mezzanine: "",
      uploaded: "",
      source_file: "",
      notes: "",
      longitude,
      latitude,
      in_survey_dropdown: dropdownNames.has(schoolName) ? "yes" : "no",
    };
  })
  .sort((a, b) => a.school_name.localeCompare(b.school_name));

const geoNames = new Set(rows.map((row) => row.school_name));
const onlyGeo = [...geoNames].filter((name) => !dropdownNames.has(name));
const onlyDropdown = [...dropdownNames].filter((name) => !geoNames.has(name));

if (onlyGeo.length || onlyDropdown.length) {
  console.warn("Dropdown / GeoJSON mismatch detected:");
  if (onlyGeo.length) console.warn("  In GeoJSON only:", onlyGeo.join(", "));
  if (onlyDropdown.length) {
    console.warn("  In dropdown only:", onlyDropdown.join(", "));
  }
} else {
  console.log("GeoJSON names match survey dropdown exactly.");
}

const manifestHeaders = [
  "school_name",
  "school_level",
  "class_code",
  "campus_id",
  ...FLOOR_COLUMNS,
];

const checklistHeaders = [
  "school_name",
  "school_level",
  "class_code",
  "campus_id",
  "address",
  "city",
  "state",
  "zip",
  ...FLOOR_COLUMNS,
  "uploaded",
  "source_file",
  "notes",
];

const lookupHeaders = [
  ...checklistHeaders,
  "longitude",
  "latitude",
  "in_survey_dropdown",
];

const manifestRows = rows.map(
  ({ school_name, school_level, class_code, campus_id, ...floorCells }) => ({
    school_name,
    school_level,
    class_code,
    campus_id,
    ...Object.fromEntries(
      FLOOR_COLUMNS.map((column) => [column, floorCells[column] ?? ""])
    ),
  })
);

writeCsv(manifestPath, manifestHeaders, manifestRows);
writeCsv(
  checklistPath,
  checklistHeaders,
  rows.map(({ longitude, latitude, in_survey_dropdown, ...rest }) => rest)
);
writeCsv(lookupPath, lookupHeaders, rows);

console.log(`Wrote ${rows.length} rows to ${manifestPath}`);
console.log(`Wrote ${rows.length} rows to ${checklistPath}`);
console.log(`Wrote ${rows.length} rows to ${lookupPath}`);
console.log(`Live manifest URL: ${LIVE_MANIFEST_URL}`);
