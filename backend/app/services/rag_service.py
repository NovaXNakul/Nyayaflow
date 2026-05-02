# app/services/rag_service.py
#
# Production RAG service for legal document retrieval.
#
# ROOT CAUSES FIXED:
#   RC-1  Sentence splitter destroys Indian legal names (Sri., Rs., S/o, dates)
#   RC-2  BM25 tokenizer can't match Indian amounts (Rs.18,50,000/-)
#   RC-3  MMR penalises co-borrower chunks on entity queries
#   RC-4  Stale chunks accumulate across re-uploads
#   RC-5  BM25 index lost on server restart (only built at index time)
#   RC-6  Keyword fallback threshold too high (requires >4 candidates)
#   RC-7  No paragraph-level chunking (legal docs are paragraph-structured)
#   RC-8  ChromaDB metadata filter uses int — must be stored/queried as str
#   RC-9  Entity anchor chunk missing when index_document called without extra_entities
#   RC-10 expand_query hallucination — rephrasings steer embedding away from real text
#   RC-11 _avg_embed averages out discriminative signal for entity queries

from __future__ import annotations

import math
import os
import re
import logging
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

import chromadb
from chromadb.config import Settings
from sentence_transformers import CrossEncoder, SentenceTransformer

logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════════════════════════════════════
# MODELS  (loaded once at import — never inside functions)
# ══════════════════════════════════════════════════════════════════════════════

BI_ENCODER = SentenceTransformer("sentence-transformers/all-mpnet-base-v2")
RERANKER    = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

# ══════════════════════════════════════════════════════════════════════════════
# CHROMADB
# ══════════════════════════════════════════════════════════════════════════════

PERSIST_DIR   = os.getenv("CHROMA_DIR", "chroma_db")
chroma_client = chromadb.PersistentClient(path=PERSIST_DIR)   # auto-persists
collection    = chroma_client.get_or_create_collection(
    name="case_documents",
    metadata={"hnsw:space": "cosine"},
)

# ══════════════════════════════════════════════════════════════════════════════
# IN-MEMORY BM25 STORE  (document_id → (BM25Index, chunk_texts))
# ══════════════════════════════════════════════════════════════════════════════

_bm25_store: Dict[int, Tuple["BM25Index", List[str]]] = {}


# ══════════════════════════════════════════════════════════════════════════════
# BM25  — Okapi BM25 with legal-document-aware tokeniser
# ══════════════════════════════════════════════════════════════════════════════

class BM25Index:
    """
    RC-2 fix: legal tokeniser understands:
      - Indian currency  Rs.18,50,000/- → rs 1850000
      - Relationships    S/o, W/o, D/o  → so, wo, do
      - Date separators  15.03.2019     → 15032019
    """

    def __init__(self, k1: float = 1.5, b: float = 0.75) -> None:
        self.k1, self.b = k1, b
        self.docs:      List[str]            = []
        self.doc_freqs: List[Dict[str, int]] = []
        self.idf:       Dict[str, float]     = {}
        self.avgdl:     float                = 0.0

    @staticmethod
    def tokenise(text: str) -> List[str]:
        t = text.lower()
        # Normalise Indian currency: Rs.18,50,000/- → rs 1850000
        t = re.sub(r'rs\.?\s*', 'rs ', t, flags=re.I)
        t = re.sub(r'(\d),(\d)', r'\1\2', t)           # remove comma in numbers
        t = re.sub(r'(\d)/-', r'\1', t)                 # remove /- suffix
        # Normalise relationships (s/o → so, w/o → wo, d/o → do, r/o → ro)
        t = re.sub(r'\b([swdr])/o\b', r'\1o', t)
        # Collapse date separators: 15.03.2019 → 15032019
        t = re.sub(r'(\d{1,2})\.(\d{2})\.(\d{4})', r'\1\2\3', t)
        return re.findall(r'\b\w{2,}\b', t)             # min 2-char tokens

    def fit(self, docs: List[str]) -> None:
        self.docs      = docs
        self.doc_freqs = []
        df: Dict[str, int] = defaultdict(int)
        total = 0

        for doc in docs:
            toks = self.tokenise(doc)
            total += len(toks)
            freq: Dict[str, int] = defaultdict(int)
            for tok in toks:
                freq[tok] += 1
            self.doc_freqs.append(dict(freq))
            for tok in set(toks):
                df[tok] += 1

        self.avgdl = total / max(len(docs), 1)
        N = len(docs)
        for term, n in df.items():
            self.idf[term] = math.log((N - n + 0.5) / (n + 0.5) + 1)

    def score(self, query: str) -> List[float]:
        toks   = self.tokenise(query)
        scores = []
        for freq in self.doc_freqs:
            dl = sum(freq.values())
            s  = 0.0
            for tok in toks:
                if tok not in freq:
                    continue
                tf  = freq[tok]
                idf = self.idf.get(tok, 0.0)
                s  += idf * tf * (self.k1 + 1) / (
                    tf + self.k1 * (1 - self.b + self.b * dl / self.avgdl)
                )
            scores.append(s)
        return scores


