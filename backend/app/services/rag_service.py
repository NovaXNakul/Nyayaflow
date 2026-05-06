# app/services/rag_service.py
#
# OPTIMIZED — target retrieval latency: 0.3–1.0 s
#
# PERFORMANCE FIXES vs original:
#   PERF-1  MMR removed entirely  (-10–30 s)
#   PERF-2  Reranker SKIPPED for entity queries  (-5–15 s)
#   PERF-3  candidate_pool reduced 30 → 15  (-2–7 s for non-entity)
#   PERF-4  Chunk cache (_chunk_cache) avoids collection.get() on every query
#   PERF-5  Batch embedding in index_document  (faster indexing)
#   PERF-6  Per-stage timing at INFO level throughout
#
# BUG FIXES vs original:
#   FIX-1   update_entity_anchor always rebuilds BM25 — previously skipped
#           when document_id not in _bm25_store (cold restart), so the anchor
#           was never refreshed in production after a server restart.
#   FIX-2   rebuild_bm25_from_chroma also warms _chunk_cache on cold start.

from __future__ import annotations

import math
import os
import re
import logging
import time
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

import chromadb

logger = logging.getLogger(__name__)

# Force CPU-only execution for all sentence-transformers models
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")

MAX_PDF_CHARS = 600_000
MAX_CHUNKS = 120

# ══════════════════════════════════════════════════════════════════════════════
# MEMORY-SAFE BATCHED EMBEDDING GENERATION
# ══════════════════════════════════════════════════════════════════════════════

