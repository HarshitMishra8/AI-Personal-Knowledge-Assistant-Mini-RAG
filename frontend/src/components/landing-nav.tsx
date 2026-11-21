"use client";

import Link from "next/link";

import { GITHUB_URL, GitHubIcon } from "@/components/github";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth";

export function LandingNav() {
  const { status } = useAuth();
  return (
    <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
      <Logo />
      <nav className="flex items-center gap-1 sm:gap-2">
        <a
          href={GITHUB_URL}
          className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm text-graphite hover:text-ink sm:inline-flex"
        >
          <GitHubIcon />
          Source
        </a>
        <ThemeToggle />
        {status === "authenticated" ? (
          <Link href="/chat" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hover">
            Open your library
          </Link>
        ) : (
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-subtle">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
