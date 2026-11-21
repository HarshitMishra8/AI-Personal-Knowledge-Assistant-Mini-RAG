"use client";

import { Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Logo } from "@/components/logo";
import { Sidebar } from "@/components/sidebar";
import { Button, FullPageSpinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { WorkspaceProvider } from "@/lib/workspace";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (status === "anonymous") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);

  // Close the mobile drawer whenever the page changes.
  useEffect(() => setDrawerOpen(false), [pathname]);

  if (status !== "authenticated") return <FullPageSpinner />;

  return (
    <WorkspaceProvider>
      <div className="flex h-dvh overflow-hidden">
        {/* Sidebar: fixed column on desktop, drawer on mobile */}
        <div
          className={cn(
            "fixed inset-0 z-30 bg-ink/30 transition-opacity lg:hidden",
            drawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-72 border-r border-rule bg-surface transition-transform lg:static lg:translate-x-0",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <Suspense>
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </Suspense>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-rule px-3 lg:hidden">
            <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
            <Logo href="/chat" />
          </header>
          <main className="min-h-0 flex-1">{children}</main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
