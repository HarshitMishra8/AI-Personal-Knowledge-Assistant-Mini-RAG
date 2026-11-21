from types import SimpleNamespace

from conftest import PLANTS_PDF, SPACE_PDF, new_user, parse_sse, upload

from app.config import settings
from app.services import llm


def ask(client, headers, chat_id, content):
    r = client.post(f"/chats/{chat_id}/messages", headers=headers, json={"content": content})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/event-stream")
    return parse_sse(r.text)


def new_chat(client, headers, document_ids=()):
    r = client.post("/chats", headers=headers, json={"document_ids": list(document_ids)})
    assert r.status_code == 201, r.text
    return r.json()


def fake_llm(monkeypatch, deltas=None, error=False):
    """Pretend an LLM is configured and capture what it receives."""
    captured = {}

    def create(**kwargs):
        captured.update(kwargs)
        if error:
            raise RuntimeError("provider down")
        return iter(
            SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=d))]) for d in deltas
        )

    fake_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    monkeypatch.setattr(settings, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(llm, "_get_client", lambda: fake_client)
    return captured


# ---------- CRUD ----------

def test_chat_crud(client, auth_headers):
    chat = new_chat(client, auth_headers)
    assert chat["title"] == "New chat" and chat["document_ids"] == []

    r = client.patch(f"/chats/{chat['id']}", headers=auth_headers, json={"title": "Biology notes"})
    assert r.json()["title"] == "Biology notes"
    assert [c["id"] for c in client.get("/chats", headers=auth_headers).json()] == [chat["id"]]

    assert client.delete(f"/chats/{chat['id']}", headers=auth_headers).status_code == 204
    assert client.get(f"/chats/{chat['id']}", headers=auth_headers).status_code == 404


def test_chat_scope_must_be_own_documents(client, auth_headers):
    r = client.post("/chats", headers=auth_headers, json={"document_ids": ["not-a-real-id"]})
    assert r.status_code == 404


def test_asking_without_documents(client, auth_headers):
    chat = new_chat(client, auth_headers)
    r = client.post(f"/chats/{chat['id']}/messages", headers=auth_headers, json={"content": "hi"})
    assert r.status_code == 400


# ---------- asking ----------

def test_answer_streams_sources_and_is_saved(client, auth_headers):
    plants = upload(client, auth_headers, "plants.pdf", PLANTS_PDF).json()
    space = upload(client, auth_headers, "space.pdf", SPACE_PDF).json()
    chat = new_chat(client, auth_headers)

    events = ask(client, auth_headers, chat["id"], "How does chlorophyll absorb sunlight?")
    names = [e for e, _ in events]
    assert names[0] == "sources" and names[-1] == "done"

    sources = events[0][1]
    assert sources and sources[0]["document_id"] == plants["id"]
    assert sources[0]["filename"] == "plants.pdf" and sources[0]["page"] == 1
    assert all(s["document_id"] != space["id"] for s in sources)
    answer = "".join(d for e, d in events if e == "token")
    assert answer == llm.NOT_CONFIGURED  # no LLM key in tests

    detail = client.get(f"/chats/{chat['id']}", headers=auth_headers).json()
    assert detail["title"] == "How does chlorophyll absorb sunlight?"
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assert detail["messages"][1]["sources"][0]["document_id"] == plants["id"]


def test_scoped_chat_with_nothing_relevant_skips_the_llm(client, auth_headers, monkeypatch):
    upload(client, auth_headers, "plants.pdf", PLANTS_PDF)
    space = upload(client, auth_headers, "space.pdf", SPACE_PDF).json()
    captured = fake_llm(monkeypatch, deltas=["should not be called"])
    chat = new_chat(client, auth_headers, [space["id"]])

    events = ask(client, auth_headers, chat["id"], "How does chlorophyll absorb sunlight?")
    assert events[0] == ("sources", [])
    assert ("token", llm.NOT_FOUND) in events
    assert captured == {}


def test_llm_gets_context_and_history(client, auth_headers, monkeypatch):
    upload(client, auth_headers, "plants.pdf", PLANTS_PDF)
    chat = new_chat(client, auth_headers)

    fake_llm(monkeypatch, deltas=["Plants ", "make glucose [1]."])
    events = ask(client, auth_headers, chat["id"], "Tell me about chlorophyll and plants")
    assert "".join(d for e, d in events if e == "token") == "Plants make glucose [1]."

    captured = fake_llm(monkeypatch, deltas=["Oxygen [1]."])
    ask(client, auth_headers, chat["id"], "What gas do plants release?")

    messages = captured["messages"]
    assert captured["stream"] is True
    assert messages[0]["role"] == "system"
    assert messages[1] == {"role": "user", "content": "Tell me about chlorophyll and plants"}
    assert messages[2] == {"role": "assistant", "content": "Plants make glucose [1]."}
    assert "[1] (plants.pdf, page" in messages[-1]["content"]
    assert "What gas do plants release?" in messages[-1]["content"]


def test_llm_failure_sends_error_event(client, auth_headers, monkeypatch):
    upload(client, auth_headers, "plants.pdf", PLANTS_PDF)
    chat = new_chat(client, auth_headers)
    fake_llm(monkeypatch, error=True)

    events = ask(client, auth_headers, chat["id"], "How does chlorophyll absorb sunlight?")
    assert events[-1][0] == "error"
    roles = [m["role"] for m in client.get(f"/chats/{chat['id']}", headers=auth_headers).json()["messages"]]
    assert roles == ["user"]  # nothing half-written was saved


def test_users_cannot_access_each_others_chats(client, auth_headers):
    upload(client, auth_headers, "plants.pdf", PLANTS_PDF)
    chat = new_chat(client, auth_headers)
    intruder = new_user(client)

    assert client.get("/chats", headers=intruder).json() == []
    assert client.get(f"/chats/{chat['id']}", headers=intruder).status_code == 404
    r = client.post(f"/chats/{chat['id']}/messages", headers=intruder, json={"content": "oxygen"})
    assert r.status_code == 404
