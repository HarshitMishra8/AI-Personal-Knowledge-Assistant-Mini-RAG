"""Application settings, read once from environment variables (and a .env file if present)."""

import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger(__name__)


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _database_url(raw: str | None, data_dir: Path) -> str:
    if not raw:
        return f"sqlite:///{data_dir / 'rag.db'}"
    # Hosted Postgres (Neon, Render, Railway...) hands out postgres:// URLs; use the psycopg 3 driver.
    for prefix in ("postgres://", "postgresql://"):
        if raw.startswith(prefix):
            return "postgresql+psycopg://" + raw[len(prefix):]
    return raw


class Settings:
    def __init__(self) -> None:
        # Storage
        self.DATA_DIR = Path(os.getenv("DATA_DIR", "data")).resolve()
        self.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.DATABASE_URL = _database_url(os.getenv("DATABASE_URL"), self.DATA_DIR)
        self.IS_POSTGRES = self.DATABASE_URL.startswith("postgresql")

        # Auth
        self.SECRET_KEY = os.getenv("SECRET_KEY", "")
        if not self.SECRET_KEY:
            self.SECRET_KEY = secrets.token_urlsafe(32)
            log.warning("SECRET_KEY not set: using a random key, so logins reset on every restart.")
        self.ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7)))
        self.GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

        # Retrieval
        self.EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
        self.EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "384"))
        self.MODEL_CACHE_DIR = os.getenv("MODEL_CACHE_DIR") or str(self.DATA_DIR / "models")
        self.PRELOAD_EMBEDDINGS = _bool("PRELOAD_EMBEDDINGS", True)
        self.CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "800"))  # characters
        self.CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "150"))
        self.TOP_K = int(os.getenv("TOP_K", "5"))
        self.MIN_SCORE = float(os.getenv("MIN_SCORE", "0.3"))  # cosine similarity cut-off
        self.MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))
        self.MAX_HISTORY = int(os.getenv("MAX_HISTORY", "6"))

        # LLM: any OpenAI-compatible API (OpenAI, Groq, OpenRouter, Ollama...)
        self.LLM_API_KEY = os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY") or ""
        self.LLM_BASE_URL = os.getenv("LLM_BASE_URL") or None
        self.LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

        # CORS: the Next.js frontend calls the API from the browser.
        self.CORS_ORIGINS = [
            o.strip().rstrip("/")
            for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
            if o.strip()
        ]
        # Optional regex, e.g. ^https://my-app(-[a-z0-9-]+)?\.vercel\.app$ for Vercel preview URLs.
        self.CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX") or None


settings = Settings()
