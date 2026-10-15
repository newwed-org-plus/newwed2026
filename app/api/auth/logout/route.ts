import { revokeSession, sessionCookie } from "@/server/auth/session";
import { errorResponse, json } from "@/server/http";

export async function POST(request: Request) {
  try {
    await revokeSession(request);
    return json({ ok: true }, { headers: { "set-cookie": sessionCookie("", 0) } });
  } catch (error) { return errorResponse(error); }
}
