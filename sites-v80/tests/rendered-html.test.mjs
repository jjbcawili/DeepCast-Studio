import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

function assertClientAssetsExist(html) {
  const assetPaths = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map((match) => match[1]);
  assert.ok(assetPaths.length > 0, "rendered HTML should reference built client assets");
  for (const assetPath of new Set(assetPaths)) {
    const assetUrl = new URL(`../dist/client${assetPath}`, import.meta.url);
    assert.ok(existsSync(fileURLToPath(assetUrl)), `missing built client asset: ${assetPath}`);
  }
}

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const html = await response.text();
  assertClientAssetsExist(html);
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /<meta(?=[^>]*name=["']viewport["'])(?=[^>]*width=device-width)[^>]*>/i);
  const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(globalCss, /--font-interface:\s*"Source Sans 3 Variable"/);
  assert.match(globalCss, /--font-display:\s*"League Spartan Variable"/);
  assert.match(globalCss, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
  assert.match(globalCss, /@supports not \(aspect-ratio: 1 \/ 1\)/);
  assert.match(globalCss, /\.dashboard-toolbar \{ position: relative; z-index: 35;/);
  assert.match(globalCss, /\.dashboard-section\.menu-layer-active \{ z-index: 30;/);
  assert.match(globalCss, /\.topbar \{ position: fixed; z-index: 80;/);
  assert.match(globalCss, /html \{[^}]*background-color: var\(--ink\)/);
  assert.match(globalCss, /body::before \{ content: ""; position: fixed;/);
  assert.match(globalCss, /-webkit-transform: translate3d\(0,0,0\)/);
  assert.match(html, /_dc_bfcache/);
  assert.match(html, /dataset\.deepcastReady !== "true"/);
  assert.match(globalCss, /\.site-shell, \.studio-page \{[^}]*background: transparent;/);
  assert.match(globalCss, /-webkit-text-size-adjust:\s*100%/);
  assert.match(globalCss, /font-size:\s*16px/);
  const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(viteConfig, /"safari14"/);
  assert.match(viteConfig, /"chrome87"/);
  assert.match(viteConfig, /"edge88"/);
  assert.match(html, /18_DeepDive_Standalone_Title_Blue_Transparent_4K\.webp/);
  const homeSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(homeSource, /DeepCast_Pinned_Title_Transparent_4K\.webp/);
  assert.doesNotMatch(homeSource, /The Cultural Reset of Brat Summer/);
  assert.doesNotMatch(homeSource, /Music Industry Drama/);
  assert.match(html, /START YOUR STUDIO SESSION/);
  assert.match(html, /entertainment-first episodes covering music industry drama/);
  assert.match(html, /main pop girlies/);
  assert.match(html, /gay and stan Twitter/);
  assert.match(html, /Khia Asylum girlies/);
  assert.doesNotMatch(html, /RECENT DEEP DIVES/);
});

test("renders working Chat and Deep Dive library routes without migration placeholders", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("functional-routes-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const chatResponse = await worker.fetch(new Request("http://localhost/chat", { headers: { accept: "text/html" } }), env, ctx);
  const chatHtml = await chatResponse.text();
  const deepDiveResponse = await worker.fetch(new Request("http://localhost/deep-dives", { headers: { accept: "text/html" } }), env, ctx);
  const deepDiveHtml = await deepDiveResponse.text();

  assert.equal(chatResponse.status, 200);
  assert.match(chatHtml, /WHAT ARE WE DEEP DIVING TODAY\?/);
  assert.match(chatHtml, /WEB SEARCH/);
  assert.doesNotMatch(chatHtml, /connected after the Home page is approved/);
  assert.equal(deepDiveResponse.status, 200);
  assert.match(deepDiveHtml, /YOUR DEEP DIVE LIBRARY IS READY/);
  assert.match(deepDiveHtml, /NEW DEEP DIVE/);
  assert.doesNotMatch(deepDiveHtml, /migrated in the next phase/);
});

test("recovers automatically when a browser requests a stale deployment asset", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("stale-asset-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/assets/old-page-hash.js"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-deepcast-recovery"), "stale-asset");
  assert.match(response.headers.get("content-type") ?? "", /text\/javascript/);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(await response.text(), /deepcast-refresh/);

  const cssResponse = await worker.fetch(
    new Request("http://localhost/assets/old-page-hash.css"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(cssResponse.status, 200);
  assert.equal(cssResponse.headers.get("x-deepcast-recovery"), "stale-asset");
  assert.match(await cssResponse.text(), /background:#09090b/);
});

test("renders Studio speaker settings and the supported voice library", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("studio-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/studio", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();
  const normalizedHtml = html.replaceAll(/<!--.*?-->/g, "");
  assertClientAssetsExist(html);

  assert.equal(response.status, 200);
  assert.match(html, /SPEAKER SETTINGS/);
  assert.match(html, /Primary navigation/);
  assert.match(normalizedHtml, /CUSTOMIZE YOUR DEEP DIVE EPISODE/);
  assert.match(normalizedHtml, /What should the AI hosts focus on in this episode\?/);
  assert.match(normalizedHtml, /Deep Dive — Layered, evidence-led exploration/);
  assert.match(normalizedHtml, /Debate — Contrasting positions and rebuttals/);
  assert.match(normalizedHtml, /Brief — Fast, fact-first summary/);
  assert.match(normalizedHtml, /Critique — Structured evaluation and verdict/);
  assert.match(normalizedHtml, /Feature Deep Dive \(approx\. 45–60 minutes\)/);
  assert.match(normalizedHtml, /SOURCES IN PROJECT/);
  assert.match(normalizedHtml, /Project Sources/);
  assert.match(normalizedHtml, /WEB SEARCH/);
  assert.match(normalizedHtml, /Episode-only research/);
  assert.match(normalizedHtml, /BACKGROUND MUSIC &amp; TRACK CUES/);
  assert.match(normalizedHtml, /Enabled music is included in complete episode exports/);
  assert.match(normalizedHtml, /EPISODE EXPORT/);
  assert.match(normalizedHtml, /WAV · Lossless PCM/);
  assert.match(normalizedHtml, /MP3 · Stereo/);
  assert.match(normalizedHtml, /M4A · AAC Stereo/);
  assert.match(normalizedHtml, /5\.1 Surround WAV/);
  assert.match(normalizedHtml, /Spatial Stereo Mix/);
  assert.doesNotMatch(normalizedHtml, /Dolby Atmos Authoring Handoff/);
  assert.match(normalizedHtml, /PASTE SOURCE MATERIAL/);
  assert.match(normalizedHtml, /ADD FROM GOOGLE DRIVE/);
  assert.doesNotMatch(normalizedHtml, /SOURCE TITLE/);
  assert.match(normalizedHtml, /These instructions directly guide the script/);
  assert.match(html, /Audio Profile/);
  assert.match(html, /Director/);
  assert.match(html, /Search voices/);
  assert.match(html, /Puck/);
  assert.match(html, /Kore/);
  assert.match(normalizedHtml, /Selected: Puck/);
  assert.match(html, /Gemini/);
  assert.match(normalizedHtml, /warm, witty, organized male host/);
  const studioSource = readFileSync(new URL("../app/studio/page.tsx", import.meta.url), "utf8");
  assert.match(studioSource, /theatrical, slightly nasal, diva-like female host/);
  assert.match(html, /▶ PREVIEW/);
  assert.match(html, /Achernar/);
  assert.match(html, /Zubenelgenubi/);
});

test("renders the persistent project source workspace", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("projects-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/projects", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assertClientAssetsExist(html);
  assert.match(html, /PROJECT WORKSPACE/);
  assert.match(html, /Primary navigation/);
  assert.match(html, /DeepCast_Projects_Title_Transparent_4K\.webp/);
  assert.match(html, /pop culture, stan and gay Twitter/);
  assert.match(html, /main pop gurlie energy/);
  assert.match(html, /YOUR PROJECTS/);
  assert.doesNotMatch(html, /SELECTED PROJECT/);
  assert.doesNotMatch(html, /ADD SOURCE/);
  assert.doesNotMatch(html, /OPEN IN STUDIO/);
  const projectsSource = readFileSync(new URL("../app/projects/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(projectsSource, /activeProject && <section className="project-detail-panel/);
  assert.match(projectsSource, /href={`\/projects\/\$\{encodeURIComponent\(project\.id\)\}`}/);
  const projectWorkspaceSource = readFileSync(new URL("../app/projects/[projectId]/page.tsx", import.meta.url), "utf8");
  assert.match(projectWorkspaceSource, /← ALL PROJECTS/);
  assert.match(projectWorkspaceSource, />OVERVIEW</);
  assert.match(projectWorkspaceSource, />SOURCES/);
  assert.match(projectWorkspaceSource, />STUDIO</);
  assert.match(projectWorkspaceSource, />CHAT</);
  assert.match(projectWorkspaceSource, /ADD SOURCES/);
  assert.match(projectWorkspaceSource, /FAST RESEARCH/);
  assert.match(projectWorkspaceSource, /DEEP RESEARCH/);
  assert.match(projectWorkspaceSource, /UPLOAD FILES/);
  assert.match(projectWorkspaceSource, /WEBSITE AND YOUTUBE URLS/);
  assert.match(projectWorkspaceSource, /\.split\(\/\[\\s,\]\+\/\)/);
  assert.match(projectWorkspaceSource, /Paste as many public links as you need/);
  assert.doesNotMatch(projectWorkspaceSource, /\]\]\.slice\(0, 20\)/);
  assert.match(projectWorkspaceSource, /COPIED TEXT/);
  assert.match(projectWorkspaceSource, /SELECT ALL/);
  assert.match(projectWorkspaceSource, /SOURCE OVERVIEW/);
  assert.match(projectWorkspaceSource, /OPEN ORIGINAL SOURCE/);
  assert.match(projectWorkspaceSource, /ActionToast/);
  assert.doesNotMatch(projectWorkspaceSource, /SOURCE TITLE/);
  assert.match(projectWorkspaceSource, /DEEPCAST STUDIO/);
  const researchRouteSource = readFileSync(new URL("../app/api/projects/research/route.ts", import.meta.url), "utf8");
  assert.match(researchRouteSource, /fast-search/);
  assert.match(researchRouteSource, /deep-search/);
  assert.match(researchRouteSource, /extract-file/);
  assert.match(researchRouteSource, /AI source overview/);
  const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(globalCss, /\.project-index-grid \{ grid-template-columns:/);
  assert.match(globalCss, /\.project-context-tabs \{ position: sticky;/);
  assert.match(globalCss, /\.projects-title-art \{ width: clamp\(226px,29\.4vw,328px\)/);
  assert.match(globalCss, /\.workspace-title-art \{ width: clamp\(279px,36\.4vw,406px\)/);
});
