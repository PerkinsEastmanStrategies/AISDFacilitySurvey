import { NextResponse } from "next/server";
import {
  submitSurveyToSupabase,
  type SurveySubmissionPayload,
} from "@/lib/submit-survey";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SurveySubmissionPayload;
    const result = await submitSurveyToSupabase(payload);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to submit survey.";

    const status = message.includes("Missing Supabase credentials") ? 503 : 400;

    console.error("[submissions] submit failed:", error);

    return NextResponse.json({ error: message }, { status });
  }
}
