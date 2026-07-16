"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Layers, MapPin, X } from "lucide-react";
import {
  annotationMatchesQuestionFilter,
  getAnnotationPinLabel,
  SURVEY_QUESTIONS,
  type Annotation,
} from "@/lib/survey-data";

function questionCategoryLabel(questionId: number): string {
  return (
    SURVEY_QUESTIONS.find((q) => q.id === questionId)?.category ??
    `Question ${questionId}`
  );
}
import type { Tool, Classification } from "@/components/annotation-toolbar";

interface MapViewerProps {
  annotations: Annotation[];
  currentQuestionId: number;
  tool: Tool;
  classification: Classification;
  onAddAnnotation: (annotation: Omit<Annotation, "id">) => void;
  onRemoveAnnotation: (id: string) => void;
  onUpdateAnnotation: (
    id: string,
    updates: Partial<Pick<Annotation, "comment" | "classification" | "color">>
  ) => void;
  onToolChange?: (tool: Tool) => void;
  center?: [number, number];
  zoom?: number;
  annotationsEnabled?: boolean;
  readOnly?: boolean;
  filterQuestionId?: number | null;
  filterQuestionIds?: number[] | null;
  filterClassification?: "strength" | "weakness" | null;
  /** [longitude, latitude] of the selected school; map flies here when it changes. */
  focusLocation?: [number, number] | null;
  /** Name of the selected school, shown as a fixed marker label. */
  focusLabel?: string | null;
}

const MAP_STYLES = {
  aerial: "mapbox://styles/mapbox/satellite-v9",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  streets: "mapbox://styles/mapbox/streets-v12",
} as const;

type MapStyleKey = keyof typeof MAP_STYLES;

// Default to Austin, TX
const DEFAULT_CENTER: [number, number] = [-97.7431, 30.2672];

type LngLat = { lng: number; lat: number };

// Great-circle distance in meters between two coordinates
function haversineMeters(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Build a circle polygon GeoJSON feature from a center + radius in meters
function circleFeature(
  center: LngLat,
  radiusMeters: number,
  props: Record<string, unknown> = {},
  steps = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
  const earthRadius = 6378137;
  const latRad = (center.lat * Math.PI) / 180;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = radiusMeters * Math.cos(angle);
    const dy = radiusMeters * Math.sin(angle);
    const dLng = ((dx / (earthRadius * Math.cos(latRad))) * 180) / Math.PI;
    const dLat = ((dy / earthRadius) * 180) / Math.PI;
    coords.push([center.lng + dLng, center.lat + dLat]);
  }
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: props,
  };
}

// Build a GeoJSON feature from freeform points: a Polygon when closed (>=3
// points) for the committed shape, or a LineString for the live preview.
function freeformFeature(
  points: LngLat[],
  props: Record<string, unknown> = {},
  closed = false
): GeoJSON.Feature {
  const coords = points.map((p) => [p.lng, p.lat] as [number, number]);
  if (closed && coords.length >= 3) {
    return {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[...coords, coords[0]]] },
      properties: props,
    };
  }
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: props,
  };
}

