import {
  applySvgViewBox,
  resolveSvgViewBox,
} from "@/lib/svg-utils";

// Program/specialty spaces that get assigned to a room on the floor plan
export const PROGRAM_SPACES = [
  "Maker Space",
  "Group Rooms",
  "Professional Learning Centers",
  "Sensory Motor Lab",
  "Vocational Lab/Life Skills",
  "Core Counseling",
  "Wellness Room (Brain Lab)",
  "Community Room",
  "Outdoor Studios",
] as const;

export type ProgramSpace = (typeof PROGRAM_SPACES)[number];

// A distinct color per program space for labels/markers on the floor plan
export const SPACE_COLORS: Record<string, string> = {
  "Maker Space": "hsl(220, 70%, 50%)",
  "Group Rooms": "hsl(160, 60%, 42%)",
  "Professional Learning Centers": "hsl(280, 55%, 52%)",
  "Sensory Motor Lab": "hsl(30, 85%, 50%)",
  "Vocational Lab/Life Skills": "hsl(340, 70%, 52%)",
  "Core Counseling": "hsl(200, 70%, 45%)",
  "Wellness Room (Brain Lab)": "hsl(45, 80%, 45%)",
  "Community Room": "hsl(180, 55%, 40%)",
  "Outdoor Studios": "hsl(120, 45%, 42%)",
};

export function getSpaceColor(space: string): string {
  return SPACE_COLORS[space] ?? "hsl(220, 70%, 50%)";
}

export interface RoomInfo {
  /** Room number / key from the SVG (data-k attribute), e.g. "200A" */
  key: string;
  /** Centroid X in SVG viewBox coordinates */
  x: number;
  /** Centroid Y in SVG viewBox coordinates */
  y: number;
  /** Polygon vertices in SVG coordinates, used for point-in-polygon hit testing */
  points: { x: number; y: number }[];
  /** Human-readable label (e.g. "Gym", "Library") parsed from the SVG text labels, if available */
  label?: string;
}

/**
 * Extract room numbers and their centroids from a floor plan SVG.
 *
 * Supports two formats:
 * - CAFM exports: `#CAFM_ID` (room labels) + `#CAFM_SPACE` (room boundaries)
 * - Legacy plans: `<polygon data-k="ROOM#">` inside `#planRooms`
 */
export function extractRoomsFromSvg(svgContent: string | null): RoomInfo[] {
  if (!svgContent || typeof window === "undefined") return [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    const svgElement = doc.querySelector("svg");
    if (!svgElement) return [];

    const mount = document.createElement("div");
    mount.style.cssText =
      "position:fixed;left:-10000px;top:0;width:2400px;height:2400px;overflow:hidden;visibility:hidden;pointer-events:none;";
    const clone = svgElement.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", "2400");
    clone.setAttribute("height", "2400");
    mount.appendChild(clone);
    document.body.appendChild(mount);

    try {
      const viewBox = resolveSvgViewBox(clone, svgContent.length);
      if (viewBox) {
        applySvgViewBox(clone, viewBox);
      }

      const cafmRooms = extractCafmRooms(clone);
      if (cafmRooms.length > 0) return cafmRooms;

      const genericRooms = extractGenericSvgRooms(clone);
      if (genericRooms.length > 0) return genericRooms;

      return extractLegacyRooms(clone);
    } finally {
      document.body.removeChild(mount);
    }
  } catch {
    return [];
  }
}

interface ParsedShape {
  element: SVGGraphicsElement;
  points: { x: number; y: number }[];
  bbox: DOMRect;
  area: number;
  centroid: { x: number; y: number };
}

/** CAFM floor plans: room numbers in #CAFM_ID, boundaries in #CAFM_SPACE. */
function extractCafmRooms(svgRoot: SVGSVGElement): RoomInfo[] {
  const cafmSpace = svgRoot.querySelector("#CAFM_SPACE");
  const cafmId = svgRoot.querySelector("#CAFM_ID");
  if (!cafmSpace || !cafmId) return [];

  const shapes = Array.from(
    cafmSpace.querySelectorAll("path, rect, polygon, polyline")
  ) as SVGGraphicsElement[];

  const shapeInfos: ParsedShape[] = shapes
    .map((el) => {
      const points = getGraphicsPolygonPoints(el);
      const bbox = el.getBBox();
      if (points.length === 0 || bbox.width <= 0 || bbox.height <= 0) return null;
      return {
        element: el,
        points,
        bbox,
        area: bbox.width * bbox.height,
        centroid: {
          x: bbox.x + bbox.width / 2,
          y: bbox.y + bbox.height / 2,
        },
      };
    })
    .filter((shape): shape is ParsedShape => shape !== null);

  if (shapeInfos.length === 0) return [];

  const regions = buildCafmSpaceRegions(svgRoot);
  if (regions.length > 0) {
    const rooms: RoomInfo[] = [];
    const seen = new Set<string>();

    for (const region of regions) {
      const resolved = resolveRegionLabels(
        region.labels,
        region.labels[0]?.x ?? 0,
        region.labels[0]?.y ?? 0
      );
      if (!resolved || seen.has(resolved.key)) continue;

      seen.add(resolved.key);
      rooms.push({
        key: resolved.key,
        x: resolved.x,
        y: resolved.y,
        points: region.points,
      });
    }

    rooms.sort((a, b) =>
      a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "base" })
    );
    return rooms;
  }

  const allLabels = getCafmLabels(svgRoot);
  const labelCandidates = allLabels.filter((label) => label.kind === "room");
  const tagLabels = allLabels.filter((label) => label.kind === "tag");

  if (labelCandidates.length === 0 && tagLabels.length === 0) return [];

  const roomsByKey = new Map<string, RoomInfo>();

  // Match each room-number label to the smallest CAFM_SPACE boundary containing it.
  for (const label of labelCandidates) {
    const matchingShapes = shapeInfos
      .filter((shape) => pointInBBox(label.x, label.y, shape.bbox))
      .sort((a, b) => a.area - b.area);

    if (matchingShapes.length === 0) continue;

    const shape = matchingShapes[0];
    const existing = roomsByKey.get(label.key);
    const candidate: RoomInfo = {
      key: label.key,
      x: label.x,
      y: label.y,
      points: shape.points,
    };

    if (!existing || polygonBBoxArea(existing.points) > shape.area) {
      roomsByKey.set(label.key, candidate);
    }
  }

  // Labels not inside any boundary bbox: attach to nearest small shape.
  for (const label of labelCandidates) {
    if (roomsByKey.has(label.key)) continue;

    const nearestShape = shapeInfos
      .map((shape) => ({
        shape,
        distance: distanceSquared(shape.centroid.x, shape.centroid.y, label.x, label.y),
      }))
      .sort((a, b) => a.distance - b.distance || a.shape.area - b.shape.area)[0]?.shape;

    if (!nearestShape) continue;

    roomsByKey.set(label.key, {
      key: label.key,
      x: label.x,
      y: label.y,
      points: nearestShape.points,
    });
  }

  const rooms = Array.from(roomsByKey.values());

  for (const tagLabel of tagLabels) {
    if (roomsByKey.has(tagLabel.key)) continue;

    const matchingShapes = shapeInfos
      .filter((shape) => pointInBBox(tagLabel.x, tagLabel.y, shape.bbox))
      .sort((a, b) => a.area - b.area);

    if (matchingShapes.length === 0) continue;

    rooms.push({
      key: tagLabel.key,
      x: tagLabel.x,
      y: tagLabel.y,
      points: matchingShapes[0].points,
    });
  }

  rooms.sort((a, b) =>
    a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "base" })
  );
  return rooms;
}

