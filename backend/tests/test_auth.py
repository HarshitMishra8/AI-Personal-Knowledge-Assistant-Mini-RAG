import uuid

from app.config import settings
from app.core import security


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["llm_configured"] is False


def test_register_returns_token_and_me_works(client):
    email = f"Me-{uuid.uuid4().hex[:6]}@Example.com"
    r = client.post("/auth/register", json={"email": email, "password": "password123", "name": "Sanvi"})
    assert r.status_code == 201
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()
    assert me["email"] == email.lower()
    assert me["name"] == "Sanvi"


def test_duplicate_email_rejected_case_insensitively(client):
    email = f"dup-{uuid.uuid4().hex[:6]}@example.com"
    assert client.post("/auth/register", json={"email": email, "password": "password123"}).status_code == 201
    r = client.post("/auth/register", json={"email": email.upper(), "password": "password123"})
    assert r.status_code == 400


def test_login(client):
    email = f"login-{uuid.uuid4().hex[:6]}@example.com"
    client.post("/auth/register", json={"email": email, "password": "password123"})
    assert client.post("/auth/login", data={"username": email, "password": "password123"}).status_code == 200
    assert client.post("/auth/login", data={"username": email, "password": "wrong-pass"}).status_code == 401


def test_short_password_rejected(client):
    r = client.post("/auth/register", json={"email": "short@example.com", "password": "short"})
    assert r.status_code == 422


def test_endpoints_require_auth(client):
    assert client.get("/documents").status_code == 401
    assert client.get("/chats").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_google_login_not_configured(client):
    r = client.post("/auth/google", json={"credential": "x" * 50})
    assert r.status_code == 501


def test_google_login_creates_and_links_accounts(client, monkeypatch):
    email = f"g-{uuid.uuid4().hex[:6]}@gmail.com"
    sub = uuid.uuid4().hex
    claims = {"sub": sub, "email": email, "name": "Google User", "picture": "https://example.com/a.png"}
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(security, "verify_google_credential", lambda credential: claims)

    # An existing password account with the same email gets linked, not duplicated.
    client.post("/auth/register", json={"email": email, "password": "password123"})

    first = client.post("/auth/google", json={"credential": "x" * 50})
    assert first.status_code == 200
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {first.json()['access_token']}"}).json()
    assert me["email"] == email and me["name"] == "Google User" and me["avatar_url"]

    second = client.post("/auth/google", json={"credential": "x" * 50})
    me2 = client.get("/auth/me", headers={"Authorization": f"Bearer {second.json()['access_token']}"}).json()
    assert me2["id"] == me["id"]
    # The password still works for the linked account.
    assert client.post("/auth/login", data={"username": email, "password": "password123"}).status_code == 200
