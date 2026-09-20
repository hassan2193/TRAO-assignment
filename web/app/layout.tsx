import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "AI Interview Prep Kit",
  description: "Turn a job description into a personalised interview preparation kit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <AuthProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
          >
            Skip to content
          </a>
          <NavBar />
          <main id="main-content" className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
