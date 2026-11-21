import hashlib
import json
import os
import re
import sys
import tempfile
import uuid
from pathlib import Path

import numpy as np
import pytest

# Configure an isolated environment BEFORE the app is imported.
# CI sets DATABASE_URL to a Postgres+pgvector service; locally the tests use a temp SQLite file.
_TMP = tempfile.mkdtemp(prefix="rag-tests-")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TMP}/test.db")
os.environ.update(
    DATA_DIR=_TMP,
    SECRET_KEY="test-secret-key-that-is-at-least-32-bytes-long",
    LLM_API_KEY="",
    OPENAI_API_KEY="",
    GOOGLE_CLIENT_ID="",
    MIN_SCORE="0.1",
    PRELOAD_EMBEDDINGS="false",
)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pdf_utils import make_pdf  # noqa: E402

PLANTS_PDF = make_pdf([
    "Photosynthesis happens in plant leaves.\nChlorophyll absorbs sunlight to make glucose.",
    "Plants release oxygen as a by-product of photosynthesis.",
])
SPACE_PDF = make_pdf(["Mars is the fourth planet from the sun.\nRovers explore the red Martian surface."])


STOPWORDS = {"a", "an", "the", "is", "of", "to", "in", "and", "as", "from", "how", "does", "do", "what", "me", "about", "tell"}


class FakeEmbedder:
    """Deterministic offline embedder: each word maps to a fixed random unit vector and a
    text is the normalised sum of its words. Texts sharing words score high; unrelated
    texts score near zero. That's all the retrieval tests need."""

    dim = 384  # must match EMBEDDING_DIM for the pgvector column

    @staticmethod
    def _word_vector(word: str) -> np.ndarray:
        seed = int(hashlib.md5(word.encode()).hexdigest()[:8], 16)
        v = np.random.default_rng(seed).standard_normal(FakeEmbedder.dim).astype("float32")
        return v / np.linalg.norm(v)

    def _encode(self, texts):
        vectors = np.zeros((len(texts), self.dim), dtype="float32")
        for row, text in enumerate(texts):
            for token in re.findall(r"[a-z]+", text.lower()):
                if token not in STOPWORDS:
                    vectors[row] += self._word_vector(token)
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        return vectors / np.where(norms == 0, 1, norms)

    def embed_documents(self, texts):
        return self._encode(texts)

    def embed_query(self, text):
        return self._encode([text])[0]


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app
    from app.services import embeddings

    embeddings.set_embedder(FakeEmbedder())
    with TestClient(app) as c:
        yield c


def new_user(client) -> dict:
    email = f"user-{uuid.uuid4().hex[:10]}@example.com"
    r = client.post("/auth/register", json={"email": email, "password": "correct-horse-battery"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def auth_headers(client):
    return new_user(client)


def upload(client, headers, name, data):
    return client.post("/documents", headers=headers, files={"file": (name, data, "application/pdf")})


def parse_sse(body: str) -> list[tuple[str, object]]:
    events = []
    for block in body.strip().split("\n\n"):
        fields = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        events.append((fields["event"], json.loads(fields["data"])))
    return events