def batch_encode(texts: List[str], batch_size: int = 4) -> List[List[float]]:
    """
    Memory-safe batched embedding generation for low-memory environments.
    Processes texts in small batches to prevent memory exhaustion.
    """
    import gc
    import torch

    embeddings = []
    total_batches = math.ceil(len(texts) / batch_size)

    logger.info("Starting batched embedding: %d texts, batch_size=%d, %d batches",
                len(texts), batch_size, total_batches)

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        batch_num = (i // batch_size) + 1

        logger.info("Processing embedding batch %d/%d (%d texts)",
                    batch_num, total_batches, len(batch))

        try:
            # Force CPU and disable gradients for memory efficiency
            with torch.no_grad():
                batch_embeddings = get_bi_encoder().encode(
                    batch,
                    batch_size=batch_size,
                    show_progress_bar=False,
                    convert_to_numpy=True,
                    device='cpu'  # Explicitly force CPU
                )

            # Convert to list and extend results
            embeddings.extend(batch_embeddings.tolist())

            logger.info("Completed embedding batch %d/%d", batch_num, total_batches)

        except Exception as e:
            logger.error("Failed embedding batch %d/%d: %s", batch_num, total_batches, e)
            raise

        # Aggressive memory cleanup between batches
        del batch
        gc.collect()

        # Small delay to allow memory to settle
        time.sleep(0.1)

    logger.info("Batched embedding complete: %d embeddings generated. Performing final cleanup...", len(embeddings))
    gc.collect()
    logger.info("Memory cleanup completion.")
    return embeddings

_bi_encoder = None
_reranker = None

def get_bi_encoder():
    global _bi_encoder
    if _bi_encoder is None:
        print("Loading SentenceTransformer model...")
        os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
        try:
            from sentence_transformers import SentenceTransformer
            _bi_encoder = SentenceTransformer(
                "sentence-transformers/all-mpnet-base-v2",
                device="cpu",
            )
        except Exception as e:
            logger.error(f"Model loading failed: {e}")
            raise
    return _bi_encoder

def get_reranker():
    global _reranker
    if _reranker is None:
        print("Loading CrossEncoder reranker...")
        os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
        try:
            from sentence_transformers import CrossEncoder
            _reranker = CrossEncoder(
                "cross-encoder/ms-marco-MiniLM-L-6-v2",
                device="cpu",
            )
        except Exception as e:
            logger.error(f"Reranker loading failed: {e}")
            raise
    return _reranker

# ══════════════════════════════════════════════════════════════════════════════
# LAZY-LOADED CHROMADB
# ══════════════════════════════════════════════════════════════════════════════

_chroma_client = None
_collection = None

def get_collection():
    global _chroma_client, _collection
    if _chroma_client is None:
        print("Initializing ChromaDB...")
        try:
            PERSIST_DIR = os.getenv("CHROMA_DIR", "chroma_db")
            _chroma_client = chromadb.PersistentClient(path=PERSIST_DIR)
        except Exception as e:
            logger.error(f"ChromaDB initialization failed: {e}")
            raise
    if _collection is None:
        try:
            _collection = _chroma_client.get_or_create_collection(
                name="case_documents",
                metadata={"hnsw:space": "cosine"},
            )
        except Exception as e:
            logger.error(f"Collection creation failed: {e}")
            raise
    return _collection

# ══════════════════════════════════════════════════════════════════════════════
# IN-MEMORY STORES
# ══════════════════════════════════════════════════════════════════════════════

_chunk_cache: Dict[int, List[str]]                     = {}
_bm25_store:  Dict[int, Tuple["BM25Index", List[str]]] = {}


# ══════════════════════════════════════════════════════════════════════════════
# BM25  — Okapi BM25 with legal-document-aware tokeniser
# ══════════════════════════════════════════════════════════════════════════════

class BM25Index:
    """
    Legal tokeniser understands:
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
        t = re.sub(r'rs\.?\s*', 'rs ', t, flags=re.I)
        t = re.sub(r'(\d),(\d)', r'\1\2', t)
        t = re.sub(r'(\d)/-', r'\1', t)
        t = re.sub(r'\b([swdr])/o\b', r'\1o', t)
        t = re.sub(r'(\d{1,2})\.(\d{2})\.(\d{4})', r'\1\2\3', t)
        return re.findall(r'\b\w{2,}\b', t)

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
    try:
        import fitz
        doc   = fitz.open(file_path)
        pages = []
        for i, page in enumerate(doc):
            raw = page.get_text("text") or ""
            raw = re.sub(r'\n{3,}', '\n\n', raw)
            raw = re.sub(r'[ \t]{2,}', ' ', raw)
            pages.append(f"[PAGE {i + 1}]\n{raw.strip()}")
        doc.close()
        full = "\n\n".join(pages)
        if len(full) > MAX_PDF_CHARS:
            logger.warning(
                "PDF text truncated from %d to %d chars for memory safety",
                len(full),
                MAX_PDF_CHARS,
            )
            full = full[:MAX_PDF_CHARS]
        logger.info("PDF loaded via PyMuPDF: %d pages, %d chars", len(pages), len(full))
        return full
    except ImportError:
        pass

    from pypdf import PdfReader
    reader = PdfReader(file_path)
    pages  = []
    for i, page in enumerate(reader.pages):
        raw = page.extract_text() or ""
        raw = re.sub(r'\n{3,}', '\n\n', raw)
        raw = re.sub(r'[ \t]{2,}', ' ', raw)
        pages.append(f"[PAGE {i + 1}]\n{raw.strip()}")
    full = "\n\n".join(pages)
    if len(full) > MAX_PDF_CHARS:
        logger.warning(
            "PDF text truncated from %d to %d chars for memory safety",
            len(full),
            MAX_PDF_CHARS,
        )
        full = full[:MAX_PDF_CHARS]
    logger.info("PDF loaded via pypdf: %d pages, %d chars", len(pages), len(full))
    return full


# ══════════════════════════════════════════════════════════════════════════════
# LEGAL-AWARE SENTENCE SPLITTER
# ══════════════════════════════════════════════════════════════════════════════

_PROTECT_PATTERNS = [
    (r'\bSri\.',        'Sri<<DOT>>'),
    (r'\bSmt\.',        'Smt<<DOT>>'),
    (r'\bShri\.',       'Shri<<DOT>>'),
    (r'\bMr\.',         'Mr<<DOT>>'),
    (r'\bMrs\.',        'Mrs<<DOT>>'),
    (r'\bMs\.',         'Ms<<DOT>>'),
    (r'\bDr\.',         'Dr<<DOT>>'),
    (r'\bProf\.',       'Prof<<DOT>>'),
    (r'\bAdv\.',        'Adv<<DOT>>'),
    (r'\bvs\.',         'vs<<DOT>>'),
    (r'\bv\.',          'v<<DOT>>'),
    (r'\bNo\.',         'No<<DOT>>'),
    (r'\bSt\.',         'St<<DOT>>'),
    (r'\bArt\.',        'Art<<DOT>>'),
    (r'\bSec\.',        'Sec<<DOT>>'),
    (r'\bRs\.',         'Rs<<DOT>>'),
    (r'\bW\.P\.',       'W<<DOT>>P<<DOT>>'),
    (r'\bCrl\.',        'Crl<<DOT>>'),
    (r'\bCr\.P\.C\.',   'Cr<<DOT>>P<<DOT>>C<<DOT>>'),
    (r'\bC\.P\.C\.',    'C<<DOT>>P<<DOT>>C<<DOT>>'),
    (r'\bI\.P\.C\.',    'I<<DOT>>P<<DOT>>C<<DOT>>'),
    (r'\bS/o\b',        'S<<SL>>o'),
    (r'\bW/o\b',        'W<<SL>>o'),
    (r'\bD/o\b',        'D<<SL>>o'),
    (r'\bR/o\b',        'R<<SL>>o'),
    (r'(\d{1,2})\.(\d{2})\.(\d{4})', r'\1<<D>>\2<<D>>\3'),
    (r'(\d{1,2})\.(\d{1,2})\.(\d{2,4})', r'\1<<D>>\2<<D>>\3'),
    (r'(\d+)\.\s',      r'\1<<DOT>> '),
    (r'\b([A-Z])\.',    r'\1<<DOT>>'),
]

def _protect(text: str) -> str:
    for pat, rep in _PROTECT_PATTERNS:
        text = re.sub(pat, rep, text)
    return text

def _restore(text: str) -> str:
    return text.replace('<<DOT>>', '.').replace('<<SL>>', '/').replace('<<D>>', '.')

def legal_sentence_split(text: str) -> List[str]:
    protected = _protect(text)
    raw_sents = re.split(r'(?<=[.!?])\s+(?=[A-Z\[])', protected)
    restored  = [_restore(s).strip() for s in raw_sents]
    return [s for s in restored if len(s) > 10]


# ══════════════════════════════════════════════════════════════════════════════
# CHUNKING
# ══════════════════════════════════════════════════════════════════════════════

def chunk_text(
    text:          str,
    target_chars:  int = 600,
    overlap_sents: int = 2,
) -> List[Dict]:
    """Paragraph-aware chunking optimised for Indian legal documents."""
    paragraphs = re.split(r'\n{2,}', text.strip())

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
                i = max(i + 1, j - overlap_sents)

    seen:    set        = set()
    deduped: List[Dict] = []
    for c in chunks:
        key = c["text"][:80]
        if key not in seen:
            seen.add(key)
            deduped.append(c)

    if len(deduped) > MAX_CHUNKS:
        logger.warning(
            "chunk_text: truncating %d chunks to %d max for memory safety",
            len(deduped),
            MAX_CHUNKS,
        )
        deduped = deduped[:MAX_CHUNKS]

    logger.info("chunk_text: %d chunks from %d chars", len(deduped), len(text))
    return deduped


# ══════════════════════════════════════════════════════════════════════════════
# QUERY CLASSIFICATION
# ══════════════════════════════════════════════════════════════════════════════

_ENTITY_RE = re.compile(
    r'\b(who|name|borrower|petitioner|defendant|plaintiff|party|parties|'
    r'person|applicant|co[\s\-]?borrower|guarantor|accused|claimant|'
    r'respondent|loan|amount|sanctioned|address|registered|account|'
    r'mortgagor|mortgagee|lender|debtor|surety|principal)\b',
    re.IGNORECASE,
)

# Summary intent — used in chat.py to route to generate_summary
_SUMMARY_RE = re.compile(
    r'\b(summari[sz]e|summary|overview|brief|gist|tldr|tl[;\s]?dr|'
    r'what is this (document|case|judgment|order) about|'
    r'give me (a |an )?(summary|overview)|explain this (document|case))\b',
    re.IGNORECASE,
)

def is_entity_query(query: str) -> bool:
    return bool(_ENTITY_RE.search(query))

def is_summary_query(query: str) -> bool:
    return bool(_SUMMARY_RE.search(query))


def _embed_query(query: str, entity_mode: bool) -> List[float]:
    """
    Entity queries: raw embedding only — averaging dilutes discriminative signal.
    Non-entity: average 3 paraphrases for broader semantic coverage.
    """
    import torch
    if entity_mode:
        with torch.no_grad():
            vec = get_bi_encoder().encode(
                query,
                normalize_embeddings=True,
                batch_size=8,
                show_progress_bar=False,
                convert_to_numpy=True,
                device="cpu",
            )
        return vec.tolist()

    expansions = [
        query,
        f"Information about: {query}",
        f"Details related to: {query}",
    ]
    import numpy as np
    with torch.no_grad():
        vecs = get_bi_encoder().encode(
            expansions,
            normalize_embeddings=True,
            batch_size=8,
            show_progress_bar=False,
            convert_to_numpy=True,
            device="cpu",
        )
    avg  = vecs.mean(axis=0)
    return avg.tolist()


# ══════════════════════════════════════════════════════════════════════════════
# RETRIEVAL HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _rrf_fuse(
    ranked_lists: List[List[Tuple[str, float]]],
    k:            int = 60,
) -> Dict[str, float]:
    scores: Dict[str, float] = defaultdict(float)
    for ranked in ranked_lists:
        for rank, (doc, _) in enumerate(ranked):
            scores[doc] += 1.0 / (k + rank + 1)
    return scores


def _keyword_scan(document_id: int, query: str, top_k: int = 15) -> List[Tuple[str, float]]:
    """
    PERF-4: Use in-memory chunk cache instead of collection.get() on every call.
    """
    texts = _chunk_cache.get(document_id)
    if texts is None:
        try:
            data  = get_collection().get(where={"document_id": str(document_id)})
            texts = data.get("documents", [])
            _chunk_cache[document_id] = texts
        except Exception as exc:
            logger.warning("_keyword_scan: collection.get failed: %s", exc)
            return []

    if not texts:
        return []

    keywords = [
        kw for kw in re.findall(r'\b\w{3,}\b', query.lower())
        if kw not in {"the", "and", "for", "who", "what", "this", "that", "with"}
    ]
    if not keywords:
        return []

    scored: List[Tuple[str, float]] = []
    for t in texts:
        tl   = t.lower()
        hits = sum(1 for kw in keywords if kw in tl)
        if hits:
            scored.append((t, float(hits)))
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]


def _rerank(
    query:      str,
    candidates: List[str],
    max_pairs:  int = 15,
) -> List[Tuple[str, float]]:
    if not candidates:
        return []
    cands = candidates[:max_pairs]
    try:
        pairs  = [(query, doc) for doc in cands]
        scores = get_reranker().predict(pairs, show_progress_bar=False)
        ranked = sorted(
            zip(cands, scores.tolist()), key=lambda x: x[1], reverse=True
        )
        logger.debug("Rerank top-5 scores: %s", [round(s, 3) for _, s in ranked[:5]])
        return ranked
    except Exception as exc:
        logger.warning("_rerank failed: %s — keeping RRF order", exc)
        return []


# ══════════════════════════════════════════════════════════════════════════════
# MAIN RETRIEVE  (public API)
# ══════════════════════════════════════════════════════════════════════════════

def retrieve_chunks(
    document_id:    int,
    query:          str,
    k:              int = 4,
    candidate_pool: int = 15,
) -> List[str]:
    """
    Optimised hybrid retrieval pipeline:
      1. Semantic search
      2. BM25 keyword search (legal-aware tokeniser)
      3. Brute-force keyword scan (entity queries only)
      4. RRF fusion
      5. Cross-encoder reranking — SKIPPED for entity queries  (PERF-2)
      6. Pure top-k selection  (PERF-1: MMR removed)
    """
    t0 = time.perf_counter()
    entity_mode = is_entity_query(query)
    logger.info(
        "retrieve_chunks: doc=%d k=%d entity=%s query='%s'",
        document_id, k, entity_mode, query,
    )

    if document_id not in _bm25_store:
        logger.warning("BM25 cold for doc %d — rebuilding from Chroma", document_id)
        rebuild_bm25_from_chroma(document_id)

    # ── 1. Semantic search ────────────────────────────────────────────────────
    t1 = time.perf_counter()
    sem_ranked: List[Tuple[str, float]] = []
    try:
        vec = _embed_query(query, entity_mode)
        res = get_collection().query(
            query_embeddings=[vec],
            n_results=min(candidate_pool, 100),
            where={"document_id": str(document_id)},
            include=["documents", "distances"],
        )
        sem_ranked = [
            (doc, 1.0 - dist)
            for doc, dist in zip(res["documents"][0], res["distances"][0])
        ]
    except Exception as exc:
        logger.warning("Semantic search error: %s", exc)
    logger.info("  semantic: %.3fs  hits=%d", time.perf_counter() - t1, len(sem_ranked))

    # ── 2. BM25 search ────────────────────────────────────────────────────────
    t2 = time.perf_counter()
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
    logger.info("  bm25: %.3fs  hits=%d", time.perf_counter() - t2, len(bm25_ranked))

    # ── 3. Keyword scan (entity queries only) ─────────────────────────────────
    t3 = time.perf_counter()
    kw_ranked: List[Tuple[str, float]] = []
    if entity_mode:
        kw_ranked = _keyword_scan(document_id, query, top_k=candidate_pool)
    logger.info("  keyword: %.3fs  hits=%d", time.perf_counter() - t3, len(kw_ranked))

    # ── 4. RRF fusion ─────────────────────────────────────────────────────────
    rrf_scores = _rrf_fuse([sem_ranked, bm25_ranked, kw_ranked])
    if not rrf_scores:
        logger.error("All retrieval methods empty for doc %d", document_id)
        return [doc for doc, _ in kw_ranked[:k]] if kw_ranked else []

    candidates_sorted = sorted(
        rrf_scores.keys(), key=lambda d: rrf_scores[d], reverse=True
    )

    # ── 5. Reranking  (PERF-2: skip for entity queries) ──────────────────────
    t5 = time.perf_counter()
    if entity_mode:
        reranked: List[Tuple[str, float]] = [
            (d, rrf_scores[d]) for d in candidates_sorted
        ]
        logger.info("  reranker: SKIPPED (entity mode)")
    else:
        reranked = _rerank(query, candidates_sorted, max_pairs=candidate_pool)
        if not reranked:
            reranked = [(d, rrf_scores[d]) for d in candidates_sorted]
        logger.info("  reranker: %.3fs", time.perf_counter() - t5)

    # ── 6. Pure top-k ─────────────────────────────────────────────────────────
    final = [doc for doc, _ in reranked[:k]]

    logger.info(
        "retrieve_chunks: TOTAL=%.3fs  returning %d chunks",
        time.perf_counter() - t0, len(final),
    )
    return final


# ══════════════════════════════════════════════════════════════════════════════
# FULL-DOCUMENT TEXT FOR SUMMARY  (public API)
# ══════════════════════════════════════════════════════════════════════════════

def get_document_text_for_summary(document_id: int, max_chars: int = 8000) -> str:
    """
    Return the full document text concatenated from all non-entity-anchor chunks,
    ordered by chunk_id. Used by the summary path in chat.py.
    """
    try:
        data = get_collection().get(
            where={"document_id": str(document_id)},
            include=["documents", "metadatas"],
        )
        pairs = [
            (meta.get("chunk_id", 0), doc)
            for doc, meta in zip(data["documents"], data["metadatas"])
            if meta.get("type") != "entities"   # skip the anchor chunk
        ]
        pairs.sort(key=lambda x: x[0])
        full_text = "\n\n".join(doc for _, doc in pairs)
        return full_text[:max_chars]
    except Exception as exc:
        logger.error("get_document_text_for_summary failed for doc %d: %s", document_id, exc)
        # Fall back to chunk cache
        texts = _chunk_cache.get(document_id, [])
        return "\n\n".join(t for t in texts if not t.startswith("DOCUMENT ENTITY SUMMARY"))[:max_chars]


# ══════════════════════════════════════════════════════════════════════════════
# INDEXING
# ══════════════════════════════════════════════════════════════════════════════

def index_document(
    document_id:    int,
    file_path:      str,
    extra_entities: Optional[Dict] = None,
) -> int:
    """
    Index a document: ChromaDB embeddings + BM25 + chunk cache.
    PERF-5: Batch embedding — encode(list) is 3–5× faster than per-item loop.
    """
    t0 = time.perf_counter()
    logger.info("index_document: doc_id=%d  path=%s", document_id, file_path)

    _purge_document(document_id)

    logger.info("PDF upload processed. Chunking started...")
    raw_text = load_pdf_text(file_path)
    chunks   = chunk_text(raw_text)
    logger.info("Chunking complete: %d chunks created.", len(chunks))
    import gc
    del raw_text
    gc.collect()

    ids:       List[str]  = []
    docs:      List[str]  = []
    metas:     List[Dict] = []
    all_texts: List[str]  = []

    for i, chunk in enumerate(chunks):
        t = chunk["text"]
        all_texts.append(t)
        ids.append(f"{document_id}_{i}")
        docs.append(t)
        metas.append({
            "document_id": str(document_id),
            "chunk_id":    i,
            "source":      chunk["source"],
            "type":        "pdf",
        })

    # Entity anchor chunk (placeholder — updated by push_entities_to_index)
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
    metas.append({
        "document_id": str(document_id),
        "chunk_id":    -1,
        "source":      "entity_anchor",
        "type":        "entities",
    })
    logger.info("Entity anchor: %s", entity_text[:300])

    # PERF-5: Memory-safe batched embedding
    t_embed = time.perf_counter()
    embeds = batch_encode(docs, batch_size=4)  # Use smaller batch size for low memory
    logger.info("Memory-safe embedding: %.2fs for %d chunks", time.perf_counter() - t_embed, len(docs))

    # Upsert to ChromaDB in smaller batches for memory safety
    CHROMA_BATCH = 50  # Smaller batch size for ChromaDB operations
    for start in range(0, len(ids), CHROMA_BATCH):
        end = start + CHROMA_BATCH
        batch_ids = ids[start:end]
        batch_docs = docs[start:end]
        batch_embeds = embeds[start:end]
        batch_metas = metas[start:end]

        logger.info("Upserting ChromaDB batch %d-%d (%d chunks)",
                    start, end, len(batch_ids))

        get_collection().upsert(
            ids=batch_ids,
            documents=batch_docs,
            embeddings=batch_embeds,
            metadatas=batch_metas,
        )

        # Memory cleanup between ChromaDB batches
        del batch_ids, batch_docs, batch_embeds, batch_metas
        import gc
        gc.collect()
        logger.info("Memory cleanup completion (Chroma batch).")
    # Build BM25
    bm25 = BM25Index()
    bm25.fit(all_texts)
    _bm25_store[document_id]  = (bm25, all_texts)
    _chunk_cache[document_id] = all_texts  # PERF-4

    logger.info(
        "index_document: TOTAL=%.2fs  doc=%d  chunks=%d",
        time.perf_counter() - t0, document_id, len(ids),
    )
    gc.collect()
    logger.info("Indexing completion for doc_id=%d", document_id)
    return len(ids)


def _purge_document(document_id: int) -> None:
    """Delete all existing chunks for this document_id before re-indexing."""
    try:
        old = get_collection().get(where={"document_id": str(document_id)})
        if old["ids"]:
            get_collection().delete(ids=old["ids"])
            logger.info("Purged %d stale chunks for doc %d", len(old["ids"]), document_id)
    except Exception as exc:
        logger.warning("_purge_document non-fatal: %s", exc)

    _bm25_store.pop(document_id, None)
    _chunk_cache.pop(document_id, None)


def rebuild_bm25_from_chroma(document_id: int) -> bool:
    """Rebuild BM25 + chunk cache from ChromaDB after server restart."""
    try:
        data  = get_collection().get(where={"document_id": str(document_id)})
        texts = data.get("documents", [])
        if not texts:
            logger.warning("rebuild_bm25: no chunks in Chroma for doc %d", document_id)
            return False
        bm25 = BM25Index()
        bm25.fit(texts)
        _bm25_store[document_id]  = (bm25, texts)
        _chunk_cache[document_id] = texts  # PERF-4 + FIX-2
        logger.info("BM25 rebuilt: %d chunks for doc %d", len(texts), document_id)
        return True
    except Exception as exc:
        logger.error("rebuild_bm25 failed for doc %d: %s", document_id, exc)
        return False


def update_entity_anchor(document_id: int, extra_entities: Dict) -> None:
    """
    Inject entity data into the index after extraction completes.
    Overwrites the placeholder entity anchor created during initial indexing.

    FIX-1: Previously skipped BM25 rebuild when document_id not in _bm25_store
    (always true after a server restart). Now always rebuilds from Chroma first
    if necessary, so the anchor is always refreshed in production.
    """
    entity_lines = [f"DOCUMENT ENTITY SUMMARY (document_id={document_id}):"]
    for key, val in extra_entities.items():
        if val:
            if isinstance(val, list):
                val = ", ".join(str(v) for v in val)
            entity_lines.append(f"{key.replace('_', ' ').title()}: {val}")
    entity_text = "\n".join(entity_lines)
    eid = f"{document_id}_entities"

    import torch
    with torch.no_grad():
        embed = get_bi_encoder().encode(
            [entity_text],
            batch_size=1,
            show_progress_bar=False,
            convert_to_numpy=True,
            device="cpu",
        )[0].tolist()
    get_collection().upsert(
        ids=[eid],
        documents=[entity_text],
        embeddings=[embed],
        metadatas=[{
            "document_id": str(document_id),
            "chunk_id":    -1,
            "source":      "entity_anchor",
            "type":        "entities",
        }],
    )
    logger.info("Entity anchor updated for doc %d: %s", document_id, entity_text[:300])

    # FIX-1: Ensure BM25 store is warm before rebuilding it
    if document_id not in _bm25_store:
        logger.info(
            "update_entity_anchor: BM25 cold for doc %d — rebuilding from Chroma first",
            document_id,
        )
        rebuild_bm25_from_chroma(document_id)

    if document_id in _bm25_store:
        _, existing_texts = _bm25_store[document_id]
        new_texts = [t for t in existing_texts if not t.startswith("DOCUMENT ENTITY SUMMARY")]
        new_texts.append(entity_text)
        bm25 = BM25Index()
        bm25.fit(new_texts)
        _bm25_store[document_id]  = (bm25, new_texts)
        _chunk_cache[document_id] = new_texts  # PERF-4


# ══════════════════════════════════════════════════════════════════════════════
# DEBUG UTILITY
# ══════════════════════════════════════════════════════════════════════════════

def debug_retrieval(document_id: int, query: str) -> Dict:
    """Full retrieval diagnostics without calling the LLM."""
    entity_mode = is_entity_query(query)

    if document_id not in _bm25_store:
        rebuild_bm25_from_chroma(document_id)

    vec = _embed_query(query, entity_mode)
    sem_results: List[Dict] = []
    try:
        res = get_collection().query(
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

    bm25_results: List[Dict] = []
    if document_id in _bm25_store:
        bm25_idx, chunk_texts = _bm25_store[document_id]
        raw = bm25_idx.score(query)
        top = sorted(range(len(raw)), key=lambda i: raw[i], reverse=True)[:10]
        bm25_results = [
            {"score": round(raw[i], 4), "text": chunk_texts[i][:300]}
            for i in top if raw[i] > 0
        ]

    kw_results   = _keyword_scan(document_id, query, top_k=10)
    final_chunks = retrieve_chunks(document_id, query, k=4)

    try:
        total_indexed = len(get_collection().get(where={"document_id": str(document_id)})["ids"])
    except Exception:
        total_indexed = -1

    return {
        "query":          query,
        "entity_mode":    entity_mode,
        "total_indexed":  total_indexed,
        "bm25_in_memory": document_id in _bm25_store,
        "semantic_top10": sem_results,
        "bm25_top10":     bm25_results,
        "keyword_top10":  [{"hits": s, "text": t[:300]} for t, s in kw_results],
        "final_chunks":   [{"text": c[:300]} for c in final_chunks],
        "diagnosis": (
            "RETRIEVAL OK — debug LLM prompt if answer not in final_chunks."
            if any(query.lower()[:10] in c.lower() for c in final_chunks)
            else "RETRIEVAL SUSPECT — answer keywords not in final_chunks."
        ),
    }