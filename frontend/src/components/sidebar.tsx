"use client";

import { Check, FileText, LogOut, MessageSquarePlus, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, Spinner } from "@/components/ui";
import { api, type Chat } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, errorMessage } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

function ChatRow({ chat, active, onNavigate }: { chat: Chat; active: boolean; onNavigate: () => void }) {
  const { refreshChats } = useWorkspace();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chat.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function rename() {
    const next = title.trim();
    setEditing(false);
    if (!next || next === chat.title) return setTitle(chat.title);
    try {
      await api.updateChat(chat.id, { title: next });
      await refreshChats();
    } catch (err) {
      toast.error(errorMessage(err));
      setTitle(chat.title);
    }
  }

  async function remove() {
    try {
      await api.deleteChat(chat.id);
      if (active) router.push("/chat");
      await refreshChats();
      toast.success("Chat deleted");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (editing) {
    return (
      <form
        className="flex items-center gap-1 rounded-lg bg-subtle px-2 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          void rename();
        }}
      >
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setTitle(chat.title);
              setEditing(false);
            }
          }}
          maxLength={200}
          aria-label="Chat title"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none"
        />
        <Button type="submit" variant="ghost" size="icon" className="h-7 w-7" aria-label="Save title">
          <Check className="h-4 w-4" />
        </Button>
      </form>
    );
  }

  return (
    <div className={cn("group relative flex items-center rounded-lg", active ? "bg-subtle" : "hover:bg-subtle/70")}>
      <Link
        href={`/chat?c=${chat.id}`}
        onClick={onNavigate}
        className={cn("min-w-0 flex-1 truncate py-2 pl-3 pr-16 text-sm", active ? "font-medium text-ink" : "text-ink/80")}
        title={chat.title}
      >
        {chat.title}
      </Link>
      <div
        className={cn(
          "absolute right-1 flex items-center",
          confirmDelete ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
        )}
      >
        {confirmDelete ? (
          <>
            <Button variant="danger" size="sm" className="h-7 px-2" onClick={() => void remove()}>
              Delete
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfirmDelete(false)} aria-label="Keep chat">
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                setTitle(chat.title);
                setEditing(true);
              }}
              aria-label="Rename chat">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfirmDelete(true)} aria-label="Delete chat">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { user, signOut } = useAuth();
  const { chats, documents } = useWorkspace();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeChatId = pathname === "/chat" ? params.get("c") : null;

  const processing = documents?.filter((d) => d.status === "processing").length ?? 0;
  const displayName = user?.name || user?.email || "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <Logo href="/chat" />
      </div>

      <div className="px-3">
        <Link
          href="/chat"
          onClick={onNavigate}
          className="flex h-10 items-center gap-2 rounded-lg border border-rule bg-paper px-3 text-sm font-medium hover:bg-subtle"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </Link>
        <Link
          href="/documents"
          onClick={onNavigate}
          className={cn(
            "mt-1 flex h-10 items-center gap-2 rounded-lg px-3 text-sm",
            pathname === "/documents" ? "bg-subtle font-medium" : "text-ink/80 hover:bg-subtle/70",
          )}
        >
          <FileText className="h-4 w-4" />
          <span className="flex-1">Documents</span>
          {processing > 0 ? (
            <Spinner className="h-3.5 w-3.5" label={`${processing} processing`} />
          ) : (
            documents && <span className="text-xs text-graphite">{documents.length}</span>
          )}
        </Link>
      </div>

      <nav className="mt-5 min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Chats">
        <h2 className="px-3 pb-1.5 text-xs font-medium text-graphite">Recent chats</h2>
        {chats === null ? (
          <div className="px-3 py-2">
            <Spinner className="h-4 w-4" />
          </div>
        ) : chats.length === 0 ? (
          <p className="px-3 py-2 text-sm text-graphite">Your conversations will show up here.</p>
        ) : (
          <div className="space-y-0.5">
            {chats.map((chat) => (
              <ChatRow key={chat.id} chat={chat} active={chat.id === activeChatId} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </nav>

      <div className="flex items-center gap-2 border-t border-rule px-3 py-3">
        {user?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-sm font-semibold text-paper">
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user?.name || "Your account"}</p>
          <p className="truncate text-xs text-graphite">{user?.email}</p>
        </div>
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
          <LogOut className="h-[18px] w-[18px]" />
        </Button>
      </div>
    </div>
  );
}
