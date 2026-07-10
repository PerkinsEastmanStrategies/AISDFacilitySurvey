import { NextResponse } from "next/server";
import {
  unauthorizedAdminResponse,
  verifyAdminRequest,
} from "@/lib/admin-auth";
import { getDistrictAnalytics } from "@/lib/submission-analytics";

export async function GET(request: Request) {
  if (!verifyAdminRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const analytics = await getDistrictAnalytics();
    return NextResponse.json(analytics);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load analytics.";
    console.error("[admin/analytics] failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
