/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const STALE_ASSET_RECOVERY = `
if (!window.__deepcastAssetRecoveryStarted) {
  window.__deepcastAssetRecoveryStarted = true;
  const now = Date.now();
  const key = "deepcast-stale-asset-retry";
  let mayReload = true;

  try {
    const previous = Number(window.sessionStorage.getItem(key) || 0);
    mayReload = !previous || now - previous > 15000;
    if (mayReload) window.sessionStorage.setItem(key, String(now));
  } catch {}

  if (mayReload) {
    const next = new URL(window.location.href);
    next.searchParams.set("deepcast-refresh", String(now));
    window.location.replace(next.toString());
  } else {
    console.error("DeepCast could not load the current interface files. Please reload the page.");
  }
}
export {};
`;

function staleAssetResponse(pathname: string): Response | null {
  if (/\.m?js$/i.test(pathname)) {
    return new Response(STALE_ASSET_RECOVERY, {
      status: 200,
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "X-DeepCast-Recovery": "stale-asset",
      },
    });
  }

  if (/\.css$/i.test(pathname)) {
    return new Response("html,body{min-height:100%;margin:0;background:#09090b!important;color:#f4f4f5!important}", {
      status: 200,
      headers: {
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "X-DeepCast-Recovery": "stale-asset",
      },
    });
  }

  return null;
}

function withFreshInterfaceHeaders(request: Request, response: Response): Response {
  const accept = request.headers.get("accept") ?? "";
  const contentType = response.headers.get("content-type") ?? "";
  const isInterfaceDocument =
    accept.includes("text/html") ||
    accept.includes("text/x-component") ||
    contentType.includes("text/html") ||
    contentType.includes("text/x-component");

  if (!isInterfaceDocument) return response;

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withSafeAssetHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/assets/")) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) return withSafeAssetHeaders(assetResponse);
      return staleAssetResponse(url.pathname) ?? assetResponse;
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    return withFreshInterfaceHeaders(request, response);
  },
};

export default worker;