# ══════════════════════════════════════════════════════════════════════════════
# PDF TEXT EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

def load_pdf_text(file_path: str) -> str:
    """
    Extract text from every page using PyMuPDF (fitz).
    Tags each page so chunker can preserve page references.
    Falls back to pypdf if fitz unavailable.
    """
    try:
        import fitz  # PyMuPDF — better text extraction for legal PDFs
        doc    = fitz.open(file_path)
        pages  = []
        for i, page in enumerate(doc):
            raw = page.get_text("text") or ""
            raw = re.sub(r'\n{3,}', '\n\n', raw)
            raw = re.sub(r'[ \t]{2,}', ' ', raw)
            pages.append(f"[PAGE {i + 1}]\n{raw.strip()}")
        doc.close()
        full = "\n\n".join(pages)
        logger.info("PDF loaded via PyMuPDF: %d pages, %d chars", len(pages), len(full))
        return full
    except ImportError:
        pass

    # Fallback: pypdf
    from pypdf import PdfReader
    reader = PdfReader(file_path)
    pages  = []
    for i, page in enumerate(reader.pages):
        raw = page.extract_text() or ""
        raw = re.sub(r'\n{3,}', '\n\n', raw)
        raw = re.sub(r'[ \t]{2,}', ' ', raw)
        pages.append(f"[PAGE {i + 1}]\n{raw.strip()}")
    full = "\n\n".join(pages)
    logger.info("PDF loaded via pypdf: %d pages, %d chars", len(pages), len(full))
    return full


# ══════════════════════════════════════════════════════════════════════════════
# LEGAL-AWARE SENTENCE SPLITTER
# ══════════════════════════════════════════════════════════════════════════════

