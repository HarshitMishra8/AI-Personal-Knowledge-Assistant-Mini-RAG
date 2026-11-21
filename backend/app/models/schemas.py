from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, field_validator


def _as_utc(value: datetime) -> datetime:
    # SQLite returns naive datetimes; they are stored in UTC, so label them as such
    # so the browser doesn't read them as local time.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


UTCDatetime = Annotated[datetime, AfterValidator(_as_utc)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str | None = Field(default=None, max_length=100)

    @field_validator("password")
    @classmethod
    def bcrypt_limit(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:  # bcrypt only uses the first 72 bytes
            raise ValueError("Password must be at most 72 bytes.")
        return v


class GoogleLogin(BaseModel):
    credential: str = Field(min_length=10, max_length=4096)


class UserOut(ORMModel):
    id: int
    email: EmailStr
    name: str | None
    avatar_url: str | None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- Documents ----------

class DocumentOut(ORMModel):
    id: str
    filename: str
    size_bytes: int
    status: Literal["processing", "ready", "failed"]
    error: str | None
    num_pages: int | None
    num_chunks: int | None
    created_at: UTCDatetime


# ---------- Chats ----------

class Source(BaseModel):
    document_id: str
    filename: str
    page: int
    text: str
    score: float


class ChatCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    document_ids: list[str] = Field(default_factory=list, max_length=100)


class ChatUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    document_ids: list[str] | None = Field(default=None, max_length=100)


class ChatOut(ORMModel):
    id: str
    title: str
    document_ids: list[str]
    created_at: UTCDatetime
    updated_at: UTCDatetime


class MessageOut(ORMModel):
    id: int
    role: Literal["user", "assistant"]
    content: str
    sources: list[Source] | None
    created_at: UTCDatetime


class ChatDetail(ChatOut):
    messages: list[MessageOut]


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
