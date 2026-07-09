export interface SvgViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Above this size, skip getBBox-based cropping when a viewBox is already declared. */
export const LARGE_SVG_CHAR_THRESHOLD = 9 * 1024 * 1024;

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

/** Prefer declared viewBox on very large SVGs to avoid an extra DOM measurement pass. */
export function resolveSvgViewBox(
  svgElement: SVGSVGElement,
  sourceCharLength?: number
): SvgViewBox | null {
  const declared = parseSvgViewBoxAttribute(svgElement);
  if (
    sourceCharLength !== undefined &&
    sourceCharLength >= LARGE_SVG_CHAR_THRESHOLD &&
    declared
  ) {
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
