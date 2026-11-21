// Typed client for the FastAPI backend.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

// ---------- Types (mirror backend/app/models/schemas.py) ----------

export type User = { id: number; email: string; name: string | null; avatar_url: string | null };

export type DocumentStatus = "processing" | "ready" | "failed";

export type DocumentItem = {
  id: string;
  filename: string;
  size_bytes: number;
  status: DocumentStatus;
  error: string | null;
  num_pages: number | null;
  num_chunks: number | null;
  created_at: string;
};

export type Source = { document_id: string; filename: string; page: number; text: string; score: number };

export type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: Source[] | null;
  created_at: string;
};

export type Chat = { id: string; title: string; document_ids: string[]; created_at: string; updated_at: string };
export type ChatDetail = Chat & { messages: Message[] };

type Token = { access_token: string; token_type: string };

// ---------- Token storage ----------

const TOKEN_KEY = "pagewise-token";

export const tokenStore = {
  get(): string | null {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable (private mode): the session lasts until reload */
    }
  },
  clear() {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export const AUTH_EXPIRED_EVENT = "pagewise:auth-expired";

// ---------- Errors ----------

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const NETWORK_ERROR = "Can't reach the server. Check that the backend is running, then try again.";

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d.msg ?? "Invalid input").join("; ");
  } catch {
    /* not JSON */
  }
  return `Request failed (${res.status})`;
}

function authHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  const token = tokenStore.get();
  if (token) result.set("Authorization", `Bearer ${token}`);
  return result;
}

function handleUnauthorized(res: Response) {
  if (res.status === 401 && tokenStore.get()) {
    tokenStore.clear();
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers: authHeaders(init.headers) });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }
  if (!res.ok) {
    handleUnauthorized(res);
    throw new ApiError(res.status, await parseError(res));
  }
  return res;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await send(path, init);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// ---------- Endpoints ----------

export const api = {
  register: (body: { email: string; password: string; name?: string }) =>
    request<Token>("/auth/register", json("POST", body)),
  login: (email: string, password: string) =>
    request<Token>("/auth/login", { method: "POST", body: new URLSearchParams({ username: email, password }) }),
  googleLogin: (credential: string) => request<Token>("/auth/google", json("POST", { credential })),
  me: () => request<User>("/auth/me"),

  listDocuments: () => request<DocumentItem[]>("/documents"),
  uploadDocument: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DocumentItem>("/documents", { method: "POST", body: form });
  },
  retryDocument: (id: string) => request<DocumentItem>(`/documents/${id}/retry`, { method: "POST" }),
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, { method: "DELETE" }),
  downloadDocument: async (id: string) => (await send(`/documents/${id}/file`)).blob(),

  listChats: () => request<Chat[]>("/chats"),
  getChat: (id: string) => request<ChatDetail>(`/chats/${id}`),
  createChat: (body: { document_ids: string[]; title?: string }) => request<Chat>("/chats", json("POST", body)),
  updateChat: (id: string, body: { title?: string; document_ids?: string[] }) =>
    request<Chat>(`/chats/${id}`, json("PATCH", body)),
  deleteChat: (id: string) => request<void>(`/chats/${id}`, { method: "DELETE" }),
};

// ---------- Streaming answers (Server-Sent Events over a POST) ----------

export type StreamHandlers = {
  onSources?: (sources: Source[]) => void;
  onToken?: (text: string) => void;
  onDone?: (messageId: number) => void;
  onError?: (detail: string) => void;
};

function dispatchEvent(block: string, handlers: StreamHandlers) {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return;
  const payload = JSON.parse(data.join("\n"));
  if (event === "sources") handlers.onSources?.(payload as Source[]);
  else if (event === "token") handlers.onToken?.(payload as string);
  else if (event === "done") handlers.onDone?.((payload as { message_id: number }).message_id);
  else if (event === "error") handlers.onError?.((payload as { detail: string }).detail);
}

/** Ask a question in a chat. Resolves when the stream ends; aborting via `signal` resolves quietly. */
export async function streamMessage(
  chatId: string,
  content: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/chats/${chatId}/messages`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ content }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return;
    throw new ApiError(0, NETWORK_ERROR);
  }
  if (!res.ok || !res.body) {
    handleUnauthorized(res);
    throw new ApiError(res.status, await parseError(res));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        dispatchEvent(buffer.slice(0, boundary), handlers);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) dispatchEvent(buffer, handlers);
  } catch (err) {
    if (signal?.aborted) return;
    throw new ApiError(0, "The connection dropped while the answer was streaming.");
  }
}