# RC-1 fix: protect these tokens before splitting on "."
_PROTECT_PATTERNS = [
    # Titles / honorifics
    (r'\bSri\.',   'Sri<<DOT>>'),
    (r'\bSmt\.',   'Smt<<DOT>>'),
    (r'\bShri\.',  'Shri<<DOT>>'),
    (r'\bMr\.',    'Mr<<DOT>>'),
    (r'\bMrs\.',   'Mrs<<DOT>>'),
    (r'\bMs\.',    'Ms<<DOT>>'),
    (r'\bDr\.',    'Dr<<DOT>>'),
    (r'\bProf\.',  'Prof<<DOT>>'),
    (r'\bAdv\.',   'Adv<<DOT>>'),
    # Legal abbreviations
    (r'\bvs\.',    'vs<<DOT>>'),
    (r'\bv\.',     'v<<DOT>>'),
    (r'\bNo\.',    'No<<DOT>>'),
    (r'\bSt\.',    'St<<DOT>>'),
    (r'\bArt\.',   'Art<<DOT>>'),
    (r'\bSec\.',   'Sec<<DOT>>'),
    (r'\bRs\.',    'Rs<<DOT>>'),
    (r'\bW\.P\.',  'W<<DOT>>P<<DOT>>'),
    (r'\bCrl\.',   'Crl<<DOT>>'),
    (r'\bCr\.P\.C\.', 'Cr<<DOT>>P<<DOT>>C<<DOT>>'),
    (r'\bC\.P\.C\.', 'C<<DOT>>P<<DOT>>C<<DOT>>'),
    (r'\bI\.P\.C\.', 'I<<DOT>>P<<DOT>>C<<DOT>>'),
    # Relationships (S/o, W/o, D/o, R/o)
    (r'\bS/o\b',   'S<<SL>>o'),
    (r'\bW/o\b',   'W<<SL>>o'),
    (r'\bD/o\b',   'D<<SL>>o'),
    (r'\bR/o\b',   'R<<SL>>o'),
    # Date pattern: 15.03.2019 or 5.3.2019
    (r'(\d{1,2})\.(\d{1,2})\.(\d{2,4})', r'\1<<D>>\2<<D>>\3'),
    # Numbered list items: 1. 2. etc (don't split on these)
    (r'(\d+)\.\s', r'\1<<DOT>> '),
    # Single capital initial: A. Kumar → A<<DOT>> Kumar
    (r'\b([A-Z])\.',  r'\1<<DOT>>'),
]

def _protect(text: str) -> str:
    for pat, rep in _PROTECT_PATTERNS:
        text = re.sub(pat, rep, text)
    return text

def _restore(text: str) -> str:
    return text.replace('<<DOT>>', '.').replace('<<SL>>', '/').replace('<<D>>', '.')

def legal_sentence_split(text: str) -> List[str]:
    """
    Split on sentence boundaries while preserving Indian legal abbreviations,
    honorifics, relationship markers (S/o, W/o), and date formats.
    """
    protected  = _protect(text)
    raw_sents  = re.split(r'(?<=[.!?])\s+(?=[A-Z\[])', protected)
    restored   = [_restore(s).strip() for s in raw_sents]
    return [s for s in restored if len(s) > 10]


# ══════════════════════════════════════════════════════════════════════════════
# CHUNKING  — paragraph-first, sentence-group sub-chunking with overlap
# ══════════════════════════════════════════════════════════════════════════════

def chunk_text(
    text:          str,
    target_chars:  int = 600,
    overlap_sents: int = 2,
) -> List[Dict]:
    """
    RC-7 fix: paragraph-aware chunking.

    Strategy:
    1. Split on blank lines (paragraph boundaries) — legal docs are paragraph-
       structured; each paragraph usually describes one party or one order.
    2. Short paragraphs (< 80 chars, e.g. headings) are merged forward into
       the next paragraph so entities stay in context.
    3. Paragraphs ≤ target_chars → single chunk.
    4. Long paragraphs → sentence-grouped sub-chunks with overlap so that
       entity names at paragraph boundaries are not orphaned.

    This keeps "Sri Rajesh Kumar S/o Mohan Kumar ... co-borrower Smt. Priya"
    in a single chunk rather than split across two sentence boundaries.
    """
    paragraphs = re.split(r'\n{2,}', text.strip())

    # Merge short paragraphs (headings, page labels) with next
    merged: List[str] = []
    pending = ""
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(para) < 80:
            pending = (pending + " " + para).strip()
        else:
            full_para = (pending + " " + para).strip() if pending else para
            merged.append(full_para)
            pending = ""
    if pending:
        if merged:
            merged[-1] = merged[-1] + " " + pending
        else:
            merged.append(pending)

    chunks: List[Dict] = []

    for para in merged:
        if len(para) <= target_chars:
            chunks.append({"text": para, "source": "paragraph"})
        else:
            sents = legal_sentence_split(para)
            i     = 0
            while i < len(sents):
                grp:  List[str] = []
                chars = 0
                j     = i
                while j < len(sents) and chars < target_chars:
                    grp.append(sents[j])
                    chars += len(sents[j])
                    j     += 1
                if grp:
                    chunks.append({"text": " ".join(grp), "source": "sentence_group"})
                # Advance with overlap so boundary sentences appear in both chunks
                i = max(i + 1, j - overlap_sents)

    # Deduplicate (overlap can produce near-identical short chunks)
    seen:         set       = set()
    deduped: List[Dict]     = []
    for c in chunks:
        key = c["text"][:80]
        if key not in seen:
            seen.add(key)
            deduped.append(c)

    logger.info("chunk_text: produced %d chunks from %d chars", len(deduped), len(text))
    return deduped


