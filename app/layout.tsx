import "@fontsource-variable/league-spartan";
import "@fontsource-variable/source-sans-3";
import type { Metadata, Viewport } from "next";
import ClientRuntimeGuard from "./components/ClientRuntimeGuard";
import BackgroundJobTray from "./components/BackgroundJobTray";
import SiteHeader from "./components/SiteHeader";
import GlobalAudioPlayer from "./components/GlobalAudioPlayer";
import SourceImportRunner from "./components/SourceImportRunner";
import SiteFooter from "./components/SiteFooter";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "DeepCast Studio",
  description:
    "Turn prompts, sources, and web research into AI-hosted podcast deep dives.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head><script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.dataset.theme=localStorage.getItem("deepcast-theme")==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}` }} /></head>
      <body>
        <style
          dangerouslySetInnerHTML={{
            __html: `html,body{min-height:100%;margin:0;background:var(--ink,#09090b);color:var(--text,#f4f4f5)}body{padding-top:96px}@media(max-width:760px){body{padding-top:calc(80px + env(safe-area-inset-top,0px))}}`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function () {
  var key = "deepcast-runtime-recovery";
  var recoveryStarted = false;
  var diagnosticMode = new URL(window.location.href).searchParams.get("interaction-check") === "1";

  function report(stage, target) {
    if (!diagnosticMode) return;
    var control = target && target.closest && target.closest("button,a,input,select,textarea");
    window.fetch("/api/client-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: stage,
        path: window.location.pathname,
        control: control ? control.tagName.toLowerCase() : (target && target.tagName ? target.tagName.toLowerCase() : "none")
      }),
      keepalive: true
    }).catch(function () {});
  }

  report("inline-boot", document.documentElement);
  window.addEventListener("pointerdown", function (event) { report("inline-pointer", event.target); }, true);

  function recover() {
    if (recoveryStarted || document.documentElement.dataset.deepcastReady === "true") return;
    recoveryStarted = true;

    try {
      var previousAttempt = Number(window.sessionStorage.getItem(key) || 0);
      if (previousAttempt && Date.now() - previousAttempt < 60000) {
        document.documentElement.dataset.deepcastRuntime = "unavailable";
        return;
      }
      window.sessionStorage.setItem(key, String(Date.now()));
    } catch (_) {}

    var next = new URL(window.location.href);
    next.searchParams.set("_dc_refresh", String(Date.now()));
    window.location.replace(next.toString());
  }

  window.addEventListener("click", function (event) {
    report("inline-click", event.target);
    var target = event.target;
    var control = target && target.closest && target.closest("button,a,input,select,textarea,label");
    if (control && document.documentElement.dataset.deepcastReady !== "true") recover();
  }, true);

  window.addEventListener("pageshow", function (event) {
    if (!event.persisted) return;
    var next = new URL(window.location.href);
    next.searchParams.set("_dc_bfcache", String(Date.now()));
    window.location.replace(next.toString());
  });

  window.addEventListener("error", function (event) {
    var target = event.target;
    var message = String(event.message || "");
    if ((target && target.tagName === "SCRIPT") || /chunk|module|import/i.test(message)) recover();
  }, true);

  window.addEventListener("unhandledrejection", function (event) {
    var message = String(event.reason && (event.reason.message || event.reason) || "");
    if (/chunk|module|import|fetch dynamically imported/i.test(message)) recover();
  });

  window.setTimeout(recover, 8000);
})();`,
          }}
        />
        <ClientRuntimeGuard />
        <SiteHeader />
        <SourceImportRunner />
        {children}
        <SiteFooter />
        <BackgroundJobTray />
        <GlobalAudioPlayer />
      </body>
    </html>
  );
}
