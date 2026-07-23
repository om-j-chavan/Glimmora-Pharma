/**
 * Open the global AI Compliance Assistant from anywhere in the app, optionally
 * with a prefilled question. Pairs with the additive `"glimmora:assistant"`
 * listener in `src/components/chatbot/AIChatbot.tsx`.
 *
 * The prompt is prefilled (not auto-sent) so the user reviews before asking —
 * the assistant itself is the real AI surface (OpenAI + Pinecone RAG).
 */
export function openAssistant(prompt?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("glimmora:assistant", { detail: { prompt } }));
}