# ══════════════════════════════════════════════════════════════════════════════
# QUERY CLASSIFICATION + EXPANSION
# ══════════════════════════════════════════════════════════════════════════════

_ENTITY_RE = re.compile(
    r'\b(who|name|borrower|petitioner|defendant|plaintiff|party|parties|'
    r'person|applicant|co[\s\-]?borrower|guarantor|accused|claimant|'
    r'respondent|loan|amount|sanctioned|address|registered|account|'
    r'mortgagor|mortgagee|lender|debtor|surety|principal)\b',
    re.IGNORECASE,
)

def is_entity_query(query: str) -> bool:
    return bool(_ENTITY_RE.search(query))


def expand_query(query: str) -> List[str]:
    """
    RC-10 fix: do NOT over-expand entity queries.
    For entity queries: return only the original query + one close paraphrase.
    Hallucinated hypothetical answers steer the embedding AWAY from the real
    text chunk that contains the name.

    For non-entity queries: add 2 thematic rephrasings.
    """
    if is_entity_query(query):
        # Minimal expansion — preserve discriminative signal
        return [
            query,
            f"Who is the {query.lower().split()[-1]} in this case?",
        ]
    return [
        query,
        f"Information about: {query}",
        f"Details related to: {query}",
    ]


def _embed_query(query: str, entity_mode: bool) -> List[float]:
    """
    RC-11 fix: for entity queries use the raw query embedding — do NOT average
    with paraphrase embeddings because averaging dilutes the discriminative
    signal needed to find the exact name/amount chunk.
    """
    if entity_mode:
        return BI_ENCODER.encode(query, normalize_embeddings=True).tolist()

    # Non-entity: average expanded queries
    expansions = expand_query(query)
    vecs = [BI_ENCODER.encode(t, normalize_embeddings=True) for t in expansions]
    avg  = sum(vecs) / len(vecs)
    return avg.tolist()


# ══════════════════════════════════════════════════════════════════════════════
# RETRIEVAL HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _rrf_fuse(
    ranked_lists: List[List[Tuple[str, float]]],
    k: int = 60,
) -> Dict[str, float]:
    """Reciprocal Rank Fusion across any number of ranked lists."""
    scores: Dict[str, float] = defaultdict(float)
    for ranked in ranked_lists:
        for rank, (doc, _) in enumerate(ranked):
            scores[doc] += 1.0 / (k + rank + 1)
    return scores


def _keyword_scan(document_id: int, query: str, top_k: int = 15) -> List[Tuple[str, float]]:
    """
    RC-6 fix: brute-force keyword scan over all stored chunks.
    Always runs for entity queries — O(n) but n ≤ ~300 chunks per document.
    Scores by raw keyword-hit count; ties broken by total keyword coverage.
    """
    try:
        # RC-8 fix: document_id stored as str in metadata
        data  = collection.get(where={"document_id": str(document_id)})
        texts = data.get("documents", [])
        if not texts:
            logger.warning("_keyword_scan: no chunks for doc %d", document_id)
            return []
        keywords = [kw for kw in re.findall(r'\b\w{3,}\b', query.lower())
                    if kw not in {"the", "and", "for", "who", "what", "this", "that", "with"}]
        scored: List[Tuple[str, float]] = []
        for t in texts:
            tl   = t.lower()
            hits = sum(1 for kw in keywords if kw in tl)
            if hits:
                scored.append((t, float(hits)))
        scored.sort(key=lambda x: x[1], reverse=True)
        logger.debug("_keyword_scan: %d hits from %d chunks", len(scored), len(texts))
        return scored[:top_k]
    except Exception as exc:
        logger.warning("_keyword_scan error: %s", exc)
        return []


