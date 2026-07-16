export interface SvgViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Above this size, skip getBBox-based cropping (cloning the SVG into the DOM).
 * CAFM plans are often multi-MB; the clone pass OOMs mobile Safari.
 */
export const LARGE_SVG_CHAR_THRESHOLD = 512 * 1024;

function isCoarsePointerDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(max-width: 767px)").matches
  );
}

export function parseSvgViewBoxAttribute(
  svgElement: SVGSVGElement
): SvgViewBox | null {
  const viewBoxAttr = svgElement.getAttribute("viewBox");
  if (viewBoxAttr) {
    const parts = viewBoxAttr.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }

  const w = parseFloat(svgElement.getAttribute("width") || "800");
  const h = parseFloat(svgElement.getAttribute("height") || "600");
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { x: 0, y: 0, width: w, height: h };
  }

  return null;
}

/** Measure rendered SVG content bounds (respects transforms). */
export function getTightSvgViewBox(
  svgElement: SVGSVGElement,
  paddingRatio = 0.03
): SvgViewBox | null {
  if (typeof document === "undefined") return null;

  const mount = document.createElement("div");
  mount.style.cssText =
    "position:fixed;left:-10000px;top:0;width:2400px;height:2400px;overflow:hidden;visibility:hidden;pointer-events:none;";
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", "2400");
  clone.setAttribute("height", "2400");
  mount.appendChild(clone);
  document.body.appendChild(mount);

  try {
    const bbox = clone.getBBox();
    if (
      !Number.isFinite(bbox.width) ||
      !Number.isFinite(bbox.height) ||
      bbox.width <= 0 ||
      bbox.height <= 0
    ) {
      return null;
    }

    const pad = Math.max(bbox.width, bbox.height) * paddingRatio;
    return {
      x: bbox.x - pad,
      y: bbox.y - pad,
      width: bbox.width + pad * 2,
      height: bbox.height + pad * 2,
    };
  } catch {
    return null;
  } finally {
    document.body.removeChild(mount);
  }
}

/**
 * Prefer declared viewBox on large SVGs and phones to avoid an extra full-DOM
 * clone + getBBox pass (a common mobile tab-kill).
 */
export function resolveSvgViewBox(
  svgElement: SVGSVGElement,
  sourceCharLength?: number
): SvgViewBox | null {
  const declared = parseSvgViewBoxAttribute(svgElement);
  const skipTightCrop =
    isCoarsePointerDevice() ||
    (sourceCharLength !== undefined &&
      sourceCharLength >= LARGE_SVG_CHAR_THRESHOLD);

  if (skipTightCrop) {
    return declared;
  }

  const tight = getTightSvgViewBox(svgElement);
  return tight ?? declared;
}

