import Link from "next/link";

import { GITHUB_URL, GitHubIcon } from "@/components/github";
import { LandingNav } from "@/components/landing-nav";

function Cite({ n }: { n: number }) {
  return (
    <span className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-highlight px-1 align-[1px] text-[11px] font-semibold text-highlight-ink">
      {n}
    </span>
  );
}

/** The hero shows the product's whole promise at once: a question, a cited answer,
 *  and the page that answer came from, with the passage getting highlighted. */
function HeroDemo() {
  return (
    <div className="relative pb-24 sm:pb-16" aria-label="Example: an answer citing page 14 of a lecture notes PDF">
      <figure className="rounded-xl border border-rule bg-surface px-7 pb-9 pt-6 shadow-[0_30px_60px_-30px_rgba(20,33,61,0.35)] sm:px-9">
        <figcaption className="mb-6 flex items-baseline justify-between gap-4 text-xs text-graphite">
          <span className="truncate">Operating Systems, lecture notes.pdf</span>
          <span className="shrink-0">Page 14</span>
        </figcaption>
        <div className="font-serif text-ink">
          <h3 className="text-[22px] leading-snug">5.3 Shortest-Job-First scheduling</h3>
          <p className="mt-3 text-[16.5px] leading-[1.75] text-ink/80">
            This algorithm associates with each process the length of its next CPU burst, and the CPU is assigned
            to the process with the smallest one.{" "}
            <span className="mark mark-sweep">
              SJF is provably optimal: it gives the minimum average waiting time for a given set of processes.
            </span>{" "}
            The real difficulty is knowing the length of the next CPU request, so it is often approximated from
            previous bursts.
          </p>
          <p className="mt-4 text-[16.5px] leading-[1.75] text-ink/40">
            5.4 Priority scheduling. A priority is associated with each process, and the CPU is allocated to the
            process with the highest priority…
          </p>
        </div>
      </figure>

      <div className="absolute -bottom-2 left-4 right-4 rounded-xl border border-rule bg-paper p-5 shadow-[0_18px_40px_-20px_rgba(20,33,61,0.45)] sm:left-auto sm:right-[-1.5rem] sm:w-[23rem]">
        <p className="text-sm text-graphite">Which scheduling algorithm minimizes average waiting time?</p>
        <p className="mt-2.5 text-[15px] leading-relaxed text-ink">
          Shortest-Job-First. It gives the minimum average waiting time for a set of processes
          <Cite n={1} />, but it needs each CPU burst length in advance, so in practice it&apos;s estimated
          <Cite n={1} />.
        </p>
      </div>
    </div>
  );
}

const promises = [
  {
    title: "Answers come only from your files",
    body: "If the answer isn't in your documents, Pagewise says so instead of guessing.",
  },
  {
    title: "Every claim points to a page",
    body: "Click a citation and the PDF opens at that page with the passage highlighted.",
  },
  {
    title: "Your library stays yours",
    body: "Each account only ever sees its own documents and conversations.",
  },
];

const steps = [
  { title: "Add your PDFs", body: "Lecture notes, research papers, a thesis, a manual. Text-based PDFs up to 20 MB." },
  { title: "Ask in plain language", body: "Search one document, a few, or your whole library. Follow-up questions keep the context." },
  { title: "Check the page", body: "Each answer lists its sources. Open any of them to read the original in context." },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <LandingNav />

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:pb-28 lg:pt-16">
          <div className="max-w-xl">
            <h1 className="text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[3.4rem]">
              Ask your PDFs. Every answer shows its page.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-graphite">
              Upload lecture notes, papers or a thesis, ask questions in plain language, and check each answer
              against the exact page it came from.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex h-12 items-center rounded-lg bg-accent px-6 font-medium text-accent-ink hover:bg-accent-hover"
              >
                Create a free account
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center rounded-lg border border-rule bg-surface px-6 font-medium hover:bg-subtle"
              >
                Sign in
              </Link>
            </div>
          </div>
          <HeroDemo />
        </section>

        <section className="border-y border-rule bg-surface">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 md:grid-cols-3 md:gap-12">
            {promises.map((p) => (
              <div key={p.title}>
                <h2 className="text-lg font-semibold">{p.title}</h2>
                <p className="mt-2 leading-relaxed text-graphite">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-10 grid gap-10 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink text-sm font-semibold">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="mt-1.5 leading-relaxed text-graphite">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
          <div className="rounded-2xl bg-ink px-8 py-12 text-paper sm:px-12">
            <h2 className="max-w-xl text-2xl font-semibold leading-snug sm:text-3xl">
              Built as an open-source retrieval-augmented generation system.
            </h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-paper/75">
              FastAPI and PostgreSQL with pgvector on the server, BGE embeddings for search, any OpenAI-compatible
              model for answers, and a Next.js interface that streams responses as they are written.
            </p>
            <a
              href={GITHUB_URL}
              className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-paper px-5 text-sm font-medium text-ink hover:bg-subtle"
            >
              <GitHubIcon />
              Read the source on GitHub
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-graphite sm:px-8">
          <span>Pagewise, made by Sanvi and Harshit</span>
          <a href={GITHUB_URL} className="hover:text-ink">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