def _rerank(query: str, candidates: List[str]) -> List[Tuple[str, float]]:
    """Cross-encoder reranking. Returns (text, score) sorted descending."""
    if not candidates:
        return []
    try:
        pairs  = [(query, doc) for doc in candidates]
        scores = RERANKER.predict(pairs, show_progress_bar=False)
        ranked = sorted(zip(candidates, scores.tolist()), key=lambda x: x[1], reverse=True)
        logger.debug("Rerank top-5 scores: %s", [round(s, 3) for _, s in ranked[:5]])
        return ranked
    except Exception as exc:
        logger.warning("_rerank failed: %s — keeping RRF order", exc)
        return []


def _select_top_k(
    ranked: List[Tuple[str, float]],
    query:  str,
    k:      int,
) -> List[str]:
    """
    RC-3 fix:
    - Entity queries  → pure top-k by rerank score (NO MMR).
      MMR would penalise the second-most-relevant chunk even if it contains
      the co-borrower name, causing "co-borrower not found" failures.
    - Open-ended queries → MMR with λ=0.7 for topic diversity.
    """
    if is_entity_query(query):
        return [doc for doc, _ in ranked[:k]]

    if not ranked:
        return []

    selected:  List[Tuple[str, float]] = []
    remaining: List[Tuple[str, float]] = list(ranked)
    lam = 0.70

    while remaining and len(selected) < k:
        if not selected:
            best = max(remaining, key=lambda x: x[1])
        else:
            sel_vecs = [
                BI_ENCODER.encode(s[0], normalize_embeddings=True)
                for s in selected
            ]
            def mmr_score(cand: Tuple[str, float]) -> float:
                cv      = BI_ENCODER.encode(cand[0], normalize_embeddings=True)
                max_sim = max(float(cv @ sv) for sv in sel_vecs)
                return lam * cand[1] - (1 - lam) * max_sim
            best = max(remaining, key=mmr_score)

        selected.append(best)
        remaining.remove(best)

    return [doc for doc, _ in selected]


# ══════════════════════════════════════════════════════════════════════════════
# INDEXING
# ══════════════════════════════════════════════════════════════════════════════

