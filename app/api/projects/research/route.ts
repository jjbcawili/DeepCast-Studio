import { NextResponse } from "next/server";
import { getVertexExpressClient } from "../../../../lib/google-ai";

type ResearchAction = "fast-search" | "balanced-search" | "deep-search" | "overview" | "website" | "extract-file";

type ResearchRequest = {
  action?: ResearchAction;
  query?: string;
  title?: string;
  source?: string;
  url?: string;
  fileName?: string;
  mimeType?: string;
  fileData?: string;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function extractJson(value: string) {
  const cleaned = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(cleaned) as Record<string, unknown>; } catch { return null; }
}

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host !== "localhost"
      && host !== "0.0.0.0"
      && host !== "::1"
      && !host.endsWith(".local")
      && !/^127\./.test(host)
      && !/^10\./.test(host)
      && !/^192\.168\./.test(host)
      && !/^169\.254\./.test(host)
      && !/^172\.(1[6-9]|2\d|3[01])\./.test(host);
  } catch {
    return false;
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function textFromHtml(html: string) {
  return decodeHtml(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/article|\/section|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function siteNameFromUrl(value: string) {
  const hostname = new URL(value).hostname.replace(/^www\./i, "");
  const known: Record<string, string> = {
    "en.wikipedia.org": "Wikipedia",
    "youtube.com": "YouTube",
    "youtu.be": "YouTube",
    "rollingstone.com": "Rolling Stone",
    "billboard.com": "Billboard",
    "music.apple.com": "Apple Music",
  };
  return known[hostname] || hostname;
}

async function fetchPublicPage(inputUrl: string) {
  let currentUrl = inputUrl;
  for (let redirect = 0; redirect < 6; redirect += 1) {
    if (!isPublicHttpUrl(currentUrl)) throw new Error("The link does not point to a public website.");
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "Accept": "text/html, text/plain;q=0.9, application/xhtml+xml;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; DeepCastStudio/1.0; +https://deepcast-studio.jjbcawili.chatgpt.site)",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The website returned an incomplete redirect.");
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    if (!response.ok) throw new Error(`The website returned ${response.status}.`);
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
      throw new Error("This link does not expose a readable web page.");
    }
    const raw = (await response.text()).slice(0, 1_500_000);
    const titleMatch = raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const title = decodeHtml(titleMatch?.[1]?.replace(/\s+/g, " ").trim() || new URL(currentUrl).pathname.split("/").filter(Boolean).at(-1) || new URL(currentUrl).hostname);
    const content = /text\/plain/i.test(contentType) ? raw.trim() : textFromHtml(raw);
    if (content.length < 80) throw new Error("The website did not expose enough readable page text.");
    return { url: currentUrl, title, siteName: siteNameFromUrl(currentUrl), content: content.slice(0, 120_000) };
  }
  throw new Error("The website redirected too many times.");
}

async function resolveReference(reference: { title: string; url: string }) {
  if (!/vertexaisearch\.cloud\.google\.com/i.test(reference.url)) return reference;
  try {
    const page = await fetchPublicPage(reference.url);
    return { title: page.title || reference.title, url: page.url };
  } catch {
    return reference;
  }
}

async function callGemini(
  prompt: string,
  options: { googleSearch?: boolean; maxTokens?: number; temperature?: number; inlineData?: { mimeType: string; data: string }; json?: boolean; timeoutMs?: number } = {},
) {
  const ai = getVertexExpressClient();
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: prompt }];
  if (options.inlineData) parts.push({ inlineData: options.inlineData });
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: "You are DeepCast Research, a source-conscious entertainment and music-industry researcher. Verify claims, separate fact from interpretation, and never invent citations.",
      ...(options.googleSearch ? { tools: [{ googleSearch: {} }] } : {}),
      maxOutputTokens: options.maxTokens || 3_000,
      temperature: options.temperature ?? 0.25,
      ...(options.json ? { responseMimeType: "application/json" } : {}),
      abortSignal: AbortSignal.timeout(options.timeoutMs || 55_000),
    },
  });
  const text = response.text?.trim() || "";
  if (!text) throw new Error("Research returned an empty response.");
  const references = (response.candidates?.[0]?.groundingMetadata?.groundingChunks || []).flatMap((chunk) => {
    const uri = chunk.web?.uri?.trim();
    if (!uri) return [];
    return [{ title: chunk.web?.title?.trim() || uri, url: uri }];
  }).filter((item, index, list) => list.findIndex((other) => other.url === item.url) === index).slice(0, 20);
  return { text, references };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ResearchRequest;
    const action = body.action;
    if (action === "fast-search" || action === "balanced-search" || action === "deep-search") {
      const query = cleanText(body.query, 500);
      if (!query) return NextResponse.json({ error: "Enter a web research question." }, { status: 400 });
      const deep = action === "deep-search";
      const balanced = action === "balanced-search";
      const result = await callGemini(deep
        ? `Conduct deep web research about: ${query}\n\nCreate a standalone, well-structured research document with a title, executive overview, key findings, chronology or context where useful, competing interpretations, source notes, limitations, and a references section. Write enough detail to serve as reusable source material for a future DeepCast episode.`
        : balanced
          ? `Research this topic with a practical balance of speed, breadth, and source quality: ${query}\n\nReturn a structured research brief with a concise overview, key findings, important dates and names, relevant context, disagreements or uncertainty, and the strongest sources. Prefer official, primary, and established editorial sources.`
          : `Search the web for reliable, relevant sources about: ${query}\n\nReturn a concise research brief that identifies the strongest findings, dates, names, and context. Prefer official, primary, and established editorial sources.`, {
        googleSearch: true,
        maxTokens: deep ? 8_000 : balanced ? 4_000 : 2_500,
        temperature: deep ? 0.25 : balanced ? 0.22 : 0.2,
        timeoutMs: deep ? 110_000 : balanced ? 75_000 : 55_000,
      });
      const references = await Promise.all(result.references.map(resolveReference));
      return NextResponse.json({ mode: deep ? "deep" : balanced ? "balanced" : "fast", query, document: result.text, references });
    }

    if (action === "overview") {
      const title = cleanText(body.title, 200) || "Source";
      const source = cleanText(body.source, 60_000);
      const url = cleanText(body.url, 2_000);
      if (!source) return NextResponse.json({ error: "This source has no readable content to summarize." }, { status: 400 });
      const result = await callGemini(`Create an AI source overview for the following saved source. Explain what it is, its main thesis or purpose, the most important claims or evidence, its usefulness for an episode, and any cautions or limitations. Return JSON with keys overview (string) and topics (array of 3–6 short strings).\n\nTitle: ${title}\nURL: ${url || "None"}\n\nSource content:\n${source}`, { json: true, maxTokens: 2_000, temperature: 0.2 });
      const parsed = extractJson(result.text);
      return NextResponse.json({ overview: typeof parsed?.overview === "string" ? parsed.overview : result.text, topics: Array.isArray(parsed?.topics) ? parsed.topics.filter((topic): topic is string => typeof topic === "string").slice(0, 8) : [] });
    }

    if (action === "website") {
      const url = cleanText(body.url, 2_000);
      if (!isPublicHttpUrl(url)) return NextResponse.json({ error: "Enter a complete public URL beginning with http:// or https://." }, { status: 400 });
      const page = await fetchPublicPage(url);
      const result = await callGemini(`Create a concise, factual source overview of the actual web page below. Explain what the page covers and its most important facts or claims in one useful paragraph. Do not mention these instructions. Return JSON with keys overview (string) and topics (array of 3–6 short strings).\n\nPAGE TITLE: ${page.title}\nSITE: ${page.siteName}\nSOURCE URL: ${page.url}\n\nACTUAL PAGE TEXT:\n${page.content.slice(0, 60_000)}`, { json: true, maxTokens: 1_800, temperature: 0.15 });
      const parsed = extractJson(result.text);
      return NextResponse.json({
        title: page.title,
        siteName: page.siteName,
        content: page.content,
        url: page.url,
        overview: typeof parsed?.overview === "string" ? parsed.overview : result.text,
        topics: Array.isArray(parsed?.topics) ? parsed.topics.filter((topic): topic is string => typeof topic === "string").slice(0, 8) : [],
      });
    }

    if (action === "extract-file") {
      const fileName = cleanText(body.fileName, 180) || "Uploaded file";
      const mimeType = cleanText(body.mimeType, 120);
      const fileData = cleanText(body.fileData, 20_000_000);
      if (!mimeType || !fileData) return NextResponse.json({ error: "The selected file could not be read." }, { status: 400 });
      const result = await callGemini(`Extract the readable source material from the attached file named "${fileName}". Preserve important wording, structure, facts, dates, names, and context. If it is audio, transcribe it. If it is an image, transcribe visible text and describe source-relevant content. Do not add facts that are not in the file.`, { inlineData: { mimeType, data: fileData }, maxTokens: 8_000, temperature: 0.1, timeoutMs: 110_000 });
      return NextResponse.json({ title: fileName, content: result.text });
    }

    return NextResponse.json({ error: "Unsupported research action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The research action failed.";
    return NextResponse.json({ error: message }, { status: /abort/i.test(message) ? 504 : 500 });
  }
}
