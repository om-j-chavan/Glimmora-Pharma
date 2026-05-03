"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Bot, Send, Mic, Square, X, Volume2, RefreshCw, Trash2, Settings, Edit3 } from "lucide-react";
// Type-only import — the actual classes extend AudioWorkletNode (a
// browser-only global) and crash at module-evaluation time on the SSR
// server. We dynamically import() the runtime inside startRecording so
// it only loads in the browser.
import type { RnnoiseWorkletNode as RnnoiseNode } from "@sapphi-red/web-noise-suppressor";
import { useAppSelector } from "@/hooks/useAppSelector";
import {
  aiChatSend,
  aiVoiceChat,
  aiVoiceTranscribe,
  aiVoiceSpeak,
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
const SUPPRESSION_KEY = "glimmora-chatbot-suppression";
const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 480;
const BUBBLE_SIZE = 56;

function loadSuppressionLevel(): number {
  if (typeof window === "undefined") return 100;
  try {
    const raw = localStorage.getItem(SUPPRESSION_KEY);
    if (!raw) return 100;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 100;
  } catch {
    return 100;
  }
}

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
  // Token from logged-in user record (set by app login flow). Prefer the
  // token on auth.user (always populated by refreshAiToken) and fall back
  // to the tenant.config.users entry for older sessions.
  const aiToken = useAppSelector((s) => {
    const u = s.auth.user;
    if (!u) return null;
    if (u.aiAccessToken) return u.aiAccessToken;
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
  // Voice state machine: idle → recording → preview → idle.
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "preview">("idle");
  // round-trip = STT + chat + TTS (audio reply); dictate = STT only, drops
  // text into the input box for the user to review and send manually.
  const [voiceMode, setVoiceMode] = useState<"round-trip" | "dictate">("round-trip");
  // Per-message TTS state — the message index whose audio is currently
  // being fetched / playing, so we can show a spinner / disabled state.
  const [ttsIdx, setTtsIdx] = useState<number | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  // Live audio level (0..1) driven by AnalyserNode for the VU-meter bars.
  const [audioLevel, setAudioLevel] = useState(0);
  // Suppression strength 0..100 — drives the wet/dry mix between raw mic
  // and RNNoise-processed audio. Live-updatable while recording.
  const [suppressionLevel, setSuppressionLevel] = useState<number>(() => loadSuppressionLevel());
  const [showSettings, setShowSettings] = useState(false);

  const dragState = useRef<{ active: boolean; offsetX: number; offsetY: number; moved: boolean }>({
    active: false, offsetX: 0, offsetY: 0, moved: false,
  });
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recStreamRef = useRef<MediaStream | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rnnoiseRef = useRef<RnnoiseNode | null>(null);
  // Wet/dry mix nodes — addressable so the slider can adjust them live.
  const wetGainRef = useRef<GainNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const recStartRef = useRef<number>(0);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // Releases mic + audio-graph resources. Safe to call repeatedly.
  function teardownRecording() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (recTimerRef.current !== null) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    if (recStreamRef.current) {
      recStreamRef.current.getTracks().forEach((t) => t.stop());
      recStreamRef.current = null;
    }
    if (processedStreamRef.current) {
      processedStreamRef.current.getTracks().forEach((t) => t.stop());
      processedStreamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => undefined);
    }
    if (rnnoiseRef.current) {
      try { rnnoiseRef.current.destroy(); } catch { /* ignore */ }
      rnnoiseRef.current = null;
    }
    wetGainRef.current = null;
    dryGainRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);
  }

  // Cleanup on unmount.
  useEffect(() => () => teardownRecording(), []);

  // Live-update the wet/dry mix when the slider moves and persist the
  // chosen level so it sticks across reloads.
  useEffect(() => {
    try { localStorage.setItem(SUPPRESSION_KEY, String(suppressionLevel)); } catch { /* ignore */ }
    const w = suppressionLevel / 100;
    if (wetGainRef.current) wetGainRef.current.gain.value = w;
    if (dryGainRef.current) dryGainRef.current.gain.value = 1 - w;
  }, [suppressionLevel]);
  // Revoke any held object URLs to avoid memory leaks.
  useEffect(() => {
    return () => {
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

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
      // Browser-level audio cleanup: noise suppression strips steady-state
      // background noise (HVAC, fan hum, keyboard rumble), echo cancellation
      // removes feedback from the user's own speakers, and AGC normalises
      // the volume so quiet speech still reaches the model. All three are
      // best-effort hints — Chromium honours them, Safari partially, Firefox
      // largely — and are defined as advanced constraints so a browser that
      // can't satisfy them will fall back to plain audio rather than fail.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Mono, 48 kHz — Whisper-friendly and reduces upload size.
          channelCount: 1,
          sampleRate: 48000,
        },
      });
      recStreamRef.current = stream;
      recChunks.current = [];

      // ── Real-time audio cleanup chain ─────────────────────────
      // RNNoise (the same RNN-based suppressor used by Jitsi / Discord-
      // style apps) runs as an AudioWorklet on a 48 kHz mono signal and
      // strips background noise — keyboard, fan, traffic, room tone —
      // far better than DSP filters can. It's wrapped in a tiny tone-
      // shaping chain so what reaches Whisper is loud, clear, mono.
      //
      //   mic ─► HighPass(60Hz) ─► RNNoise ─► Compressor ─► MakeUpGain ─┬─► Destination ─► MediaRecorder
      //                                                                  └─► Analyser (VU meter)
      //
      // RNNoise expects 48 kHz mono. The getUserMedia constraints above
      // already request that, and on browsers that fall back to the
      // default rate the AudioContext is set explicitly.
      //
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const ctx = new Ctx({ sampleRate: 48000 });
      audioCtxRef.current = ctx;

      // Load the RNNoise wasm binary + AudioWorklet processor. Both are
      // served from /public/rnnoise/ (copied at install time).
      let rnnoiseNode: AudioNode | null = null;
      let rnnoiseInstance: RnnoiseNode | null = null;
      try {
        // Dynamic import — the package extends the browser-only
        // AudioWorkletNode class, which would crash at module load on
        // the Next.js SSR server.
        const { loadRnnoise, RnnoiseWorkletNode } = await import("@sapphi-red/web-noise-suppressor");
        const wasmBinary = await loadRnnoise({
          url: "/rnnoise/rnnoise.wasm",
          simdUrl: "/rnnoise/rnnoise_simd.wasm",
        });
        await ctx.audioWorklet.addModule("/rnnoise/workletProcessor.js");
        rnnoiseInstance = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary });
        rnnoiseNode = rnnoiseInstance;
      } catch (err) {
        // Browser doesn't support AudioWorklet, or the assets failed to
        // load. Fall back to the rest of the chain — still better than
        // raw mic, and we log it so we know.
        console.warn("[chatbot] RNNoise unavailable — falling back to DSP-only chain", err);
        rnnoiseNode = null;
      }

      const source = ctx.createMediaStreamSource(stream);

      const highPass = ctx.createBiquadFilter();
      highPass.type = "highpass";
      highPass.frequency.value = 60;        // cuts subsonic rumble RNNoise can't reach
      highPass.Q.value = 0.7;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -22;
      compressor.knee.value = 24;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.18;

      // Make-up gain after the compressor — RNNoise tends to leave the
      // post-processed signal slightly hot, so +6 dB of clean headroom.
      const makeup = ctx.createGain();
      makeup.gain.value = 1.5;

      // Wire it up. The signal forks after the high-pass: a "wet" path
      // through RNNoise (gain = suppressionLevel / 100) and a "dry" path
      // straight from the high-pass (gain = 1 - suppressionLevel / 100).
      // Both feed the compressor. The slider adjusts the two gains live
      // so the user can dial suppression strength while recording.
      source.connect(highPass);
      const wet = ctx.createGain();
      const dry = ctx.createGain();
      const w = suppressionLevel / 100;
      wet.gain.value = w;
      dry.gain.value = 1 - w;
      wetGainRef.current = wet;
      dryGainRef.current = dry;

      if (rnnoiseNode) {
        highPass.connect(rnnoiseNode);
        rnnoiseNode.connect(wet);
      } else {
        // No RNNoise available — wet path falls back to the dry signal so
        // the slider effectively becomes a no-op. The user still gets the
        // rest of the chain.
        highPass.connect(wet);
      }
      highPass.connect(dry);

      wet.connect(compressor);
      dry.connect(compressor);
      compressor.connect(makeup);

      // Tap analyser AFTER the chain so the VU meter reflects what the
      // model actually hears (no noise, gated when silent).
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      makeup.connect(analyser);
      analyserRef.current = analyser;

      // MediaStreamDestination → cleaned-up audio that MediaRecorder reads.
      const destination = ctx.createMediaStreamDestination();
      makeup.connect(destination);
      processedStreamRef.current = destination.stream;

      // Hold a reference to the rnnoise worklet so we can destroy() it
      // on teardown (frees the wasm memory).
      rnnoiseRef.current = rnnoiseInstance;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        // Boost contrast so quiet speech still moves the bars.
        setAudioLevel(Math.min(1, avg * 2.4));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      // MediaRecorder reads from the cleaned stream, not the raw mic.
      // Pin the codec to Opus inside a webm container — Whisper accepts
      // both webm/opus and ogg/opus directly, and Opus avoids the rare
      // browsers that default to formats Whisper rejects (e.g. mp4/aac
      // on some Safari builds). Fall back to default if the browser
      // doesn't support the explicit type.
      const preferredMime = "audio/webm;codecs=opus";
      const mrOpts: MediaRecorderOptions = (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(preferredMime))
        ? { mimeType: preferredMime, audioBitsPerSecond: 64000 }
        : {};
      const mr = new MediaRecorder(destination.stream, mrOpts);

      // Give RNNoise ~300 ms of audio to settle before we start a new
      // recording. Without this, the RNN's transient state can clip the
      // first syllable of speech. The MediaRecorder is started then
      // immediately discards the buffered chunks — first real chunk to
      // be kept is the one after the settle window expires.
      const settleMs = 300;
      const settleStart = Date.now();
      let settled = false;
      mr.ondataavailable = (ev) => {
        if (!settled) {
          if (Date.now() - settleStart >= settleMs) settled = true;
          else return; // drop this chunk — RNNoise still warming up
        }
        if (ev.data.size > 0) recChunks.current.push(ev.data);
      };
      mr.onstop = () => {
        const blob = new Blob(recChunks.current, { type: mr.mimeType || "audio/webm" });
        console.info(`[chatbot] voice recorded — ${blob.size} bytes, ${mr.mimeType || "default"}, ~${recordSeconds}s`);
        const url = URL.createObjectURL(blob);
        teardownRecording();
        setRecordedBlob(blob);
        setRecordedUrl(url);
        setVoiceState("preview");
      };
      // Request a chunk every 250 ms so the settle window can drop early
      // chunks instead of waiting for stop().
      mr.start(250);
      recRef.current = mr;
      recStartRef.current = Date.now();
      setRecordSeconds(0);
      recTimerRef.current = setInterval(() => {
        setRecordSeconds(Math.floor((Date.now() - recStartRef.current) / 1000));
      }, 250);
      setVoiceState("recording");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start recording";
      setError(
        msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")
          ? "Microphone permission was denied. Click the lock icon in the address bar and reset the microphone permission, then try again."
          : msg,
      );
      teardownRecording();
    }
  }

  function stopRecording() {
    const mr = recRef.current;
    if (!mr) return;
    if (mr.state !== "inactive") mr.stop();
    recRef.current = null;
    // teardownRecording is called inside mr.onstop after the chunks flush.
  }

  function cancelRecording() {
    const mr = recRef.current;
    if (mr && mr.state !== "inactive") {
      // Detach onstop so we don't accidentally enter preview state.
      mr.onstop = null;
      mr.stop();
      recRef.current = null;
    }
    teardownRecording();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordSeconds(0);
    setVoiceState("idle");
  }

  function rerecord() {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordSeconds(0);
    setVoiceState("idle");
    void startRecording();
  }

  async function sendRecorded() {
    if (!aiToken || !recordedBlob) return;
    const blob = recordedBlob;
    setError(null);

    // Dictate mode — STT only. Transcribe and drop into the input box for
    // the user to edit and send manually. No assistant turn is added.
    if (voiceMode === "dictate") {
      setBusy(true);
      // Reset preview state immediately so the panel returns to its idle UI.
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      setRecordedBlob(null);
      setRecordedUrl(null);
      setRecordSeconds(0);
      setVoiceState("idle");
      try {
        const r = await aiVoiceTranscribe(blob, aiToken);
        const transcribed = (r as { text?: string }).text ?? "";
        setInput((prev) => (prev ? `${prev} ${transcribed}` : transcribed));
      } catch (e) {
        const msg = e instanceof AiChatError ? e.message : e instanceof Error ? e.message : "Transcription failed";
        setError(msg);
      } finally {
        setBusy(false);
      }
      return;
    }

    // Round-trip mode — STT + chat + TTS. Plays audio reply.
    setBusy(true);
    let userIdx = -1;
    setMessages((m) => {
      userIdx = m.length;
      return [...m, { role: "user", content: "🎤 (transcribing…)" }];
    });
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordSeconds(0);
    setVoiceState("idle");
    try {
      const result = await aiVoiceChat(blob, aiToken, messages);
      const url = URL.createObjectURL(result.audio);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => undefined);
      }
      setMessages((m) => {
        const next = m.slice();
        if (userIdx >= 0 && userIdx < next.length && next[userIdx].role === "user") {
          next[userIdx] = {
            role: "user",
            content: result.userText
              ? `🎤 ${result.userText}`
              : "🎤 (voice message — transcript unavailable)",
          };
        }
        next.push({
          role: "assistant",
          content: result.aiReply ?? "🔊 (voice reply — playing)",
        });
        return next;
      });
    } catch (e) {
      const msg = e instanceof AiChatError ? e.message : e instanceof Error ? e.message : "Voice chat failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  // TTS — speak a stored assistant reply on demand.
  async function speakMessage(idx: number, text: string) {
    if (!aiToken || !text || !text.trim()) return;
    setTtsIdx(idx);
    setError(null);
    try {
      const audio = await aiVoiceSpeak(text, "nova", aiToken);
      const url = URL.createObjectURL(audio);
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play().catch(() => undefined);
      }
    } catch (e) {
      const msg = e instanceof AiChatError ? e.message : e instanceof Error ? e.message : "Speech failed";
      setError(msg);
    } finally {
      setTtsIdx(null);
    }
  }

  function formatDuration(s: number): string {
    const mm = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
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
                aria-label="Voice settings"
                aria-expanded={showSettings}
                onClick={() => setShowSettings((v) => !v)}
                className="p-1 rounded transition-colors bg-transparent border-0 cursor-pointer"
                style={{ color: showSettings ? "var(--brand)" : "var(--text-muted)" }}
              >
                <Settings className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
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

          {/* Settings drawer — collapsible row under the header. Holds the
              voice-cleanup controls. Live-applies while recording. */}
          {showSettings && (
            <div
              className="px-3 py-2.5"
              style={{ borderBottom: "1px solid var(--card-border)", background: "var(--bg-base)" }}
            >
              <label
                htmlFor="voice-suppression"
                className="flex items-center justify-between text-[11px] font-medium mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                <span>Noise suppression</span>
                <span className="font-mono tabular-nums" style={{ color: "var(--brand)" }}>
                  {suppressionLevel}%
                </span>
              </label>
              <input
                id="voice-suppression"
                type="range"
                min={0}
                max={100}
                step={5}
                value={suppressionLevel}
                onChange={(e) => setSuppressionLevel(Number(e.target.value))}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={suppressionLevel}
                className="w-full"
                style={{ accentColor: "var(--brand)" }}
              />
              <div
                className="flex items-center justify-between text-[10px] mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                <span>Off</span>
                <span>Light</span>
                <span>Medium</span>
                <span>Strong</span>
                <span>Max</span>
              </div>
              <p className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                Wet/dry mix between your raw mic and the RNNoise-cleaned signal.
                Higher = more background noise removed (may slightly muffle quiet speech).
              </p>
            </div>
          )}

          {/* Message list */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2" style={{ background: "var(--bg-base)" }}>
            {messages.length === 0 && !busy && (
              <p className="text-[11px] text-center" style={{ color: "var(--text-muted)" }}>
                Ask anything about CAPAs, deviations, audits, or compliance.
                Hold the mic to record, release to send.
              </p>
            )}
            {messages.map((m, i) => {
              // Show a "speak this reply" button on assistant turns whose
              // content is plain text (skip the placeholder voice-reply tag
              // since that audio is already playing from the round-trip).
              const isAssistant = m.role !== "user";
              const isVoicePlayingTag = isAssistant && m.content.startsWith("🔊");
              const canSpeak = isAssistant && !isVoicePlayingTag && !!m.content.trim();
              const speaking = ttsIdx === i;
              return (
                <div
                  key={i}
                  className="rounded-lg px-2.5 py-2 text-[12px] max-w-[85%] relative group"
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
                  {canSpeak && (
                    <button
                      type="button"
                      aria-label={speaking ? "Generating audio…" : "Read aloud"}
                      title={speaking ? "Generating audio…" : "Read aloud"}
                      onClick={() => speakMessage(i, m.content)}
                      disabled={speaking || ttsIdx !== null}
                      className="ml-2 inline-flex items-center justify-center rounded-md cursor-pointer border-0 align-middle disabled:opacity-50 disabled:cursor-wait"
                      style={{
                        width: 22,
                        height: 22,
                        background: "transparent",
                        color: speaking ? "var(--brand)" : "var(--text-muted)",
                      }}
                    >
                      <Volume2
                        className={"w-3.5 h-3.5 " + (speaking ? "animate-pulse" : "")}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>
              );
            })}
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

          {/* Input row — three modes:
                idle      : mic + text input + send
                recording : VU-meter + stop / cancel
                preview   : audio preview + send / re-record / discard */}
          <div
            className="flex items-center gap-2 p-2"
            style={{ borderTop: "1px solid var(--card-border)", background: "var(--bg-elevated)" }}
          >
            {voiceState === "idle" && (
              <>
                {/* Record voice (round-trip — STT + chat + TTS reply) */}
                <button
                  type="button"
                  aria-label="Record voice message (assistant replies aloud)"
                  title="Record voice message — assistant replies aloud"
                  onClick={() => { setVoiceMode("round-trip"); void startRecording(); }}
                  disabled={busy}
                  className="p-2 rounded-lg transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--bg-border)" }}
                >
                  <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                {/* Dictate (STT-only — text drops into the input box) */}
                <button
                  type="button"
                  aria-label="Dictate to text input"
                  title="Dictate — transcribe to the text input, then edit before sending"
                  onClick={() => { setVoiceMode("dictate"); void startRecording(); }}
                  disabled={busy}
                  className="p-2 rounded-lg transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--bg-border)" }}
                >
                  <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <input
                  type="text"
                  className="input text-[12px] flex-1"
                  placeholder={busy ? "Waiting…" : "Type a message…"}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                  disabled={busy}
                />
                <button
                  type="button"
                  aria-label="Send"
                  onClick={handleSend}
                  disabled={busy || !input.trim()}
                  className="p-2 rounded-lg transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "var(--brand)", color: "#fff" }}
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </>
            )}

            {voiceState === "recording" && (
              <>
                <button
                  type="button"
                  aria-label="Cancel recording"
                  onClick={cancelRecording}
                  className="p-2 rounded-lg transition-colors border-0 cursor-pointer"
                  style={{ background: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--bg-border)" }}
                  title="Discard"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>

                <VoiceMeter level={audioLevel} />

                <span
                  className="text-[11px] font-mono tabular-nums shrink-0"
                  style={{ color: "var(--text-secondary)", minWidth: 40 }}
                >
                  {formatDuration(recordSeconds)}
                </span>

                <button
                  type="button"
                  aria-label="Stop recording"
                  onClick={stopRecording}
                  className="p-2 rounded-lg transition-colors border-0 cursor-pointer"
                  style={{ background: "var(--danger)", color: "#fff" }}
                  title="Stop"
                >
                  <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                </button>
              </>
            )}

            {voiceState === "preview" && recordedUrl && (
              <>
                <button
                  type="button"
                  aria-label="Discard recording"
                  onClick={cancelRecording}
                  disabled={busy}
                  className="p-2 rounded-lg transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--bg-border)" }}
                  title="Discard"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>

                <audio
                  src={recordedUrl}
                  controls
                  className="flex-1 h-9 min-w-0"
                  style={{ maxWidth: "100%" }}
                />

                <button
                  type="button"
                  aria-label="Re-record"
                  onClick={rerecord}
                  disabled={busy}
                  className="p-2 rounded-lg transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--bg-border)" }}
                  title="Re-record"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  aria-label="Send voice message"
                  onClick={sendRecorded}
                  disabled={busy}
                  className="p-2 rounded-lg transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "var(--brand)", color: "#fff" }}
                  title="Send"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * VU-meter style animated bars driven by the live audio level (0..1).
 * Each bar's height is biased by its index so the centre bars are tallest,
 * and a tiny per-frame jitter keeps it visually alive even at steady tones.
 * If the level stays near zero for several frames, the bars sit flat — so
 * the user can see at a glance whether the mic is actually picking anything
 * up.
 */