def index_document(
    document_id:    int,
    file_path:      str,
    extra_entities: Optional[Dict] = None,
) -> int:
    """
    Index a document into ChromaDB + build BM25.

    extra_entities: dict of already-extracted structured fields.
    These are stored as a dedicated entity-anchor chunk so that queries like
    "who is the borrower" ALWAYS find this chunk regardless of how the raw
    PDF text was chunked.

    Returns: number of chunks indexed.
    """
    logger.info("index_document: doc_id=%d path=%s", document_id, file_path)

    # RC-4 fix: purge ALL stale chunks before re-indexing
    _purge_document(document_id)

    raw_text = load_pdf_text(file_path)
    chunks   = chunk_text(raw_text)

    ids:       List[str]            = []
    docs:      List[str]            = []
    embeds:    List[List[float]]    = []
    metas:     List[Dict]           = []
    all_texts: List[str]            = []

    for i, chunk in enumerate(chunks):
        t = chunk["text"]
        all_texts.append(t)
        # RC-8 fix: store document_id as str so Chroma metadata filter is consistent
        ids.append(f"{document_id}_{i}")
        docs.append(t)
        embeds.append(BI_ENCODER.encode(t, normalize_embeddings=True).tolist())
        metas.append({
            "document_id": str(document_id),
            "chunk_id":    i,
            "source":      chunk["source"],
            "type":        "pdf",
        })

    # RC-9 fix: entity anchor chunk — always create it, even if extra_entities is None.
    # At minimum it will contain the document_id so keyword scan always has a hook.
    # When extraction has already run, it contains borrower, loan amount, etc.
    entity_lines = [f"DOCUMENT ENTITY SUMMARY (document_id={document_id}):"]
    if extra_entities:
        for key, val in extra_entities.items():
            if val:
                if isinstance(val, list):
                    val = ", ".join(str(v) for v in val)
                entity_lines.append(f"{key.replace('_', ' ').title()}: {val}")
    entity_text = "\n".join(entity_lines)

    eid = f"{document_id}_entities"
    all_texts.append(entity_text)
    ids.append(eid)
    docs.append(entity_text)
    embeds.append(BI_ENCODER.encode(entity_text, normalize_embeddings=True).tolist())
    metas.append({
        "document_id": str(document_id),
        "chunk_id":    -1,
        "source":      "entity_anchor",
        "type":        "entities",
    })
    logger.info("Entity anchor chunk: %s", entity_text[:300])

    # Upsert to ChromaDB
    BATCH = 100
    for start in range(0, len(ids), BATCH):
        collection.upsert(
            ids=ids[start:start + BATCH],
            documents=docs[start:start + BATCH],
            embeddings=embeds[start:start + BATCH],
            metadatas=metas[start:start + BATCH],
        )

    # RC-5 fix: always (re)build BM25 in memory at index time
    bm25 = BM25Index()
    bm25.fit(all_texts)
    _bm25_store[document_id] = (bm25, all_texts)

    logger.info(
        "index_document complete: doc_id=%d  chunks=%d  bm25_docs=%d",
        document_id, len(ids), len(all_texts),
    )
    for i, t in enumerate(all_texts[:5]):
        logger.debug("  INDEXED_CHUNK[%d]: %s", i, t[:200])

    return len(ids)


def _purge_document(document_id: int) -> None:
    """RC-4 fix: delete all existing chunks for this document_id before re-indexing."""
    try:
        # RC-8 fix: query by str key
        old = collection.get(where={"document_id": str(document_id)})
        if old["ids"]:
            collection.delete(ids=old["ids"])
            logger.info("Purged %d stale chunks for doc %d", len(old["ids"]), document_id)
    except Exception as exc:
        logger.warning("_purge_document non-fatal: %s", exc)

    # Also clear BM25
    if document_id in _bm25_store:
        del _bm25_store[document_id]


def rebuild_bm25_from_chroma(document_id: int) -> bool:
    """
    RC-5 fix: rebuild BM25 from ChromaDB after server restart.
    Call at application startup for all known document_ids.
    """
    try:
        data  = collection.get(where={"document_id": str(document_id)})
        texts = data.get("documents", [])
        if not texts:
            logger.warning("rebuild_bm25: no chunks in Chroma for doc %d", document_id)
            return False
        bm25 = BM25Index()
        bm25.fit(texts)
        _bm25_store[document_id] = (bm25, texts)
        logger.info("BM25 rebuilt: %d chunks for doc %d", len(texts), document_id)
        return True
    except Exception as exc:
        logger.error("rebuild_bm25 failed for doc %d: %s", document_id, exc)
        return False


def update_entity_anchor(document_id: int, extra_entities: Dict) -> None:
    """
    Call this AFTER extraction completes to inject entity data into the index.
    Overwrites the placeholder entity anchor created during initial indexing.
    """
    entity_lines = [f"DOCUMENT ENTITY SUMMARY (document_id={document_id}):"]
    for key, val in extra_entities.items():
        if val:
            if isinstance(val, list):
                val = ", ".join(str(v) for v in val)
            entity_lines.append(f"{key.replace('_', ' ').title()}: {val}")
    entity_text = "\n".join(entity_lines)
    eid = f"{document_id}_entities"

    collection.upsert(
        ids=[eid],
        documents=[entity_text],
        embeddings=[BI_ENCODER.encode(entity_text, normalize_embeddings=True).tolist()],
        metadatas=[{
            "document_id": str(document_id),
            "chunk_id":    -1,
            "source":      "entity_anchor",
            "type":        "entities",
        }],
    )
    logger.info("Entity anchor updated for doc %d: %s", document_id, entity_text[:300])

    # Rebuild BM25 so the updated anchor text is searchable
    if document_id in _bm25_store:
        _, existing_texts = _bm25_store[document_id]
        # Replace or append entity anchor
        new_texts = [t for t in existing_texts if not t.startswith("DOCUMENT ENTITY SUMMARY")]
        new_texts.append(entity_text)
        bm25 = BM25Index()
        bm25.fit(new_texts)
        _bm25_store[document_id] = (bm25, new_texts)


