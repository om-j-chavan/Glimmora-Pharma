"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Bot, Send, Mic, Square, X, Volume2, RefreshCw, Trash2, Settings, Edit3, FileText, Ticket, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AIButton } from "@/components/ai";
// Type-only import — the actual classes extend AudioWorkletNode (a
// browser-only global) and crash at module-evaluation time on the SSR
// server. We dynamically import() the runtime inside startRecording so
// it only loads in the browser.
import type { RnnoiseWorkletNode as RnnoiseNode } from "@sapphi-red/web-noise-suppressor";
import { useAppSelector } from "@/hooks/useAppSelector";
import {
  aiHelpSend,
  aiVoiceChat,
  aiVoiceTranscribe,
  aiVoiceSpeak,
  AiChatError,
  type ChatMessage,
  type HelpSource,
  type TicketPrefill,
} from "@/lib/aiChat";
import { friendlyAiError } from "@/lib/friendlyError";
import { isDataQuestion, formatDataAnswer } from "@/lib/aiData";
import { getSmallTalkReply } from "@/lib/aiSmallTalk";
import { getComplianceSnapshot } from "@/actions/complianceSnapshot";
import { RaiseTicketModal, type RaiseTicketPrefill } from "@/modules/support/RaiseTicketModal";

/**
 * Metadata attached to a Compliance Help Assistant answer so the UI can
 * render citations, the confidence band, and the ticket handoff. Voice
 * turns and the user's own messages simply omit it.
 */
interface HelpMeta {
  status: string;
  band: string;
  score: number;
  sources: HelpSource[];
  suggestTicket: boolean;
  ticketPrefill?: TicketPrefill | null;
  actionRefused: boolean;
  auditId?: string | null;
}

type UiMessage = ChatMessage & { meta?: HelpMeta };

/**
 * Floating AI chatbot.
 *
 *  - Click the bubble to toggle the panel. The bubble is pinned to the
 *    bottom-right corner with a fixed CSS offset so it stays put when the
 *    browser is zoomed (it is no longer draggable).
 *  - Voice: hold-to-talk records audio, posts to /api/ai/voice/chat, and
 *    auto-plays the audio reply.
 *  - History is in-memory only (cleared on logout / refresh).
 */

const SUPPRESSION_KEY = "glimmora-chatbot-suppression";
const BUBBLE_SIZE = 56;
// Fixed distance from the bottom-right corner for the launcher bubble. Using a
// CSS offset (not a computed pixel coordinate) keeps the bubble pinned to the
// corner regardless of browser zoom — the layout viewport's CSS-pixel size
// changes when zoomed, so any stored left/top pixel position would drift.
const BUBBLE_OFFSET = 24;
// Focus-mode drawer dimensions (used when the panel is open). The panel docks
// to the right as an elevated drawer over a dimming + blurred backdrop, so the
// user's attention stays on the conversation. Width is responsive; height fills
// the viewport minus a uniform margin.
const DRAWER_WIDTH = 420;
const DRAWER_MARGIN = 16;

/**
 * Suggested questions shown on first open so a new user isn't staring at a
 * blank box. Tapping one fills the ask box (per the spec's "tap to fill"
 * affordance) — it does NOT auto-send, so the user can edit before asking.
 */
const SUGGESTED_QUESTIONS = [
  "How do I close a CAPA?",
  "Where is the audit trail?",
  "What is a deviation?",
] as const;

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

