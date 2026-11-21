from conftest import PLANTS_PDF, new_user, upload
from pdf_utils import make_pdf

from app.db.database import SessionLocal
from app.models.document import Chunk, DocumentFile


def test_upload_rejects_non_pdf(client, auth_headers):
    r = upload(client, auth_headers, "notes.pdf", b"just some text")
    assert r.status_code == 400
    assert "not a valid PDF" in r.json()["detail"]


def test_upload_is_processed_in_background(client, auth_headers):
    r = upload(client, auth_headers, "../../etc/plants.pdf", PLANTS_PDF)
    assert r.status_code == 202
    doc = r.json()
    assert doc["status"] == "processing"
    assert doc["filename"] == "plants.pdf"  # path components stripped
    assert doc["size_bytes"] == len(PLANTS_PDF)

    # TestClient runs background tasks before returning, so it's ready now.
    listed = client.get("/documents", headers=auth_headers).json()
    assert len(listed) == 1
    assert listed[0]["status"] == "ready"
    assert listed[0]["num_pages"] == 2 and listed[0]["num_chunks"] == 2


def test_pdf_without_text_fails_and_can_be_retried(client, auth_headers):
    doc = upload(client, auth_headers, "blank.pdf", make_pdf([""])).json()
    failed = client.get(f"/documents/{doc['id']}", headers=auth_headers).json()
    assert failed["status"] == "failed"
    assert "No readable text" in failed["error"]

    r = client.post(f"/documents/{doc['id']}/retry", headers=auth_headers)
    assert r.status_code == 202
    assert client.get(f"/documents/{doc['id']}", headers=auth_headers).json()["status"] == "failed"


def test_retry_only_failed_documents(client, auth_headers):
    doc = upload(client, auth_headers, "plants.pdf", PLANTS_PDF).json()
    assert client.post(f"/documents/{doc['id']}/retry", headers=auth_headers).status_code == 409


def test_download_original_file(client, auth_headers):
    doc = upload(client, auth_headers, "plants.pdf", PLANTS_PDF).json()
    r = client.get(f"/documents/{doc['id']}/file", headers=auth_headers)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content == PLANTS_PDF


def test_delete_removes_file_and_chunks(client, auth_headers):
    doc = upload(client, auth_headers, "plants.pdf", PLANTS_PDF).json()
    with SessionLocal() as db:
        assert db.query(Chunk).filter(Chunk.document_id == doc["id"]).count() == 2

    assert client.delete(f"/documents/{doc['id']}", headers=auth_headers).status_code == 204
    assert client.get("/documents", headers=auth_headers).json() == []
    with SessionLocal() as db:
        assert db.query(Chunk).filter(Chunk.document_id == doc["id"]).count() == 0
        assert db.get(DocumentFile, doc["id"]) is None


def test_users_cannot_access_each_others_documents(client, auth_headers):
    doc = upload(client, auth_headers, "plants.pdf", PLANTS_PDF).json()
    intruder = new_user(client)

    assert client.get("/documents", headers=intruder).json() == []
    assert client.get(f"/documents/{doc['id']}", headers=intruder).status_code == 404
    assert client.get(f"/documents/{doc['id']}/file", headers=intruder).status_code == 404
    assert client.delete(f"/documents/{doc['id']}", headers=intruder).status_code == 404
