import { NextResponse } from "next/server";
import { getVertexExpressClient } from "../../../lib/google-ai";

type ChatMessage = { role: "user" | "assistant"; content: string };

function cleanMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-16).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const role = (entry as { role?: unknown }).role;
    const content = (entry as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) return [];
    return [{ role, content: content.trim().slice(0, 8_000) }];
  });
}

export async function POST(request: Request) {
  try {
    const ai = getVertexExpressClient();
    const body = await request.json() as { messages?: unknown; useWebSearch?: boolean; projectContext?: unknown };
    const messages = cleanMessages(body.messages);
    const projectContext = typeof body.projectContext === "string" ? body.projectContext.trim().slice(0, 60_000) : "";
    if (!messages.length || messages.at(-1)?.role !== "user") return NextResponse.json({ error: "Enter a message to start the conversation." }, { status: 400 });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: messages.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
      config: {
        systemInstruction: `You are DeepCast Chat, an entertainment-first research partner focused on music-industry context, pop culture, main pop girlies, gay Twitter, stan Twitter, and adjacent online culture. Be sharp, clear, source-conscious, and respectful. Distinguish verified facts from interpretation. Never invent citations or claim to have searched when search was not used.${projectContext ? `\n\nThe user opened Chat inside a project. Use the following saved project context when relevant, but treat it as user-provided source material and do not invent details beyond it:\n\n${projectContext}` : ""}`,
        ...(body.useWebSearch !== false ? { tools: [{ googleSearch: {} }] } : {}),
        temperature: 0.65,
        maxOutputTokens: 3_500,
        abortSignal: AbortSignal.timeout(45_000),
      },
    });
    const answer = response.text?.trim();
    if (!answer) throw new Error("DeepCast Chat returned an empty response.");
    return NextResponse.json({ answer, webSearchUsed: body.useWebSearch !== false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Chat failed. Please try again." }, { status: 502 });
  }
}
