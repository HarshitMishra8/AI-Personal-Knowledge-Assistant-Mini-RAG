"""Vector search over chunks.

Postgres: pgvector's cosine-distance operator, computed inside the database.
SQLite (local dev / tests): load the candidate vectors and score them with numpy,
which is plenty fast at personal-library scale.
"""

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models.document import Chunk


def to_db_vector(vector: np.ndarray):
    vector = np.asarray(vector, dtype=np.float32)
    return vector.tolist() if settings.IS_POSTGRES else vector.tobytes()


def search(db: Session, document_ids: list[str], query_vector: np.ndarray, top_k: int) -> list[dict]:
    """Top-k chunks from the given documents, best first: [{document_id, page, text, score}]."""
    if not document_ids or top_k <= 0:
        return []
    query_vector = np.asarray(query_vector, dtype=np.float32)

    if settings.IS_POSTGRES:
        distance = Chunk.embedding.cosine_distance(query_vector.tolist())
        rows = db.execute(
            select(Chunk.document_id, Chunk.page, Chunk.text, (1 - distance).label("score"))
            .where(Chunk.document_id.in_(document_ids))
            .order_by(distance)
            .limit(top_k)
        ).all()
        return [
            {"document_id": r.document_id, "page": r.page, "text": r.text, "score": float(r.score)}
            for r in rows
        ]

    rows = db.execute(select(Chunk.id, Chunk.embedding).where(Chunk.document_id.in_(document_ids))).all()
    if not rows:
        return []
    matrix = np.frombuffer(b"".join(r.embedding for r in rows), dtype=np.float32).reshape(len(rows), -1)
    scores = matrix @ query_vector
    best = np.argsort(-scores)[:top_k]

    ids = [rows[i].id for i in best]
    chunks = {c.id: c for c in db.execute(select(Chunk).where(Chunk.id.in_(ids))).scalars()}
    return [
        {
            "document_id": chunks[rows[i].id].document_id,
            "page": chunks[rows[i].id].page,
            "text": chunks[rows[i].id].text,
            "score": float(scores[i]),
        }
        for i in best
    ]
