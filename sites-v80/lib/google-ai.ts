import { GoogleGenAI } from "@google/genai";

export function getVertexExpressClient() {
  const apiKey = process.env.VERTEX_EXPRESS_API_KEY;
  if (!apiKey) throw new Error("Vertex AI Express is not configured on this deployment.");
  return new GoogleGenAI({ vertexai: true, apiKey });
}
