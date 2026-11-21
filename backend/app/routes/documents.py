from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import get_current_user
from app.db.database import get_db
from app.models.document import Document, DocumentFile
from app.models.schemas import DocumentOut
from app.models.user import User
from app.services.ingestion import IngestionError, create_document, process_document

router = APIRouter(prefix="/documents", tags=["documents"])


def get_owned_document(db: Session, document_id: str, user: User) -> Document:
    document = db.query(Document).filter(Document.id == document_id, Document.user_id == user.id).first()
    if document is None:  # same answer for other users' documents, so IDs don't leak
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.post("", response_model=DocumentOut, status_code=status.HTTP_202_ACCEPTED)
def upload_document(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Store the PDF and return immediately; parsing and embedding run in the background.
    Poll GET /documents until status is 'ready' or 'failed'."""
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    data = file.file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File is larger than {settings.MAX_UPLOAD_MB} MB")
    try:
        document = create_document(db, current_user.id, file.filename, data)
    except IngestionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    background.add_task(process_document, document.id)
    return document


@router.get("", response_model=list[DocumentOut])
def list_documents(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Document)
        .filter(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
        .all()
    )


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_owned_document(db, document_id, current_user)


@router.get("/{document_id}/file", response_class=Response)
def download_document(
    document_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    document = get_owned_document(db, document_id, current_user)
    file = db.get(DocumentFile, document.id)
    return Response(
        content=file.data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(document.filename)}",
            "Cache-Control": "private, max-age=3600",
        },
    )


@router.post("/{document_id}/retry", response_model=DocumentOut, status_code=status.HTTP_202_ACCEPTED)
def retry_document(
    document_id: str,
    background: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = get_owned_document(db, document_id, current_user)
    if document.status != "failed":
        raise HTTPException(status_code=409, detail="Only failed documents can be retried")
    document.status, document.error = "processing", None
    db.commit()
    background.add_task(process_document, document.id)
    return document


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    get_owned_document(db, document_id, current_user)
    # ON DELETE CASCADE removes the stored file and all chunks.
    db.execute(delete(Document).where(Document.id == document_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