function getElementPointInSvgRoot(
  element: SVGGraphicsElement,
  svgRoot: SVGSVGElement,
  localX: number,
  localY: number
): { x: number; y: number } {
  const point = svgRoot.createSVGPoint();
  point.x = localX;
  point.y = localY;

  const elementCtm = element.getCTM();
  const rootCtm = svgRoot.getCTM();
  if (elementCtm && rootCtm) {
    const inRoot = point
      .matrixTransform(elementCtm)
      .matrixTransform(rootCtm.inverse());
    return { x: inRoot.x, y: inRoot.y };
  }

  const matrix = getAccumulatedTransform(element, svgRoot);
  return applyMatrix(matrix, localX, localY);
}

function getSvgTextPosition(
  textEl: SVGTextElement,
  svgRoot: SVGSVGElement
): { x: number; y: number } | null {
  try {
    const bbox = textEl.getBBox();
    const hasBBox = bbox.width > 0 || bbox.height > 0;
    const localX = hasBBox
      ? bbox.x + bbox.width / 2
      : parseSvgLength(textEl.getAttribute("x") ?? "0");
    const localY = hasBBox
      ? bbox.y + bbox.height / 2
      : parseSvgLength(textEl.getAttribute("y") ?? "0");
    return getElementPointInSvgRoot(textEl, svgRoot, localX, localY);
  } catch {
    const x = parseSvgLength(textEl.getAttribute("x") ?? "0");
    const y = parseSvgLength(textEl.getAttribute("y") ?? "0");
    return getElementPointInSvgRoot(textEl, svgRoot, x, y);
  }
}

type Matrix2D = [number, number, number, number, number, number];

function parseSvgLength(value: string): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMatrixTransform(transform: string): Matrix2D | null {
  const match = transform.match(/matrix\(([^)]+)\)/);
  if (!match) return null;
  const vals = match[1].split(/[\s,]+/).map(Number);
  if (vals.length !== 6 || vals.some((v) => !Number.isFinite(v))) return null;
  return vals as Matrix2D;
}

function multiplyMatrices(a: Matrix2D, b: Matrix2D): Matrix2D {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function applyMatrix(m: Matrix2D, x: number, y: number): { x: number; y: number } {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  };
}

/** Walk up the SVG tree and combine transform matrices from attributes. */
function getAccumulatedTransform(element: Element, root: SVGSVGElement): Matrix2D {
  let matrix: Matrix2D = [1, 0, 0, 1, 0, 0];
  let node: Element | null = element;

  while (node && node !== root) {
    if (node instanceof SVGGraphicsElement) {
      const attr = node.getAttribute("transform");
      if (attr) {
        const parsed = parseMatrixTransform(attr);
        if (parsed) matrix = multiplyMatrices(parsed, matrix);
      }
    }
    node = node.parentElement;
  }

  return matrix;
}

interface CafmLabel {
  key: string;
  text: string;
  /** Plain room number (101) vs CAFM text tag (PTAOFC, CAFE, GYM). */
  kind: "room" | "tag";
  x: number;
  y: number;
  priority: number;
}

const IGNORED_CAFM_LABELS = new Set(["WORKAREA", "WORK AREA"]);

const IGNORED_GENERIC_LABELS = new Set([
  ...IGNORED_CAFM_LABELS,
  "DN",
  "DN.",
  "UP",
  "OPEN",
  "OUTSIDE",
  "A",
  "ADMIN",
  "CAFE",
  "FREEZER",
  "VAULT",
  "MDF",
  "MECHKIT",
  "MECHACCS",
]);

/** Room labels on non-CAFM exports (e.g. 101, 101RR, 102COM). */
const GENERIC_ROOM_LABEL_PATTERN =
  /^(?:\d{3}[A-Z]{0,6}|\d{2}[A-Z]{2,6})$/;

function isGenericRoomLabel(text: string): boolean {
  const normalized = text.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized || normalized.length > 12) return false;
  if (IGNORED_GENERIC_LABELS.has(normalized)) return false;
  if (
    /^(AHU|COR|MECH|S\d|CC|KIT|LIB|CAFE|STO|WF|MF|LOUNGE|COUN|CUST|ADMB|WKRM|CLRM|GHRR|COMP|OFC|AVRM|BKRM|STOADM|FRR|DWRM|CAFEBHRR|CAFEBKRM|CAFECC|CAFEGHRR|CAFEWKRM|KITDWRM|KITCLRM|KITRR|LIBCOM|LIBOFC|LIBSTO|LIBAVRM|LIBCOMP|COUNSOFC|WFRRADM|MFRRADM|ADMBKRM|CAFESTO|CUSTSTO)/.test(
      normalized
    )
  ) {
    return false;
  }
  return GENERIC_ROOM_LABEL_PATTERN.test(normalized);
}

