"""Measure retrieval quality on your own PDFs: hit-rate@k and MRR.

Usage (from backend/):
    python -m scripts.eval_retrieval path/to/doc.pdf path/to/questions.jsonl [--k 5]
    python -m scripts.eval_retrieval doc.pdf questions.jsonl --chunk-size 500 --overlap 100

questions.jsonl has one JSON object per line, with the page(s) where the answer is:
    {"question": "What does chlorophyll absorb?", "pages": [3]}

A question counts as a hit@k if any of the top-k retrieved chunks comes from an expected page.
Runs entirely in memory with the real embedding model; no database or server needed.
"""

import argparse
import json
from pathlib import Path

import numpy as np

from app.config import settings
from app.services import embeddings
from app.services.chunking import chunk_pages
from app.services.ingestion import extract_pages


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("questions", type=Path)
    parser.add_argument("--k", type=int, default=settings.TOP_K)
    parser.add_argument("--chunk-size", type=int, default=settings.CHUNK_SIZE)
    parser.add_argument("--overlap", type=int, default=settings.CHUNK_OVERLAP)
    args = parser.parse_args()

    chunks = chunk_pages(extract_pages(args.pdf.read_bytes()), args.chunk_size, args.overlap)
    matrix = embeddings.embed_documents([c.text for c in chunks])
    pages = np.array([c.page for c in chunks])
    items = [json.loads(line) for line in args.questions.read_text().splitlines() if line.strip()]

    hits, reciprocal_ranks = 0, []
    for item in items:
        scores = matrix @ embeddings.embed_query(item["question"])
        ranked_pages = pages[np.argsort(-scores)][: args.k]
        expected = set(item["pages"])
        rank = next((i + 1 for i, p in enumerate(ranked_pages) if p in expected), None)
        hits += rank is not None
        reciprocal_ranks.append(1 / rank if rank else 0.0)
        mark = f"hit @ {rank}" if rank else "MISS"
        print(f"[{mark:>8}] {item['question']}  (expected {sorted(expected)}, got {ranked_pages.tolist()})")

    print(
        f"\n{len(chunks)} chunks (size={args.chunk_size}, overlap={args.overlap}), {len(items)} questions, "
        f"model={settings.EMBEDDING_MODEL}"
    )
    print(f"hit-rate@{args.k}: {hits / len(items):.1%}   MRR: {np.mean(reciprocal_ranks):.3f}")


if __name__ == "__main__":
    main()
