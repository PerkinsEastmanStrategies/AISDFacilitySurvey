import { NextResponse } from "next/server";
import {
  unauthorizedAdminResponse,
  verifyAdminRequest,
} from "@/lib/admin-auth";
import { loadSurveySubmission } from "@/lib/load-submission";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const { id } = await context.params;
    const result = await loadSurveySubmission(id);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load submission.";
    const status = message.includes("not found") ? 404 : 500;
    console.error("[admin/submissions/[id]] load failed:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