export function MapViewer({
  annotations,
  currentQuestionId,
  tool,
  classification,
  onAddAnnotation,
  onRemoveAnnotation,
  onUpdateAnnotation,
  onToolChange,
  center = DEFAULT_CENTER,
  zoom = 16,
  annotationsEnabled = true,
  readOnly = false,
  filterQuestionId,
  filterQuestionIds,
  filterClassification,
  focusLocation = null,
  focusLabel = null,
}: MapViewerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const schoolMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [styleKey, setStyleKey] = useState<MapStyleKey>("aerial");
  const [hasToken] = useState(() => !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);

  // Pending annotation awaiting a comment before it is committed
  const [pendingLngLat, setPendingLngLat] = useState<{ lng: number; lat: number } | null>(null);
  const [pendingComment, setPendingComment] = useState("");

  // Two-click circle: center set on first click, radius sized on move, finished on second click
  const circleCenterRef = useRef<LngLat | null>(null);
  const [circleDrawing, setCircleDrawing] = useState(false);
  // Pending circle awaiting a comment: { center, radius }
  const [pendingCircle, setPendingCircle] = useState<{ center: LngLat; radius: number } | null>(null);

  // Freeform: capture points while dragging, finished on mouseup
  const freeformPointsRef = useRef<LngLat[]>([]);
  const freeformDrawingRef = useRef(false);
  const [freeformDrawing, setFreeformDrawing] = useState(false);
  // Pending freeform awaiting a comment: { points }
  const [pendingFreeform, setPendingFreeform] = useState<{ points: LngLat[] } | null>(null);
  /** Space bar held — temporarily pan instead of starting a freeform draw. */
  const spaceHeldRef = useRef(false);

  // Marker the user tapped in edit mode (to view/edit comment / remove)
  const [activeMarker, setActiveMarker] = useState<Annotation | null>(null);
  const [editComment, setEditComment] = useState("");
  const [editClassification, setEditClassification] = useState<
    "strength" | "weakness"
  >("strength");

  const openActiveMarker = (ann: Annotation) => {
    setActiveMarker(ann);
    setEditComment(ann.comment ?? "");
    setEditClassification(ann.classification);
  };

  const closeActiveMarker = () => {
    setActiveMarker(null);
    setEditComment("");
    setEditClassification("strength");
  };

  // keep the latest interaction config in refs so the click handler stays stable
  const toolRef = useRef(tool);
  const classificationRef = useRef(classification);
  const enabledRef = useRef(annotationsEnabled);
  const questionRef = useRef(currentQuestionId);
  const annotationsRef = useRef(annotations);
  const readOnlyRef = useRef(readOnly);
  toolRef.current = tool;
  classificationRef.current = classification;
  enabledRef.current = annotationsEnabled;
  questionRef.current = currentQuestionId;
  annotationsRef.current = annotations;
  readOnlyRef.current = readOnly;

  // Initialize map once
  useEffect(() => {
    if (!hasToken || !mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLES.aerial,
      center: focusLocation ?? center,
      zoom,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));

    const ensurePreviewLayers = () => {
      if (!map.getSource("circle-preview")) {
        map.addSource("circle-preview", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "circle-preview-fill",
          type: "fill",
          source: "circle-preview",
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.25 },
        });
        map.addLayer({
          id: "circle-preview-line",
          type: "line",
          source: "circle-preview",
          paint: { "line-color": ["get", "color"], "line-width": 2 },
        });
      }
      if (!map.getSource("freeform-preview")) {
        map.addSource("freeform-preview", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "freeform-preview-fill",
          type: "fill",
          source: "freeform-preview",
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.2 },
        });
        map.addLayer({
          id: "freeform-preview-line",
          type: "line",
          source: "freeform-preview",
          paint: { "line-color": ["get", "color"], "line-width": 2 },
        });
      }
    };

    map.on("load", () => {
      ensurePreviewLayers();
      setMapLoaded(true);
    });
    // Re-add preview layers after a base-style change
    map.on("style.load", ensurePreviewLayers);

    map.on("click", (e) => {
      if (readOnly || !enabledRef.current) return;
      const activeTool = toolRef.current;

      if (activeTool === "pin") {
        setPendingLngLat({ lng: e.lngLat.lng, lat: e.lngLat.lat });
        setPendingComment("");
        return;
      }

      if (activeTool === "circle") {
        if (!circleCenterRef.current) {
          // First click: set the center, begin sizing
          circleCenterRef.current = { lng: e.lngLat.lng, lat: e.lngLat.lat };
          setCircleDrawing(true);
        } else {
          // Second click: finalize the circle and prompt for a comment
          const center = circleCenterRef.current;
          const radius = haversineMeters(center, {
            lng: e.lngLat.lng,
            lat: e.lngLat.lat,
          });
          circleCenterRef.current = null;
          setCircleDrawing(false);
          // Clear the live preview
          const src = map.getSource("circle-preview") as mapboxgl.GeoJSONSource;
          src?.setData({ type: "FeatureCollection", features: [] });
          if (radius > 1) {
            setPendingCircle({ center, radius });
            setPendingComment("");
          }
        }
      }
    });

    // Live preview of the circle as the cursor moves between the two clicks
    map.on("mousemove", (e) => {
      const center = circleCenterRef.current;
      if (!center || toolRef.current !== "circle") return;
      const radius = haversineMeters(center, {
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
      });
      const isStrength = classificationRef.current === "strength";
      const src = map.getSource("circle-preview") as mapboxgl.GeoJSONSource;
      src?.setData({
        type: "FeatureCollection",
        features: [
          circleFeature(center, radius, {
            color: isStrength ? "#059669" : "#dc2626",
          }),
        ],
      });
    });

    // Freeform: start drawing on mousedown, capture points while dragging,
    // finalize on mouseup. Disable map panning so the drag draws instead.
    // Hold Space to pan instead of drawing. Always finish on window mouseup so
    // dragPan is not left disabled if the pointer is released off the map.
    const ensureDragPan = () => {
      if (!map.dragPan.isEnabled()) map.dragPan.enable();
    };

    const finishFreeform = () => {
      if (!freeformDrawingRef.current) {
        ensureDragPan();
        return;
      }
      freeformDrawingRef.current = false;
      ensureDragPan();
      setFreeformDrawing(false);
      const points = freeformPointsRef.current;
      freeformPointsRef.current = [];
      const src = map.getSource("freeform-preview") as mapboxgl.GeoJSONSource;
      src?.setData({ type: "FeatureCollection", features: [] });
      if (points.length > 2) {
        setPendingFreeform({ points });
        setPendingComment("");
      }
    };

    map.on("mousedown", (e) => {
      if (readOnly || !enabledRef.current) return;
      if (toolRef.current !== "freeform") return;
      // Space = temporary pan mode (don't begin a draw).
      if (spaceHeldRef.current || e.originalEvent.button !== 0) return;
      e.preventDefault();
      map.dragPan.disable();
      freeformDrawingRef.current = true;
      freeformPointsRef.current = [{ lng: e.lngLat.lng, lat: e.lngLat.lat }];
      setFreeformDrawing(true);
    });

    map.on("mousemove", (e) => {
      if (!freeformDrawingRef.current || toolRef.current !== "freeform") return;
      freeformPointsRef.current.push({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      const isStrength = classificationRef.current === "strength";
      const src = map.getSource("freeform-preview") as mapboxgl.GeoJSONSource;
      src?.setData({
        type: "FeatureCollection",
        features: [
          freeformFeature(freeformPointsRef.current, {
            color: isStrength ? "#059669" : "#dc2626",
          }),
        ],
      });
    });

    window.addEventListener("mouseup", finishFreeform);
    window.addEventListener("touchend", finishFreeform);

    mapRef.current = map;

    return () => {
      window.removeEventListener("mouseup", finishFreeform);
      window.removeEventListener("touchend", finishFreeform);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken]);

  // Keep drag-pan available whenever we are not actively freeform-drawing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (tool !== "freeform" || !freeformDrawing) {
      if (!freeformDrawingRef.current && !map.dragPan.isEnabled()) {
        map.dragPan.enable();
      }
    }
  }, [tool, freeformDrawing, mapLoaded, annotationsEnabled]);

  // Space = pan while Draw tool is selected (and cancel an in-progress draw).
  useEffect(() => {
    const isSpace = (e: KeyboardEvent) =>
      e.code === "Space" || e.key === " " || e.key === "Spacebar";

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isSpace(e)) return;
      // Avoid page scroll while using Space-to-pan over the map.
      if (toolRef.current === "freeform") e.preventDefault();
      spaceHeldRef.current = true;
      const map = mapRef.current;
      if (!map) return;
      if (freeformDrawingRef.current) {
        freeformDrawingRef.current = false;
        freeformPointsRef.current = [];
        setFreeformDrawing(false);
        const src = map.getSource("freeform-preview") as mapboxgl.GeoJSONSource;
        src?.setData({ type: "FeatureCollection", features: [] });
      }
      if (!map.dragPan.isEnabled()) map.dragPan.enable();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!isSpace(e)) return;
      spaceHeldRef.current = false;
    };

    const clearSpace = () => {
      spaceHeldRef.current = false;
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearSpace);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearSpace);
      spaceHeldRef.current = false;
    };
  }, []);

  // Update cursor based on tool
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const canvas = map.getCanvas();
    const drawable = tool === "pin" || tool === "circle" || tool === "freeform";
    canvas.style.cursor =
      !readOnly && annotationsEnabled && drawable ? "crosshair" : "";
  }, [tool, annotationsEnabled, readOnly, mapLoaded]);

  // Cancel an in-progress circle with Escape; also restore drag-pan.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const map = mapRef.current;
      if (map && !map.dragPan.isEnabled()) map.dragPan.enable();

      if (freeformDrawingRef.current) {
        freeformDrawingRef.current = false;
        freeformPointsRef.current = [];
        setFreeformDrawing(false);
        const src = map?.getSource("freeform-preview") as
          | mapboxgl.GeoJSONSource
          | undefined;
        src?.setData({ type: "FeatureCollection", features: [] });
      }

      if (!circleCenterRef.current) return;
      circleCenterRef.current = null;
      setCircleDrawing(false);
      const src = map?.getSource("circle-preview") as mapboxgl.GeoJSONSource | undefined;
      src?.setData({ type: "FeatureCollection", features: [] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Switch base style
  const changeStyle = useCallback((key: MapStyleKey) => {
    const map = mapRef.current;
    if (!map) return;
    setStyleKey(key);
    map.setStyle(MAP_STYLES[key]);
  }, []);

  // Fly to the selected school and drop a labeled marker for it
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Remove any previous school marker
    if (schoolMarkerRef.current) {
      schoolMarkerRef.current.remove();
      schoolMarkerRef.current = null;
    }

    if (!focusLocation) return;

    const el = document.createElement("div");
    el.style.display = "flex";
    el.style.flexDirection = "column";
    el.style.alignItems = "center";
    el.style.pointerEvents = "none";
    el.innerHTML = `
      <div style="
        max-width: 180px; padding: 2px 8px; margin-bottom: 4px;
        background: rgba(17,24,39,0.9); color: #fff; font-size: 11px; font-weight: 600;
        border-radius: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      ">${focusLabel ?? "Selected School"}</div>
      <div style="
        width: 16px; height: 16px; border-radius: 9999px;
        background: #2563eb; border: 3px solid #fff;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      "></div>
    `;

    schoolMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
      .setLngLat(focusLocation)
      .addTo(map);

    map.flyTo({ center: focusLocation, zoom: 17, speed: 1.2, essential: true });
  }, [focusLocation, focusLabel, mapLoaded]);

  // Render markers whenever annotations / filters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const visible = annotations.filter((a) => {
      if (a.view !== "map") return false;
      if (!annotationMatchesQuestionFilter(a, filterQuestionId, filterQuestionIds))
        return false;
      if (filterClassification != null && a.classification !== filterClassification)
        return false;
      return true;
    });

    // Render committed circles into a dedicated GeoJSON source
    const circles = visible.filter((a) => a.type === "circle" && a.radius);
    const circlesFC: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: circles.map((a) =>
        circleFeature({ lng: a.x, lat: a.y }, a.radius as number, {
          id: a.id,
          color: a.classification === "strength" ? "#059669" : "#dc2626",
        })
      ),
    };
    const ensureCircleLayers = () => {
      if (!map.getSource("circles")) {
        map.addSource("circles", { type: "geojson", data: circlesFC });
        map.addLayer({
          id: "circles-fill",
          type: "fill",
          source: "circles",
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.2 },
        });
        map.addLayer({
          id: "circles-line",
          type: "line",
          source: "circles",
          paint: { "line-color": ["get", "color"], "line-width": 2 },
        });
        map.on("click", "circles-fill", (e) => {
          const fid = e.features?.[0]?.properties?.id as string | undefined;
          const ann = annotationsRef.current.find((x) => x.id === fid);
          if (ann) {
            e.preventDefault();
            if (readOnlyRef.current) setSelectedAnnotation(ann);
            else openActiveMarker(ann);
          }
        });
      } else {
        (map.getSource("circles") as mapboxgl.GeoJSONSource).setData(circlesFC);
      }
    };
    ensureCircleLayers();

    // Render committed freeform shapes into a dedicated GeoJSON source
    const freeforms = visible.filter(
      (a) => a.type === "freeform" && a.points && a.points.length > 2
    );
    const freeformsFC: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: freeforms.map((a) =>
        freeformFeature(
          (a.points as { x: number; y: number }[]).map((p) => ({
            lng: p.x,
            lat: p.y,
          })),
          {
            id: a.id,
            color: a.classification === "strength" ? "#059669" : "#dc2626",
          },
          true
        )
      ),
    };
    const ensureFreeformLayers = () => {
      if (!map.getSource("freeforms")) {
        map.addSource("freeforms", { type: "geojson", data: freeformsFC });
        map.addLayer({
          id: "freeforms-fill",
          type: "fill",
          source: "freeforms",
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.2 },
        });
        map.addLayer({
          id: "freeforms-line",
          type: "line",
          source: "freeforms",
          paint: { "line-color": ["get", "color"], "line-width": 2 },
        });
        map.on("click", "freeforms-fill", (e) => {
          const fid = e.features?.[0]?.properties?.id as string | undefined;
          const ann = annotationsRef.current.find((x) => x.id === fid);
          if (ann) {
            e.preventDefault();
            if (readOnlyRef.current) setSelectedAnnotation(ann);
            else openActiveMarker(ann);
          }
        });
      } else {
        (map.getSource("freeforms") as mapboxgl.GeoJSONSource).setData(freeformsFC);
      }
    };
    ensureFreeformLayers();

    visible
      .filter((a) => a.type !== "circle" && a.type !== "freeform")
      .forEach((a) => {
      const isStrength = a.classification === "strength";
      const el = document.createElement("div");
      el.style.cssText = `
        width: 26px; height: 26px;
        display: flex; align-items: center; justify-content: center;
        color: white; font-size: 12px; font-weight: 700;
        background: ${isStrength ? "#059669" : "#dc2626"};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: pointer;
      `;
      const span = document.createElement("span");
      span.textContent = getAnnotationPinLabel(a.questionId);
      span.style.transform = "rotate(45deg)";
      span.style.fontSize = "9px";
      span.style.lineHeight = "1";
      el.appendChild(span);

      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (readOnly) {
          setSelectedAnnotation(a);
        } else {
          openActiveMarker(a);
        }
      });

      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([a.x, a.y])
        .addTo(map);
      markersRef.current.push(marker);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, mapLoaded, filterQuestionId, filterQuestionIds, filterClassification, readOnly, styleKey]);

  const handleConfirmAnnotation = () => {
    const isStrength = classification === "strength";
    if (pendingFreeform) {
      const pts = pendingFreeform.points;
      const xs = pts.map((p) => p.lng);
      const ys = pts.map((p) => p.lat);
      onAddAnnotation({
        questionId: currentQuestionId,
        type: "freeform",
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
        points: pts.map((p) => ({ x: p.lng, y: p.lat })),
        comment: pendingComment.trim(),
        classification,
        color: isStrength ? "#059669" : "#dc2626",
        view: "map",
      });
      setPendingFreeform(null);
      setPendingComment("");
      onToolChange?.("pan");
      return;
    }
    if (pendingCircle) {
      onAddAnnotation({
        questionId: currentQuestionId,
        type: "circle",
        x: pendingCircle.center.lng,
        y: pendingCircle.center.lat,
        radius: pendingCircle.radius,
        comment: pendingComment.trim(),
        classification,
        color: isStrength ? "#059669" : "#dc2626",
        view: "map",
      });
      setPendingCircle(null);
      setPendingComment("");
      onToolChange?.("pan");
      return;
    }
    if (!pendingLngLat) return;
    onAddAnnotation({
      questionId: currentQuestionId,
      type: "pin",
      x: pendingLngLat.lng,
      y: pendingLngLat.lat,
      comment: pendingComment.trim(),
      classification,
      color: isStrength ? "#059669" : "#dc2626",
      view: "map",
    });
    setPendingLngLat(null);
    setPendingComment("");
    onToolChange?.("pan");
  };

  const handleCancelAnnotation = () => {
    setPendingLngLat(null);
    setPendingCircle(null);
    setPendingFreeform(null);
    setPendingComment("");
    const map = mapRef.current;
    if (map && !map.dragPan.isEnabled()) map.dragPan.enable();
    onToolChange?.("pan");
  };

  if (!hasToken) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-border bg-muted/30">
        <div className="max-w-sm text-center px-6">
          <MapPin className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Map unavailable</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The NEXT_PUBLIC_MAPBOX_TOKEN environment variable is not set.
          </p>
        </div>
      </div>
    );
  }

  return (
      <div className="relative h-full w-full overflow-hidden rounded-md border border-border">
      <div ref={mapContainer} className="h-full w-full" />

      {/* Style switcher */}
      <div className="absolute left-3 top-3 flex overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <button
          onClick={() => changeStyle("aerial")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            styleKey === "aerial"
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-muted"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          Aerial
        </button>
        <button
          onClick={() => changeStyle("satellite")}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            styleKey === "satellite"
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-muted"
          }`}
        >
          Labels
        </button>
        <button
          onClick={() => changeStyle("streets")}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            styleKey === "streets"
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-muted"
          }`}
        >
          Streets
        </button>
      </div>

      {!readOnly && annotationsEnabled && tool === "freeform" && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 max-w-[min(24rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-lg border border-border/70 bg-card/95 px-3 py-1.5 text-center text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm">
          Drag to draw · Hold{" "}
          <kbd className="rounded border border-border bg-muted px-1 font-medium text-foreground">
            Space
          </kbd>{" "}
          and drag to pan
        </div>
      )}

      {/* Circle drawing hint */}
      {circleDrawing && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full bg-foreground/90 px-4 py-1.5 text-xs font-medium text-background shadow-lg">
          Click again to set the size · Esc to cancel
        </div>
      )}

      {/* Freeform drawing hint */}
      {freeformDrawing && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full bg-foreground/90 px-4 py-1.5 text-xs font-medium text-background shadow-lg">
          Drag to draw a shape · release to finish
        </div>
      )}

      {/* Comment popover for read-only mode */}
      {readOnly && selectedAnnotation && (
        <Popover open onOpenChange={(open) => !open && setSelectedAnnotation(null)}>
          <PopoverTrigger asChild>
            <span className="absolute left-1/2 top-1/2 h-0 w-0" />
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0">
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {questionCategoryLabel(selectedAnnotation.questionId)}
                  </p>
                  <span
                    className={`text-sm font-medium ${
                      selectedAnnotation.classification === "strength"
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}
                  >
                    {selectedAnnotation.classification === "strength"
                      ? "Strength"
                      : "Challenge"}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 shrink-0 p-0"
                  onClick={() => setSelectedAnnotation(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {selectedAnnotation.comment ? (
                <p className="text-sm text-foreground">{selectedAnnotation.comment}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">No comment provided</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
      {/* Comment input dialog when placing a new pin, circle, or freeform */}
      {(pendingLngLat || pendingCircle || pendingFreeform) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-2">
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${
                  classification === "strength" ? "bg-emerald-600" : "bg-rose-600"
                }`}
              >
                {currentQuestionId}
              </span>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                Add {classification === "strength" ? "Strength" : "Area of Concern"}{" "}
                {pendingCircle ? "Area" : pendingFreeform ? "Shape" : "Pin"}
              </h3>
            </div>
            <textarea
              value={pendingComment}
              onChange={(e) => setPendingComment(e.target.value)}
              placeholder="Optional: Describe this location..."
              className="w-full resize-none rounded-lg border border-border bg-muted/45 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background"
              rows={3}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancelAnnotation}>
                Cancel
              </Button>
              <Button onClick={handleConfirmAnnotation}>
                {pendingCircle ? "Add Area" : pendingFreeform ? "Add Shape" : "Add Pin"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Active marker dialog (edit mode): edit comment / remove */}
      {!readOnly && activeMarker && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
                    editClassification === "strength"
                      ? "bg-emerald-600"
                      : "bg-rose-600"
                  }`}
                >
                  {getAnnotationPinLabel(activeMarker.questionId)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {questionCategoryLabel(activeMarker.questionId)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={closeActiveMarker}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Mark as
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={editClassification === "strength" ? "default" : "outline"}
                  className={
                    editClassification === "strength"
                      ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                      : undefined
                  }
                  onClick={() => setEditClassification("strength")}
                >
                  Strength
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={editClassification === "weakness" ? "default" : "outline"}
                  className={
                    editClassification === "weakness"
                      ? "border-rose-600 bg-rose-600 text-white hover:bg-rose-700"
                      : undefined
                  }
                  onClick={() => setEditClassification("weakness")}
                >
                  Challenge
                </Button>
              </div>
            </div>
            <textarea
              value={editComment}
              onChange={(e) => setEditComment(e.target.value)}
              placeholder="Add or edit a comment..."
              className="w-full resize-none rounded-lg border border-border bg-muted/45 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background"
              rows={3}
              autoFocus
            />
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button
                variant="destructive"
                onClick={() => {
                  onRemoveAnnotation(activeMarker.id);
                  closeActiveMarker();
                }}
              >
                Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={closeActiveMarker}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    onUpdateAnnotation(activeMarker.id, {
                      comment: editComment.trim(),
                      classification: editClassification,
                      color:
                        editClassification === "strength"
                          ? "#059669"
                          : "#dc2626",
                    });
                    closeActiveMarker();
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
