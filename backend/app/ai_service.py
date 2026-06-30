# app/ai_service.py
# ─────────────────────────────────────────────────────────────
# Updated for Step 7 — customer_id passed through to DB handler
# ─────────────────────────────────────────────────────────────

from openai import OpenAI
from dotenv import load_dotenv
import os
import httpx

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Live web search (Tavily) — powers the Regulatory AI Assistant's "answer from
# the internet" path. Optional: when TAVILY_API_KEY is unset the assistant
# gracefully degrades to the model's own trained knowledge. Tavily is a simple
# REST API (no extra Python package needed — we call it with httpx, which is
# already a dependency).
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")


# ── Intent detection ──────────────────────────────────────────
def detect_intent(user_message: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": """You are an intent classifier for a quality management system.
Reply with ONLY one of these exact words:

DB_QUERY   → user asks for counts, lists, status, or data
             (e.g. "how many CAPAs", "show open RCAs", "list action plans")

RAG_SEARCH → user asks about THIS company's own internal documents,
             procedures, SOPs, or how to use this system
             (e.g. "what is our closure process", "how do I fill a CAPA",
              "explain effectiveness check", "what is severity")

WEB_SEARCH → user asks about external regulations, laws, standards, or
             public regulatory guidance (FDA, EMA, ICH, MHRA, WHO, CDSCO,
             21 CFR, EU GMP Annex, GAMP), or anything needing current
             public/world information
             (e.g. "what does 21 CFR Part 11 require for e-signatures",
              "latest FDA data integrity guidance", "EU GMP Annex 11 audit trail rules")

GENERAL    → anything else

Reply with ONLY the one word.""",
            },
            {"role": "user", "content": user_message},
        ],
        temperature=0,
    )
    intent = response.choices[0].message.content.strip()
    if intent not in ["DB_QUERY", "RAG_SEARCH", "WEB_SEARCH", "GENERAL"]:
        intent = "GENERAL"
    return intent


# ── General chat ──────────────────────────────────────────────
def general_chat(user_message: str, chat_history: list = []) -> str:
    messages = [
        {
            "role": "system",
            "content": """You are a helpful assistant for Glimmora quality management system.
You help users with CAPA, RCA, Action Plans, Monitoring, Effectiveness, and Closure.
Be concise, friendly, and professional.""",
        }
    ]
    messages.extend(chat_history)
    messages.append({"role": "user", "content": user_message})
    response = client.chat.completions.create(
        model="gpt-4o-mini", messages=messages, temperature=0.7
    )
    return response.choices[0].message.content


# ── Live web search (Tavily) ──────────────────────────────────
def web_search(query: str, max_results: int = 5) -> list:
    """Return live web results [{title, url, content}] for a query.

    Returns an empty list when TAVILY_API_KEY is unset or the call fails —
    callers treat an empty list as "no web context" and fall back to the
    model's own knowledge.
    """
    if not TAVILY_API_KEY:
        return []
    try:
        resp = httpx.post(
            "https://api.tavily.com/search",
            json={
                "api_key": TAVILY_API_KEY,
                "query": query,
                "search_depth": "advanced",
                "max_results": max_results,
                "include_answer": False,
            },
            timeout=20.0,
        )
        resp.raise_for_status()
        data = resp.json()
        return [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content": r.get("content", ""),
            }
            for r in data.get("results", [])
        ]
    except Exception as e:  # network / quota / shape — degrade gracefully
        print(f"[AI] web_search failed: {e}")
        return []


# ── Regulatory answer grounded in live web results ────────────
def regulatory_web_chat(user_message: str, chat_history: list = []) -> str:
    """Answer a regulatory question using LIVE web search results.

    Searches the public web, hands the snippets to GPT-4o, and asks it to
    answer with clause-level citations and a Sources list. If no web context
    is available (no key / search failed), falls back to the model's trained
    knowledge so the assistant still responds.
    """
    results = web_search(user_message, max_results=5)
    if not results:
        # No live context — answer from model knowledge, but keep the
        # regulatory framing + advisory disclaimer.
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a pharmaceutical regulatory-affairs assistant. "
                    "Answer accurately and concisely, citing clauses/sections "
                    "where relevant (e.g. 21 CFR 211.x, EU GMP Annex 11 §x, ICH Q9). "
                    "Advisory only — do not make a formal compliance determination."
                ),
            }
        ]
        messages.extend(chat_history[-6:])
        messages.append({"role": "user", "content": user_message})
        response = client.chat.completions.create(
            model="gpt-4o", messages=messages, temperature=0.3
        )
        return response.choices[0].message.content

    sources_block = "\n\n".join(
        f"[{i + 1}] {r['title']}\nURL: {r['url']}\n{r['content']}"
        for i, r in enumerate(results)
    )
    system = (
        "You are a pharmaceutical regulatory-affairs assistant. Answer the "
        "user's question using ONLY the web search results provided below, plus "
        "your regulatory knowledge to interpret them. Be accurate and concise, "
        "cite specific clauses/sections where relevant (e.g. 21 CFR 211.x, "
        "EU GMP Annex 11 §x, ICH Q9), and finish with a 'Sources:' list of the "
        "[n] references and their URLs you actually used. Advisory only — do not "
        "make a formal compliance determination."
    )
    messages = [{"role": "system", "content": system}]
    messages.extend(chat_history[-6:])
    messages.append(
        {
            "role": "user",
            "content": f"Question: {user_message}\n\nWeb search results:\n{sources_block}",
        }
    )
    response = client.chat.completions.create(
        model="gpt-4o", messages=messages, temperature=0.3
    )
    return response.choices[0].message.content


# ── Format raw DB result → natural language ───────────────────
def format_db_result(raw_data: str, original_question: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "Convert raw database results into clear, friendly sentences. Be concise.",
            },
            {
                "role": "user",
                "content": f"Question: {original_question}\nData: {raw_data}\n\nWrite one friendly sentence answering the question using this data.",
            },
        ],
        temperature=0.3,
    )
    return response.choices[0].message.content


# ── Context resolver ──────────────────────────────────────────
# Rewrites a follow-up question that depends on prior turns into a
# self-contained one, so the intent classifier and DB / RAG handlers
# (which don't see chat_history) can route it correctly. Without this,
# voice-style follow-ups like "how many got by that time?" lose all
# context and get answered with the generic "which module?" intro.
def resolve_with_context(user_message: str, chat_history: list) -> str:
    if not chat_history:
        return user_message
    # Only pull recent turns so the prompt stays small.
    recent = chat_history[-8:]
    transcript = "\n".join(
        f"{m.get('role', 'user')}: {m.get('content', '')}" for m in recent
    )
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You rewrite a user's latest message to be self-contained, "
                    "using the prior conversation only when the latest message is "
                    "ambiguous, vague, or refers to something earlier (it/that/those, "
                    "or missing the noun). Return ONLY the rewritten message — no "
                    "preface, no quotes, no explanation. If the latest message is "
                    "already self-contained, return it unchanged."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Conversation so far:\n{transcript}\n\n"
                    f"Latest message:\n{user_message}\n\n"
                    "Rewritten message:"
                ),
            },
        ],
        temperature=0,
    )
    rewritten = response.choices[0].message.content.strip()
    # Strip any wrapping quotes the model might add.
    if (rewritten.startswith('"') and rewritten.endswith('"')) or (
        rewritten.startswith("'") and rewritten.endswith("'")
    ):
        rewritten = rewritten[1:-1].strip()
    if not rewritten:
        return user_message
    if rewritten.lower() != user_message.lower():
        print(f"[AI] Context-resolved: {user_message!r} → {rewritten!r}")
    return rewritten


# ── Main chat entry point ─────────────────────────────────────
def chat(
    user_message: str,
    db=None,
    chat_history: list = [],
    customer_id: str = None,       # ✅ NEW — received from ai_router
) -> str:
    # Resolve vague follow-ups against history before routing. The DB query
    # and RAG handlers don't see chat_history themselves, so this is the
    # one place we can fold context in for them.
    resolved = resolve_with_context(user_message, chat_history)
    intent = detect_intent(resolved)
    print(f"[AI] Intent: {intent} | Customer: {customer_id}")

    if intent == "DB_QUERY":
        if db is None:
            return "I need database access to answer that. Please try again."
        from app.ai_db_handler import handle_db_query
        raw_result = handle_db_query(resolved, db, customer_id)
        return format_db_result(raw_result, resolved)

    elif intent == "RAG_SEARCH":
        from app.rag.rag_service import rag_search
        return rag_search(resolved)

    elif intent == "WEB_SEARCH":
        # Regulatory / external-knowledge question → answer from live web
        # search (Tavily) grounded with GPT-4o. Pass the original message +
        # history so citations and follow-ups read naturally.
        return regulatory_web_chat(user_message, chat_history)

    else:
        # general_chat keeps the original message + history so the model
        # sees the conversation as it actually happened.
        return general_chat(user_message, chat_history)