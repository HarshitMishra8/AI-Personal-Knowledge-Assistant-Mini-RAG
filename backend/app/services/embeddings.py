"""Text embeddings via FastEmbed (ONNX Runtime).

FastEmbed needs no PyTorch, so the API fits in the 512 MB RAM of free hosting tiers.
The model loads lazily (or at startup via warmup()), and tests swap in a fake with
set_embedder(). All vectors are L2-normalised, so dot product == cosine similarity.
"""

import threading
from typing import Protocol

import numpy as np

from app.config import settings


class Embedder(Protocol):
    def embed_documents(self, texts: list[str]) -> np.ndarray: ...
    def embed_query(self, text: str) -> np.ndarray: ...


def _normalise(vectors: np.ndarray) -> np.ndarray:
    vectors = np.asarray(vectors, dtype=np.float32)
    norms = np.linalg.norm(vectors, axis=-1, keepdims=True)
    return vectors / np.where(norms == 0, 1, norms)


class FastEmbedEmbedder:
    def __init__(self, model_name: str, cache_dir: str) -> None:
        from fastembed import TextEmbedding

        self.model = TextEmbedding(model_name=model_name, cache_dir=cache_dir)

    def embed_documents(self, texts: list[str]) -> np.ndarray:
        return _normalise(np.array(list(self.model.embed(texts, batch_size=32))))

    def embed_query(self, text: str) -> np.ndarray:
        return _normalise(np.array(list(self.model.embed([text])))[0])


_embedder: Embedder | None = None
_lock = threading.Lock()


def set_embedder(embedder: Embedder) -> None:
    global _embedder
    _embedder = embedder


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        with _lock:
            if _embedder is None:
                _embedder = FastEmbedEmbedder(settings.EMBEDDING_MODEL, settings.MODEL_CACHE_DIR)
    return _embedder


def warmup() -> None:
    get_embedder()


def embed_documents(texts: list[str]) -> np.ndarray:
    return get_embedder().embed_documents(texts)


def embed_query(text: str) -> np.ndarray:
    return get_embedder().embed_query(text)
