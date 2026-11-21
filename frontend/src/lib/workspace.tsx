"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { api, type Chat, type DocumentItem } from "@/lib/api";
import { errorMessage } from "@/lib/utils";

type WorkspaceContextValue = {
  documents: DocumentItem[] | null; // null while loading
  chats: Chat[] | null;
  refreshDocuments: () => Promise<void>;
  refreshChats: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null);
  const [chats, setChats] = useState<Chat[] | null>(null);
  const previousStatus = useRef(new Map<string, DocumentItem["status"]>());

  const refreshDocuments = useCallback(async () => {
    try {
      const next = await api.listDocuments();
      // Tell the user when a background upload finishes.
      for (const doc of next) {
        const before = previousStatus.current.get(doc.id);
        if (before === "processing" && doc.status === "ready") toast.success(`${doc.filename} is ready`);
        if (before === "processing" && doc.status === "failed")
          toast.error(`${doc.filename} couldn't be processed`, { description: doc.error ?? undefined });
      }
      previousStatus.current = new Map(next.map((d) => [d.id, d.status]));
      setDocuments(next);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);

  const refreshChats = useCallback(async () => {
    try {
      setChats(await api.listChats());
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void refreshDocuments();
    void refreshChats();
  }, [refreshDocuments, refreshChats]);

  // Poll while anything is still processing.
  const processing = documents?.some((d) => d.status === "processing") ?? false;
  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => void refreshDocuments(), 2000);
    return () => window.clearInterval(timer);
  }, [processing, refreshDocuments]);

  const value = useMemo(
    () => ({ documents, chats, refreshDocuments, refreshChats }),
    [documents, chats, refreshDocuments, refreshChats],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return context;
}