function isValidCafmLabelText(text: string): boolean {
  if (IGNORED_CAFM_LABELS.has(text)) return false;
  if (text.length < 2 || text.length > 24) return false;
  return /^[A-Z0-9][A-Z0-9]*$/.test(text);
}

/** CAFM exports label text inside TEXT/MTEXT groups, sometimes via extra wrapper g nodes. */
function isCafmLabelGroup(node: Element): boolean {
  const id = node.getAttribute("id") ?? "";
  if (id.startsWith("TEXT") || id.startsWith("MTEXT")) return true;
  const serifId = node.getAttribute("serif:id") ?? "";
  return serifId === "TEXT" || serifId === "MTEXT";
}

function getCafmLabelGroupId(textEl: Element): string | null {
  let node: Element | null = textEl.parentElement;
  while (node) {
    if (node.id === "CAFM_ID") break;
    if (isCafmLabelGroup(node)) {
      return node.getAttribute("id") || node.getAttribute("serif:id");
    }
    node = node.parentElement;
  }
  return null;
}

function parseCafmTextLabel(
  textEl: SVGTextElement,
  svgRoot: SVGSVGElement
): CafmLabel | null {
  const rawText = (textEl.textContent ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!isValidCafmLabelText(rawText)) return null;

  const groupId = getCafmLabelGroupId(textEl) ?? "";
  const isMtext = groupId.startsWith("MTEXT");
  const isText = groupId.startsWith("TEXT");
  if (!isMtext && !isText) return null;

  const position = getSvgTextPosition(textEl, svgRoot);
  if (!position) return null;

  const priority = isMtext ? 2 : 1;

  if (/^\d{3}[A-Z]?$/.test(rawText)) {
    return {
      key: rawText,
      text: rawText,
      kind: "room",
      x: position.x,
      y: position.y,
      priority,
    };
  }

  return {
    key: rawText,
    text: rawText,
    kind: "tag",
    x: position.x,
    y: position.y,
    priority,
  };
}

function getCafmLabels(svgRoot: SVGSVGElement): CafmLabel[] {
  const cafmId = svgRoot.querySelector("#CAFM_ID");
  if (!cafmId) return [];

  const labels: CafmLabel[] = [];
  for (const textEl of Array.from(cafmId.querySelectorAll("text"))) {
    const label = parseCafmTextLabel(textEl, svgRoot);
    if (label) labels.push(label);
  }

  return labels;
}

export interface CafmFloorPlanAudit {
  hasCafmId: boolean;
  hasCafmSpace: boolean;
  rawTextCount: number;
  parsedLabelCount: number;
  labeledRegionCount: number;
  totalShapeCount: number;
  nestedLabelWrapperCount: number;
  ok: boolean;
  warnings: string[];
}

/** Validate CAFM layer structure after a floor plan SVG is mounted in the DOM. */
export function auditCafmFloorPlan(svgRoot: SVGSVGElement): CafmFloorPlanAudit {
  const cafmId = svgRoot.querySelector("#CAFM_ID");
  const cafmSpace = svgRoot.querySelector("#CAFM_SPACE");
  const rawTexts = cafmId
    ? Array.from(cafmId.querySelectorAll("text"))
    : [];
  const parsedLabels = getCafmLabels(svgRoot);
  const labeledRegions = buildCafmSpaceRegions(svgRoot);
  const allShapes = getCafmShapeRegions(svgRoot);
  const nestedLabelWrapperCount = rawTexts.filter((textEl) => {
    const parent = textEl.parentElement;
    return Boolean(parent && !isCafmLabelGroup(parent) && getCafmLabelGroupId(textEl));
  }).length;

  const warnings: string[] = [];
  const hasCafmId = Boolean(cafmId);
  const hasCafmSpace = Boolean(cafmSpace);

  if (hasCafmSpace && !hasCafmId) {
    warnings.push("CAFM_SPACE is present but CAFM_ID is missing.");
  }
  if (hasCafmId && rawTexts.length === 0) {
    warnings.push("CAFM_ID is present but contains no <text> labels.");
  }
  if (hasCafmId && rawTexts.length > 0 && parsedLabels.length === 0) {
    warnings.push(
      "CAFM labels could not be parsed — room detection and polygon matching may not work."
    );
  }
  if (hasCafmSpace && allShapes.length === 0) {
    warnings.push("CAFM_SPACE contains no usable room boundary shapes.");
  }
  if (hasCafmSpace && parsedLabels.length > 0 && labeledRegions.length === 0) {
    warnings.push(
      "Parsed labels did not match any room polygons — check coordinate alignment."
    );
  }

  const ok = warnings.length === 0;

  return {
    hasCafmId,
    hasCafmSpace,
    rawTextCount: rawTexts.length,
    parsedLabelCount: parsedLabels.length,
    labeledRegionCount: labeledRegions.length,
    totalShapeCount: allShapes.length,
    nestedLabelWrapperCount,
    ok,
    warnings,
  };
}

export function logCafmFloorPlanAudit(
  svgRoot: SVGSVGElement,
  buildingName?: string
): CafmFloorPlanAudit {
  const audit = auditCafmFloorPlan(svgRoot);
  const prefix = buildingName
    ? `[CAFM floor plan: ${buildingName}]`
    : "[CAFM floor plan]";

  if (process.env.NODE_ENV === "production") {
    return audit;
  }

  if (audit.ok) {
    if (!audit.hasCafmId && !audit.hasCafmSpace) {
      const genericLabels = getGenericSvgLabels(svgRoot);
      const genericRooms = getGenericSvgRooms(svgRoot);
      const genericRegions = getGenericShapeRegions(svgRoot);
      console.info(
        `${prefix} non-CAFM plan — ${genericLabels.length} text labels, ${genericRooms.length} rooms, ${genericRegions.length} boundary regions`
      );
      return audit;
    }

    console.info(
      `${prefix} OK — ${audit.parsedLabelCount} labels, ${audit.labeledRegionCount} labeled regions, ${audit.totalShapeCount} shapes` +
        (audit.nestedLabelWrapperCount > 0
          ? ` (${audit.nestedLabelWrapperCount} nested label wrappers)`
          : "")
    );
    return audit;
  }

  console.warn(`${prefix} audit found issues:`, audit.warnings.join(" "));
  console.warn(`${prefix} details:`, audit);
  return audit;
}

