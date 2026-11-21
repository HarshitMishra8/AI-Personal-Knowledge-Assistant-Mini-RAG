"use client";

import { GoogleLogin } from "@react-oauth/google";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/logo";
import { GOOGLE_CLIENT_ID } from "@/components/providers";
import { Button, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/utils";

type Mode = "login" | "signup";

function safeNext(next: string | null): string {
  // Only allow same-site paths, so ?next= can't send people to another website.
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/chat";
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { status, signIn } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  async function finish(token: string) {
    await signIn(token);
    router.replace(next);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { access_token } =
        mode === "signup"
          ? await api.register({ email, password, name: name.trim() || undefined })
          : await api.login(email, password);
      await finish(access_token);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  async function onGoogle(credential: string | undefined) {
    if (!credential) return setError("Google sign-in didn't return a credential. Try again.");
    setError(null);
    try {
      const { access_token } = await api.googleLogin(credential);
      await finish(access_token);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const isSignup = mode === "signup";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-5 sm:px-8">
        <Logo />
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-8 sm:pt-16">
        <div className="w-full max-w-[400px]">
          <h1 className="text-[28px] font-semibold tracking-tight">
            {isSignup ? "Create your library" : "Welcome back"}
          </h1>
          <p className="mt-2 text-graphite">
            {isSignup
              ? "Free, and your documents stay private to your account."
              : "Sign in to keep asking your documents."}
          </p>

          {GOOGLE_CLIENT_ID && (
            <>
              <div className="mt-8 flex justify-center">
                <GoogleLogin
                  onSuccess={(response) => void onGoogle(response.credential)}
                  onError={() => setError("Google sign-in was cancelled or failed. Try again.")}
                  text={isSignup ? "signup_with" : "continue_with"}
                  shape="rectangular"
                  width="400"
                />
              </div>
              <div className="my-6 flex items-center gap-3 text-sm text-graphite">
                <span className="h-px flex-1 bg-rule" />
                or with email
                <span className="h-px flex-1 bg-rule" />
              </div>
            </>
          )}

          <form onSubmit={onSubmit} className={GOOGLE_CLIENT_ID ? "space-y-4" : "mt-8 space-y-4"} noValidate={false}>
            {isSignup && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Name</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Email</span>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Password</span>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={isSignup ? 8 : undefined}
                required
              />
              {isSignup && <span className="mt-1.5 block text-sm text-graphite">At least 8 characters.</span>}
            </label>

            {error && (
              <p role="alert" className="rounded-lg bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" loading={submitting}>
              {isSignup ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-graphite">
            {isSignup ? "Already have an account? " : "New to Pagewise? "}
            <Link
              href={`${isSignup ? "/login" : "/signup"}${next !== "/chat" ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="font-medium text-accent hover:underline"
            >
              {isSignup ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
