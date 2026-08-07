"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { readProjectSources, readProjects, type DeepCastProject } from "../../lib/project-storage";
import ProjectWorkspaceHeader from "../components/ProjectWorkspaceHeader";

type Message = { id: string; role: "user" | "assistant"; content: string; searched?: boolean };
const CHAT_STORAGE_KEY = "deepcast-chat-history-v1";
const suggestions = [
  "Explain the rollout strategy behind a major pop era.",
  "Compare two pop-star album campaigns.",
  "Break down a stan-Twitter debate without losing the facts.",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [project, setProject] = useState<DeepCastProject | null>(null);
  const [projectContext, setProjectContext] = useState("");
  const [projectSourceCount, setProjectSourceCount] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const projectId = new URLSearchParams(window.location.search).get("project") || "";
        const selectedProject = readProjects().find((item) => item.id === projectId) || null;
        const sourceRecords = selectedProject ? readProjectSources(selectedProject.id) : [];
        setProject(selectedProject);
        setProjectSourceCount(sourceRecords.length);
        setProjectContext(selectedProject ? [
          `Project title: ${selectedProject.title}`,
          `Project description: ${selectedProject.description || "No description provided."}`,
          ...sourceRecords.slice(0, 20).map((source, index) => `Source ${index + 1} — ${source.title}: ${source.content.slice(0, 3_000)}`),
        ].join("\n\n") : "");
        const storageKey = selectedProject ? `${CHAT_STORAGE_KEY}:${selectedProject.id}` : CHAT_STORAGE_KEY;
        const saved = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
        if (Array.isArray(saved)) setMessages(saved.slice(-40));
      } catch {
        window.localStorage.removeItem(CHAT_STORAGE_KEY);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, sending]);

  function persist(next: Message[]) {
    setMessages(next);
    window.localStorage.setItem(project ? `${CHAT_STORAGE_KEY}:${project.id}` : CHAT_STORAGE_KEY, JSON.stringify(next.slice(-40)));
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    const userMessage: Message = { id: `user-${Date.now()}`, role: "user", content };
    const next = [...messages, userMessage];
    persist(next);
    setInput("");
    setError("");
    setSending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content: text }) => ({ role, content: text })), useWebSearch, projectContext }),
      });
      const result = await response.json().catch(() => null) as { answer?: string; error?: string; webSearchUsed?: boolean } | null;
      if (!response.ok || !result?.answer) throw new Error(result?.error || "DeepCast Chat could not answer right now.");
      persist([...next, { id: `assistant-${Date.now()}`, role: "assistant", content: result.answer, searched: result.webSearchUsed }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chat failed. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="site-shell chat-page">
      <div className="chat-shell">
        {project && <ProjectWorkspaceHeader project={project} active="chat" sourceCount={projectSourceCount} />}
        <header className="chat-page-header"><span>{project ? "PROJECT CHAT" : "ENTERTAINMENT RESEARCH"}</span><h1>CHAT</h1><p>{project ? `Research and discuss ${project.title} using its saved project context and optional web search.` : "Ask about pop culture, the music industry, main pop girlies, and the discourse moving gay and stan Twitter."}</p></header>
        <section className="chat-workspace glass-section" aria-label="DeepCast Chat conversation">
          <div className="chat-messages" aria-live="polite">
            {!messages.length && <div className="chat-welcome"><strong>{project ? `ASK ABOUT ${project.title}` : "WHAT ARE WE DEEP DIVING TODAY?"}</strong><p>{project ? "This conversation can use the sources saved to this project." : "Start with a question or choose a lane below."}</p><div>{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => setInput(suggestion)}>{suggestion}</button>)}</div></div>}
            {messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}><span>{message.role === "user" ? "YOU" : "DEEPCAST"}</span><p>{message.content}</p>{message.role === "assistant" && <small>{message.searched ? "WEB SEARCH ENABLED" : "PROJECT-FREE CHAT"}</small>}</article>)}
            {sending && <div className="chat-thinking"><i /><span>DeepCast is researching and writing…</span></div>}
            <div ref={endRef} />
          </div>
          {error && <div className="chat-error" role="alert">{error}</div>}
          <form className="chat-composer" onSubmit={sendMessage}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask DeepCast anything about entertainment, music, pop culture, or stan discourse…" maxLength={8000} />
            <div><button type="button" className={`chat-search-toggle ${useWebSearch ? "active" : ""}`} onClick={() => setUseWebSearch((current) => !current)} aria-pressed={useWebSearch}><i /><span>WEB SEARCH</span></button><button type="button" onClick={() => { persist([]); setError(""); }} disabled={!messages.length}>CLEAR CHAT</button><button type="submit" className="chat-send" disabled={!input.trim() || sending}>{sending ? "SENDING…" : "SEND"}</button></div>
          </form>
        </section>
      </div>
    </main>
  );
}
