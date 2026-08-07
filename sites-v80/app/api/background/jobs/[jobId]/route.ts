import { callDeepCastBackground, forwardBackgroundResponse } from "../../../../../lib/deepcast-background-server";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    return forwardBackgroundResponse(await callDeepCastBackground(`/v1/jobs/${encodeURIComponent(jobId)}`));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Generation status is unavailable." }, { status: 503 });
  }
}
