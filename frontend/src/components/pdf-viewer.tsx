"use client";

// Loaded with next/dynamic({ ssr: false }): pdf.js only runs in the browser.

import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { Button, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/utils";

// Worker from the CDN at exactly the version react-pdf bundles, so they can never mismatch.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Downloaded PDFs, kept for the session so reopening a citation is instant.
const fileCache = new Map<string, Promise<string>>();

function loadFile(documentId: string): Promise<string> {
  let url = fileCache.get(documentId);
  if (!url) {
    url = api.downloadDocument(documentId).then((blob) => URL.createObjectURL(blob));
    url.catch(() => fileCache.delete(documentId));
    fileCache.set(documentId, url);
  }
  return url;
}

const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type PdfTarget = { documentId: string; filename: string; page: number; highlight?: string };

export default function PdfViewer({ target, onClose }: { target: PdfTarget; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [page, setPage] = useState(target.page);
  const [width, setWidth] = useState(560);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(null);
    loadFile(target.documentId)
      .then((u) => !cancelled && setUrl(u))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [target.documentId]);

  useEffect(() => setPage(target.page), [target.page, target.documentId]);

  // Fit the page to the panel width.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width) - 32)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Highlight the text items on the cited page that belong to the cited passage.
  const passage = useMemo(() => normalise(target.highlight ?? ""), [target.highlight]);
  const renderText = useCallback(
    ({ str }: { str: string }) => {
      const item = normalise(str);
      if (passage && page === target.page && item.length >= 4 && passage.includes(item)) {
        return `<mark>${escapeHtml(str)}</mark>`;
      }
      return escapeHtml(str);
    },
    [passage, page, target.page],
  );

  const documentOptions = useMemo(() => ({ isEvalSupported: false }), []);

  return (
    <div className="flex h-full flex-col bg-subtle">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-rule bg-surface px-3">
        <div className="min-w-0 flex-1 pl-1">
          <p className="truncate text-sm font-medium" title={target.filename}>
            {target.filename}
          </p>
          <p className="text-xs text-graphite">
            Page {page}
            {numPages ? ` of ${numPages}` : ""}
            {page === target.page && target.highlight ? ", cited passage highlighted" : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPage((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))}
          disabled={numPages !== null && page >= numPages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {url && (
          <a
            href={`${url}#page=${page}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-graphite hover:bg-subtle hover:text-ink"
            aria-label="Open the PDF in a new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close document">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto p-4">
        {error ? (
          <p className="mx-auto mt-10 max-w-sm text-center text-sm text-danger">{error}</p>
        ) : !url ? (
          <div className="flex justify-center pt-16">
            <Spinner />
          </div>
        ) : (
          <Document
            file={url}
            options={documentOptions}
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n);
              setPage((p) => Math.min(Math.max(1, p), n));
            }}
            onLoadError={(err) => setError(`Couldn't open this PDF: ${err.message}`)}
            loading={
              <div className="flex justify-center pt-16">
                <Spinner />
              </div>
            }
          >
            <Page
              key={page}
              pageNumber={page}
              width={width}
              className="pdf-page mx-auto w-fit overflow-hidden rounded shadow-[0_12px_30px_-18px_rgba(20,33,61,0.5)]"
              customTextRenderer={renderText}
              renderAnnotationLayer={false}
              loading={<div style={{ width, height: width * 1.3 }} className="mx-auto rounded bg-surface" />}
            />
          </Document>
        )}
      </div>
    </div>
  );
}
