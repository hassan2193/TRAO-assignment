import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-2xl py-12 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">AI Interview Prep Kit</h1>
      <p className="mt-4 text-slate-600">
        Paste a job description, give us the company&apos;s website, and tell us how many days you have. We&apos;ll
        research the company, find what we can about how they interview, and build a company brief, a role
        breakdown, a question bank, flashcards and a day-by-day study schedule — all editable, all yours.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/register" className="btn-primary">
          Get started
        </Link>
        <Link href="/login" className="btn-secondary">
          Log in
        </Link>
      </div>
    </div>
  );
}
