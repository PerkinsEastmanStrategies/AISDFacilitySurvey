"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
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

const NOTES_BODY_PREFIX = "aisd-admin-meeting-notes:v1:";
const NOTES_UI_KEY = "aisd-admin-meeting-notes-ui:v1";

const PANEL_WIDTH = 420;
const PANEL_HEIGHT = 360;
const MINIMIZED_HEIGHT = 44;
const EDGE_PAD = 12;

type PanelUiState = {
  x: number;
  y: number;
  minimized: boolean;
  open: boolean;
};

function schoolNoteKey(school: string): string {
  const trimmed = school.trim();
  return `${NOTES_BODY_PREFIX}${trimmed || "general"}`;
}

function defaultPosition(): { x: number; y: number } {
  if (typeof window === "undefined") {
    return { x: EDGE_PAD, y: EDGE_PAD };
  }
  return {
    x: Math.max(EDGE_PAD, window.innerWidth - PANEL_WIDTH - EDGE_PAD),
    y: Math.max(EDGE_PAD, window.innerHeight - PANEL_HEIGHT - EDGE_PAD),
  };
}

function loadUiState(): PanelUiState {
  const fallback: PanelUiState = {
    ...defaultPosition(),
    minimized: false,
    open: true,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(NOTES_UI_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PanelUiState>;
    return {
      x: typeof parsed.x === "number" ? parsed.x : fallback.x,
      y: typeof parsed.y === "number" ? parsed.y : fallback.y,
      minimized: Boolean(parsed.minimized),
      open: parsed.open !== false,
    };
  } catch {
    return fallback;
  }
}

function loadNoteBody(school: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(schoolNoteKey(school)) ?? "";
  } catch {
    return "";
  }
}

function clampPosition(
  x: number,
  y: number,
  minimized: boolean
): { x: number; y: number } {
  if (typeof window === "undefined") return { x, y };
  const width = Math.min(PANEL_WIDTH, window.innerWidth - EDGE_PAD * 2);
  const height = minimized
    ? MINIMIZED_HEIGHT
    : Math.min(PANEL_HEIGHT, window.innerHeight - EDGE_PAD * 2);
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
  const [hydrated, setHydrated] = useState(false);
  const [position, setPosition] = useState({ x: EDGE_PAD, y: EDGE_PAD });
  const [minimized, setMinimized] = useState(false);
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const schoolRef = useRef(school);
  const bodyRef = useRef(body);
  bodyRef.current = body;

  useEffect(() => {
    const ui = loadUiState();
    const clamped = clampPosition(ui.x, ui.y, ui.minimized);
    setPosition(clamped);
    setMinimized(ui.minimized);
    setBody(loadNoteBody(school));
    schoolRef.current = school;
    onOpenChange(ui.open);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once on mount
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (schoolRef.current === school) return;
    try {
      localStorage.setItem(schoolNoteKey(schoolRef.current), bodyRef.current);
    } catch {
      // ignore quota / private mode
    }
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    schoolRef.current = school;
    setBody(loadNoteBody(school));
  }, [school, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const next: PanelUiState = {
        x: position.x,
        y: position.y,
        minimized,
        open,
      };
      localStorage.setItem(NOTES_UI_KEY, JSON.stringify(next));
    } catch {
      // ignore quota / private mode
    }
  }, [position, minimized, open, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    const noteSchool = schoolRef.current;
    saveTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(schoolNoteKey(noteSchool), body);
      } catch {
        // ignore quota / private mode
      }
    }, 250);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [body, hydrated]);

  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => clampPosition(prev.x, prev.y, minimized));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [minimized]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = event.clientX - dragRef.current.startX;
      const dy = event.clientY - dragRef.current.startY;
      setPosition(
        clampPosition(
          dragRef.current.originX + dx,
          dragRef.current.originY + dy,
          minimized
        )
      );
    };
    const onUp = () => endDrag();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [endDrag, minimized]);

  const startDrag = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard failures
    }
  };

  const handleClear = () => {
    if (!body.trim()) return;
    if (!window.confirm("Clear meeting notes for this school?")) return;
    setBody("");
    try {
      localStorage.removeItem(schoolNoteKey(school));
    } catch {
      // ignore
    }
  };

  if (!hydrated || !open) return null;

  const schoolLabel = school.trim() || "General notes";
  const width = Math.min(PANEL_WIDTH, typeof window !== "undefined" ? window.innerWidth - EDGE_PAD * 2 : PANEL_WIDTH);

  return (
    <div
      className="fixed z-[60] flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      style={{
        left: position.x,
        top: position.y,
        width,
        height: minimized
          ? MINIMIZED_HEIGHT
          : Math.min(
              PANEL_HEIGHT,
              typeof window !== "undefined"
                ? window.innerHeight - EDGE_PAD * 2
                : PANEL_HEIGHT
            ),
      }}
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
                {schoolLabel}
              </span>
            ) : null}
          </p>
          {!minimized && (
            <p className="truncate text-[10px] text-muted-foreground">
              {schoolLabel}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setMinimized((v) => !v)}
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
          <div className="min-h-0 flex-1 p-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Capture comments from the school leader review meeting…"
              className="h-full min-h-[12rem] resize-none overflow-y-auto bg-background text-sm [field-sizing:fixed]"
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
                disabled={!body.trim()}
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
                disabled={!body.trim()}
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
