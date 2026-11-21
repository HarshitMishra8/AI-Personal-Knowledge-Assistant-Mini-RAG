import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app import models  # noqa: F401  (registers tables on Base.metadata)
from app.config import settings
from app.db.database import SessionLocal, init_db
from app.routes import auth, chats, documents
from app.services import embeddings, llm
from app.services.ingestion import fail_interrupted_documents

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    fail_interrupted_documents()
    if settings.PRELOAD_EMBEDDINGS:
        # Load the model at startup so the first upload/question isn't slow.
        await run_in_threadpool(embeddings.warmup)
    yield


app = FastAPI(
    title="Mini-RAG API",
    description="Upload PDFs and chat with them using retrieval-augmented generation.",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=False,  # auth uses a bearer token, not cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(chats.router)


@app.get("/", include_in_schema=False)
def root():
    return {"name": "Mini-RAG API", "docs": "/docs"}


@app.get("/health", tags=["meta"])
def health():
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "database": "postgres" if settings.IS_POSTGRES else "sqlite",
        "llm_configured": llm.is_configured(),
        "google_auth": bool(settings.GOOGLE_CLIENT_ID),
    }
