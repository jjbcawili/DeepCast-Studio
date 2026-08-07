import { callDeepCastBackground, forwardBackgroundResponse } from "../../../../lib/deepcast-background-server";

export async function POST(request: Request) {
  try {
    const body = await request.text();
    return forwardBackgroundResponse(await callDeepCastBackground("/v1/jobs", { method: "POST", body }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Background generation could not start." }, { status: 503 });
  }
}