function getPlanDistanceScale(svgRoot: SVGSVGElement): number {
  const viewBox = svgRoot.viewBox.baseVal;
  const planWidth = viewBox.width > 0 ? viewBox.width : svgRoot.getBBox().width;
  const planHeight = viewBox.height > 0 ? viewBox.height : svgRoot.getBBox().height;
  return Math.max(planWidth, planHeight);
}

function findNearestLabel(
  labels: CafmLabel[],
  x: number,
  y: number,
  maxDistanceSq: number
): CafmLabel | null {
  let nearest: CafmLabel | null = null;
  let bestDistance = Infinity;

  for (const label of labels) {
    const distance = distanceSquared(label.x, label.y, x, y);
    if (distance > maxDistanceSq) continue;
    if (distance < bestDistance || (distance === bestDistance && label.priority > (nearest?.priority ?? 0))) {
      bestDistance = distance;
      nearest = label;
    }
  }

  return nearest;
}

function pickCafmRoomAtPoint(
  svgRoot: SVGSVGElement,
  labels: CafmLabel[],
  x: number,
  y: number
): RoomInfo | null {
  if (labels.length === 0) return null;

  const planScale = getPlanDistanceScale(svgRoot);
  const maxDistanceSq = (planScale * 0.07) ** 2;

  const nearest = findNearestLabel(labels, x, y, maxDistanceSq);
  if (!nearest) return null;

  if (nearest.kind === "room") {
    return {
      key: nearest.key,
      x: nearest.x,
      y: nearest.y,
      points: [],
    };
  }

  return {
    key: nearest.text,
    x: nearest.x,
    y: nearest.y,
    points: [],
  };
}

interface CafmSpaceRegion {
  element: SVGGraphicsElement;
  points: { x: number; y: number }[];
  bbox: DOMRect;
  area: number;
  closed: boolean;
  labels: CafmLabel[];
}

const cafmShapeCache = new WeakMap<SVGSVGElement, CafmSpaceRegion[]>();
const cafmRegionCache = new WeakMap<SVGSVGElement, CafmSpaceRegion[]>();
const genericShapeCache = new WeakMap<SVGSVGElement, CafmSpaceRegion[]>();
const genericRoomCache = new WeakMap<SVGSVGElement, RoomInfo[]>();

function getPlanMetrics(svgRoot: SVGSVGElement): {
  width: number;
  height: number;
  area: number;
} {
  const viewBox = svgRoot.viewBox.baseVal;
  const width =
    viewBox.width > 0 ? viewBox.width : svgRoot.getBBox().width || 0;
  const height =
    viewBox.height > 0 ? viewBox.height : svgRoot.getBBox().height || 0;
  return { width, height, area: width * height };
}

function pathLooksLikeRoomBoundary(path: SVGPathElement): boolean {
  const style = (path.getAttribute("style") ?? "").toLowerCase();
  if (style.includes("font-size") || style.includes("font-family")) return false;
  if (!style.includes("stroke:") && !path.getAttribute("stroke")) return false;

  const fillMatch = style.match(/fill:([^;]+)/);
  if (fillMatch) {
    const fill = fillMatch[1].trim();
    if (fill !== "none" && fill !== "#ffffff" && fill !== "white") return false;
  }

  return true;
}

