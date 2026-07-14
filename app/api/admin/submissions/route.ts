import { NextResponse } from "next/server";
import {
  unauthorizedAdminResponse,
  verifyAdminRequest,
} from "@/lib/admin-auth";
import { buildSchoolMatrix } from "@/lib/admin-school-matrix";
import { listSurveySubmissions } from "@/lib/load-submission";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!verifyAdminRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const submissions = await listSurveySubmissions();
    const { rows: schoolMatrix, source: manifestSource } =
      await buildSchoolMatrix(submissions);
    return NextResponse.json({
      submissions,
      schoolMatrix,
      manifestSource,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load submissions.";
    console.error("[admin/submissions] list failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
