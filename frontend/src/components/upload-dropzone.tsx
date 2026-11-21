"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { cn, errorMessage } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

const MAX_MB = 20;

export function UploadDropzone({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { refreshDocuments } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    for (const file of list) {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        toast.error(`${file.name} isn't a PDF`, { description: "Only PDF files can be added." });
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        toast.error(`${file.name} is larger than ${MAX_MB} MB`);
        continue;
      }
      setUploading(file.name);
      try {
        await api.uploadDocument(file);
        await refreshDocuments(); // shows it as "processing" and starts polling
      } catch (err) {
        toast.error(`Couldn't upload ${file.name}`, { description: errorMessage(err) });
      }
    }
    setUploading(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
      className={cn(
        "rounded-xl border-2 border-dashed text-center transition-colors",
        dragging ? "border-accent bg-accent/5" : "border-rule bg-surface",
        compact ? "px-5 py-6" : "px-6 py-10",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={(e) => e.target.files && void upload(e.target.files)}
        aria-label="Choose PDF files"
      />
      <Upload className="mx-auto h-6 w-6 text-graphite" aria-hidden />
      <p className="mt-3 font-medium">
        {uploading ? `Uploading ${uploading}…` : "Drop PDFs here, or "}
        {!uploading && (
          <button type="button" onClick={() => inputRef.current?.click()} className="text-accent hover:underline">
            choose files
          </button>
        )}
      </p>
      <p className="mt-1 text-sm text-graphite">Text-based PDFs up to {MAX_MB} MB. Scanned pages without text can&apos;t be read yet.</p>
    </div>
  );
}