export function AIChatbot() {
  // Token from logged-in user record (set by app login flow). Prefer the
  // token on auth.user (always populated by refreshAiToken) and fall back
  // to the tenant.config.users entry for older sessions.
  // AI backend was made permissive on 2026-05-15 — auth is no longer enforced
  // server-side, so we fall back to a placeholder so the existing UI gates
  // (`if (!aiToken)`) keep passing instead of blocking the user.
  const aiToken = useAppSelector((s) => {
    const u = s.auth.user;
    if (!u) return "anonymous";
    if (u.aiAccessToken) return u.aiAccessToken;
    const tenant = s.auth.tenants.find((t) => t.id === u.tenantId);
    return tenant?.config?.users?.find((x) => x.id === u.id)?.aiAccessToken ?? "anonymous";
  });

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
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
  // Support handoff — prefilled Raise Ticket modal (reuses the one create path).
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [raisePrefill, setRaisePrefill] = useState<RaiseTicketPrefill | undefined>(undefined);
  const [raiseTranscript, setRaiseTranscript] = useState<string | undefined>(undefined);

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
  const inputRef = useRef<HTMLInputElement>(null);

  /** Fill the ask box from a tapped suggestion and focus it (no auto-send). */
  function handleSuggestion(q: string) {
    setInput(q);
    // Defer focus so the value is in the box before the caret lands.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // Defer the first render to the client so the localStorage-derived state
  // (suppression level) doesn't trip a hydration mismatch.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-scroll chat to the bottom on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Focus-mode affordances while the panel is open:
  //  - Escape closes (standard modal convention for keyboard users).
  //  - Move focus into the ask box so a keyboard/screen-reader user lands
  //    inside the dialog rather than behind it.
  // Recording is left alone — Escape during a recording would be surprising,
  // so we only bind the close shortcut when not actively capturing audio.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && voiceState === "idle") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, voiceState]);

  // Additive, backward-compatible: any part of the app can open the assistant
  // (optionally with a prefilled question) via
  //   window.dispatchEvent(new CustomEvent("glimmora:assistant", { detail: { prompt } }))
  // Nothing changes when the event never fires. See src/lib/assistant.ts.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt;
      setOpen(true);
      if (prompt) setInput(prompt);
      window.setTimeout(() => inputRef.current?.focus(), 80);
    };
    window.addEventListener("glimmora:assistant", onOpen as EventListener);
    return () => window.removeEventListener("glimmora:assistant", onOpen as EventListener);
  }, []);

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
    const userMsg: UiMessage = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setBusy(true);

    // Small talk first ("hi", "thanks", "tell me a joke", "who are you?") —
    // answered instantly with a friendly canned reply, no LLM call. The helper
    // returns null for anything naming a compliance term, so a real question is
    // never swallowed by a pleasantry. Synchronous → no busy spinner needed.
    const smallTalk = getSmallTalkReply(text, next.length);
    if (smallTalk) {
      setMessages([...next, { role: "assistant", content: smallTalk }]);
      setBusy(false);
      return;
    }

    // Live-data / count questions ("how many open CAPAs?", "any overdue
    // deviations?") are answered from the tenant's actual records via a
    // read-only server action — the grounded /help corpus cannot (and must
    // not) answer these. Knowledge / how-to questions fall through to the
    // grounded path below, unchanged.
    if (isDataQuestion(text)) {
      try {
        const snapshot = await getComplianceSnapshot();
        setMessages([...next, { role: "assistant", content: formatDataAnswer(text, snapshot) }]);
      } catch (e) {
        console.error("[chatbot] data query failed", e);
        setError(friendlyAiError(e, "Couldn't read your live data just now. Please try again."));
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      // Send only role+content as history — the backend ignores extra fields,
      // but stripping keeps the payload clean.
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await aiHelpSend(text, history, aiToken);
      const meta: HelpMeta = {
        status: res.status,
        band: res.confidence_band,
        score: res.confidence_score,
        sources: res.sources ?? [],
        suggestTicket: res.suggest_ticket,
        ticketPrefill: res.ticket_prefill,
        actionRefused: res.action_refused,
        auditId: res.audit_id,
      };
      setMessages([...next, { role: "assistant", content: res.answer || "(no answer)", meta }]);
    } catch (e) {
      console.error("[chatbot] help failed", e);
      // 503 = the assistant service is down ("I'm broken"), which is distinct
      // from a confident "I don't know" (that comes back 200 with a handoff).
      if (e instanceof AiChatError && e.status === 503) {
        setError("The assistant is unavailable right now. Please try again shortly.");
      } else {
        setError(friendlyAiError(e, "Couldn't send your message. Please try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  function handleClear() {
    setMessages([]);
    setError(null);
  }

  /**
   * Carry the conversation across to a real support ticket. This opens the
   * SAME RaiseTicketModal the Support module uses (one validated create path —
   * tenant scoping, SLA, activity + central AuditLog, notify), prefilled from
   * what the assistant knows and with the conversation attached via the
   * createTicket { transcript } seam. The user confirms/edits before filing;
   * nothing is written here directly. Lands Unassigned like every ticket.
   */
  function handleCreateTicket(meta: HelpMeta) {
    const prefill = meta.ticketPrefill;
    // Transcript = the conversation the user could already see (no extra PII).
    const transcript = messages
      .map((m) => `${m.role === "user" ? "You" : "AI"}: ${m.content}`)
      .join("\n");
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    setRaisePrefill({
      subject: prefill?.summary || (lastUser ? lastUser.content.slice(0, 80) : "Support request from Help Assistant"),
      // Defaults per spec — user-editable in the modal.
      category: "How-to/Training",
      priority: "Medium",
      description: lastUser?.content ?? prefill?.summary ?? "",
    });
    setRaiseTranscript(transcript);
    // Hide the chat panel so the ticket modal (z-50) isn't covered by it
    // (the panel sits at z-1000). It reopens on a successful create.
    setOpen(false);
    setRaiseOpen(true);
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
        console.error("[chatbot] transcription failed", e);
        setError(friendlyAiError(e, "We couldn't transcribe that recording. Please try again."));
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
      console.error("[chatbot] voice chat failed", e);
      setError(friendlyAiError(e, "Voice chat failed. Please try again."));
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
      console.error("[chatbot] speech synthesis failed", e);
      setError(friendlyAiError(e, "Couldn't play the audio response. Please try again."));
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

  // Focus-mode drawer: dock to the right edge, full height minus a uniform
  // margin, elevated above the dimming backdrop. We intentionally no longer
  // anchor the open panel to the bubble — in focus mode the user wants one
  // stable, distraction-free surface, not a floating tile that can land
  // half-off-screen. The launcher bubble keeps its draggable position for the
  // *closed* state.
  const panelStyle: CSSProperties = {
    position: "fixed",
    top: DRAWER_MARGIN,
    right: DRAWER_MARGIN,
    bottom: DRAWER_MARGIN,
    width: `min(${DRAWER_WIDTH}px, calc(100vw - ${DRAWER_MARGIN * 2}px))`,
    zIndex: 1000,
    animation: "ai-panel-in 0.24s cubic-bezier(0.16, 1, 0.3, 1)",
  };

  return (
    <>
      {/* Focus-mode animations — backdrop fade + panel slide/scale-in. Kept
          inline so the component is self-contained (no global CSS dependency).
          Respect reduced-motion: users who opt out get an instant, jump-free
          appearance instead of the transform. */}
      <style>{`
        @keyframes ai-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ai-panel-in {
          from { opacity: 0; transform: translateX(20px) scale(0.985); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-ai-backdrop], [data-ai-panel] { animation: none !important; }
        }
      `}</style>

      {/* Floating launcher bubble — hidden while the panel is open. In focus
          mode the header close button, the backdrop click, and Escape handle
          closing, so a second floating control would only add clutter. */}
      {!open && (
      <button
        type="button"
        aria-label="Open AI assistant"
        onClick={() => setOpen((v) => !v)}
        title="Click to open"
        style={{
          position: "fixed",
          right: BUBBLE_OFFSET,
          bottom: BUBBLE_OFFSET,
          width: BUBBLE_SIZE,
          height: BUBBLE_SIZE,
          borderRadius: "50%",
          // AI accent, not --brand: --brand is user-selectable per tenant, so
          // the assistant used to turn emerald/crimson/amber and stop matching
          // the other AI surfaces.
          background: "var(--ai-accent)",
          color: "var(--ai-on-accent)",
          border: "none",
          cursor: "pointer",
          boxShadow: "0 6px 20px var(--ai-glow)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1001,
          transition: "transform 0.15s",
        }}
      >
        <Bot className="w-6 h-6" aria-hidden="true" />
      </button>
      )}

      {/* Hidden audio element for voice playback */}
      <audio ref={audioRef} className="sr-only" />

      {/* Dimming + blurred backdrop. Sits above the app (z-999) but below the
          panel (z-1000), so the application is visibly de-emphasised AND
          non-interactive while the assistant is open. Clicking it closes the
          panel (standard modal scrim behaviour). aria-hidden so screen readers
          treat the dialog as the active surface. */}
      {open && (
        <div
          data-ai-backdrop
          aria-hidden="true"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            animation: "ai-backdrop-in 0.2s ease",
          }}
        />
      )}

      {/* Panel */}
      {open && (
        <div
          data-ai-panel
          role="dialog"
          aria-modal="true"
          aria-label="Compliance Assistant"
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
            <div className="flex items-center gap-2 min-w-0">
              {/* Traffic-light status dots */}
              <span className="flex items-center gap-1 shrink-0" aria-hidden="true">
                <span className="w-2 h-2 rounded-full" style={{ background: "#ef4444" }} />
                <span className="w-2 h-2 rounded-full" style={{ background: "#f59e0b" }} />
                <span className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-[12px] font-semibold truncate leading-tight" style={{ color: "var(--card-text)" }}>
                  Compliance Assistant
                </span>
                <span className="text-[9px] truncate leading-tight" style={{ color: "var(--text-muted)" }}>
                  Answers cited from approved SOPs &amp; app guidance
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* READY / WORKING status badge */}
              <span
                aria-live="polite"
                className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded mr-0.5"
                style={{
                  background: busy ? "var(--warning-bg)" : "var(--ai-muted)",
                  color: busy ? "#b45309" : "var(--ai-accent)",
                  border: `1px solid ${busy ? "var(--warning)" : "var(--ai-border)"}`,
                }}
              >
                {busy ? "WORKING" : "READY"}
              </span>
              <button
                type="button"
                aria-label="Voice settings"
                aria-expanded={showSettings}
                onClick={() => setShowSettings((v) => !v)}
                className="p-1 rounded transition-colors bg-transparent border-0 cursor-pointer"
                style={{ color: showSettings ? "var(--ai-accent)" : "var(--text-muted)" }}
              >
                <Settings className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={RefreshCw}
                aria-label="Clear conversation"
                onClick={handleClear}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={X}
                aria-label="Close"
                onClick={() => setOpen(false)}
              />
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
                <span className="font-mono tabular-nums" style={{ color: "var(--ai-accent)" }}>
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
                style={{ accentColor: "var(--ai-accent)" }}
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
              <div className="space-y-3">
                {/* Greeting bubble with an AI avatar badge */}
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="shrink-0 inline-flex items-center justify-center text-[9px] font-bold rounded-md mt-0.5"
                    style={{ width: 22, height: 22, background: "var(--ai-accent)", color: "#fff" }}
                  >
                    AI
                  </span>
                  <div
                    className="rounded-lg px-2.5 py-2 text-[12px]"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--bg-border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Hi. Ask me about CAPAs, deviations, audit trails, or how to use the system.
                  </div>
                </div>

                {/* Tappable suggested questions — fill the ask box on tap. */}
                <div className="space-y-1.5">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => handleSuggestion(q)}
                      className="w-full flex items-center justify-between gap-2 text-left px-2.5 py-2 rounded-lg text-[12px] transition-colors cursor-pointer"
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--bg-border)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <span className="truncate">{q}</span>
                      <span className="text-[10px] italic shrink-0" style={{ color: "var(--text-muted)" }}>
                        tap to fill
                      </span>
                    </button>
                  ))}
                </div>
              </div>
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
                    background: m.role === "user" ? "var(--ai-muted)" : "var(--bg-elevated)",
                    color: m.role === "user" ? "var(--ai-accent)" : "var(--text-primary)",
                    border: m.role === "user" ? "1px solid var(--ai-border)" : "1px solid var(--bg-border)",
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
                        color: speaking ? "var(--ai-accent)" : "var(--text-muted)",
                      }}
                    >
                      <Volume2
                        className={"w-3.5 h-3.5 " + (speaking ? "animate-pulse" : "")}
                        aria-hidden="true"
                      />
                    </button>
                  )}

                  {/* GxP metadata — confidence band, cited sources, ticket handoff */}
                  {isAssistant && m.meta && (
                    <div className="mt-2 pt-2 space-y-2" style={{ borderTop: "1px dashed var(--bg-border)" }}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span style={bandStyle(m.meta.band)}>
                          {m.meta.band} · {Math.round(m.meta.score * 100)}%
                        </span>
                        {m.meta.actionRefused && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-medium"
                            style={{ color: "var(--danger)" }}
                          >
                            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                            requires a human
                          </span>
                        )}
                      </div>

                      {m.meta.sources.length > 0 && (
                        <div>
                          <p
                            className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Sources
                          </p>
                          <ul className="space-y-1">
                            {m.meta.sources.map((s, si) => (
                              <li key={si} className="text-[11px] flex items-start gap-1.5">
                                <FileText
                                  className="w-3 h-3 shrink-0 mt-0.5"
                                  aria-hidden="true"
                                  style={{ color: "var(--ai-accent)" }}
                                />
                                {s.url ? (
                                  <a
                                    href={s.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: "var(--ai-accent)", textDecoration: "underline" }}
                                  >
                                    {s.id}{s.section ? ` ${s.section}` : ""}
                                  </a>
                                ) : (
                                  <span style={{ color: "var(--text-secondary)" }}>
                                    {s.id}{s.section ? ` ${s.section}` : ""}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {m.meta.suggestTicket && (
                        <Button
                          type="button"
                          variant="primary"
                          size="xs"
                          icon={Ticket}
                          onClick={() => handleCreateTicket(m.meta!)}
                        >
                          Create a ticket
                        </Button>
                      )}
                    </div>
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
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  icon={Mic}
                  aria-label="Record voice message (assistant replies aloud)"
                  title="Record voice message — assistant replies aloud"
                  onClick={() => { setVoiceMode("round-trip"); void startRecording(); }}
                  disabled={busy}
                />
                {/* Dictate (STT-only — text drops into the input box) */}
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  icon={Edit3}
                  aria-label="Dictate to text input"
                  title="Dictate — transcribe to the text input, then edit before sending"
                  onClick={() => { setVoiceMode("dictate"); void startRecording(); }}
                  disabled={busy}
                />
                <input
                  ref={inputRef}
                  type="text"
                  className="input text-[13px] flex-1"
                  placeholder={busy ? "Waiting…" : "Ask a question…"}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                  disabled={busy}
                />
                <AIButton
                  size="md"
                  iconOnly
                  icon={Send}
                  aria-label="Send"
                  onClick={handleSend}
                  disabled={busy || !input.trim()}
                  className="w-9 h-9"
                />
              </>
            )}

            {voiceState === "recording" && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  icon={Trash2}
                  aria-label="Cancel recording"
                  onClick={cancelRecording}
                  title="Discard"
                />

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
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  icon={Trash2}
                  aria-label="Discard recording"
                  onClick={cancelRecording}
                  disabled={busy}
                  title="Discard"
                />

                <audio
                  src={recordedUrl}
                  controls
                  className="flex-1 h-9 min-w-0"
                  style={{ maxWidth: "100%" }}
                />

                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  icon={RefreshCw}
                  aria-label="Re-record"
                  onClick={rerecord}
                  disabled={busy}
                  title="Re-record"
                />

                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  icon={Send}
                  aria-label="Send voice message"
                  onClick={sendRecorded}
                  disabled={busy}
                  title="Send"
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Support handoff — the SAME RaiseTicketModal / createTicket path the
          Support module uses. Rendered outside the panel; the panel is hidden
          while it's open and reopens on success to show the confirmation. */}
      <RaiseTicketModal
        open={raiseOpen}
        onClose={() => setRaiseOpen(false)}
        prefill={raisePrefill}
        transcript={raiseTranscript}
        onCreated={(t) => {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: `🎫 Ticket ${t.reference ?? ""} created. Track it under Support → ${t.reference ?? t.id} (/support/${t.id}).`,
            },
          ]);
          setOpen(true);
        }}
      />
    </>
  );
}

/**
 * Confidence-band pill styling. HIGH = green, MEDIUM = amber, LOW = red.
 * Self-contained colours (not theme tokens) so the badge reads the same in
 * light and dark and matches the spec's H·M·L convention.
 */
function bandStyle(band: string): CSSProperties {
  const map: Record<string, [string, string]> = {
    HIGH: ["#dcfce7", "#15803d"],
    MEDIUM: ["#fef3c7", "#b45309"],
    LOW: ["#fee2e2", "#b91c1c"],
  };
  const [bg, fg] = map[band] ?? ["var(--bg-surface)", "var(--text-muted)"];
  return {
    background: bg,
    color: fg,
    padding: "1px 7px",
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.02em",
  };
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
        // Deterministic per-bar jitter. Math.random() is impure and must not run
        // during render (React flags it — it re-rolls on every unrelated re-render).
        // A fract(sin()) hash seeded by the bar index + live mic `level` stays pure
        // yet still shimmers as the level animates.
        const noise = Math.sin((i + 1) * 12.9898 + level * 78.233) * 43758.5453;
        const jitter = recording ? 0.85 + (noise - Math.floor(noise)) * 0.3 : 1;
        const h = Math.max(0.12, level * bellAt(i) * jitter);
        return (
          <span
            key={i}
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 2,
              height: `${Math.round(h * 24) + 4}px`,
              background: "var(--ai-accent)",
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
