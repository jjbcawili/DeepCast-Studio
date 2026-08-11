import { callDeepCastBackground, forwardBackgroundResponse } from "../../../../../../../../lib/deepcast-background-server";
import { remoteEpisode } from "../../../../../../../../lib/deepcast-episode-adapter";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string; segmentId: string }> }) {
  try {
    const { jobId } = await context.params;
    const response = await callDeepCastBackground(`/api/episodes/${encodeURIComponent(jobId)}`);
    if (!response.ok) return forwardBackgroundResponse(response);
    const episode = remoteEpisode(await response.json());
    const asset = episode.assets?.find((item) => item.url && ["mp3", "m4a", "wav"].includes(String(item.kind || "").toLowerCase()));
    if (!asset?.url) return Response.json({ error: "Finished episode audio is not available yet." }, { status: 404 });
    return forwardBackgroundResponse(await fetch(asset.url, { cache: "no-store" }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Section audio is unavailable." }, { status: 503 });
  }
}
