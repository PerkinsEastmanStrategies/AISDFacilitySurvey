"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ZoomIn,
  ZoomOut,
  Move,
  RotateCcw,
  Maximize,
  X,
  MessageSquare,
  MapPin,
  Info,
  Loader2,
} from "lucide-react";
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
import { clientToSvgPoint, findRoomMatchAtSvgPoint, formatRoomLocationDisplay, logCafmFloorPlanAudit, logRoomsWithinFloorPlanShape, type FloorPlanSelectionShape, type RoomInfo } from "@/lib/spaces-data";
import {
  applySvgViewBox,
  cropMountedSvgToContent,
  enhanceFloorPlanLineContrast,
  resolveSvgViewBox,
  LARGE_SVG_CHAR_THRESHOLD,
  type SvgViewBox,
} from "@/lib/svg-utils";
import type { Tool, Classification } from "@/components/annotation-toolbar";
import type { FloorPlanLevel } from "@/lib/floor-plans";
import { useIsMobile } from "@/hooks/use-mobile";

interface SpaceLabel {
  label: string;
  roomKey: string;
  x: number;
  y: number;
  color?: string;
}

interface FloorPlanViewerProps {
  svgContent: string | null;
  annotations: Annotation[];
  currentQuestionId: number;
  currentColor: string;
  tool: Tool;
  classification: Classification;
  onAddAnnotation: (annotation: Omit<Annotation, "id">) => void;
  onRemoveAnnotation: (id: string) => void;
  onUpdateAnnotation: (
    id: string,
    updates: Partial<Pick<Annotation, "comment" | "classification" | "color">>
  ) => void;
  onToolChange: (tool: Tool) => void;
  filterQuestionId?: number | null;
  filterQuestionIds?: number[] | null;
  filterClassification?: "strength" | "weakness" | null;
  annotationsEnabled?: boolean;
  readOnly?: boolean;
  spaceLabels?: SpaceLabel[];
  /** When set, clicking a room assigns it (used in the Program Spaces step). */
  spacePlacementActive?: boolean;
  /** Called with the clicked room when in space-placement mode. */
  onPlaceRoom?: (room: RoomInfo) => void;
  /** School/building name — used for CAFM floor plan validation logs. */
  buildingName?: string;
  /** Available floor levels for this school (from manifest). */
  availableFloors?: FloorPlanLevel[];
  activeFloorId?: string;
  onFloorChange?: (floorId: string) => void;
  isLoading?: boolean;
  loadingMessage?: string;
}

type ViewBox = SvgViewBox;

