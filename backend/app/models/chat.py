from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.database import Base
from app.models.user import utcnow


class Chat(Base):
    __tablename__ = "chats"

    id = Column(String(36), primary_key=True)  # uuid4
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title = Column(String(200), nullable=False, default="New chat")
    document_ids = Column(JSON, nullable=False, default=list)  # empty = all of the user's documents
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    messages = relationship("Message", order_by="Message.id", passive_deletes=True)


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True)
    chat_id = Column(String(36), ForeignKey("chats.id", ondelete="CASCADE"), index=True, nullable=False)
    role = Column(String(16), nullable=False)  # user | assistant
    content = Column(Text, nullable=False)
    sources = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
