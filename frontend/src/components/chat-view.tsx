"use client";

import { ArrowUp, Square } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { MessageView, type UIMessage } from "@/components/answer";
import type { PdfTarget } from "@/components/pdf-viewer";
import { ScopePicker } from "@/components/scope-picker";
import { Button, Spinner } from "@/components/ui";
import { UploadDropzone } from "@/components/upload-dropzone";
import { api, streamMessage, type Message, type Source } from "@/lib/api";
import { errorMessage, localId } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

const PdfViewer = dynamic(() => import("@/components/pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  ),
});

const SUGGESTIONS = [
  "Summarize the main points",
  "What are the key definitions?",
  "List the important numbers and dates",
];

function toUI(message: Message): UIMessage {
  return { key: `m-${message.id}`, role: message.role, content: message.content, sources: message.sources, status: "done" };
}

export function ChatView() {
  const router = useRouter();
  const params = useSearchParams();
  const urlChatId = params.get("c");
  const { documents, refreshChats } = useWorkspace();

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [scope, setScope] = useState<string[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [viewer, setViewer] = useState<PdfTarget | null>(null);

  const chatIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load the chat named in the URL (or reset for a new one).
  useEffect(() => {
    if (urlChatId === chatIdRef.current) return; // we just created it ourselves
    abortRef.current?.abort();
    setViewer(null);
    setInput("");

    if (!urlChatId) {
      chatIdRef.current = null;
      setMessages([]);
      setScope([]);
      return;
    }

    let cancelled = false;
    setLoadingChat(true);
    api
      .getChat(urlChatId)
      .then((chat) => {
        if (cancelled) return;
        chatIdRef.current = chat.id;
        setMessages(chat.messages.map(toUI));
        setScope(chat.document_ids);
        stickToBottom.current = true;
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(errorMessage(err));
        router.replace("/chat");
      })
      .finally(() => !cancelled && setLoadingChat(false));
    return () => {
      cancelled = true;
    };
  }, [urlChatId, router]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Grow the question box with its content (up to max-h-48).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  // Follow the streaming answer, unless the reader has scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const readyDocuments = documents?.filter((d) => d.status === "ready") ?? [];
  const hasDocuments = (documents?.length ?? 0) > 0;
  const showAskCopy = hasDocuments || documents === null; // don't flash "add a PDF" while loading

  const changeScope = useCallback(async (ids: string[]) => {
    setScope(ids);
    const chatId = chatIdRef.current;
    if (!chatId) return;
    try {
      await api.updateChat(chatId, { document_ids: ids });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);

  const openSource = useCallback((source: Source) => {
    setViewer({ documentId: source.document_id, filename: source.filename, page: source.page, highlight: source.text });
  }, []);

  async function send(text: string) {
    const question = text.trim();
    if (!question || streaming) return;
    if (readyDocuments.length === 0) {
      toast.error("Add a PDF and wait until it's ready before asking.");
      return;
    }

    setStreaming(true);
    let chatId = chatIdRef.current;
    if (!chatId) {
      try {
        const chat = await api.createChat({ document_ids: scope });
        chatId = chat.id;
        chatIdRef.current = chat.id;
        // Update the URL without remounting this view, so the stream below keeps going.
        window.history.replaceState(null, "", `/chat?c=${chat.id}`);
      } catch (err) {
        toast.error(errorMessage(err));
        setStreaming(false);
        return;
      }
    }

    const answerKey = localId("a");
    setInput("");
    stickToBottom.current = true;
    setMessages((prev) => [
      ...prev,
      { key: localId("q"), role: "user", content: question, sources: null, status: "done" },
      { key: answerKey, role: "assistant", content: "", sources: null, status: "streaming" },
    ]);
    const update = (fn: (m: UIMessage) => UIMessage) =>
      setMessages((prev) => prev.map((m) => (m.key === answerKey ? fn(m) : m)));

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamMessage(
        chatId,
        question,
        {
          onSources: (sources) => update((m) => ({ ...m, sources })),
          onToken: (token) => update((m) => ({ ...m, content: m.content + token })),
          onDone: () => update((m) => ({ ...m, status: "done" })),
          onError: (detail) => update((m) => ({ ...m, status: "error", error: detail })),
        },
        controller.signal,
      );
      if (controller.signal.aborted) {
        update((m) => ({ ...m, status: "done", content: m.content ? `${m.content} …` : "_Stopped._" }));
      }
    } catch (err) {
      update((m) => ({ ...m, status: "error", error: errorMessage(err) }));
    } finally {
      update((m) => (m.status === "streaming" ? { ...m, status: "done" } : m));
      abortRef.current = null;
      setStreaming(false);
      void refreshChats();
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-full">
      <section className="flex min-w-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {loadingChat ? (
            <div className="flex justify-center pt-24">
              <Spinner />
            </div>
          ) : empty ? (
            <div className="mx-auto flex max-w-2xl flex-col px-5 pt-[12vh]">
              <h1 className="text-3xl font-semibold tracking-tight">
                {showAskCopy ? "What do you want to find out?" : "Add a PDF to get started"}
              </h1>
              <p className="mt-3 text-graphite">
                {showAskCopy
                  ? "Ask about anything in your documents. Each answer links to the pages it used."
                  : "Once it's processed, ask questions about it here. Answers cite the page they came from."}
              </p>
              {documents === null ? (
                <Spinner className="mt-8" />
              ) : hasDocuments ? (
                <div className="mt-8 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      disabled={readyDocuments.length === 0}
                      className="rounded-full border border-rule bg-surface px-4 py-2 text-sm hover:border-accent/50 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : (
                <UploadDropzone className="mt-8" />
              )}
              {hasDocuments && readyDocuments.length === 0 && (
                <p className="mt-6 flex items-center gap-2 text-sm text-graphite">
                  <Spinner className="h-4 w-4" /> Your documents are still processing.
                </p>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-8 px-5 py-8">
              {messages.map((m) => (
                <MessageView key={m.key} message={m} onOpenSource={openSource} />
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pb-4 pt-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="mx-auto max-w-3xl rounded-2xl border border-rule bg-surface p-2 focus-within:border-accent/60"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={4000}
              placeholder={hasDocuments ? "Ask a question about your documents" : "Add a PDF first, then ask here"}
              aria-label="Your question"
              className="block max-h-48 min-h-11 w-full resize-none bg-transparent px-2.5 py-2.5 text-[15.5px] outline-none placeholder:text-graphite/70"
            />
            <div className="flex items-center justify-between gap-2">
              {documents && documents.length > 0 ? (
                <ScopePicker documents={documents} value={scope} onChange={(ids) => void changeScope(ids)} />
              ) : (
                <Link href="/documents" className="px-2.5 text-sm text-graphite hover:text-ink">
                  Manage documents
                </Link>
              )}
              {streaming ? (
                <Button type="button" size="icon" variant="secondary" onClick={() => abortRef.current?.abort()} aria-label="Stop answering">
                  <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
              ) : (
                <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send question">
                  <ArrowUp className="h-[18px] w-[18px]" />
                </Button>
              )}
            </div>
          </form>
          <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-graphite">
            Answers come only from your documents. Check the cited pages for anything important.
          </p>
        </div>
      </section>

      {viewer && (
        <aside className="fixed inset-0 z-50 border-l border-rule lg:static lg:z-auto lg:w-[min(46%,680px)] lg:shrink-0">
          <PdfViewer target={viewer} onClose={() => setViewer(null)} />
        </aside>
      )}
    </div>
  );
}
