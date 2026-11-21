"""Split page text into overlapping, roughly fixed-size chunks.

Chunks never cross a page boundary, so every chunk can be cited with a page number.
Boundaries prefer sentence ends, then spaces, so words are never cut in half.
"""

import re
from dataclasses import dataclass


@dataclass
class Chunk:
    text: str
    page: int  # 1-based
    chunk_index: int


def split_text(text: str, chunk_size: int = 800, overlap: int = 150) -> list[str]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if not 0 <= overlap < chunk_size // 2:
        raise ValueError("overlap must be between 0 and chunk_size / 2")

    text = re.sub(r"\s+", " ", text).strip()
    n = len(text)
    chunks: list[str] = []
    start = 0

    while start < n:
        end = min(start + chunk_size, n)
        if end < n:
            # Prefer to end on a sentence boundary in the second half of the window...
            sentence_end = text.rfind(". ", start, end)
            if sentence_end > start + chunk_size // 2:
                end = sentence_end + 1
            else:
                # ...otherwise on a space, so words stay whole.
                space = text.rfind(" ", start, end)
                if space > start + chunk_size // 2:
                    end = space

        piece = text[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= n:
            break

        # Step back by `overlap` characters, then forward to the next word start.
        start = end - overlap
        space = text.find(" ", start, end)
        if overlap and space != -1:
            start = space + 1

    return chunks


def chunk_pages(pages: list[str], chunk_size: int = 800, overlap: int = 150) -> list[Chunk]:
    chunks: list[Chunk] = []
    for page_number, page_text in enumerate(pages, start=1):
        for piece in split_text(page_text or "", chunk_size, overlap):
            chunks.append(Chunk(text=piece, page=page_number, chunk_index=len(chunks)))
    return chunks
