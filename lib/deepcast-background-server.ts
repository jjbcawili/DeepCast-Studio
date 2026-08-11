import "server-only";

const OWNER_ID = "personal-workspace";

function configuration() {
  const baseUrl = process.env.DEEPCAST_BACKEND_URL?.replace(/\/$/, "");
  const secret = process.env.DEEPCAST_BACKEND_SHARED_SECRET;
  if (!baseUrl || !secret) {
    throw new Error("DeepCast background generation is not configured.");
  }
  return { baseUrl, secret };
}

export async function callDeepCastBackground(path: string, init: RequestInit = {}) {
  const { baseUrl, secret } = configuration();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret}`);
  headers.set("X-DeepCast-Owner", OWNER_ID);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${baseUrl}${path}`, { ...init, headers, cache: "no-store" });
}

export async function forwardBackgroundResponse(response: Response) {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", response.headers.get("Content-Type") || "application/json; charset=utf-8");
  const disposition = response.headers.get("Content-Disposition");
  if (disposition) headers.set("Content-Disposition", disposition);
  return new Response(response.body, { status: response.status, headers });
}
