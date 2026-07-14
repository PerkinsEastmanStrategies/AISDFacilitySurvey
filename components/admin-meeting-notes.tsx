"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  ClipboardCopy,
  GripVertical,
  Maximize2,
  Minus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";

const NOTES_DATA_PREFIX = "aisd-admin-meeting-notes:v2:";
const NOTES_DATA_PREFIX_V1 = "aisd-admin-meeting-notes:v1:";
const NOTES_SIZE_KEY = "aisd-admin-meeting-notes-size:v2";

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 460;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 280;
const MINIMIZED_HEIGHT = 44;
const EDGE = 16;
const OVERLAY_ID = "aisd-admin-notes-overlay-root";

type MeetingNoteRecord = {
  assessors: string;
  schoolLeaderParticipant: string;
  meetingDate: string;
  body: string;
};

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatMeetingDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function schoolNoteKey(school: string): string {
  return `${NOTES_DATA_PREFIX}${school.trim()}`;
}

function emptyNote(): MeetingNoteRecord {
  return {
    assessors: "",
    schoolLeaderParticipant: "",
    meetingDate: todayIsoDate(),
    body: "",
  };
}

function loadNoteRecord(school: string): MeetingNoteRecord {
  if (typeof window === "undefined") return emptyNote();
  try {
    const raw = localStorage.getItem(schoolNoteKey(school));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MeetingNoteRecord>;
      return {
        assessors: typeof parsed.assessors === "string" ? parsed.assessors : "",
        schoolLeaderParticipant:
          typeof parsed.schoolLeaderParticipant === "string"
            ? parsed.schoolLeaderParticipant
            : "",
        meetingDate:
          typeof parsed.meetingDate === "string" && parsed.meetingDate
            ? parsed.meetingDate
            : todayIsoDate(),
        body: typeof parsed.body === "string" ? parsed.body : "",
      };
    }
    const legacy = localStorage.getItem(
      `${NOTES_DATA_PREFIX_V1}${school.trim()}`
    );
    if (legacy) return { ...emptyNote(), body: legacy };
  } catch {
    // ignore
  }
  return emptyNote();
}

function saveNoteRecord(school: string, record: MeetingNoteRecord) {
  try {
    localStorage.setItem(schoolNoteKey(school), JSON.stringify(record));
  } catch {
    // ignore
  }
}

function viewportSize() {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
}

function clampSize(width: number, height: number) {
  const vp = viewportSize();
  return {
    width: Math.min(Math.max(MIN_WIDTH, width), Math.max(MIN_WIDTH, vp.width - EDGE * 2)),
    height: Math.min(
      Math.max(MIN_HEIGHT, height),
      Math.max(MIN_HEIGHT, vp.height - EDGE * 2)
    ),
  };
}

function midRightPosition(width: number, height: number) {
  const vp = viewportSize();
  return {
    x: Math.max(EDGE, vp.width - width - EDGE),
    y: Math.max(EDGE, Math.round((vp.height - height) / 2)),
  };
}

function clampPos(x: number, y: number, width: number, height: number) {
  const vp = viewportSize();
  return {
    x: Math.min(Math.max(EDGE, x), Math.max(EDGE, vp.width - width - EDGE)),
    y: Math.min(Math.max(EDGE, y), Math.max(EDGE, vp.height - height - EDGE)),
  };
}

