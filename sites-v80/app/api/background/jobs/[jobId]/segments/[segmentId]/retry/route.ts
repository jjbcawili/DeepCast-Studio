import { callDeepCastBackground, forwardBackgroundResponse } from "../../../../../../../../lib/deepcast-background-server";

export async function POST(_request: Request, context: { params: Promise<{ jobId: string; segmentId: string }> }) {
  try {
    const { jobId, segmentId } = await context.params;
    return forwardBackgroundResponse(await callDeepCastBackground(`/v1/jobs/${encodeURIComponent(jobId)}/segments/${encodeURIComponent(segmentId)}/retry`, { method: "POST" }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Section retry could not start." }, { status: 503 });
  }
}
