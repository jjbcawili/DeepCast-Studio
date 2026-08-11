import { callDeepCastBackground, forwardBackgroundResponse } from "../../../lib/deepcast-background-server";

export async function POST(request: Request) {
  try {
    const response = await callDeepCastBackground("/api/voice-references", {
      method: "POST",
      headers: { "Content-Type": request.headers.get("Content-Type") || "application/json" },
      body: await request.text(),
    });
    return forwardBackgroundResponse(response);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Voice reference upload failed." }, { status: 502 });
  }
}
