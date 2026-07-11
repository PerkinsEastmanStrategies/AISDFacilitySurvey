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

const FLOOR_PLAN_CONTRAST_STYLE_ID = "aisd-floor-plan-contrast";

export type FloorPlanContrastBoost = "default" | "mobile";

/**
 * Boost line contrast for display. Injected at render time so source SVG files
 * in Supabase do not need to be edited individually.
 * Mobile boost uses non-scaling strokes so walls stay readable on small screens.
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

  if (boost === "mobile") {
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
        stroke-width: 1.75px !important;
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
        stroke-width: 2px !important;
      }
      text,
      text tspan {
        stroke: #1a1a1a !important;
        stroke-opacity: 0.95 !important;
        fill: #1a1a1a !important;
        vector-effect: non-scaling-stroke !important;
        stroke-width: 0.6px !important;
      }
    `;
  } else {
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
        stroke: #111111 !important;
        stroke-opacity: 0.92 !important;
      }
      #planDetail line {
        stroke-opacity: 0.75 !important;
      }
      #planWalls line,
      .proom {
        stroke-opacity: 0.95 !important;
      }
    `;
  }

  svgElement.insertBefore(style, svgElement.firstChild);
}
