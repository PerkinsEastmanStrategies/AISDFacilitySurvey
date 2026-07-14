"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
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
const NOTES_SIZE_KEY = "aisd-admin-meeting-notes-size:v1";

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 460;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 280;
const MINIMIZED_HEIGHT = 44;
const EDGE_PAD = 16;

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
    if (legacy) {
      return { ...emptyNote(), body: legacy };
    }
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

function loadSavedSize(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
  try {
    const raw = localStorage.getItem(NOTES_SIZE_KEY);
    if (!raw) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
    const parsed = JSON.parse(raw) as { width?: number; height?: number };
    return {
      width:
        typeof parsed.width === "number" && parsed.width >= MIN_WIDTH
          ? parsed.width
          : DEFAULT_WIDTH,
      height:
        typeof parsed.height === "number" && parsed.height >= MIN_HEIGHT
          ? parsed.height
          : DEFAULT_HEIGHT,
    };
  } catch {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
}

function clampSize(width: number, height: number) {
  if (typeof window === "undefined") {
    return { width, height };
  }
  return {
    width: Math.min(
      Math.max(MIN_WIDTH, width),
      window.innerWidth - EDGE_PAD * 2
    ),
    height: Math.min(
      Math.max(MIN_HEIGHT, height),
      window.innerHeight - EDGE_PAD * 2
    ),
  };
}

function clampPoint(
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  if (typeof window === "undefined") return { x, y };
  return {
    x: Math.min(
      Math.max(EDGE_PAD, x),
      Math.max(EDGE_PAD, window.innerWidth - width - EDGE_PAD)
    ),
    y: Math.min(
      Math.max(EDGE_PAD, y),
      Math.max(EDGE_PAD, window.innerHeight - height - EDGE_PAD)
    ),
  };
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

/**
 * Placement model:
 * - Default: CSS mid-right (`right` + `top: 50%` + `translateY(-50%)`) — no JS coords.
 * - After drag: switch to pixel `left`/`top` from the pointer.
 * - Reopening always resets to CSS mid-right.
 * - Portaled to document.body so parent layout can't skew `position: fixed`.
 */
export function AdminMeetingNotes({
  school,
  open,
  onOpenChange,
}: AdminMeetingNotesProps) {
  const [mounted, setMounted] = useState(false);
  const [size, setSize] = useState(() => loadSavedSize());
  const [minimized, setMinimized] = useState(false);
  const [dragged, setDragged] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [record, setRecord] = useState<MeetingNoteRecord>(() => emptyNote());
  const [copied, setCopied] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const resizeRef = useRef<{
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
  const expandedHeightRef = useRef(size.height);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!school.trim()) return;
    setRecord(loadNoteRecord(school));
    schoolRef.current = school;
  }, [school]);

  // Every open: snap back to CSS mid-right (clear any dragged pixel placement).
  useEffect(() => {
    if (!open) return;
    setDragged(false);
    setMinimized(false);
    setSize((prev) => clampSize(prev.width, prev.height));
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
    const noteSchool = school;
    saveTimerRef.current = window.setTimeout(() => {
      saveNoteRecord(noteSchool, record);
    }, 250);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [record, school]);

  const endInteraction = useCallback(() => {
    dragRef.current = null;
    resizeRef.current = null;
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (dragRef.current) {
        const dx = event.clientX - dragRef.current.startX;
        const dy = event.clientY - dragRef.current.startY;
        const height = minimized ? MINIMIZED_HEIGHT : size.height;
        setPosition(
          clampPoint(
            dragRef.current.originX + dx,
            dragRef.current.originY + dy,
            size.width,
            height
          )
        );
        return;
      }
      if (resizeRef.current && !minimized) {
        const dx = event.clientX - resizeRef.current.startX;
        const dy = event.clientY - resizeRef.current.startY;
        const next = clampSize(
          resizeRef.current.originW + dx,
          resizeRef.current.originH + dy
        );
        setSize(next);
        expandedHeightRef.current = next.height;
        setPosition(
          clampPoint(
            resizeRef.current.originX,
            resizeRef.current.originY,
            next.width,
            next.height
          )
        );
      }
    };
    const onUp = () => endInteraction();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [endInteraction, minimized, size.height, size.width]);

  const startDrag = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // First drag leaves CSS anchoring and locks to pixel coords.
    if (!dragged) {
      setDragged(true);
      setPosition({ x: rect.left, y: rect.top });
    }
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: dragged ? position.x : rect.left,
      originY: dragged ? position.y : rect.top,
    };
  };

  const startResize = (event: ReactPointerEvent) => {
    if (event.button !== 0 || minimized) return;
    event.preventDefault();
    event.stopPropagation();
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!dragged) {
      setDragged(true);
      setPosition({ x: rect.left, y: rect.top });
    }
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originW: size.width,
      originH: size.height,
      originX: dragged ? position.x : rect.left,
      originY: dragged ? position.y : rect.top,
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
        setSize((s) =>
          clampSize(s.width, Math.max(MIN_HEIGHT, expandedHeightRef.current))
        );
        return false;
      }
      expandedHeightRef.current = Math.max(MIN_HEIGHT, size.height);
      return true;
    });
  };

  if (!mounted || !school.trim() || !open) return null;

  const panelHeight = minimized ? MINIMIZED_HEIGHT : size.height;

  // Default placement is pure CSS — mid-right of the viewport.
  const panelStyle: CSSProperties = dragged
    ? {
        left: position.x,
        top: position.y,
        right: "auto",
        width: size.width,
        height: panelHeight,
        transform: "none",
      }
    : {
        right: EDGE_PAD,
        top: "50%",
        left: "auto",
        width: size.width,
        height: panelHeight,
        transform: "translateY(-50%)",
      };

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[200] relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      style={panelStyle}
      role="dialog"
      aria-label="Meeting notes"
    >
      <div
        className="flex h-11 shrink-0 cursor-grab items-center gap-2 border-b border-border bg-muted/50 px-2 active:cursor-grabbing"
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
            className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
            onPointerDown={startResize}
            aria-label="Resize notes window"
          >
            <div className="absolute bottom-1 right-1 h-2 w-2 border-b-2 border-r-2 border-muted-foreground/50" />
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
