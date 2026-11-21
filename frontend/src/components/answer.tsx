"use client";

import { CircleAlert, Check, Copy } from "lucide-react";
import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { LogoMark } from "@/components/logo";
import type { Source } from "@/lib/api";
import { cn, linkifyCitations } from "@/lib/utils";

export type UIMessage = {
  key: string;
  role: "user" | "assistant";
  content: string;
  sources: Source[] | null;
  status: "streaming" | "done" | "error";
  error?: string;
};

type OpenSource = (source: Source) => void;

function CitationChip({ n, source, onOpen }: { n: number; source?: Source; onOpen: OpenSource }) {
  if (!source) return <sup className="text-graphite">[{n}]</sup>;
  return (
    <button
      type="button"
      onClick={() => onOpen(source)}
      title={`${source.filename}, page ${source.page}`}
      aria-label={`Source ${n}: ${source.filename}, page ${source.page}`}
      className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-highlight px-1 align-[1px] text-[11px] font-semibold text-highlight-ink hover:ring-2 hover:ring-highlight/60"
    >
      {n}
    </button>
  );
}

const AnswerMarkdown = memo(function AnswerMarkdown({
  content,
  sources,
  onOpen,
}: {
  content: string;
  sources: Source[];
  onOpen: OpenSource;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => {
          if (href?.startsWith("#cite-")) {
            const n = Number(href.slice(6));
            return <CitationChip n={n} source={sources[n - 1]} onOpen={onOpen} />;
          }
          return (
            <a href={href} target="_blank" rel="noreferrer" className="text-accent underline">
              {children}
            </a>
          );
        },
      }}
    >
      {linkifyCitations(content)}
    </ReactMarkdown>
  );
});

function SourceList({ sources, onOpen }: { sources: Source[]; onOpen: OpenSource }) {
  return (
    <div className="mt-5">
      <h3 className="text-xs font-medium text-graphite">Sources</h3>
      <ol className="mt-2 grid gap-2 sm:grid-cols-2">
        {sources.map((source, i) => (
          <li key={`${source.document_id}-${source.page}-${i}`}>
            <button
              type="button"
              onClick={() => onOpen(source)}
              className="group block h-full w-full rounded-lg border border-rule bg-surface p-3 text-left hover:border-accent/50"
            >
              <span className="flex items-center gap-2 text-xs text-graphite">
                <span className="flex h-5 min-w-5 items-center justify-center rounded bg-highlight px-1 text-[11px] font-semibold text-highlight-ink">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{source.filename}</span>
                <span className="shrink-0">p. {source.page}</span>
              </span>
              <span className="mt-2 line-clamp-3 font-serif text-[14.5px] leading-snug text-ink/80 group-hover:text-ink">
                {source.text}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-graphite hover:bg-subtle hover:text-ink"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function MessageView({ message, onOpenSource }: { message: UIMessage; onOpenSource: OpenSource }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-subtle px-4 py-2.5 leading-relaxed">
          {message.content}
        </p>
      </div>
    );
  }

  const sources = message.sources ?? [];
  const waiting = message.status === "streaming" && !message.content;

  return (
    <div className="flex gap-3.5">
      <LogoMark className="mt-0.5 h-7 w-7 shrink-0" />
      <div className="min-w-0 flex-1">
        {waiting ? (
          <p className="pt-1 text-graphite">
            {message.sources === null ? "Searching your documents…" : `Found ${sources.length} passages, writing…`}
          </p>
        ) : (
          <div className={cn("answer text-[15.5px]", message.status === "streaming" && "caret")}>
            <AnswerMarkdown content={message.content} sources={sources} onOpen={onOpenSource} />
          </div>
        )}

        {message.status === "error" && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {message.error}
          </p>
        )}

        {sources.length > 0 && message.status !== "streaming" && <SourceList sources={sources} onOpen={onOpenSource} />}

        {message.status === "done" && message.content && (
          <div className="mt-2 -ml-2">
            <CopyButton text={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}
