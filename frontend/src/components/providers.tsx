"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";

import { AuthProvider } from "@/lib/auth";

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster position="bottom-right" theme={resolvedTheme === "dark" ? "dark" : "light"} closeButton />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const app = (
    <AuthProvider>
      {children}
      <ThemedToaster />
    </AuthProvider>
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {GOOGLE_CLIENT_ID ? <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{app}</GoogleOAuthProvider> : app}
    </ThemeProvider>
  );
}
