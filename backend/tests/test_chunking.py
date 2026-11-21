import pytest

from app.services.chunking import chunk_pages, split_text


def test_short_text_is_one_chunk():
    assert split_text("Hello   world.\n\nSecond line.") == ["Hello world. Second line."]


def test_empty_text_gives_no_chunks():
    assert split_text("   \n\t ") == []


def test_long_text_is_split_with_overlap_and_whole_words():
    words = [f"word{i}" for i in range(400)]
    text = " ".join(words)
    chunks = split_text(text, chunk_size=200, overlap=40)

    assert len(chunks) > 1
    assert all(len(c) <= 200 for c in chunks)
    # No word is cut in half.
    assert all(token in set(words) for c in chunks for token in c.split())
    # Consecutive chunks overlap.
    for a, b in zip(chunks, chunks[1:]):
        assert a.split()[-1] in b.split()
    # Nothing is lost.
    covered = {token for c in chunks for token in c.split()}
    assert covered == set(words)


def test_prefers_sentence_boundaries():
    text = ("This is a sentence about things. " * 20).strip()
    chunks = split_text(text, chunk_size=120, overlap=20)
    assert all(c.endswith(".") for c in chunks[:-1])


def test_pages_keep_page_numbers_and_skip_blank_pages():
    chunks = chunk_pages(["First page text.", "", "Third page text."])
    assert [(c.page, c.text) for c in chunks] == [(1, "First page text."), (3, "Third page text.")]
    assert [c.chunk_index for c in chunks] == [0, 1]


def test_rejects_bad_overlap():
    with pytest.raises(ValueError):
        split_text("abc", chunk_size=100, overlap=60)
