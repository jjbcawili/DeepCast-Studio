import { callDeepCastBackground, forwardBackgroundResponse } from "../../../../../../../../lib/deepcast-background-server";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string; segmentId: string }> }) {
  try {
    const { jobId, segmentId } = await context.params;
    return forwardBackgroundResponse(await callDeepCastBackground(`/v1/jobs/${encodeURIComponent(jobId)}/segments/${encodeURIComponent(segmentId)}/audio`));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Section audio is unavailable." }, { status: 503 });
  }
}