function getGenericSvgLabels(svgRoot: SVGSVGElement): CafmLabel[] {
  const labels: CafmLabel[] = [];
  const seen = new Set<string>();

  for (const textEl of Array.from(svgRoot.querySelectorAll("text"))) {
    const rawText = (textEl.textContent ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (!isGenericRoomLabel(rawText)) continue;

    const position = getSvgTextPosition(textEl as SVGTextElement, svgRoot);
    if (!position) continue;

    const dedupeKey = `${rawText}:${Math.round(position.x)}:${Math.round(position.y)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    labels.push({
      key: rawText,
      text: rawText,
      kind: "room",
      x: position.x,
      y: position.y,
      priority: /^\d{3}/.test(rawText) ? 2 : 1,
    });
  }

  return labels;
}

function buildGenericShapeRegions(svgRoot: SVGSVGElement): CafmSpaceRegion[] {
  const { area: planArea } = getPlanMetrics(svgRoot);
  if (planArea <= 0) return [];

  const minArea = planArea * 0.000015;
  const maxArea = planArea * 0.12;
  const regions: CafmSpaceRegion[] = [];

  for (const shape of Array.from(
    svgRoot.querySelectorAll("path")
  ) as SVGPathElement[]) {
    if (!pathLooksLikeRoomBoundary(shape)) continue;

    const pathData = shape.getAttribute("d") ?? "";
    const localPoints = getGraphicsPolygonPoints(shape);
    const closesExplicitly = /[zZ]\s*$/.test(pathData.trim());
    if (!closesExplicitly && localPoints.length >= 3) {
      const first = localPoints[0];
      const last = localPoints[localPoints.length - 1];
      if (
        distanceSquared(first.x, first.y, last.x, last.y) > 25
      ) {
        continue;
      }
    }

    try {
      const localBbox = shape.getBBox();
      if (localBbox.width <= 0 || localBbox.height <= 0) continue;

      const points = getShapePointsInRootSpace(shape, svgRoot);
      const bbox = bboxFromPoints(points);
      const area = bbox.width * bbox.height;
      if (area < minArea || area > maxArea || area > planArea * 0.4) continue;

      regions.push({
        element: shape,
        points,
        bbox,
        area,
        closed: true,
        labels: [],
      });
    } catch {
      continue;
    }
  }

  return regions;
}

function getGenericShapeRegions(svgRoot: SVGSVGElement): CafmSpaceRegion[] {
  const cached = genericShapeCache.get(svgRoot);
  if (cached) return cached;

  const regions = buildGenericShapeRegions(svgRoot);
  genericShapeCache.set(svgRoot, regions);
  return regions;
}

function findGenericRegionAtSvgCoordinates(
  svgRoot: SVGSVGElement,
  x: number,
  y: number
): CafmSpaceRegion | null {
  return (
    getGenericShapeRegions(svgRoot)
      .filter((region) => regionContainsPoint(region, x, y))
      .sort((a, b) => a.area - b.area)[0] ?? null
  );
}

function findRoomInGenericRegions(
  svgRoot: SVGSVGElement,
  x: number,
  y: number
): RoomInfo | null {
  const hits = getGenericShapeRegions(svgRoot)
    .filter((region) => regionContainsPoint(region, x, y))
    .sort((a, b) => a.area - b.area);

  const labels = getGenericSvgLabels(svgRoot);

  for (const region of hits) {
    const regionLabels = labels
      .filter((label) => labelBelongsToRegion(region, label))
      .sort((a, b) => b.priority - a.priority);

    if (regionLabels.length > 0) {
      const label = regionLabels[0];
      return {
        key: label.key,
        x: label.x,
        y: label.y,
        points: region.points,
      };
    }
  }

  return null;
}

/** Non-CAFM exports: match plain text labels to nearby stroked path boundaries. */
function extractGenericSvgRooms(svgRoot: SVGSVGElement): RoomInfo[] {
  const labels = getGenericSvgLabels(svgRoot);
  if (labels.length === 0) return [];

  const shapeInfos = getGenericShapeRegions(svgRoot).map((region) => ({
    element: region.element,
    points: region.points,
    bbox: region.bbox,
    area: region.area,
    centroid: regionCentroid(region),
  }));

  if (shapeInfos.length === 0) {
    return labels.map((label) => ({
      key: label.key,
      x: label.x,
      y: label.y,
      points: [],
    }));
  }

  const roomsByKey = new Map<string, RoomInfo>();

  for (const label of labels) {
    const matchingShapes = shapeInfos
      .filter((shape) => pointInBBox(label.x, label.y, shape.bbox))
      .sort((a, b) => a.area - b.area);

    const shape = matchingShapes[0];
    if (shape) {
      roomsByKey.set(label.key, {
        key: label.key,
        x: label.x,
        y: label.y,
        points: shape.points,
      });
    }
  }

  for (const label of labels) {
    if (roomsByKey.has(label.key)) continue;

    const nearestShape = shapeInfos
      .map((shape) => ({
        shape,
        distance: distanceSquared(
          shape.centroid.x,
          shape.centroid.y,
          label.x,
          label.y
        ),
      }))
      .sort((a, b) => a.distance - b.distance || a.shape.area - b.shape.area)[0]
      ?.shape;

    if (!nearestShape) continue;

    roomsByKey.set(label.key, {
      key: label.key,
      x: label.x,
      y: label.y,
      points: nearestShape.points,
    });
  }

  const rooms = Array.from(roomsByKey.values());
  rooms.sort((a, b) =>
    a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "base" })
  );
  return rooms;
}

function getGenericSvgRooms(svgRoot: SVGSVGElement): RoomInfo[] {
  const cached = genericRoomCache.get(svgRoot);
  if (cached) return cached;

  const rooms = extractGenericSvgRooms(svgRoot);
  genericRoomCache.set(svgRoot, rooms);
  return rooms;
}

function isClosedShape(el: SVGGraphicsElement, points: { x: number; y: number }[]): boolean {
  if (el instanceof SVGPathElement) {
    const d = el.getAttribute("d") ?? "";
    if (/z\s*$/i.test(d.trim())) return true;
  }
  if (el instanceof SVGPolygonElement) return true;
  if (el instanceof SVGRectElement) return true;
  if (points.length >= 3) {
    const first = points[0];
    const last = points[points.length - 1];
    return distanceSquared(first.x, first.y, last.x, last.y) < 4;
  }
  return false;
}

function regionContainsPoint(region: CafmSpaceRegion, x: number, y: number): boolean {
  if (!pointInBBox(x, y, region.bbox)) return false;
  if (!region.closed || region.points.length < 3) return false;
  return pointInPolygon(x, y, region.points);
}

function labelBelongsToRegion(region: CafmSpaceRegion, label: CafmLabel): boolean {
  return regionContainsPoint(region, label.x, label.y);
}

function resolveRegionLabels(
  labels: CafmLabel[],
  clickX: number,
  clickY: number
): { key: string; label?: string; x: number; y: number } | null {
  if (labels.length === 0) return null;

  const primary = [...labels].sort(
    (a, b) =>
      distanceSquared(a.x, a.y, clickX, clickY) -
      distanceSquared(b.x, b.y, clickX, clickY)
  )[0];

  if (primary.kind === "room") {
    return { key: primary.key, x: primary.x, y: primary.y };
  }

  return { key: primary.text, x: primary.x, y: primary.y };
}

function bboxFromPoints(points: { x: number; y: number }[]): DOMRect {
  if (points.length === 0) return new DOMRect(0, 0, 0, 0);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return new DOMRect(minX, minY, maxX - minX, maxY - minY);
}

function getShapePointsInRootSpace(
  shape: SVGGraphicsElement,
  svgRoot: SVGSVGElement
): { x: number; y: number }[] {
  return getGraphicsPolygonPoints(shape).map((point) =>
    getElementPointInSvgRoot(shape, svgRoot, point.x, point.y)
  );
}

/** All #CAFM_SPACE boundary shapes (with or without labels). */
function buildCafmShapeRegions(svgRoot: SVGSVGElement): CafmSpaceRegion[] {
  const cafmSpace = svgRoot.querySelector("#CAFM_SPACE");
  if (!cafmSpace) return [];

  const shapes = Array.from(
    cafmSpace.querySelectorAll("path, polygon, polyline, rect")
  ) as SVGGraphicsElement[];

  return shapes
    .map((shape) => {
      const localBbox = shape.getBBox();
      if (localBbox.width <= 0 || localBbox.height <= 0) return null;

      const localPoints = getGraphicsPolygonPoints(shape);
      const points = getShapePointsInRootSpace(shape, svgRoot);
      const bbox = bboxFromPoints(points);
      if (bbox.width <= 0 || bbox.height <= 0) return null;

      return {
        element: shape,
        points,
        bbox,
        area: bbox.width * bbox.height,
        closed: isClosedShape(shape, localPoints),
        labels: [] as CafmLabel[],
      };
    })
    .filter((region): region is CafmSpaceRegion => region !== null);
}

function getCafmShapeRegions(svgRoot: SVGSVGElement): CafmSpaceRegion[] {
  const cached = cafmShapeCache.get(svgRoot);
  if (cached) return cached;

  const regions = buildCafmShapeRegions(svgRoot);
  cafmShapeCache.set(svgRoot, regions);
  return regions;
}

function findRegionAtSvgCoordinates(
  svgRoot: SVGSVGElement,
  x: number,
  y: number
): CafmSpaceRegion | null {
  return (
    getCafmShapeRegions(svgRoot)
      .filter((region) => regionContainsPoint(region, x, y))
      .sort((a, b) => a.area - b.area)[0] ?? null
  );
}

function findRegionPolygonAtSvgCoordinates(
  svgRoot: SVGSVGElement,
  x: number,
  y: number
): { x: number; y: number }[] | null {
  const hit = findRegionAtSvgCoordinates(svgRoot, x, y);
  return hit && hit.points.length >= 3 ? hit.points : null;
}

/**
 * Build CAFM space regions by pairing #CAFM_SPACE boundaries with #CAFM_ID labels
 * that fall inside each boundary polygon (spatial join — not explicit SVG ids).
 */
function buildCafmSpaceRegions(svgRoot: SVGSVGElement): CafmSpaceRegion[] {
  const labels = getCafmLabels(svgRoot);
  const regions = getCafmShapeRegions(svgRoot).map((region) => ({
    ...region,
    labels: [] as CafmLabel[],
  }));

  for (const label of labels) {
    const matches = regions
      .filter((region) => labelBelongsToRegion(region, label))
      .sort((a, b) => a.area - b.area);

    if (matches.length > 0) {
      matches[0].labels.push(label);
    }
  }

  return regions.filter((region) => region.labels.length > 0);
}

function getCafmSpaceRegions(svgRoot: SVGSVGElement): CafmSpaceRegion[] {
  const cached = cafmRegionCache.get(svgRoot);
  if (cached) return cached;

  const regions = buildCafmSpaceRegions(svgRoot);
  cafmRegionCache.set(svgRoot, regions);
  return regions;
}

function findRoomInCafmRegions(
  svgRoot: SVGSVGElement,
  x: number,
  y: number
): RoomInfo | null {
  const regions = getCafmSpaceRegions(svgRoot);
  const hits = regions
    .filter((region) => regionContainsPoint(region, x, y))
    .sort((a, b) => a.area - b.area);

  for (const region of hits) {
    const resolved = resolveRegionLabels(region.labels, x, y);
    if (resolved) {
      return {
        key: resolved.key,
        x: resolved.x,
        y: resolved.y,
        points: region.points,
      };
    }
  }

  return null;
}

export type FloorPlanSelectionShape =
  | { type: "circle"; x: number; y: number; radius: number }
  | { type: "polygon"; points: { x: number; y: number }[] };

function closePolygonPoints(
  points: { x: number; y: number }[]
): { x: number; y: number }[] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.x === last.x && first.y === last.y) return points;
  return [...points, first];
}

function pointInSelectionShape(
  x: number,
  y: number,
  shape: FloorPlanSelectionShape
): boolean {
  if (shape.type === "circle") {
    if (shape.radius <= 0) return false;
    return (
      distanceSquared(x, y, shape.x, shape.y) <= shape.radius * shape.radius
    );
  }

  const polygon = closePolygonPoints(shape.points);
  return polygon.length >= 3 && pointInPolygon(x, y, polygon);
}

function regionCentroid(region: CafmSpaceRegion): { x: number; y: number } {
  if (region.points.length === 0) {
    return {
      x: region.bbox.x + region.bbox.width / 2,
      y: region.bbox.y + region.bbox.height / 2,
    };
  }

  let sumX = 0;
  let sumY = 0;
  for (const point of region.points) {
    sumX += point.x;
    sumY += point.y;
  }
  return { x: sumX / region.points.length, y: sumY / region.points.length };
}

function regionToRoomInfo(region: CafmSpaceRegion): RoomInfo | null {
  const centroid = regionCentroid(region);
  const resolved = resolveRegionLabels(region.labels, centroid.x, centroid.y);
  if (!resolved) return null;

  const descriptor = region.labels.find((label) => label.kind === "tag")?.text;

  return {
    key: resolved.key,
    x: centroid.x,
    y: centroid.y,
    points: region.points,
    label: descriptor,
  };
}

function roomIntersectsSelectionShape(
  room: RoomInfo,
  shape: FloorPlanSelectionShape
): boolean {
  if (pointInSelectionShape(room.x, room.y, shape)) return true;

  for (const point of room.points) {
    if (pointInSelectionShape(point.x, point.y, shape)) return true;
  }

  if (shape.type === "polygon" && room.points.length >= 3) {
    const polygon = closePolygonPoints(shape.points);
    for (const point of polygon) {
      if (pointInPolygon(point.x, point.y, room.points)) return true;
    }
  }

  return false;
}

/** Rooms whose boundary polygon falls within (or intersects) a drawn circle or lasso. */
export function findRoomsWithinFloorPlanShape(
  svgRoot: SVGSVGElement,
  shape: FloorPlanSelectionShape
): RoomInfo[] {
  const cafmRegions = getCafmSpaceRegions(svgRoot);
  const rooms: RoomInfo[] = [];
  const seen = new Set<string>();

  if (cafmRegions.length > 0) {
    for (const region of cafmRegions) {
      const room = regionToRoomInfo(region);
      if (!room || seen.has(room.key)) continue;
      if (!roomIntersectsSelectionShape(room, shape)) continue;
      seen.add(room.key);
      rooms.push(room);
    }
  } else {
    for (const room of getGenericSvgRooms(svgRoot)) {
      if (seen.has(room.key)) continue;
      if (!roomIntersectsSelectionShape(room, shape)) continue;
      seen.add(room.key);
      rooms.push(room);
    }

    for (const room of extractLegacyRooms(svgRoot)) {
      if (seen.has(room.key)) continue;
      if (!roomIntersectsSelectionShape(room, shape)) continue;
      seen.add(room.key);
      rooms.push(room);
    }
  }

  rooms.sort((a, b) =>
    a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "base" })
  );
  return rooms;
}

export function logRoomsWithinFloorPlanShape(
  svgRoot: SVGSVGElement,
  shape: FloorPlanSelectionShape,
  context?: { buildingName?: string; shapeLabel?: string }
): RoomInfo[] {
  const rooms = findRoomsWithinFloorPlanShape(svgRoot, shape);
  const prefix = context?.buildingName
    ? `[Floor plan: ${context.buildingName}]`
    : "[Floor plan]";
  const shapeLabel =
    context?.shapeLabel ?? (shape.type === "circle" ? "circle" : "polygon");

  console.info(
    `${prefix} ${rooms.length} room polygon(s) within drawn ${shapeLabel}:`,
    rooms.map((room) =>
      room.label ? `${room.key} (${room.label})` : room.key
    )
  );

  if (rooms.length > 0) {
    console.table(
      rooms.map((room) => ({
        room: room.key,
        label: room.label ?? "",
        x: Math.round(room.x),
        y: Math.round(room.y),
        vertices: room.points.length,
      }))
    );
  }

  return rooms;
}

export function formatRoomLocationDisplay(roomKey: string, roomLabel?: string): string {
  const isRoomNumber = /^\d{3}[A-Z]?$/.test(roomKey);
  if (isRoomNumber) {
    return roomLabel ? `Room ${roomKey} · ${roomLabel}` : `Room ${roomKey}`;
  }
  return roomLabel && roomLabel !== roomKey ? `${roomKey} · ${roomLabel}` : roomKey;
}

/** Convert a browser click to SVG viewBox coordinates using the rendered SVG element. */
export function clientToSvgPoint(
  svgRoot: SVGSVGElement,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const pt = svgRoot.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svgRoot.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const mapped = pt.matrixTransform(ctm.inverse());
  return { x: mapped.x, y: mapped.y };
}

export interface RoomMatchResult {
  room: RoomInfo | null;
  highlightPoints: { x: number; y: number }[] | null;
  highlightElement: SVGGraphicsElement | null;
}

/** Detect the room at a click using the live SVG (preferred for CAFM plans). */
export function findRoomAtSvgPoint(
  svgRoot: SVGSVGElement,
  clientX: number,
  clientY: number
): RoomInfo | null {
  const { x, y } = clientToSvgPoint(svgRoot, clientX, clientY);
  return findRoomAtSvgCoordinates(svgRoot, x, y);
}

/** Room detection plus the boundary polygon to highlight on click. */
export function findRoomMatchAtSvgPoint(
  svgRoot: SVGSVGElement,
  clientX: number,
  clientY: number
): RoomMatchResult {
  const { x, y } = clientToSvgPoint(svgRoot, clientX, clientY);
  return findRoomMatchAtSvgCoordinates(svgRoot, x, y);
}

export function findRoomMatchAtSvgCoordinates(
  svgRoot: SVGSVGElement,
  x: number,
  y: number
): RoomMatchResult {
  const cafmSpace = svgRoot.querySelector("#CAFM_SPACE");

  if (cafmSpace) {
    const region = findRegionAtSvgCoordinates(svgRoot, x, y);
    const labels = getCafmLabels(svgRoot);
    const room =
      labels.length > 0
        ? findRoomInCafmRegions(svgRoot, x, y) ??
          pickCafmRoomAtPoint(svgRoot, labels, x, y)
        : null;
    const highlightPoints =
      region && region.points.length >= 3
        ? region.points
        : room && room.points.length >= 3
          ? room.points
          : null;
    return {
      room,
      highlightPoints,
      highlightElement: region?.element ?? null,
    };
  }

  const genericRooms = getGenericSvgRooms(svgRoot);
  if (genericRooms.length > 0) {
    return findGenericRoomMatchAtSvgCoordinates(svgRoot, x, y);
  }

  return findLegacyRoomMatchAtSvgCoordinates(svgRoot, x, y);
}

function findGenericRoomMatchAtSvgCoordinates(
  svgRoot: SVGSVGElement,
  x: number,
  y: number
): RoomMatchResult {
  const genericRooms = getGenericSvgRooms(svgRoot);
  const region = findGenericRegionAtSvgCoordinates(svgRoot, x, y);
  const room =
    findRoomInGenericRegions(svgRoot, x, y) ??
    findRoomAtPoint(genericRooms, x, y);
  const highlightPoints =
    region && region.points.length >= 3
      ? region.points
      : room && room.points.length >= 3
        ? room.points
        : null;

  return {
    room,
    highlightPoints,
    highlightElement: region?.element ?? null,
  };
}

function findLegacyRoomMatchAtSvgCoordinates(
  svgRoot: SVGSVGElement,
  x: number,
  y: number
): RoomMatchResult {
  const rooms = extractLegacyRooms(svgRoot);
  const room = findRoomAtPoint(rooms, x, y);
  const highlightPoints =
    room && room.points.length >= 3 ? room.points : null;
  return { room, highlightPoints, highlightElement: null };
}

export function findRoomAtSvgCoordinates(
  svgRoot: SVGSVGElement,
  x: number,
  y: number
): RoomInfo | null {
  const cafmSpace = svgRoot.querySelector("#CAFM_SPACE");

  if (cafmSpace) {
    const labels = getCafmLabels(svgRoot);
    if (labels.length > 0) {
      const fromRegion = findRoomInCafmRegions(svgRoot, x, y);
      if (fromRegion) return fromRegion;

      return pickCafmRoomAtPoint(svgRoot, labels, x, y);
    }

    return null;
  }

  const genericRooms = getGenericSvgRooms(svgRoot);
  if (genericRooms.length > 0) {
    const fromRegion = findRoomInGenericRegions(svgRoot, x, y);
    if (fromRegion) return fromRegion;
    return findRoomAtPoint(genericRooms, x, y);
  }

  const rooms = extractLegacyRooms(svgRoot);
  return findRoomAtPoint(rooms, x, y);
}

/** Legacy floor plans with `<polygon data-k="ROOM#">`. */
function extractLegacyRooms(svgRoot: SVGSVGElement): RoomInfo[] {
  const polygons = Array.from(svgRoot.querySelectorAll("polygon[data-k]"));

  const labelMap = new Map<string, string>();
  for (const text of Array.from(svgRoot.querySelectorAll("text"))) {
    const tspans = Array.from(text.querySelectorAll("tspan"))
      .map((t) => t.textContent?.trim() || "")
      .filter(Boolean);
    if (tspans.length >= 2) {
      const roomNum = tspans[0];
      const descriptor = tspans
        .slice(1)
        .find((t) => /[a-zA-Z]/.test(t) && !/SF$/i.test(t));
      if (roomNum && descriptor) labelMap.set(roomNum, descriptor);
    }
  }

  const rooms: RoomInfo[] = [];
  const seen = new Set<string>();

  for (const poly of polygons) {
    const key = poly.getAttribute("data-k")?.trim();
    const pointsAttr = poly.getAttribute("points");
    if (!key || !pointsAttr || seen.has(key)) continue;

    const nums = pointsAttr.trim().split(/[\s,]+/).map(Number);
    const points: { x: number; y: number }[] = [];
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      if (Number.isFinite(nums[i]) && Number.isFinite(nums[i + 1])) {
        points.push({ x: nums[i], y: nums[i + 1] });
        sumX += nums[i];
        sumY += nums[i + 1];
      }
    }
    if (points.length === 0) continue;

    seen.add(key);
    rooms.push({
      key,
      x: sumX / points.length,
      y: sumY / points.length,
      points,
      label: labelMap.get(key),
    });
  }

  rooms.sort((a, b) =>
    a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "base" })
  );
  return rooms;
}

function getGraphicsPolygonPoints(el: SVGGraphicsElement): { x: number; y: number }[] {
  if (el instanceof SVGRectElement) {
    return bboxToPolygon(el.getBBox());
  }

  if (el instanceof SVGPolygonElement || el instanceof SVGPolylineElement) {
    const pointsAttr = el.getAttribute("points");
    if (!pointsAttr) return bboxToPolygon(el.getBBox());
    const nums = pointsAttr.trim().split(/[\s,]+/).map(Number);
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      if (Number.isFinite(nums[i]) && Number.isFinite(nums[i + 1])) {
        points.push({ x: nums[i], y: nums[i + 1] });
      }
    }
    return points.length >= 3 ? points : bboxToPolygon(el.getBBox());
  }

  if (el instanceof SVGPathElement) {
    const length = el.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) {
      return bboxToPolygon(el.getBBox());
    }
    const count = Math.min(160, Math.max(16, Math.ceil(length / 150)));
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const point = el.getPointAtLength((length * i) / Math.max(count - 1, 1));
      points.push({ x: point.x, y: point.y });
    }
    return points;
  }

  return bboxToPolygon(el.getBBox());
}

function bboxToPolygon(bbox: DOMRect): { x: number; y: number }[] {
  if (bbox.width <= 0 || bbox.height <= 0) return [];
  return [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
    { x: bbox.x, y: bbox.y + bbox.height },
  ];
}

/** Ray-casting point-in-polygon test. */
function pointInPolygon(
  px: number,
  py: number,
  polygon: { x: number; y: number }[]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Find which room (if any) a point in SVG coordinates falls within.
 * For CAFM plans, room labels are the most reliable anchor — pick the nearest
 * room number label to the click, not the largest boundary polygon.
 */
export function findRoomAtPoint(
  rooms: RoomInfo[],
  x: number,
  y: number
): RoomInfo | null {
  if (!rooms.length) return null;

  const bounds = getRoomsBounds(rooms);
  const maxDistance = Math.max(bounds.width, bounds.height) * 0.045;
  const maxDistanceSq = maxDistance * maxDistance;

  const rankedByLabel = [...rooms].sort(
    (a, b) => distanceSquared(a.x, a.y, x, y) - distanceSquared(b.x, b.y, x, y)
  );

  const nearestLabel = rankedByLabel[0];
  if (nearestLabel && distanceSquared(nearestLabel.x, nearestLabel.y, x, y) <= maxDistanceSq) {
    return nearestLabel;
  }

  const containing = rooms.filter(
    (room) =>
      pointInBBox(x, y, pointsBBox(room.points)) ||
      (room.points.length >= 3 && pointInPolygon(x, y, room.points))
  );

  if (containing.length > 0) {
    return containing.sort(
      (a, b) => polygonBBoxArea(a.points) - polygonBBoxArea(b.points)
    )[0];
  }

  return nearestLabel && distanceSquared(nearestLabel.x, nearestLabel.y, x, y) <= maxDistanceSq * 4
    ? nearestLabel
    : null;
}

function pointInBBox(x: number, y: number, bbox: DOMRect): boolean {
  return (
    x >= bbox.x &&
    x <= bbox.x + bbox.width &&
    y >= bbox.y &&
    y <= bbox.y + bbox.height
  );
}

function pointsBBox(points: { x: number; y: number }[]): DOMRect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 0),
    height: Math.max(maxY - minY, 0),
    top: minY,
    left: minX,
    right: maxX,
    bottom: maxY,
    toJSON: () => ({}),
  };
}

function polygonBBoxArea(points: { x: number; y: number }[]): number {
  const bbox = pointsBBox(points);
  return bbox.width * bbox.height;
}

function distanceSquared(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
}

function getRoomsBounds(rooms: RoomInfo[]): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const room of rooms) {
    for (const point of room.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, width: 1, height: 1 };
  }

  return {
    minX,
    minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}
