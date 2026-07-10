import { ADMIN_KEY_HEADER } from "@/lib/admin-constants";

export function verifyAdminRequest(request: Request): boolean {
  const expected = process.env.ADMIN_ACCESS_KEY?.trim();
  if (!expected) return false;

  const headerKey = request.headers.get(ADMIN_KEY_HEADER)?.trim();
  if (headerKey === expected) return true;

  const auth = request.headers.get("authorization")?.trim();
  if (auth === `Bearer ${expected}`) return true;

  return false;
}

export function unauthorizedAdminResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
