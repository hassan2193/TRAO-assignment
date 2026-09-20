"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";

export function NavBar() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href={user ? "/dashboard" : "/"} className="font-semibold text-slate-900 focus-ring rounded">
          AI Interview Prep Kit
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {!loading && user && (
            <>
              <Link href="/dashboard" className="text-slate-600 hover:text-slate-900 focus-ring rounded">
                Dashboard
              </Link>
              <Link href="/kits/new" className="text-slate-600 hover:text-slate-900 focus-ring rounded">
                New kit
              </Link>
              <span className="text-slate-400">{user.email}</span>
              <button
                type="button"
                className="btn-secondary"
                onClick={async () => {
                  await logout();
                  router.push("/login");
                }}
              >
                Log out
              </button>
            </>
          )}
          {!loading && !user && (
            <>
              <Link href="/login" className="text-slate-600 hover:text-slate-900 focus-ring rounded">
                Log in
              </Link>
              <Link href="/register" className="btn-primary">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
