import { callDeepCastBackground, forwardBackgroundResponse } from "../../../../../../../../lib/deepcast-background-server";

export async function POST(_request: Request, context: { params: Promise<{ jobId: string; segmentId: string }> }) {
  try {
    const { jobId } = await context.params;
    return forwardBackgroundResponse(await callDeepCastBackground(`/api/episodes/${encodeURIComponent(jobId)}/retry`, { method: "POST" }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Section retry could not start." }, { status: 503 });
  }
}