# ══════════════════════════════════════════════════════════════════════════════
# MAIN RETRIEVE  (public API)
# ══════════════════════════════════════════════════════════════════════════════

def retrieve_chunks(
    document_id:    int,
    query:          str,
    k:              int = 6,
    candidate_pool: int = 30,
) -> List[str]:
    """
    Full hybrid retrieval pipeline:
      1. Semantic search  (focused embedding — RC-11 fix)
      2. BM25 keyword search (legal-aware tokeniser — RC-2 fix)
      3. Brute-force keyword scan (always for entity queries — RC-6 fix)
      4. RRF fusion
      5. Cross-encoder reranking
      6. Top-k selection (pure for entity queries — RC-3 fix; MMR for open-ended)

    Returns up to k chunks ordered by relevance.
    """
    logger.info(
        "retrieve_chunks: doc_id=%d k=%d entity=%s query='%s'",
        document_id, k, is_entity_query(query), query,
    )
    entity_mode = is_entity_query(query)

    # RC-5 fix: lazy BM25 rebuild if server restarted
    if document_id not in _bm25_store:
        logger.warning("BM25 not in memory for doc %d — rebuilding from Chroma", document_id)
        rebuild_bm25_from_chroma(document_id)

    # ── 1. Semantic search ─────────────────────────────────────────────────────
    sem_ranked: List[Tuple[str, float]] = []
    try:
        # RC-11 fix: focused embedding for entity queries
        vec = _embed_query(query, entity_mode)
        res = collection.query(
            query_embeddings=[vec],
            n_results=min(candidate_pool, 100),
            where={"document_id": str(document_id)},   # RC-8 fix: str filter
            include=["documents", "distances"],
        )
        sem_ranked = [
            (doc, 1.0 - dist)
            for doc, dist in zip(res["documents"][0], res["distances"][0])
        ]
        logger.debug("Semantic hits: %d", len(sem_ranked))
    except Exception as exc:
        logger.warning("Semantic search error: %s", exc)

    # ── 2. BM25 search ─────────────────────────────────────────────────────────
    bm25_ranked: List[Tuple[str, float]] = []
    if document_id in _bm25_store:
        bm25_idx, chunk_texts = _bm25_store[document_id]
        raw_scores  = bm25_idx.score(query)
        top_indices = sorted(
            range(len(raw_scores)), key=lambda i: raw_scores[i], reverse=True
        )[:candidate_pool]
        bm25_ranked = [
            (chunk_texts[i], raw_scores[i])
            for i in top_indices
            if raw_scores[i] > 0.0
        ]
        logger.debug("BM25 hits: %d", len(bm25_ranked))
    else:
        logger.warning("No BM25 index for doc %d — semantic-only retrieval", document_id)

    # ── 3. Keyword scan (always for entity queries — RC-6 fix) ─────────────────
    kw_ranked: List[Tuple[str, float]] = []
    if entity_mode:
        kw_ranked = _keyword_scan(document_id, query, top_k=candidate_pool)
        logger.debug("Keyword scan hits: %d", len(kw_ranked))

    # ── 4. RRF fusion ──────────────────────────────────────────────────────────
    rrf_scores = _rrf_fuse([sem_ranked, bm25_ranked, kw_ranked])

    if not rrf_scores:
        logger.error("All retrieval methods empty for doc %d — returning keyword scan fallback", document_id)
        return [doc for doc, _ in kw_ranked[:k]] if kw_ranked else []

    candidates_sorted = sorted(
        rrf_scores.keys(), key=lambda d: rrf_scores[d], reverse=True
    )

    # ── 5. Cross-encoder reranking ─────────────────────────────────────────────
    reranked = _rerank(query, candidates_sorted[:candidate_pool])
    if not reranked:
        # Reranker unavailable — fall back to RRF order
        reranked = [(d, rrf_scores[d]) for d in candidates_sorted]

    # ── 6. Final selection ─────────────────────────────────────────────────────
    final = _select_top_k(reranked, query, k)

    logger.info(
        "retrieve_chunks: returning %d chunks (entity_mode=%s)",
        len(final), entity_mode,
    )
    for i, chunk in enumerate(final):
        logger.debug("  RESULT[%d]: %.200s", i, chunk)

    return final