export function applySvgViewBox(
  svgElement: SVGSVGElement,
  viewBox: SvgViewBox
): void {
  svgElement.setAttribute(
    "viewBox",
    `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
  );
}

/**
 * Crop an already-mounted SVG to its drawn content. Safer than cloning the
 * whole tree (used by getTightSvgViewBox) and fixes CAFM exports whose
 * declared viewBox leaves large empty margins.
 */
export function cropMountedSvgToContent(
  svgElement: SVGSVGElement,
  paddingRatio = 0.04
): SvgViewBox | null {
  try {
    const bbox = svgElement.getBBox();
    if (
      !Number.isFinite(bbox.width) ||
      !Number.isFinite(bbox.height) ||
      bbox.width <= 0 ||
      bbox.height <= 0
    ) {
      return null;
    }

    const pad = Math.max(bbox.width, bbox.height) * paddingRatio;
    const next: SvgViewBox = {
      x: bbox.x - pad,
      y: bbox.y - pad,
      width: bbox.width + pad * 2,
      height: bbox.height + pad * 2,
    };
    applySvgViewBox(svgElement, next);
    return next;
  } catch {
    return null;
  }
}

/**
 * Mount-time content crop is allowed up to this SVG character length.
 * Large CAFM plans (e.g. Anderson ~2.8MB) need this so empty artboard
 * margins are trimmed; root getBBox on a mounted SVG is typically fast.
 */
export const MOUNT_CROP_MAX_CHARS = 7 * 1024 * 1024;

const FLOOR_PLAN_CONTRAST_STYLE_ID = "aisd-floor-plan-contrast";

export type FloorPlanContrastBoost = "default" | "mobile";

/**
 * Boost line contrast for display. Injected at render time so source SVG files
 * in Supabase do not need to be edited individually.
 * Uses non-scaling strokes so walls stay readable when the plan is zoomed to fit.
 */
export function enhanceFloorPlanLineContrast(
  svgElement: SVGSVGElement,
  doc: Document,
  options?: { boost?: FloorPlanContrastBoost }
): void {
  const existing = svgElement.querySelector(`#${FLOOR_PLAN_CONTRAST_STYLE_ID}`);
  if (existing) existing.remove();

  const boost = options?.boost ?? "default";
  const style = doc.createElementNS("http://www.w3.org/2000/svg", "style");
  style.id = FLOOR_PLAN_CONTRAST_STYLE_ID;

  // Desktop a bit heavier; mobile slightly lighter for dense plans.
  const lineWidth = boost === "mobile" ? "0.95px" : "1.35px";
  const wallWidth = boost === "mobile" ? "1.1px" : "1.55px";
  const textWidth = boost === "mobile" ? "0.55px" : "0.65px";
  // CAFM labels use nested matrices (layer ~0.005 × group ~300). Scaling the
  // group matrix grows text in place; font-size tweaks alone look tiny.
  const labelScale = boost === "mobile" ? 4.25 : 3.75;

  scaleCafmLabelTransforms(svgElement, labelScale);
  scaleSvgTextFontSizes(svgElement, 1.15);

  style.textContent = `
    #planDetail line,
    #planWalls line,
    .proom,
    line,
    polyline,
    rect[stroke],
    rect[style*="stroke:"],
    circle[stroke],
    circle[style*="stroke:"],
    ellipse[stroke],
    ellipse[style*="stroke:"],
    polygon[stroke],
    polygon[style*="stroke:"],
    path[stroke],
    path[style*="stroke:"] {
      stroke: #000000 !important;
      stroke-opacity: 1 !important;
      vector-effect: non-scaling-stroke !important;
      stroke-width: ${lineWidth} !important;
    }
    #CAFM_SPACE path,
    #CAFM_SPACE rect,
    #CAFM_BLDG_OTLN path,
    #CAFM_BLDG_OTLN rect,
    #A-WALLS path,
    #A-WALLS line {
      stroke: #000000 !important;
      stroke-opacity: 1 !important;
      vector-effect: non-scaling-stroke !important;
      stroke-width: ${wallWidth} !important;
    }
    text,
    text tspan {
      stroke: #111111 !important;
      stroke-opacity: 0.95 !important;
      fill: #111111 !important;
      vector-effect: non-scaling-stroke !important;
      stroke-width: ${textWidth} !important;
    }
  `;

  svgElement.insertBefore(style, svgElement.firstChild);
}

/**
 * CAFM Affinity exports wrap each label as:
 *   #CAFM_ID[matrix(0.005…)] > g[matrix(300…, tx, ty)] > text
 * Scaling a/b/c/d on the inner group grows the glyph around its anchor.
 */
function scaleCafmLabelTransforms(
  svgElement: SVGSVGElement,
  factor: number
): void {
  if (!(factor > 0) || factor === 1) return;

  svgElement.querySelectorAll("g[transform]").forEach((node) => {
    const g = node as SVGGElement;
    const transform = g.getAttribute("transform");
    if (!transform || !g.querySelector("text")) return;

    const match = transform.match(/matrix\s*\(\s*([^)]+)\)/i);
    if (!match) return;

    const parts = match[1]
      .trim()
      .split(/[\s,]+/)
      .map((value) => Number(value));
    if (parts.length < 6 || parts.some((value) => !Number.isFinite(value))) {
      return;
    }

    const [a, b, c, d, e, f] = parts;
    // Label wrappers are ~300; layer roots are ~0.005 — only scale wrappers.
    const linearScale = Math.hypot(a, b);
    if (linearScale < 10 || linearScale > 5000) return;

    const next = `matrix(${a * factor},${b * factor},${c * factor},${d * factor},${e},${f})`;
    g.setAttribute("transform", transform.replace(match[0], next));
  });
}

/** Multiply existing SVG label font sizes (attribute + inline style). */
function scaleSvgTextFontSizes(svgElement: SVGSVGElement, factor: number): void {
  if (!(factor > 0) || factor === 1) return;

  svgElement.querySelectorAll("text, tspan").forEach((node) => {
    const el = node as SVGElement;

    const attr = el.getAttribute("font-size");
    if (attr) {
      const match = attr.trim().match(/^([\d.]+)(.*)$/);
      if (match) {
        const next = parseFloat(match[1]) * factor;
        if (Number.isFinite(next)) {
          el.setAttribute("font-size", `${next}${match[2]}`);
        }
      }
    }

    const styleAttr = el.getAttribute("style");
    if (styleAttr && /font-size\s*:/i.test(styleAttr)) {
      el.setAttribute(
        "style",
        styleAttr.replace(
          /font-size\s*:\s*([\d.]+)([a-z%]*)/i,
          (_full, value: string, unit: string) => {
            const next = parseFloat(value) * factor;
            return Number.isFinite(next)
              ? `font-size:${next}${unit}`
              : `font-size:${value}${unit}`;
          }
        )
      );
    }
  });
}