function VoiceMeter({ level }: { level: number }) {
  const BARS = 18;
  // Cosine bell so bars in the middle reach higher than the edges.
  const bellAt = (i: number) => {
    const x = (i / (BARS - 1)) * 2 - 1; // -1..1
    return 0.55 + 0.45 * Math.cos(x * Math.PI * 0.5);
  };
  const recording = level > 0.04;
  return (
    <div
      role="status"
      aria-label="Recording"
      className="flex-1 flex items-center justify-center gap-[3px] h-9 px-2 rounded-md"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", minWidth: 0 }}
    >
      {/* Live red dot */}
      <span
        aria-hidden="true"
        className="w-2 h-2 rounded-full mr-1 shrink-0"
        style={{
          background: "var(--danger)",
          animation: "ai-rec-pulse 1.2s ease-in-out infinite",
        }}
      />
      {Array.from({ length: BARS }, (_, i) => {
        const jitter = recording ? 0.85 + Math.random() * 0.3 : 1;
        const h = Math.max(0.12, level * bellAt(i) * jitter);
        return (
          <span
            key={i}
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 2,
              height: `${Math.round(h * 24) + 4}px`,
              background: "var(--brand)",
              borderRadius: 1,
              transition: "height 90ms linear",
              opacity: 0.75 + h * 0.25,
            }}
          />
        );
      })}
      <style>{`
        @keyframes ai-rec-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}
