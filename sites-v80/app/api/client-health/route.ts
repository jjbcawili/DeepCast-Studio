const ALLOWED_STAGES = new Set([
  "inline-boot",
  "inline-pointer",
  "inline-click",
  "react-hydrated",
]);

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      stage?: unknown;
      path?: unknown;
      control?: unknown;
    };

    const stage = typeof payload.stage === "string" && ALLOWED_STAGES.has(payload.stage)
      ? payload.stage
      : "invalid";
    const path = typeof payload.path === "string" ? payload.path.slice(0, 160) : "unknown";
    const control = typeof payload.control === "string" ? payload.control.slice(0, 40) : "none";

    console.log(JSON.stringify({ event: "deepcast-client-health", stage, path, control }));
  } catch {
    console.log(JSON.stringify({ event: "deepcast-client-health", stage: "invalid-json" }));
  }

  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