# ══════════════════════════════════════════════════════════════════════════════
# DEBUG UTILITY
# ══════════════════════════════════════════════════════════════════════════════

def debug_retrieval(document_id: int, query: str) -> Dict:
    """
    Returns a complete breakdown of every retrieval stage.
    Use GET /chat/debug to call this without touching the LLM.

    Interpretation guide:
      - If final_chunks contains the answer → retrieval is fine; debug the LLM prompt.
      - If final_chunks does NOT contain it → retrieval failure; check each stage below.
      - If semantic_top10 has it but final_chunks doesn't → reranker is dropping it.
      - If bm25_top10 has it but semantic doesn't → use query with more exact keywords.
      - If neither has it → chunk_text is splitting the answer across chunk boundaries.
    """
    entity_mode = is_entity_query(query)

    # Rebuild BM25 if missing
    if document_id not in _bm25_store:
        rebuild_bm25_from_chroma(document_id)

    # Semantic
    vec = _embed_query(query, entity_mode)
    sem_results: List[Dict] = []
    try:
        res = collection.query(
            query_embeddings=[vec],
            n_results=10,
            where={"document_id": str(document_id)},
            include=["documents", "distances", "metadatas"],
        )
        for doc, dist, meta in zip(
            res["documents"][0], res["distances"][0], res["metadatas"][0]
        ):
            sem_results.append({
                "score":  round(1.0 - dist, 4),
                "type":   meta.get("type"),
                "source": meta.get("source"),
                "text":   doc[:300],
            })
    except Exception as exc:
        sem_results = [{"error": str(exc)}]

    # BM25
    bm25_results: List[Dict] = []
    if document_id in _bm25_store:
        bm25_idx, chunk_texts = _bm25_store[document_id]
        raw = bm25_idx.score(query)
        top = sorted(range(len(raw)), key=lambda i: raw[i], reverse=True)[:10]
        bm25_results = [
            {"score": round(raw[i], 4), "text": chunk_texts[i][:300]}
            for i in top if raw[i] > 0
        ]

    # Keyword scan
    kw_results = _keyword_scan(document_id, query, top_k=10)

    # Full pipeline
    final_chunks = retrieve_chunks(document_id, query, k=6)

    # Index stats
    try:
        total_indexed = len(collection.get(where={"document_id": str(document_id)})["ids"])
    except Exception:
        total_indexed = -1

    return {
        "query":           query,
        "entity_mode":     entity_mode,
        "total_indexed":   total_indexed,
        "bm25_in_memory":  document_id in _bm25_store,
        "semantic_top10":  sem_results,
        "bm25_top10":      bm25_results,
        "keyword_top10":   [{"hits": s, "text": t[:300]} for t, s in kw_results],
        "final_chunks":    [{"text": c[:300]} for c in final_chunks],
        "diagnosis": (
            "RETRIEVAL OK — debug LLM prompt if answer not in final_chunks text above."
            if any(query.lower()[:10] in c.lower() for c in final_chunks)
            else "RETRIEVAL SUSPECT — answer keywords not found in final_chunks."
        ),
    }