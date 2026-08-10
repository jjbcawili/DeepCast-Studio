import { callDeepCastBackground, forwardBackgroundResponse } from "../../../../lib/deepcast-background-server";
import { remoteEpisode, toEpisodeRequest } from "../../../../lib/deepcast-episode-adapter";

export async function POST(request: Request) {
  try {
    const input = await request.json() as Record<string, unknown>;
    const response = await callDeepCastBackground("/api/episodes", { method: "POST", body: JSON.stringify(toEpisodeRequest(input)) });
    if (!response.ok) return forwardBackgroundResponse(response);
    const episode = remoteEpisode(await response.json());
    return Response.json({ id: episode.id }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Background generation could not start." }, { status: 503 });
  }
}
