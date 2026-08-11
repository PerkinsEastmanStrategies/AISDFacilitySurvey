import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ADMIN_NOTE_SUBJECT_GENERAL } from "@/lib/survey-data";

export type InterviewNoteRecord = {
  assessors: string;
  schoolLeaderParticipant: string;
  meetingDate: string;
  subjectNotes: Record<string, string>;
};

type InterviewNoteRow = {
  id: string;
  school: string;
  assessors: string;
  school_leader_participant: string;
  meeting_date: string;
  subject_notes: Record<string, string> | null;
  created_at: string;
  updated_at: string;
};

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function emptyInterviewNote(): InterviewNoteRecord {
  return {
    assessors: "",
    schoolLeaderParticipant: "",
    meetingDate: todayIsoDate(),
    subjectNotes: {},
  };
}

export function hasAnySubjectNotes(
  subjectNotes: Record<string, string>
): boolean {
  return Object.values(subjectNotes).some((text) => text.trim());
}

export function isInterviewNoteEmpty(record: InterviewNoteRecord): boolean {
  return (
    !record.assessors.trim() &&
    !record.schoolLeaderParticipant.trim() &&
    !hasAnySubjectNotes(record.subjectNotes)
  );
}

export function normalizeSubjectNotes(
  value: unknown,
  legacyBody?: string
): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const notes: Record<string, string> = {};
    for (const [key, text] of Object.entries(value)) {
      if (typeof text === "string" && text.trim()) {
        notes[key] = text;
      }
    }
    return notes;
  }
  if (typeof legacyBody === "string" && legacyBody.trim()) {
    return { [ADMIN_NOTE_SUBJECT_GENERAL]: legacyBody };
  }
  return {};
}

function rowToRecord(row: InterviewNoteRow): InterviewNoteRecord {
  return {
    assessors: row.assessors ?? "",
    schoolLeaderParticipant: row.school_leader_participant ?? "",
    meetingDate: row.meeting_date ?? todayIsoDate(),
    subjectNotes: normalizeSubjectNotes(row.subject_notes),
  };
}

export async function getInterviewNotes(
  school: string
): Promise<InterviewNoteRecord | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("interview_notes")
    .select(
      "id, school, assessors, school_leader_participant, meeting_date, subject_notes, created_at, updated_at"
    )
    .eq("school", school.trim())
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? rowToRecord(data as InterviewNoteRow) : null;
}

export async function saveInterviewNotes(
  school: string,
  record: InterviewNoteRecord
): Promise<InterviewNoteRecord | null> {
  const trimmedSchool = school.trim();
  if (!trimmedSchool) {
    throw new Error("School is required.");
  }

  const supabase = getSupabaseAdmin();

  if (isInterviewNoteEmpty(record)) {
    const { error } = await supabase
      .from("interview_notes")
      .delete()
      .eq("school", trimmedSchool);
    if (error) {
      throw new Error(error.message);
    }
    return null;
  }

  const { data, error } = await supabase
    .from("interview_notes")
    .upsert(
      {
        school: trimmedSchool,
        assessors: record.assessors.trim(),
        school_leader_participant: record.schoolLeaderParticipant.trim(),
        meeting_date: record.meetingDate || todayIsoDate(),
        subject_notes: record.subjectNotes,
      },
      { onConflict: "school" }
    )
    .select(
      "id, school, assessors, school_leader_participant, meeting_date, subject_notes, created_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return rowToRecord(data as InterviewNoteRow);
}

export async function deleteInterviewNotes(school: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("interview_notes")
    .delete()
    .eq("school", school.trim());
  if (error) {
    throw new Error(error.message);
  }
}
