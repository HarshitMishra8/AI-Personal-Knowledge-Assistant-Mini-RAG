"use client";

import { CircleAlert, Eye, FileText, MessageSquare, RotateCw, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import type { PdfTarget } from "@/components/pdf-viewer";
import { Button, Spinner } from "@/components/ui";
import { UploadDropzone } from "@/components/upload-dropzone";
import { api, type DocumentItem } from "@/lib/api";
import { errorMessage, formatBytes, timeAgo } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

const PdfViewer = dynamic(() => import("@/components/pdf-viewer"), { ssr: false });

function StatusLine({ doc }: { doc: DocumentItem }) {
  if (doc.status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-graphite">
        <Spinner className="h-3.5 w-3.5" /> Reading and indexing…
      </span>
    );
  }
  if (doc.status === "failed") {
    return (
      <span className="inline-flex items-start gap-1.5 text-danger">
        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {doc.error ?? "Processing failed."}
      </span>
    );
  }
  return (
    <span className="text-graphite">
      {doc.num_pages} {doc.num_pages === 1 ? "page" : "pages"}, {formatBytes(doc.size_bytes)}, added {timeAgo(doc.created_at)}
    </span>
  );
}

function DocumentRow({ doc, onView }: { doc: DocumentItem; onView: (doc: DocumentItem) => void }) {
  const router = useRouter();
  const { refreshDocuments, refreshChats } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4">
      <FileText className="h-5 w-5 shrink-0 text-graphite" aria-hidden />
      <div className="min-w-0 flex-1 basis-60">
        <p className="truncate font-medium" title={doc.filename}>
          {doc.filename}
        </p>
        <p className="mt-0.5 text-sm">
          <StatusLine doc={doc} />
        </p>
      </div>

      <div className="flex items-center gap-1">
        {doc.status === "ready" && (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const chat = await api.createChat({ document_ids: [doc.id], title: `About ${doc.filename}` });
                  await refreshChats();
                  router.push(`/chat?c=${chat.id}`);
                })
              }
            >
              <MessageSquare className="h-4 w-4" /> Ask about it
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onView(doc)} aria-label={`View ${doc.filename}`}>
              <Eye className="h-4 w-4" />
            </Button>
          </>
        )}
        {doc.status === "failed" && (
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() =>
              void run(async () => {
                await api.retryDocument(doc.id);
                await refreshDocuments();
              })
            }
          >
            {!busy && <RotateCw className="h-4 w-4" />} Retry
          </Button>
        )}
        {confirmDelete ? (
          <>
            <Button
              variant="danger"
              size="sm"
              loading={busy}
              onClick={() =>
                void run(async () => {
                  await api.deleteDocument(doc.id);
                  await refreshDocuments();
                  toast.success(`${doc.filename} deleted`);
                })
              }
            >
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${doc.filename}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

export function DocumentsView() {
  const { documents } = useWorkspace();
  const [viewer, setViewer] = useState<PdfTarget | null>(null);

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-5 py-10">
          <h1 className="text-3xl font-semibold tracking-tight">Documents</h1>
          <p className="mt-2 text-graphite">
            Everything you add here can be searched in your chats. Deleting a document also removes it from future
            answers.
          </p>

          <UploadDropzone compact className="mt-8" />

          {documents === null ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : documents.length === 0 ? (
            <p className="py-10 text-center text-graphite">No documents yet. Add your first PDF above.</p>
          ) : (
            <ul className="mt-6 divide-y divide-rule border-y border-rule">
              {documents.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  onView={(d) => setViewer({ documentId: d.id, filename: d.filename, page: 1 })}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {viewer && (
        <aside className="fixed inset-0 z-50 border-l border-rule lg:static lg:z-auto lg:w-[min(46%,680px)] lg:shrink-0">
          <PdfViewer target={viewer} onClose={() => setViewer(null)} />
        </aside>
      )}
    </div>
  );
}
