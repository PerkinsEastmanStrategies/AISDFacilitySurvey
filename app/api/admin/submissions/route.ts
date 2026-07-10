import { NextResponse } from "next/server";
import {
  unauthorizedAdminResponse,
  verifyAdminRequest,
} from "@/lib/admin-auth";
import { listSurveySubmissions } from "@/lib/load-submission";

export async function GET(request: Request) {
  if (!verifyAdminRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const submissions = await listSurveySubmissions();
    return NextResponse.json({ submissions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load submissions.";
    console.error("[admin/submissions] list failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
