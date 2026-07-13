# app/rag/rag_service.py
# ─────────────────────────────────────────────────────────────
# Step 6 — RAG Search Service (Pinecone version)
# ─────────────────────────────────────────────────────────────

import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client     = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
INDEX_NAME = "glimmora-docs"

# Pinecone is optional. If the package isn't installed or no API key is
# configured, RAG falls back to a plain OpenAI call (general_fallback) so
# /api/ai/chat still answers — instead of 500ing on every RAG_SEARCH intent.
try:
    from pinecone import Pinecone, ServerlessSpec  # type: ignore[import-not-found]
    _PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
    pc = Pinecone(api_key=_PINECONE_API_KEY) if _PINECONE_API_KEY else None
except Exception as _err:  # noqa: BLE001 — any import / init error → disable RAG
    print(f"[rag] Pinecone unavailable, RAG disabled: {_err}")
    Pinecone = None  # type: ignore[assignment]
    ServerlessSpec = None  # type: ignore[assignment]
    pc = None


# ─────────────────────────────────────────────────────────────
# Get or create Pinecone index
# ─────────────────────────────────────────────────────────────
def get_index():
    existing = [i.name for i in pc.list_indexes()]
    if INDEX_NAME not in existing:
        pc.create_index(
            name=INDEX_NAME,
            dimension=1536,          # text-embedding-3-small dimension
            metric="cosine",
            spec=ServerlessSpec(
                cloud="aws",
                region="us-east-1"   # free tier region
            ),
        )
        print(f"Created Pinecone index: {INDEX_NAME}")
    return pc.Index(INDEX_NAME)


# ─────────────────────────────────────────────────────────────
# STEP A: Build vector store (run once)
# ─────────────────────────────────────────────────────────────
def build_vector_store(documents: list):
    """
    documents = list of {"title": "...", "content": "..."}
    Run once to embed and upload all documents to Pinecone.
    """
    index = get_index()

    print(f"Embedding and uploading {len(documents)} documents to Pinecone...")

    vectors = []
    for i, doc in enumerate(documents):
        text = f"{doc['title']}\n\n{doc['content']}"

        # Get embedding from OpenAI
        embedding_response = client.embeddings.create(
            model="text-embedding-3-small",
            input=text,
        )
        embedding = embedding_response.data[0].embedding

        vectors.append({
            "id":       f"doc_{i}",
            "values":   embedding,
            "metadata": {
                "title":   doc["title"],
                "content": text,        # store full text in metadata
            },
        })
        print(f"  ✓ Embedded: {doc['title']}")

    # Upload all vectors to Pinecone in one batch
    index.upsert(vectors=vectors)
    print(f"\n✅ {len(vectors)} documents uploaded to Pinecone index '{INDEX_NAME}'")


# ─────────────────────────────────────────────────────────────
# STEP B: Search Pinecone
# ─────────────────────────────────────────────────────────────
def search_documents(question: str, top_k: int = 3) -> list:
    """
    Embeds the question and finds the most similar documents in Pinecone.
    Returns list of matching document texts.
    """
    index = get_index()

    # Embed the question
    embedding_response = client.embeddings.create(
        model="text-embedding-3-small",
        input=question,
    )
    question_embedding = embedding_response.data[0].embedding

    # Query Pinecone
    results = index.query(
        vector=question_embedding,
        top_k=top_k,
        include_metadata=True,
    )

    matches = results.get("matches", [])

    # Filter low relevance results (score < 0.3 = not relevant)
    relevant_docs = [
        match["metadata"]["content"]
        for match in matches
        if match["score"] >= 0.3
    ]

    return relevant_docs


# ─────────────────────────────────────────────────────────────
# STEP C: Generate answer using retrieved documents
# ─────────────────────────────────────────────────────────────
def rag_search(question: str) -> str:
    """
    Main RAG function called from ai_service.py
    1. Search Pinecone for relevant docs
    2. Use docs as context for OpenAI
    3. Return grounded answer

    If Pinecone is unavailable (missing dep or no API key), skip retrieval
    and answer with the OpenAI-only fallback so the user still gets an
    answer instead of a 500.
    """
    if pc is None:
        return general_fallback(question)
    # Step 1: Retrieve relevant documents
    relevant_docs = search_documents(question, top_k=3)

    if not relevant_docs:
        return general_fallback(question)

    # Step 2: Build context
    context = "\n\n---\n\n".join(relevant_docs)

    # Step 3: Generate grounded answer
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": """You are a helpful assistant for Glimmora, a quality management system.
Answer the user's question using ONLY the provided context below.
If the context does not contain enough information, say so honestly.
Be concise and clear. Use bullet points when listing steps or items.

Context:
""" + context,
            },
            {"role": "user", "content": question},
        ],
        temperature=0.3,
    )
    return response.choices[0].message.content


# ─────────────────────────────────────────────────────────────
# Fallback when no relevant docs found
# ─────────────────────────────────────────────────────────────
def general_fallback(question: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "You are a helpful assistant for Glimmora quality management system.",
            },
            {"role": "user", "content": question},
        ],
        temperature=0.5,
    )
    return response.choices[0].message.content