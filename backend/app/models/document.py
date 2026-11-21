from sqlalchemy import Column, DateTime, ForeignKey, Integer, LargeBinary, String, Text

from app.config import settings
from app.db.database import Base
from app.models.user import utcnow

if settings.IS_POSTGRES:
    from pgvector.sqlalchemy import Vector

    EmbeddingType = Vector(settings.EMBEDDING_DIM)
else:
    # SQLite (local dev / tests): float32 bytes, searched with numpy.
    EmbeddingType = LargeBinary


class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True)  # uuid4
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    filename = Column(String(255), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    status = Column(String(16), nullable=False, default="processing")  # processing | ready | failed
    error = Column(String(500), nullable=True)
    num_pages = Column(Integer, nullable=True)
    num_chunks = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DocumentFile(Base):
    """The original PDF, kept in the database so the API server stays stateless
    (free hosting tiers wipe the local disk on every deploy)."""

    __tablename__ = "document_files"

    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True)
    data = Column(LargeBinary, nullable=False)


class Chunk(Base):
    __tablename__ = "chunks"

    id = Column(Integer, primary_key=True)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    page = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    embedding = Column(EmbeddingType, nullable=False)
