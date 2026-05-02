"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Bot, Send, Mic, Square, X, Volume2, RefreshCw } from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import {
  aiChatSend,
  aiVoiceChat,
  AiChatError,
  type ChatMessage,
} from "@/lib/aiChat";

/**
 * Floating AI chatbot.
 *
 *  - Left-click the bubble to toggle the panel.
 *  - Right-click + drag the bubble to move it. Position is cached per-session
 *    in localStorage. (Right-click was specifically requested over left-click
 *    drag so the bubble stays "click to open" with no long-press gymnastics.)
 *  - Voice: hold-to-talk records audio, posts to /api/ai/voice/chat, and
 *    auto-plays the audio reply.
 *  - History is in-memory only (cleared on logout / refresh).
 */

const STORAGE_KEY = "glimmora-chatbot-pos";
const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 480;
const BUBBLE_SIZE = 56;

interface Position { x: number; y: number }

function clampToViewport(p: Position, w: number, h: number): Position {
  if (typeof window === "undefined") return p;
  const margin = 8;
  return {
    x: Math.min(Math.max(margin, p.x), window.innerWidth - w - margin),
    y: Math.min(Math.max(margin, p.y), window.innerHeight - h - margin),
  };
}

function loadPosition(): Position | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Position;
    if (typeof p.x !== "number" || typeof p.y !== "number") return null;
    return p;
  } catch {
    return null;
  }
}

