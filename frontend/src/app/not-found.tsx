import Link from "next/link";

import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center px-6">
      <Logo />
      <h1 className="mt-10 text-3xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
      <p className="mt-3 text-graphite">The link may be broken, or the page may have moved.</p>
      <Link href="/" className="mt-8 rounded-lg bg-accent px-5 py-2.5 font-medium text-accent-ink hover:bg-accent-hover">
        Go to the home page
      </Link>
    </div>
  );
}
