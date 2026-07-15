"use client";

import { Button } from "@/components/ui/button";
import { MapPin, X, MousePointerClick } from "lucide-react";
import {
  PROGRAM_SPACES,
  getSpaceColor,
  type RoomInfo,
} from "@/lib/spaces-data";
import type { SpaceRoomEntry } from "@/lib/survey-data";

interface SpaceAssignmentFormProps {
  rooms: RoomInfo[];
  assignments: Record<string, SpaceRoomEntry[]>;
  activeSpace: string | null;
  onActiveSpaceChange: (space: string | null) => void;
  onRemoveRoom: (space: string, roomKey: string) => void;
  hasSvg: boolean;
}

export function SpaceAssignmentForm({
  rooms,
  assignments,
  activeSpace,
  onActiveSpaceChange,
  onRemoveRoom,
  hasSvg,
}: SpaceAssignmentFormProps) {
  const totalPlaced = Object.values(assignments).reduce(
    (sum, entries) => sum + entries.length,
    0
  );

  return (
    <div className="space-y-4" data-tour="program-spaces">
      <div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-semibold text-foreground">
            Specialized Program Spaces
          </h2>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Select a program space, then click its room(s) on the floor plan. You can
          place multiple rooms per space. Each placement is added to the table below.{" "}
          <span className="text-muted-foreground">(optional)</span>
        </p>

        {!hasSvg ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Upload a floor plan on a previous step to enable room placement.
          </div>
        ) : rooms.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            No room numbers were detected in the uploaded floor plan.
          </div>
        ) : (
          <>
            {/* Category selector chips */}
            <div className="flex flex-wrap gap-2">
              {PROGRAM_SPACES.map((space) => {
                const isActive = activeSpace === space;
                const count = assignments[space]?.length ?? 0;
                const color = getSpaceColor(space);
                return (
                  <button
                    key={space}
                    onClick={() => onActiveSpaceChange(isActive ? null : space)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      isActive
                        ? "border-transparent text-white shadow-sm"
                        : "border-border bg-card text-foreground hover:bg-muted"
                    }`}
                    style={isActive ? { backgroundColor: color } : undefined}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: isActive ? "white" : color }}
                    />
                    {space}
                    {count > 0 && (
                      <span
                        className={`ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                          isActive ? "bg-white/25 text-white" : "bg-muted-foreground/15 text-foreground"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active prompt */}
            <div
              className={`mt-4 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                activeSpace
                  ? "border-primary/30 bg-primary/5 text-foreground"
                  : "border-dashed border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              <MousePointerClick className="h-4 w-4 shrink-0 text-primary" />
              {activeSpace ? (
                <span>
                  Click rooms on the floor plan to assign them to{" "}
                  <span className="font-semibold">{activeSpace}</span>.
                </span>
              ) : (
                <span>Select a program space above to start placing rooms.</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Assignments table */}
      {hasSvg && rooms.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">
              Placed Rooms
            </h3>
            <span className="text-xs text-muted-foreground">
              {totalPlaced} {totalPlaced === 1 ? "room" : "rooms"} placed
            </span>
          </div>

          {totalPlaced === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No rooms placed yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Program Space</th>
                  <th className="px-4 py-2 font-medium">Room</th>
                  <th className="w-10 px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {PROGRAM_SPACES.flatMap((space) => {
                  const entries = assignments[space] ?? [];
                  const color = getSpaceColor(space);
                  return entries.map((entry, idx) => (
                    <tr
                      key={`${space}-${entry.roomKey}`}
                      className="border-b border-border/40 last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-4 py-2.5">
                        {idx === 0 ? (
                          <span className="flex items-center gap-2 font-medium text-foreground">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            {space}
                          </span>
                        ) : (
                          <span className="pl-[18px] text-muted-foreground">
                            {"\u21B3"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-foreground">
                        <span className="font-semibold">{entry.roomKey}</span>
                        {entry.roomLabel ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {entry.roomLabel}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => onRemoveRoom(space, entry.roomKey)}
                          title={`Remove ${entry.roomKey} from ${space}`}
                        >
                          <X className="h-3.5 w-3.5" />
                          <span className="sr-only">
                            Remove {entry.roomKey} from {space}
                          </span>
                        </Button>
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