export function FloorPlanViewer({
  svgContent,
  annotations,
  currentQuestionId,
  currentColor,
  tool,
  classification,
  onAddAnnotation,
  onRemoveAnnotation,
  onUpdateAnnotation,
  onToolChange,
  filterQuestionId,
  filterQuestionIds,
  filterClassification,
  annotationsEnabled = true,
  readOnly = false,
  spaceLabels = [],
  spacePlacementActive = false,
  onPlaceRoom,
  buildingName,
  availableFloors = [],
  activeFloorId = "floor-1",
  onFloorChange,
  isLoading = false,
  loadingMessage,
}: FloorPlanViewerProps) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<{ x: number; y: number }[]>([]);
  const [circleStart, setCircleStart] = useState<{ x: number; y: number } | null>(null);
  /** Circle center while dragging (midpoint of diameter from edge to edge). */
  const [circleCenter, setCircleCenter] = useState<{ x: number; y: number } | null>(null);
  const [circleRadius, setCircleRadius] = useState(0);
  const [pendingComment, setPendingComment] = useState("");
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState<Omit<Annotation, "id" | "comment"> | null>(null);
  const [highlightPolygon, setHighlightPolygon] = useState<{ x: number; y: number }[] | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [editComment, setEditComment] = useState("");
  const [editClassification, setEditClassification] = useState<
    "strength" | "weakness"
  >("strength");
  const [viewBox, setViewBox] = useState<ViewBox | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  /** Bumps when a new SVG should be mounted into the host (avoids keeping a second full SVG string in React state). */
  const [svgMountKey, setSvgMountKey] = useState(0);
  const pendingSvgRef = useRef<SVGSVGElement | null>(null);
  const svgSourceLengthRef = useRef(0);
  const [svgReady, setSvgReady] = useState(false);

  // Parse SVG and prepare for mount — do not serializeToString (doubles memory on large CAFM plans).
  useEffect(() => {
    if (!svgContent) {
      pendingSvgRef.current = null;
      svgSourceLengthRef.current = 0;
      setViewBox(null);
      setHighlightPolygon(null);
      setSvgReady(false);
      svgRef.current = null;
      setSvgMountKey((k) => k + 1);
      return;
    }

    let cancelled = false;
    const sourceLength = svgContent.length;
    svgSourceLengthRef.current = sourceLength;

    const processSvg = () => {
      if (cancelled) return;

      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, "image/svg+xml");
      const svgElement = doc.querySelector("svg");

      if (!svgElement) {
        pendingSvgRef.current = null;
        setViewBox(null);
        setSvgReady(false);
        setSvgMountKey((k) => k + 1);
        return;
      }

      const effectiveViewBox = resolveSvgViewBox(svgElement, sourceLength);
      if (effectiveViewBox) {
        applySvgViewBox(svgElement, effectiveViewBox);
        setViewBox(effectiveViewBox);
      } else {
        setViewBox(null);
      }

      enhanceFloorPlanLineContrast(svgElement, doc, {
        boost: isMobile ? "mobile" : "default",
      });
      pendingSvgRef.current = svgElement;
      setSvgReady(true);
      setSvgMountKey((k) => k + 1);
    };

    // Yield so the "Show floor plan" tap can paint before heavy parse work.
    const timer = window.setTimeout(processSvg, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [svgContent, isMobile]);

  useEffect(() => {
    if (!svgHostRef.current) {
      svgRef.current = null;
      return;
    }

    svgHostRef.current.replaceChildren();
    const source = pendingSvgRef.current;
    if (!source || !svgReady) {
      svgRef.current = null;
      return;
    }

    const mounted = document.importNode(source, true) as SVGSVGElement;
    mounted.setAttribute("width", "100%");
    mounted.setAttribute("height", "100%");
    mounted.style.maxWidth = "100%";
    mounted.style.maxHeight = "100%";
    svgHostRef.current.appendChild(mounted);
    svgRef.current = mounted;
    // Drop the parse-tree copy once mounted so phones aren't holding two full DOMs.
    pendingSvgRef.current = null;

    setHighlightPolygon(null);

    // Crop empty CAFM canvas margins so the building fills the viewer.
    // Skip only for very large files where getBBox can be costly on phones.
    const canCrop =
      svgSourceLengthRef.current > 0 &&
      svgSourceLengthRef.current < LARGE_SVG_CHAR_THRESHOLD * 2;
    if (canCrop) {
      const frameId = requestAnimationFrame(() => {
        if (svgRef.current !== mounted) return;
        const cropped = cropMountedSvgToContent(mounted);
        if (cropped) setViewBox(cropped);
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [svgMountKey, svgReady]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!svgRef.current) return;

    const runAudit = () => {
      if (svgRef.current) {
        logCafmFloorPlanAudit(svgRef.current, buildingName);
      }
    };

    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleHandle = window.requestIdleCallback(runAudit, { timeout: 4000 });
    } else {
      timeoutHandle = setTimeout(runAudit, 150);
    }

    return () => {
      if (idleHandle !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
    };
  }, [svgMountKey, svgReady, buildingName]);

  // Track container size
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Calculate scale to fit — small padding so the building fills the panel.
  const calculateFitScale = useCallback(() => {
    if (!viewBox || containerSize.width === 0) return 1;
    const padding = 4;
    const scaleX = (containerSize.width - padding) / viewBox.width;
    const scaleY = (containerSize.height - padding) / viewBox.height;
    return Math.min(scaleX, scaleY);
  }, [viewBox, containerSize]);

  // Auto-fit when SVG loads or container resizes
  useEffect(() => {
    if (viewBox && containerSize.width > 0) {
      const fitScale = calculateFitScale();
      setZoom(fitScale);
      
      // Center the content
      const scaledWidth = viewBox.width * fitScale;
      const scaledHeight = viewBox.height * fitScale;
      setPan({
        x: (containerSize.width - scaledWidth) / 2,
        y: (containerSize.height - scaledHeight) / 2,
      });
    }
  }, [viewBox, containerSize, calculateFitScale]);

  // Convert screen coordinates to SVG viewBox coordinates
  const screenToSvg = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } => {
      if (!viewBox || !containerRef.current) return { x: 0, y: 0 };
      
      const rect = containerRef.current.getBoundingClientRect();
      
      // Position relative to container
      const relX = screenX - rect.left;
      const relY = screenY - rect.top;
      
      // Remove pan offset and scale to get position in scaled SVG space
      const scaledX = (relX - pan.x) / zoom;
      const scaledY = (relY - pan.y) / zoom;
      
      // Add viewBox offset to get final SVG coordinates
      const svgX = scaledX + viewBox.x;
      const svgY = scaledY + viewBox.y;
      
      return { x: svgX, y: svgY };
    },
    [pan, zoom, viewBox]
  );

  const getEventSvgCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      if (svgRef.current) {
        return clientToSvgPoint(svgRef.current, clientX, clientY);
      }
      return screenToSvg(clientX, clientY);
    },
    [screenToSvg]
  );

  const detectRoomMatchAtEvent = useCallback(
    (clientX: number, clientY: number) => {
      if (svgRef.current) {
        return findRoomMatchAtSvgPoint(svgRef.current, clientX, clientY);
      }
      return { room: null, highlightPoints: null, highlightElement: null };
    },
    []
  );

  const clearSvgRoomHighlight = useCallback(() => {
    svgRef.current
      ?.querySelectorAll("[data-room-highlight]")
      .forEach((element) => element.remove());
  }, []);

  const applyRoomHighlight = useCallback(
    (clientX: number, clientY: number) => {
      clearSvgRoomHighlight();

      const { highlightPoints, highlightElement } = detectRoomMatchAtEvent(
        clientX,
        clientY
      );

      if (highlightElement && svgRef.current?.contains(highlightElement)) {
        const clone = highlightElement.cloneNode(true) as SVGGraphicsElement;
        clone.removeAttribute("id");
        clone.setAttribute("data-room-highlight", "true");
        clone.style.fill = "rgba(59, 130, 246, 0.55)";
        clone.style.stroke = "rgb(29, 78, 216)";
        clone.style.strokeWidth = "2px";
        clone.style.pointerEvents = "none";
        highlightElement.parentNode?.insertBefore(clone, highlightElement.nextSibling);
        setHighlightPolygon(null);
        return;
      }

      setHighlightPolygon(
        highlightPoints && highlightPoints.length >= 3 ? highlightPoints : null
      );
    },
    [clearSvgRoomHighlight, detectRoomMatchAtEvent]
  );

  useEffect(() => {
    setHighlightPolygon(null);
    clearSvgRoomHighlight();
  }, [activeFloorId, clearSvgRoomHighlight]);

  // Convert SVG viewBox coordinates to screen-space offset (for rendering)
  const svgToScreen = useCallback(
    (svgX: number, svgY: number): { x: number; y: number } => {
      if (!viewBox) return { x: 0, y: 0 };
      
      // Remove viewBox offset
      const localX = svgX - viewBox.x;
      const localY = svgY - viewBox.y;
      
      // Apply scale and pan
      const screenX = localX * zoom + pan.x;
      const screenY = localY * zoom + pan.y;
      
      return { x: screenX, y: screenY };
    },
    [pan, zoom, viewBox]
  );

  const getRoomsInDrawnShape = useCallback(
    (shape: FloorPlanSelectionShape): RoomInfo[] => {
      if (!svgRef.current) return [];
      return logRoomsWithinFloorPlanShape(svgRef.current, shape, {
        buildingName,
        shapeLabel: shape.type,
      });
    },
    [buildingName]
  );

  const toRoomsInShapeField = (rooms: RoomInfo[]) =>
    rooms.map((room) => ({
      roomKey: room.key,
      roomLabel: room.label,
    }));

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!svgContent || !viewBox) return;
    e.preventDefault();

    // Program Spaces step: click a room to assign it to the active space
    if (spacePlacementActive) {
      const { room } = detectRoomMatchAtEvent(e.clientX, e.clientY);
      applyRoomHighlight(e.clientX, e.clientY);
      if (room && onPlaceRoom) {
        onPlaceRoom(room);
      }
      return;
    }

    // If in pan mode or annotations are disabled, just pan
    if (tool === "pan" || !annotationsEnabled) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }
    
    if (tool === "pin") {
      const coords = getEventSvgCoords(e.clientX, e.clientY);
      const { room } = detectRoomMatchAtEvent(e.clientX, e.clientY);
      applyRoomHighlight(e.clientX, e.clientY);
      setPendingAnnotation({
        questionId: currentQuestionId,
        type: "pin",
        x: coords.x,
        y: coords.y,
        classification,
        color: currentColor,
        roomKey: room?.key,
        roomLabel: room?.label,
        floorKey: activeFloorId,
      });
      setShowCommentInput(true);
    } else if (tool === "circle") {
      // First press = a point on the circle edge; drag to the opposite edge.
      const coords = getEventSvgCoords(e.clientX, e.clientY);
      setCircleStart(coords);
      setCircleCenter(coords);
      setCircleRadius(0);
      setIsDrawing(true);
    } else if (tool === "freeform") {
      const coords = getEventSvgCoords(e.clientX, e.clientY);
      setDrawingPoints([coords]);
      setIsDrawing(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    } else if (isDrawing && tool === "circle" && circleStart) {
      const coords = getEventSvgCoords(e.clientX, e.clientY);
      const center = {
        x: (circleStart.x + coords.x) / 2,
        y: (circleStart.y + coords.y) / 2,
      };
      const radius =
        Math.hypot(coords.x - circleStart.x, coords.y - circleStart.y) / 2;
      setCircleCenter(center);
      setCircleRadius(radius);
    } else if (isDrawing && tool === "freeform") {
      const coords = getEventSvgCoords(e.clientX, e.clientY);
      setDrawingPoints((prev) => [...prev, coords]);
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    } else if (isDrawing && tool === "circle" && circleStart && circleCenter) {
      const roomsInShape =
        circleRadius > 0
          ? getRoomsInDrawnShape({
              type: "circle",
              x: circleCenter.x,
              y: circleCenter.y,
              radius: circleRadius,
            })
          : [];

      if (circleRadius > 0) {
        setPendingAnnotation({
          questionId: currentQuestionId,
          type: "circle",
          x: circleCenter.x,
          y: circleCenter.y,
          radius: circleRadius,
          classification,
          color: currentColor,
          floorKey: activeFloorId,
          roomsInShape: toRoomsInShapeField(roomsInShape),
        });
        setShowCommentInput(true);
      }
      setIsDrawing(false);
      setCircleStart(null);
      setCircleCenter(null);
      setCircleRadius(0);
    } else if (isDrawing && tool === "freeform" && drawingPoints.length > 2) {
      const bounds = drawingPoints.reduce(
        (acc, p) => ({
          minX: Math.min(acc.minX, p.x),
          maxX: Math.max(acc.maxX, p.x),
          minY: Math.min(acc.minY, p.y),
          maxY: Math.max(acc.maxY, p.y),
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      );
      const roomsInShape = getRoomsInDrawnShape({
        type: "polygon",
        points: drawingPoints,
      });

      setPendingAnnotation({
        questionId: currentQuestionId,
        type: "freeform",
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
        points: drawingPoints,
        classification,
        color: currentColor,
        floorKey: activeFloorId,
        roomsInShape: toRoomsInShapeField(roomsInShape),
      });
      setShowCommentInput(true);
      setIsDrawing(false);
      setDrawingPoints([]);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(10, zoom * delta));
    
    // Zoom toward mouse position
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const newPanX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
      const newPanY = mouseY - (mouseY - pan.y) * (newZoom / zoom);
      
      setPan({ x: newPanX, y: newPanY });
    }
    setZoom(newZoom);
  };

  const handleConfirmAnnotation = () => {
    if (pendingAnnotation) {
      onAddAnnotation({
        ...pendingAnnotation,
        comment: pendingComment,
        view: "floorplan",
      });
      setPendingAnnotation(null);
      setPendingComment("");
      setShowCommentInput(false);
      setHighlightPolygon(null);
      clearSvgRoomHighlight();
      // Reset to pan mode after annotation
      onToolChange("pan");
    }
  };

  const handleCancelAnnotation = () => {
    setPendingAnnotation(null);
    setPendingComment("");
    setShowCommentInput(false);
    setHighlightPolygon(null);
    clearSvgRoomHighlight();
    setDrawingPoints([]);
    setCircleStart(null);
    setCircleCenter(null);
    setCircleRadius(0);
  };

  const fitToWindow = () => {
    if (viewBox && containerSize.width > 0) {
      const fitScale = calculateFitScale();
      setZoom(fitScale);
      const scaledWidth = viewBox.width * fitScale;
      const scaledHeight = viewBox.height * fitScale;
      setPan({
        x: (containerSize.width - scaledWidth) / 2,
        y: (containerSize.height - scaledHeight) / 2,
      });
    }
  };

  const filteredAnnotations = annotations.filter((a) => {
    // Only show floor plan annotations here (treat legacy untagged ones as floor plan)
    if (a.view === "map") return false;
    if (a.floorKey) {
      if (a.floorKey !== activeFloorId) return false;
    } else if (activeFloorId !== "floor-1") {
      return false;
    }
    if (!annotationMatchesQuestionFilter(a, filterQuestionId, filterQuestionIds))
      return false;
    if (filterClassification && a.classification !== filterClassification) return false;
    return true;
  });

  // Handle annotation click
  const renderAnnotationRoomContext = (annotation: {
    roomKey?: string;
    roomLabel?: string;
    roomsInShape?: Array<{ roomKey: string; roomLabel?: string }>;
  }) => {
    if (annotation.roomKey) {
      return (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="font-semibold text-foreground">
            {formatRoomLocationDisplay(annotation.roomKey, annotation.roomLabel)}
          </span>
        </div>
      );
    }

    if (!annotation.roomsInShape?.length) return null;

    return (
      <div className="mb-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="font-semibold uppercase tracking-wide">
            Rooms in selection ({annotation.roomsInShape.length})
          </span>
        </div>
        <ul className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
          {annotation.roomsInShape.map((room) => (
            <li
              key={room.roomKey}
              className="rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs text-foreground"
            >
              {formatRoomLocationDisplay(room.roomKey, room.roomLabel)}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const handleAnnotationClick = (annotation: Annotation, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedAnnotation(annotation);
    setEditComment(annotation.comment ?? "");
    setEditClassification(annotation.classification);
  };

  const closeAnnotationPopover = () => {
    setSelectedAnnotation(null);
    setEditComment("");
    setEditClassification("strength");
  };

  const saveSelectedAnnotationComment = () => {
    if (!selectedAnnotation) return;
    const color =
      editClassification === "strength" ? "#059669" : "#dc2626";
    onUpdateAnnotation(selectedAnnotation.id, {
      comment: editComment.trim(),
      classification: editClassification,
      color,
    });
    closeAnnotationPopover();
  };

  const deleteSelectedAnnotation = () => {
    if (!selectedAnnotation) return;
    onRemoveAnnotation(selectedAnnotation.id);
    closeAnnotationPopover();
  };

  const renderAnnotationPopoverBody = (annotation: Annotation) => {
    const isStrength = annotation.classification === "strength";
    return (
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {questionCategoryLabel(annotation.questionId)}
            </p>
            <span
              className={`text-sm font-medium ${
                isStrength ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {isStrength ? "Strength" : "Challenge"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 shrink-0 p-0"
            onClick={closeAnnotationPopover}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        {renderAnnotationRoomContext(annotation)}
        {annotation.comment ? (
          <p className="text-sm text-foreground">{annotation.comment}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">No comment provided</p>
        )}
      </div>
    );
  };

  // Render a pin annotation
  const renderPin = (annotation: Annotation) => {
    const screen = svgToScreen(annotation.x, annotation.y);
    const size = 28;
    const isStrength = annotation.classification === "strength";
    const isSelected = selectedAnnotation?.id === annotation.id;

    const pinElement = (
      <div
        className={`absolute pointer-events-auto cursor-pointer group ${isSelected ? "z-10" : ""}`}
        style={{
          left: screen.x - size / 2,
          top: screen.y - size,
          width: size,
          height: size,
        }}
        onClick={(e) => handleAnnotationClick(annotation, e)}
        title={readOnly ? "Click to view comment" : "Click to edit or delete"}
      >
        <div
          className={`w-full h-full flex items-center justify-center text-white text-xs font-bold shadow-lg transition-transform group-hover:scale-110 ${isSelected ? "scale-125 ring-2 ring-white ring-offset-2" : ""}`}
          style={{
            backgroundColor: isStrength ? "#059669" : "#dc2626",
            borderRadius: "50% 50% 50% 0",
            transform: "rotate(-45deg)",
          }}
        >
          <span style={{ transform: "rotate(45deg)", fontSize: "9px", lineHeight: 1 }}>
            {getAnnotationPinLabel(annotation.questionId)}
          </span>
        </div>
      </div>
    );

    if (readOnly) {
      return (
        <Popover
          key={annotation.id}
          open={isSelected}
          onOpenChange={(open) => !open && closeAnnotationPopover()}
        >
          <PopoverTrigger asChild>{pinElement}</PopoverTrigger>
          <PopoverContent className="w-72 p-0" side="top" sideOffset={8}>
            {renderAnnotationPopoverBody(annotation)}
          </PopoverContent>
        </Popover>
      );
    }

    return <div key={annotation.id}>{pinElement}</div>;
  };

  // Render circle annotation as screen-space element
  const renderCircle = (annotation: Annotation) => {
    if (!annotation.radius || !viewBox) return null;
    const center = svgToScreen(annotation.x, annotation.y);
    const radiusScreen = annotation.radius * zoom;
    const isStrength = annotation.classification === "strength";
    const isSelected = selectedAnnotation?.id === annotation.id;

    const circleElement = (
      <div
        className={`absolute pointer-events-auto cursor-pointer ${isSelected ? "z-10" : ""}`}
        style={{
          left: center.x - radiusScreen,
          top: center.y - radiusScreen,
          width: radiusScreen * 2,
          height: radiusScreen * 2,
        }}
        onClick={(e) => handleAnnotationClick(annotation, e)}
        title={readOnly ? "Click to view comment" : "Click to edit or delete"}
      >
        <svg className="w-full h-full" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="48"
            fill={isStrength ? "#059669" : "#dc2626"}
            fillOpacity={isSelected ? 0.35 : 0.2}
            stroke={isStrength ? "#059669" : "#dc2626"}
            strokeWidth={isSelected ? 4 : 3}
            strokeDasharray={isStrength ? "none" : "8 4"}
          />
          <text
            x="50"
            y="55"
            textAnchor="middle"
            fill={isStrength ? "#059669" : "#dc2626"}
            fontSize="24"
            fontWeight="bold"
          >
            {getAnnotationPinLabel(annotation.questionId)}
          </text>
        </svg>
      </div>
    );

    if (readOnly) {
      return (
        <Popover
          key={annotation.id}
          open={isSelected}
          onOpenChange={(open) => !open && closeAnnotationPopover()}
        >
          <PopoverTrigger asChild>{circleElement}</PopoverTrigger>
          <PopoverContent className="w-72 p-0" side="top" sideOffset={8}>
            {renderAnnotationPopoverBody(annotation)}
          </PopoverContent>
        </Popover>
      );
    }

    return <div key={annotation.id}>{circleElement}</div>;
  };

  // Render freeform annotation
  const renderFreeform = (annotation: Annotation) => {
    if (!annotation.points || annotation.points.length < 2 || !viewBox) return null;

    // Convert all points to screen coordinates
    const screenPoints = annotation.points.map((p) => svgToScreen(p.x, p.y));

    // Find bounding box
    const minX = Math.min(...screenPoints.map((p) => p.x));
    const maxX = Math.max(...screenPoints.map((p) => p.x));
    const minY = Math.min(...screenPoints.map((p) => p.y));
    const maxY = Math.max(...screenPoints.map((p) => p.y));

    const width = maxX - minX + 20;
    const height = maxY - minY + 20;

    // Translate points relative to the bounding box
    const relPoints = screenPoints.map((p) => ({
      x: p.x - minX + 10,
      y: p.y - minY + 10,
    }));

    const pathD = `M ${relPoints.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`;
    const isStrength = annotation.classification === "strength";
    const isSelected = selectedAnnotation?.id === annotation.id;

    const freeformElement = (
      <div
        className={`absolute pointer-events-auto cursor-pointer ${isSelected ? "z-10" : ""}`}
        style={{
          left: minX - 10,
          top: minY - 10,
          width,
          height,
        }}
        onClick={(e) => handleAnnotationClick(annotation, e)}
        title={readOnly ? "Click to view comment" : "Click to edit or delete"}
      >
        <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`}>
          <path
            d={pathD}
            fill={isStrength ? "#059669" : "#dc2626"}
            fillOpacity={isSelected ? 0.35 : 0.2}
            stroke={isStrength ? "#059669" : "#dc2626"}
            strokeWidth={isSelected ? 4 : 3}
            strokeDasharray={isStrength ? "none" : "8 4"}
          />
        </svg>
      </div>
    );

    if (readOnly) {
      return (
        <Popover
          key={annotation.id}
          open={isSelected}
          onOpenChange={(open) => !open && closeAnnotationPopover()}
        >
          <PopoverTrigger asChild>{freeformElement}</PopoverTrigger>
          <PopoverContent className="w-72 p-0" side="top" sideOffset={8}>
            {renderAnnotationPopoverBody(annotation)}
          </PopoverContent>
        </Popover>
      );
    }

    return <div key={annotation.id}>{freeformElement}</div>;
  };

  // Render a program-space label pinned to a room centroid
  const renderSpaceLabel = (space: SpaceLabel) => {
    if (!viewBox) return null;
    const screen = svgToScreen(space.x, space.y);
    const color = space.color ?? "hsl(220, 70%, 50%)";
    return (
      <div
        key={`space-${space.label}-${space.roomKey}`}
        className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2"
        style={{ left: screen.x, top: screen.y }}
      >
        <div className="flex flex-col items-center gap-0.5">
          <div
            className="whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold leading-tight text-white shadow-md"
            style={{ backgroundColor: color }}
          >
            {space.label}
          </div>
          <div className="rounded bg-card/90 px-1.5 text-[10px] font-medium text-foreground shadow-sm">
            {space.roomKey}
          </div>
        </div>
      </div>
    );
  };

  // Render drawing preview
  const renderDrawingPreview = () => {
    if (!isDrawing || !viewBox) return null;
    
    if (tool === "circle" && circleCenter && circleRadius > 0) {
      const center = svgToScreen(circleCenter.x, circleCenter.y);
      const radiusScreen = circleRadius * zoom;
      const isStrength = classification === "strength";
      return (
        <div
          className="absolute pointer-events-none"
          style={{
            left: center.x - radiusScreen,
            top: center.y - radiusScreen,
            width: radiusScreen * 2,
            height: radiusScreen * 2,
          }}
        >
          <svg className="w-full h-full" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="48"
              fill={isStrength ? "#059669" : "#dc2626"}
              fillOpacity={0.1}
              stroke={isStrength ? "#059669" : "#dc2626"}
              strokeWidth={2}
              strokeDasharray="8 4"
            />
          </svg>
        </div>
      );
    }
    
    if (tool === "freeform" && drawingPoints.length > 1) {
      const screenPoints = drawingPoints.map(p => svgToScreen(p.x, p.y));
      const minX = Math.min(...screenPoints.map(p => p.x));
      const maxX = Math.max(...screenPoints.map(p => p.x));
      const minY = Math.min(...screenPoints.map(p => p.y));
      const maxY = Math.max(...screenPoints.map(p => p.y));
      
      const width = maxX - minX + 20;
      const height = maxY - minY + 20;
      
      const relPoints = screenPoints.map(p => ({
        x: p.x - minX + 10,
        y: p.y - minY + 10,
      }));
      
      const pathD = `M ${relPoints.map(p => `${p.x} ${p.y}`).join(" L ")}`;
      const isStrength = classification === "strength";
      
      return (
        <div
          className="absolute pointer-events-none"
          style={{
            left: minX - 10,
            top: minY - 10,
            width,
            height,
          }}
        >
          <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`}>
            <path
              d={pathD}
              fill="none"
              stroke={isStrength ? "#059669" : "#dc2626"}
              strokeWidth={2}
              strokeDasharray="8 4"
            />
          </svg>
        </div>
      );
    }
    
    return null;
  };

  const renderRoomHighlight = () => {
    if (!highlightPolygon || highlightPolygon.length < 3 || !viewBox) return null;

    const closedPoints = [...highlightPolygon];
    const first = closedPoints[0];
    const last = closedPoints[closedPoints.length - 1];
    if (first.x !== last.x || first.y !== last.y) {
      closedPoints.push(first);
    }

    return (
      <svg
        className="absolute pointer-events-none z-[5]"
        style={{
          left: pan.x,
          top: pan.y,
          width: viewBox.width * zoom,
          height: viewBox.height * zoom,
        }}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      >
        <polygon
          points={closedPoints.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="rgba(59, 130, 246, 0.55)"
          stroke="rgb(29, 78, 216)"
          strokeWidth={2.5 / zoom}
          fillRule="nonzero"
        />
      </svg>
    );
  };

  // Determine cursor based on tool and state
  const getCursor = () => {
    if (isPanning) return "grabbing";
    if (spacePlacementActive) return "copy";
    if (tool === "pan" || !annotationsEnabled) return "grab";
    return "crosshair";
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      {/* Mini Toolbar - pan, floor levels, zoom */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1 rounded-md border border-border/60 bg-card p-1 shadow-sm">
        <div className="flex flex-wrap items-center gap-0.5">
          <Button
            variant={tool === "pan" || !annotationsEnabled ? "default" : "ghost"}
            size="sm"
            onClick={() => onToolChange("pan")}
            title="Pan / Navigate"
            className="h-6 gap-0.5 px-1.5"
          >
            <Move className="h-3 w-3" />
            <span className="hidden text-[10px] sm:inline">Navigate</span>
          </Button>

          {availableFloors.length > 1 && onFloorChange && (
            <div
              data-tour="floor-toggle"
              className="flex overflow-hidden rounded border border-border bg-background shadow-sm"
            >
              {availableFloors.map((floor) => (
                <button
                  key={floor.id}
                  type="button"
                  onClick={() => onFloorChange(floor.id)}
                  className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors sm:px-2 ${
                    activeFloorId === floor.id
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
                  }`}
                  title={floor.fullLabel}
                >
                  {floor.shortLabel}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-px">
          <Button variant="ghost" size="sm" onClick={() => setZoom((z) => Math.min(z * 1.2, 10))} className="h-6 w-6">
            <ZoomIn className="h-3 w-3" />
          </Button>
          <span className="min-w-[2.25rem] text-center text-[10px] font-medium text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="sm" onClick={() => setZoom((z) => Math.max(z / 1.2, 0.1))} className="h-6 w-6">
            <ZoomOut className="h-3 w-3" />
          </Button>
          <div className="mx-px h-4 w-px bg-border" />
          <Button variant="ghost" size="sm" onClick={fitToWindow} title="Fit to Window" className="h-6 w-6">
            <Maximize className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={fitToWindow} title="Reset View" className="h-6 w-6">
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Floor Plan Area */}
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-border/60 bg-gradient-to-br from-slate-50 to-slate-100 shadow-inner"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: getCursor() }}
      >
        {svgReady && viewBox ? (
          <>
            {/* Inline SVG for accurate coordinate mapping and room hit-testing */}
            <div
              ref={svgHostRef}
              className="absolute pointer-events-none select-none [&>svg]:h-full [&>svg]:w-full"
              style={{
                left: pan.x,
                top: pan.y,
                width: viewBox.width * zoom,
                height: viewBox.height * zoom,
              }}
            />

            {/* Annotations layer */}
            <div className="absolute inset-0 pointer-events-none">
              {renderRoomHighlight()}
              {filteredAnnotations.map((annotation) => {
                if (annotation.type === "pin") return renderPin(annotation);
                if (annotation.type === "circle") return renderCircle(annotation);
                if (annotation.type === "freeform") return renderFreeform(annotation);
                return null;
              })}
              {spaceLabels.map((space) => renderSpaceLabel(space))}
              {renderDrawingPreview()}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary/70" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {loadingMessage ??
                (isLoading || svgContent
                  ? "Loading floor plan…"
                  : "Select a school to load its floor plan.")}
            </p>
            {(isLoading || svgContent) && svgContent && svgContent.length >= LARGE_SVG_CHAR_THRESHOLD && (
              <p className="max-w-xs text-xs text-muted-foreground/80">
                Large plan file — this may take a moment on first load.
              </p>
            )}
          </div>
        )}
      </div>

      <p className="flex shrink-0 items-start gap-1 rounded border border-border/60 bg-muted/40 px-2 py-1 text-[9px] leading-snug text-muted-foreground">
        <Info className="mt-0.5 h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>
          These floor plans reflect the latest plans provided by AISD. Recent construction or
          renovation projects may not yet be shown. If you need to comment on a new or changed
          portion of a building that is not represented here, please use the{" "}
          <span className="font-medium text-foreground">Site Map</span> aerial view instead.
        </span>
      </p>

      {/* Comment Input Dialog */}
      {showCommentInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
            <h3 className="font-heading text-lg font-semibold text-foreground mb-4">Add Annotation Comment</h3>
            {pendingAnnotation && renderAnnotationRoomContext(pendingAnnotation)}
            <textarea
              value={pendingComment}
              onChange={(e) => setPendingComment(e.target.value)}
              placeholder="Optional: Describe this location..."
              className="w-full rounded-lg border border-border bg-muted/45 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background"
              rows={3}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancelAnnotation}>
                Cancel
              </Button>
              <Button onClick={handleConfirmAnnotation}>
                Add Annotation
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / delete existing annotation */}
      {!readOnly && selectedAnnotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {questionCategoryLabel(selectedAnnotation.questionId)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 shrink-0 p-0"
                onClick={closeAnnotationPopover}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            {renderAnnotationRoomContext(selectedAnnotation)}
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
              <Button variant="destructive" onClick={deleteSelectedAnnotation}>
                Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={closeAnnotationPopover}>
                  Close
                </Button>
                <Button onClick={saveSelectedAnnotationComment}>Save</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
