import { NextResponse } from "next/server";
import {
  unauthorizedAdminResponse,
  verifyAdminRequest,
} from "@/lib/admin-auth";
import {
  deleteInterviewNotes,
  getInterviewNotes,
  saveInterviewNotes,
  type InterviewNoteRecord,
} from "@/lib/interview-notes";

export const dynamic = "force-dynamic";

function schoolFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  const school = url.searchParams.get("school")?.trim();
  return school || null;
}

export async function GET(request: Request) {
  if (!verifyAdminRequest(request)) {
    return unauthorizedAdminResponse();
  }

  const school = schoolFromRequest(request);
  if (!school) {
    return NextResponse.json({ error: "school query parameter is required." }, { status: 400 });
  }

  try {
    const record = await getInterviewNotes(school);
    return NextResponse.json({ record });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load interview notes.";
    console.error("[admin/interview-notes] GET failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!verifyAdminRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const body = (await request.json()) as Partial<
      InterviewNoteRecord & { school?: string }
    >;
    const school = body.school?.trim();
    if (!school) {
      return NextResponse.json({ error: "school is required." }, { status: 400 });
    }

    const record: InterviewNoteRecord = {
      assessors: typeof body.assessors === "string" ? body.assessors : "",
      schoolLeaderParticipant:
        typeof body.schoolLeaderParticipant === "string"
          ? body.schoolLeaderParticipant
          : "",
      meetingDate:
        typeof body.meetingDate === "string" && body.meetingDate
          ? body.meetingDate
          : new Date().toISOString().slice(0, 10),
      subjectNotes:
        body.subjectNotes && typeof body.subjectNotes === "object"
          ? (body.subjectNotes as Record<string, string>)
          : {},
    };

    const saved = await saveInterviewNotes(school, record);
    return NextResponse.json({ record: saved });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save interview notes.";
    console.error("[admin/interview-notes] PUT failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!verifyAdminRequest(request)) {
    return unauthorizedAdminResponse();
  }

  const school = schoolFromRequest(request);
  if (!school) {
    return NextResponse.json({ error: "school query parameter is required." }, { status: 400 });
  }

  try {
    await deleteInterviewNotes(school);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete interview notes.";
    console.error("[admin/interview-notes] DELETE failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