function savePosition(p: Position) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function AIChatbot() {
  // Token from logged-in user record (set by app login flow).
  const aiToken = useAppSelector((s) => {
    const u = s.auth.user;
    if (!u) return null;
    const tenant = s.auth.tenants.find((t) => t.id === u.tenantId);
    return tenant?.config?.users?.find((x) => x.id === u.id)?.aiAccessToken ?? null;
  });

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position>(() => ({ x: 24, y: 24 })); // fallback; replaced after mount
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const dragState = useRef<{ active: boolean; offsetX: number; offsetY: number; moved: boolean }>({
    active: false, offsetX: 0, offsetY: 0, moved: false,
  });
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Bottom-right default position once we know the viewport. Restore from
  // localStorage if the user has dragged before.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = loadPosition();
    const initial: Position = stored ?? {
      x: window.innerWidth - BUBBLE_SIZE - 24,
      y: window.innerHeight - BUBBLE_SIZE - 24,
    };
    setPos(clampToViewport(initial, BUBBLE_SIZE, BUBBLE_SIZE));
    setMounted(true);
  }, []);

  // Auto-scroll chat to the bottom on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  /* ── Drag handlers (right-click) ─────────────────────────────── */

  function handleContextMenu(e: React.MouseEvent) {
    // Right-click toggles drag mode AND suppresses the browser context menu.
    e.preventDefault();
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 2) return; // only right button starts drag
    e.preventDefault();
    dragState.current = {
      active: true,
      offsetX: e.clientX - pos.x,
      offsetY: e.clientY - pos.y,
      moved: false,
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!dragState.current.active) return;
    const next = clampToViewport(
      { x: e.clientX - dragState.current.offsetX, y: e.clientY - dragState.current.offsetY },
      BUBBLE_SIZE,
      BUBBLE_SIZE,
    );
    dragState.current.moved = true;
    setPos(next);
  }

  function handleMouseUp() {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
    // Persist the new position.
    setPos((p) => {
      savePosition(p);
      return p;
    });
  }

  /* ── Chat ────────────────────────────────────────────────────── */

  async function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    if (!aiToken) {
      setError("AI session is missing. Sign out and sign back in to refresh your token.");
      return;
    }
    setInput("");
    const userMsg: ChatMessage = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setBusy(true);
    try {
      const res = await aiChatSend(text, messages, aiToken);
      setMessages([...next, { role: "assistant", content: res.reply ?? "(no reply)" }]);
    } catch (e) {
      const msg = e instanceof AiChatError ? e.message : e instanceof Error ? e.message : "Chat failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function handleClear() {
    setMessages([]);
    setError(null);
  }

  /* ── Voice ───────────────────────────────────────────────────── */

  async function startRecording() {
    setError(null);
    if (!aiToken) {
      setError("AI session is missing. Sign out and sign back in to refresh your token.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone is not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recChunks.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (ev) => { if (ev.data.size > 0) recChunks.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recChunks.current, { type: mr.mimeType || "audio/webm" });
        await sendVoice(blob);
      };
      mr.start();
      recRef.current = mr;
      setRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start recording");
    }
  }

  function stopRecording() {
    const mr = recRef.current;
    if (!mr) return;
    setRecording(false);
    if (mr.state !== "inactive") mr.stop();
    recRef.current = null;
  }

  async function sendVoice(audio: Blob) {
    if (!aiToken) return;
    setBusy(true);
    setError(null);
    setMessages((m) => [...m, { role: "user", content: "🎤 (voice message)" }]);
    try {
      const replyAudio = await aiVoiceChat(audio, aiToken);
      const url = URL.createObjectURL(replyAudio);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => undefined);
      }
      setMessages((m) => [...m, { role: "assistant", content: "🔊 (voice reply — playing)" }]);
    } catch (e) {
      const msg = e instanceof AiChatError ? e.message : e instanceof Error ? e.message : "Voice chat failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  /* ── Render ──────────────────────────────────────────────────── */

  if (!mounted) return null;

  // Panel anchors to the bubble. If bubble is in the right half of the
  // viewport, panel opens to the bubble's left; otherwise to the right.
  // Same idea vertically — opens upward if there's no room below.
  const opensLeft = pos.x + PANEL_WIDTH + BUBBLE_SIZE + 16 > window.innerWidth;
  const opensUp = pos.y + PANEL_HEIGHT + BUBBLE_SIZE + 16 > window.innerHeight;
  const panelStyle: CSSProperties = {
    position: "fixed",
    left: opensLeft ? pos.x - PANEL_WIDTH - 12 : pos.x + BUBBLE_SIZE + 12,
    top: opensUp ? Math.max(8, pos.y + BUBBLE_SIZE - PANEL_HEIGHT) : pos.y,
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    zIndex: 1000,
  };

  return (
    <>
      {/* Floating bubble */}
      <button
        type="button"
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        onClick={() => {
          if (dragState.current.moved) {
            // Don't toggle if this was the end of a drag gesture.
            dragState.current.moved = false;
            return;
          }
          setOpen((v) => !v);
        }}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        title="Click to open · Right-click and drag to move"
        style={{
          position: "fixed",
          left: pos.x,
          top: pos.y,
          width: BUBBLE_SIZE,
          height: BUBBLE_SIZE,
          borderRadius: "50%",
          background: "var(--brand)",
          color: "#fff",
          border: "none",
          cursor: dragState.current.active ? "grabbing" : "pointer",
          boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1001,
          transition: "transform 0.15s",
        }}
      >
        {open ? <X className="w-6 h-6" aria-hidden="true" /> : <Bot className="w-6 h-6" aria-hidden="true" />}
      </button>

      {/* Hidden audio element for voice playback */}
      <audio ref={audioRef} className="sr-only" />

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="AI Assistant"
          style={{
            ...panelStyle,
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2.5"
            style={{ borderBottom: "1px solid var(--card-border)", background: "var(--bg-elevated)" }}
          >
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4" aria-hidden="true" style={{ color: "var(--brand)" }} />
              <span className="text-[12px] font-semibold" style={{ color: "var(--card-text)" }}>
                AI Assistant
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Clear conversation"
                onClick={handleClear}
                className="p-1 rounded transition-colors bg-transparent border-0 cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="p-1 rounded transition-colors bg-transparent border-0 cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Message list */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2" style={{ background: "var(--bg-base)" }}>
            {messages.length === 0 && !busy && (
              <p className="text-[11px] text-center" style={{ color: "var(--text-muted)" }}>
                Ask anything about CAPAs, deviations, audits, or compliance.
                Hold the mic to record, release to send.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className="rounded-lg px-2.5 py-2 text-[12px] max-w-[85%]"
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  marginLeft: m.role === "user" ? "auto" : 0,
                  marginRight: m.role === "user" ? 0 : "auto",
                  background: m.role === "user" ? "var(--brand-muted)" : "var(--bg-elevated)",
                  color: m.role === "user" ? "var(--brand)" : "var(--text-primary)",
                  border: m.role === "user" ? "1px solid var(--brand-border)" : "1px solid var(--bg-border)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.content}
              </div>
            ))}
            {busy && (
              <div
                className="rounded-lg px-2.5 py-2 text-[12px] inline-flex items-center gap-2"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-muted)" }}
              >
                <Volume2 className="w-3 h-3 animate-pulse" aria-hidden="true" />
                Thinking…
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="px-3 py-1.5 text-[11px]"
              style={{ background: "var(--danger-bg)", color: "var(--danger)", borderTop: "1px solid var(--danger)" }}
            >
              {error}
            </div>
          )}

          {/* Input row */}
          <div
            className="flex items-center gap-2 p-2"
            style={{ borderTop: "1px solid var(--card-border)", background: "var(--bg-elevated)" }}
          >
            <button
              type="button"
              aria-label={recording ? "Stop recording" : "Hold to talk"}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={recording ? stopRecording : undefined}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              disabled={busy && !recording}
              className="p-2 rounded-lg transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: recording ? "var(--danger)" : "var(--bg-surface)",
                color: recording ? "#fff" : "var(--text-secondary)",
                border: "1px solid var(--bg-border)",
              }}
            >
              {recording ? <Square className="w-3.5 h-3.5" aria-hidden="true" /> : <Mic className="w-3.5 h-3.5" aria-hidden="true" />}
            </button>
            <input
              type="text"
              className="input text-[12px] flex-1"
              placeholder={busy ? "Waiting…" : "Type a message…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              disabled={busy || recording}
            />
            <button
              type="button"
              aria-label="Send"
              onClick={handleSend}
              disabled={busy || recording || !input.trim()}
              className="p-2 rounded-lg transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--brand)", color: "#fff" }}
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
