import json
import logging
import uuid
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import get_current_user
from app.db.database import SessionLocal, get_db
from app.models.chat import Chat, Message
from app.models.document import Document
from app.models.schemas import ChatCreate, ChatDetail, ChatOut, ChatUpdate, MessageCreate, Source
from app.models.user import User, utcnow
from app.services import embeddings, llm, retrieval

log = logging.getLogger(__name__)

router = APIRouter(prefix="/chats", tags=["chats"])


# ---------- helpers ----------

def get_owned_chat(db: Session, chat_id: str, user: User) -> Chat:
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == user.id).first()
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


def check_document_ids(db: Session, document_ids: list[str], user: User) -> list[str]:
    unique = list(dict.fromkeys(document_ids))
    if unique:
        found = db.query(Document.id).filter(Document.user_id == user.id, Document.id.in_(unique)).count()
        if found != len(unique):
            raise HTTPException(status_code=404, detail="One or more documents were not found")
    return unique


def retrieval_query(question: str, history: list[dict]) -> str:
    """Short follow-ups ("and its cost?") retrieve badly alone, so prepend the previous question."""
    previous = [m["content"] for m in history if m["role"] == "user"]
    if previous and len(question.split()) <= 8:
        return f"{previous[-1]}\n{question}"
    return question


def sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ---------- CRUD ----------

@router.get("", response_model=list[ChatOut])
def list_chats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Chat)
        .filter(Chat.user_id == current_user.id)
        .order_by(Chat.updated_at.desc())
        .limit(100)
        .all()
    )


@router.post("", response_model=ChatOut, status_code=status.HTTP_201_CREATED)
def create_chat(payload: ChatCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = Chat(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=(payload.title or "").strip()[:200] or "New chat",
        document_ids=check_document_ids(db, payload.document_ids, current_user),
    )
    db.add(chat)
    db.commit()
    return chat


@router.get("/{chat_id}", response_model=ChatDetail)
def get_chat(chat_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_owned_chat(db, chat_id, current_user)


@router.patch("/{chat_id}", response_model=ChatOut)
def update_chat(
    chat_id: str,
    payload: ChatUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = get_owned_chat(db, chat_id, current_user)
    if payload.title is not None:
        chat.title = payload.title.strip() or chat.title
    if payload.document_ids is not None:
        chat.document_ids = check_document_ids(db, payload.document_ids, current_user)
    db.commit()
    return chat


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat(chat_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_owned_chat(db, chat_id, current_user)
    db.execute(delete(Chat).where(Chat.id == chat_id))  # messages cascade
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- asking a question (streamed) ----------

@router.post("/{chat_id}/messages")
def send_message(
    chat_id: str,
    payload: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve relevant chunks, then stream the answer as Server-Sent Events:

    - `sources`: list of cited passages (sent first)
    - `token`:   a piece of answer text (many)
    - `done`:    {"message_id": int} once the answer is saved
    - `error`:   {"detail": str} if generation failed
    """
    chat = get_owned_chat(db, chat_id, current_user)

    documents_query = db.query(Document).filter(Document.user_id == current_user.id, Document.status == "ready")
    if chat.document_ids:
        documents_query = documents_query.filter(Document.id.in_(chat.document_ids))
    documents = documents_query.all()
    if not documents:
        detail = (
            "The documents selected for this chat are gone or still processing. Pick other sources."
            if chat.document_ids
            else "Upload a document (and wait for it to finish processing) before asking questions."
        )
        raise HTTPException(status_code=400, detail=detail)
    filenames = {d.id: d.filename for d in documents}

    recent = (
        db.query(Message)
        .filter(Message.chat_id == chat.id)
        .order_by(Message.id.desc())
        .limit(settings.MAX_HISTORY)
        .all()
    )
    history = [{"role": m.role, "content": m.content} for m in reversed(recent)]

    question = payload.content.strip()
    db.add(Message(chat_id=chat.id, role="user", content=question))
    if chat.title == "New chat":
        chat.title = question[:60] + ("…" if len(question) > 60 else "")
    chat.updated_at = utcnow()
    db.commit()

    query_vector = embeddings.embed_query(retrieval_query(question, history))
    hits = retrieval.search(db, list(filenames), query_vector, settings.TOP_K)
    sources = [
        Source(
            document_id=h["document_id"],
            filename=filenames[h["document_id"]],
            page=h["page"],
            text=h["text"],
            score=round(h["score"], 4),
        ).model_dump()
        for h in hits
        if h["score"] >= settings.MIN_SCORE
    ]

    def events() -> Iterator[str]:
        parts: list[str] = []
        saved = False

        def save(content: str) -> int:
            with SessionLocal() as s:
                message = Message(chat_id=chat_id, role="assistant", content=content, sources=sources or None)
                s.add(message)
                s.execute(update(Chat).where(Chat.id == chat_id).values(updated_at=utcnow()))
                s.commit()
                return message.id

        try:
            yield sse("sources", sources)
            if not sources:  # nothing relevant: don't spend an LLM call
                parts.append(llm.NOT_FOUND)
                yield sse("token", llm.NOT_FOUND)
            else:
                try:
                    for delta in llm.stream_answer(question, sources, history):
                        parts.append(delta)
                        yield sse("token", delta)
                except Exception:
                    log.exception("LLM request failed")
                    yield sse("error", {"detail": "The language model request failed. Check the LLM settings and try again."})
                    return
            message_id = save("".join(parts).strip() or llm.NOT_FOUND)
            saved = True
            yield sse("done", {"message_id": message_id})
        finally:
            # Client stopped the stream (or the LLM failed mid-way): keep what was written.
            if not saved and "".join(parts).strip():
                save("".join(parts).strip() + " …")

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
