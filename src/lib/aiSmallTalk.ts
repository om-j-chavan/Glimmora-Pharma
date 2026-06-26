/**
 * Small-talk / social layer for the Compliance Assistant chatbot.
 *
 * Greetings, thanks, goodbyes, "who are you / what can you do", compliments and
 * the occasional joke request shouldn't be sent to the grounded /help endpoint —
 * it would retrieve nothing and reply "I could not find a confident answer in the
 * approved procedures", which reads as broken for a simple "hi".
 *
 * getSmallTalkReply() returns a warm, on-brand canned reply for those messages
 * (or null when the message isn't small talk). It is deterministic (no LLM, no
 * token cost, no fabricated compliance facts) and ALWAYS steers back toward real
 * compliance help. Tone: friendly + professional — this is a GxP product used by
 * QA and auditors, so personality is light, never flippant about compliance.
 *
 * Safety guard: if the message names any real compliance term (capa, deviation,
 * finding, audit trail, 483, sop…), it is NOT treated as small talk — it falls
 * through to the data / grounded-knowledge paths so a real question is never
 * swallowed by a pleasantry (e.g. "hi, how do I close a CAPA?" → answered, not
 * greeted).
 */

/** Concrete record/document terms. Their presence means "this is real work". */
const COMPLIANCE_TERMS =
  /\b(capas?|deviations?|findings?|gap assessment|gaps?|audit trail|483|fda[ -]?483|sops?|cfr|rca|root cause|closure|effectiveness|evidence|training record|readiness|validation|csv|csa|change control|inspections?|worklist|severity|overdue|escalation)\b/;

interface SmallTalkRule {
  test: RegExp;
  replies: string[];
}

// First matching rule wins, so order specific → generic.
const RULES: SmallTalkRule[] = [
  // Identity / capability — onboarding-style answer.
  {
    test: /\b(who are you|what are you|what can you do|what do you do|what can i ask|how do you work|are you (an? )?(ai|bot|robot|human)|your name)\b/,
    replies: [
      "I'm the Glimmora Compliance Assistant 🤖 — a guide and compliance helper built into this app. I can:\n" +
        '• Explain procedures (e.g. "how do I close a CAPA?") and cite the SOP\n' +
        "• Show you where a module lives and who can access it\n" +
        '• Pull live numbers ("how many overdue deviations?")\n' +
        "• Raise a support ticket if I'm not confident\n" +
        "What would you like to do?",
    ],
  },
  // Joke / be funny.
  {
    test: /\b(joke|make me laugh|something funny|be funny|are you funny|cheer me up|tell me something)\b/,
    replies: [
      "Why did the auditor bring a ladder? To reach the highest standards. 📏\nAnyway — anything I can help you with?",
      "I'd tell you a GMP joke, but first I'd need to document it, validate it, and get QA approval. 📋\nWhat can I help you with?",
      "I told my CAPA a joke… it took corrective action immediately. ✅\nOkay, back to business — what do you need?",
      "Why was the deviation so calm? It already had its root cause figured out. 🌱\nHow can I help?",
    ],
  },
  // Compliments / affirmations of the assistant.
  {
    test: /\b(good job|well done|nice work|you'?re (great|awesome|smart|the best|amazing|helpful)|love (you|this|it)|amazing|awesome|brilliant|perfect|you rock)\b/,
    replies: [
      "Thank you — that means a lot! 😊 I'll keep it accurate and audit-friendly. What can I help with next?",
      "Appreciate it! 🙌 Always here to keep you audit-ready. Anything else?",
    ],
  },
  // Thanks.
  {
    test: /\b(thanks|thank you|thx|ty|cheers|appreciate it|much appreciated)\b/,
    replies: [
      "You're welcome! 🙌 Ask me anything else, anytime.",
      "Anytime! If anything else comes up — procedure, navigation, or live numbers — just ask.",
    ],
  },
  // Goodbye.
  {
    test: /\b(bye|goodbye|see you|see ya|take care|good night|goodnight|catch you later|that'?s all)\b/,
    replies: [
      "Take care! 👋 I'll be right here in the corner whenever you need compliance help.",
      "Goodbye for now — stay audit-ready! 🟢",
    ],
  },
  // How are you / wellbeing.
  {
    test: /\b(how are you|how'?s it going|how are things|how do you do|what'?s up|wassup|sup|how'?s your day|you (ok|good|alright))\b/,
    replies: [
      "Doing great and ready to help! 🙂 More to the point — how can I help you stay audit-ready today?",
      "All systems READY 🟢 I'm here whenever you need a hand with CAPAs, deviations, or finding your way around the app.",
    ],
  },
  // Greetings.
  {
    test: /^(\s*)(hi+|hello+|hey+|heya|hiya|yo|howdy|good (morning|afternoon|evening)|greetings|namaste)\b/,
    replies: [
      "Hello! 👋 I'm your Compliance Assistant. Ask me about CAPAs, deviations, gap assessments, or how to use the system — or for live numbers like \"how many open CAPAs?\"",
      "Hi there! 👋 Ready when you are — I can explain procedures, point you to the right module, or pull live compliance numbers.",
      "Hey! How can I help with your compliance work today?",
    ],
  },
  // Bored / chit-chat.
  {
    test: /\b(i'?m bored|bored|nothing to do|entertain me|talk to me|let'?s chat)\b/,
    replies: [
      "I hear you! While we're here — want me to surface anything useful, like overdue CAPAs or open deviations? Or I can explain any module.",
    ],
  },
  // Short acknowledgements / dismissals.
  {
    test: /^(\s*)(ok(ay)?|k|got it|cool|alright|fine|never ?mind|nvm|nothing|no thanks)(\s*[.!]*)$/,
    replies: ["👍 Got it. I'm here if anything else comes up — procedures, navigation, or live numbers."],
  },
];

/**
 * Return a friendly canned reply for social / small-talk messages, or null when
 * the message is real compliance work (or names a compliance term) and should go
 * to the data / grounded-knowledge paths instead.
 *
 * @param seed rotates which reply variant is used (pass the message count) so a
 *   repeated "thanks" or "tell me a joke" doesn't return the identical line.
 */
export function getSmallTalkReply(text: string, seed = 0): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  // Real compliance content → not small talk; let the other paths handle it.
  if (COMPLIANCE_TERMS.test(t)) return null;
  for (const rule of RULES) {
    if (rule.test.test(t)) {
      return rule.replies[Math.abs(seed) % rule.replies.length];
    }
  }
  return null;
}
