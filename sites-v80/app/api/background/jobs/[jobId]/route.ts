import { callDeepCastBackground, forwardBackgroundResponse } from "../../../../../lib/deepcast-background-server";
import { remoteEpisode, toLegacySnapshot } from "../../../../../lib/deepcast-episode-adapter";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const response = await callDeepCastBackground(`/api/episodes/${encodeURIComponent(jobId)}`);
    if (!response.ok) return forwardBackgroundResponse(response);
    return Response.json(toLegacySnapshot(remoteEpisode(await response.json())), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Generation status is unavailable." }, { status: 503 });
  }
}