function loadSavedSize(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
  try {
    const raw = localStorage.getItem(NOTES_SIZE_KEY);
    if (!raw) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
    const parsed = JSON.parse(raw) as { width?: number; height?: number };
    const width =
      typeof parsed.width === "number" ? parsed.width : DEFAULT_WIDTH;
    const height =
      typeof parsed.height === "number" ? parsed.height : DEFAULT_HEIGHT;
    // Reject near-fullscreen heights that used to pin the panel.
    if (height > window.innerHeight * 0.75) {
      return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
    }
    return clampSize(width, height);
  } catch {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
}

function getOverlayRoot(): HTMLElement {
  let root = document.getElementById(OVERLAY_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = OVERLAY_ID;
    // Full-viewport layer attached to <html>, so placement is never relative
    // to a transformed/scrolling subsection of the admin page.
    root.setAttribute(
      "style",
      [
        "position:fixed",
        "inset:0",
        "width:100vw",
        "height:100vh",
        "pointer-events:none",
        "z-index:2147483000",
        "overflow:visible",
      ].join(";")
    );
    document.documentElement.appendChild(root);
  }
  return root;
}

function formatCopyText(school: string, record: MeetingNoteRecord): string {
  return [
    `School: ${school}`,
    `Date: ${formatMeetingDate(record.meetingDate)}`,
    `Assessor(s): ${record.assessors || "—"}`,
    `School Leader Participant: ${record.schoolLeaderParticipant || "—"}`,
    "",
    "Notes:",
    record.body || "—",
  ].join("\n");
}

type AdminMeetingNotesProps = {
  school: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AdminMeetingNotes({
  school,
  open,
  onOpenChange,
}: AdminMeetingNotesProps) {
  const [mounted, setMounted] = useState(false);
  const [size, setSize] = useState({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  });
  const [position, setPosition] = useState({ x: EDGE, y: EDGE });
  const [minimized, setMinimized] = useState(false);
  const [record, setRecord] = useState<MeetingNoteRecord>(() => emptyNote());
  const [copied, setCopied] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originW: number;
    originH: number;
    originX: number;
    originY: number;
  } | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const schoolRef = useRef(school);
  const recordRef = useRef(record);
  recordRef.current = record;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const positionRef = useRef(position);
  positionRef.current = position;
  const expandedHeightRef = useRef(DEFAULT_HEIGHT);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!school.trim()) return;
    setRecord(loadNoteRecord(school));
    schoolRef.current = school;
  }, [school]);

  // Place mid-right in the viewport overlay whenever the panel opens.
  useLayoutEffect(() => {
    if (!open) return;
    const nextSize = loadSavedSize();
    const placed = midRightPosition(nextSize.width, nextSize.height);
    setMinimized(false);
    setSize(nextSize);
    setPosition(placed);
    expandedHeightRef.current = nextSize.height;
  }, [open]);

  useEffect(() => {
    if (!school.trim()) return;
    if (schoolRef.current === school) return;
    saveNoteRecord(schoolRef.current, recordRef.current);
    schoolRef.current = school;
    setRecord(loadNoteRecord(school));
  }, [school]);

  useEffect(() => {
    try {
      localStorage.setItem(
        NOTES_SIZE_KEY,
        JSON.stringify({
          width: size.width,
          height: minimized ? expandedHeightRef.current : size.height,
        })
      );
    } catch {
      // ignore
    }
  }, [size, minimized]);

  useEffect(() => {
    if (!school.trim()) return;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveNoteRecord(school, record);
    }, 250);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [record, school]);

  // Keep inside the viewport if the window resizes.
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      const nextSize = clampSize(sizeRef.current.width, sizeRef.current.height);
      setSize(nextSize);
      setPosition((prev) =>
        clampPos(
          prev.x,
          prev.y,
          nextSize.width,
          minimized ? MINIMIZED_HEIGHT : nextSize.height
        )
      );
    };
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
    };
  }, [open, minimized]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    if (dragRef.current && event.pointerId === dragRef.current.pointerId) {
      const dx = event.clientX - dragRef.current.startX;
      const dy = event.clientY - dragRef.current.startY;
      const height = minimized ? MINIMIZED_HEIGHT : sizeRef.current.height;
      setPosition(
        clampPos(
          dragRef.current.originX + dx,
          dragRef.current.originY + dy,
          sizeRef.current.width,
          height
        )
      );
      return;
    }
    if (resizeRef.current && event.pointerId === resizeRef.current.pointerId) {
      const dx = event.clientX - resizeRef.current.startX;
      const dy = event.clientY - resizeRef.current.startY;
      const next = clampSize(
        resizeRef.current.originW + dx,
        resizeRef.current.originH + dy
      );
      expandedHeightRef.current = next.height;
      setSize(next);
      setPosition(
        clampPos(
          resizeRef.current.originX,
          resizeRef.current.originY,
          next.width,
          next.height
        )
      );
    }
  }, [minimized]);

  const onPointerUp = useCallback((event: PointerEvent) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (resizeRef.current?.pointerId === event.pointerId) resizeRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: positionRef.current.x,
      originY: positionRef.current.y,
    };
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || minimized) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originW: sizeRef.current.width,
      originH: sizeRef.current.height,
      originX: positionRef.current.x,
      originY: positionRef.current.y,
    };
  };

  const updateField = <K extends keyof MeetingNoteRecord>(
    key: K,
    value: MeetingNoteRecord[K]
  ) => {
    setRecord((prev) => ({ ...prev, [key]: value }));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatCopyText(school, record));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleClear = () => {
    const hasContent =
      record.body.trim() ||
      record.assessors.trim() ||
      record.schoolLeaderParticipant.trim();
    if (!hasContent) return;
    if (!window.confirm("Clear meeting notes for this school?")) return;
    setRecord(emptyNote());
    try {
      localStorage.removeItem(schoolNoteKey(school));
      localStorage.removeItem(`${NOTES_DATA_PREFIX_V1}${school.trim()}`);
    } catch {
      // ignore
    }
  };

  const toggleMinimized = () => {
    setMinimized((prev) => {
      if (prev) {
        const next = clampSize(
          sizeRef.current.width,
          Math.max(MIN_HEIGHT, expandedHeightRef.current)
        );
        setSize(next);
        setPosition((p) => clampPos(p.x, p.y, next.width, next.height));
        return false;
      }
      expandedHeightRef.current = Math.max(MIN_HEIGHT, sizeRef.current.height);
      return true;
    });
  };

  if (!mounted || !school.trim() || !open) return null;

  const panelHeight = minimized ? MINIMIZED_HEIGHT : size.height;

  return createPortal(
    <div
      ref={panelRef}
      className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl"
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        width: size.width,
        height: panelHeight,
        pointerEvents: "auto",
        zIndex: 1,
        touchAction: "none",
      }}
      role="dialog"
      aria-label="Meeting notes"
    >
      <div
        className="flex h-11 shrink-0 cursor-grab items-center gap-2 border-b border-border bg-muted/50 px-2 active:cursor-grabbing"
        style={{ touchAction: "none" }}
        onPointerDown={startDrag}
      >
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
        <StickyNote className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            Meeting Notes
            {minimized ? (
              <span className="font-normal text-muted-foreground">
                {" · "}
                {school}
              </span>
            ) : null}
          </p>
          {!minimized && (
            <p className="truncate text-[10px] text-muted-foreground">
              {school} · {formatMeetingDate(record.meetingDate)}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggleMinimized}
          aria-label={minimized ? "Expand notes" : "Minimize notes"}
        >
          {minimized ? (
            <Maximize2 className="h-3.5 w-3.5" />
          ) : (
            <Minus className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onOpenChange(false)}
          aria-label="Close notes"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {!minimized && (
        <>
          <div className="shrink-0 space-y-2 border-b border-border px-3 py-2">
            <div>
              <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Assessor(s)
              </label>
              <Input
                value={record.assessors}
                onChange={(e) => updateField("assessors", e.target.value)}
                placeholder="Names of assessors present"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                School Leader Participant
              </label>
              <Input
                value={record.schoolLeaderParticipant}
                onChange={(e) =>
                  updateField("schoolLeaderParticipant", e.target.value)
                }
                placeholder="Name of school leader"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Date
              </label>
              <p className="rounded-lg border border-input bg-muted/40 px-2.5 py-1.5 text-sm text-foreground">
                {formatMeetingDate(record.meetingDate)}
              </p>
            </div>
          </div>
          <div className="relative min-h-0 flex-1 p-2">
            <Textarea
              value={record.body}
              onChange={(e) => updateField("body", e.target.value)}
              placeholder="Capture comments from the school leader review meeting…"
              className="h-full min-h-[8rem] resize-none overflow-y-auto bg-background text-sm [field-sizing:fixed]"
            />
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-2 py-1.5">
            <p className="text-[10px] text-muted-foreground">
              Saved in this browser
            </p>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={handleCopy}
                disabled={
                  !record.body.trim() &&
                  !record.assessors.trim() &&
                  !record.schoolLeaderParticipant.trim()
                }
              >
                {copied ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <ClipboardCopy className="h-3 w-3" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={handleClear}
                disabled={
                  !record.body.trim() &&
                  !record.assessors.trim() &&
                  !record.schoolLeaderParticipant.trim()
                }
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </Button>
            </div>
          </div>
          <div
            className="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize"
            style={{ touchAction: "none" }}
            onPointerDown={startResize}
            aria-label="Resize notes window"
          >
            <div className="absolute bottom-1.5 right-1.5 h-2 w-2 border-b-2 border-r-2 border-muted-foreground/60" />
          </div>
        </>
      )}
    </div>,
    getOverlayRoot()
  );
}
