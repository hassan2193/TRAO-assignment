# AI Interview Prep Kit

Turns a pasted job description + a company website + a number of days-until-interview into a structured,
editable interview prep kit: a company brief, a role breakdown, a categorised question bank, flashcards,
and a day-by-day study schedule — researched, generated, checked for coverage, and rebuilt where it comes
up short, without a human in the loop.

## 1. Project overview & tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 15 (App Router) + Tailwind CSS | React 19. Client components talk to the API over `fetch` with cookies. |
| Backend | Node.js + Express, TypeScript, ESM | REST API, JWT-in-httpOnly-cookie sessions. |
| Database | MongoDB (Mongoose) | One `Kit` document per generated kit; the Appendix A structure is stored as a validated sub-document. |
| LLM | Google Gemini (`@google/genai`), model `gemini-flash-latest` by default | Backend-only; `GEMINI_API_KEY` is never sent to the browser. `GEMINI_MODEL` overrides it, e.g. to pin an exact version. |
| Validation | Zod | One schema is the source of truth for the Appendix A kit shape, request bodies, and LLM structured-output responses. |
| Tests | Vitest | Pure-function pipeline logic (coverage, schedule, link ranking, HTML extraction, validation, SSRF) is unit tested. |

This matches the brief's preferred stack, with the deliberate substitutions below justified:

- **JWT-in-cookie sessions instead of a server-side session store.** The brief explicitly scopes auth down
  to "secure registration, login, logout, session handling" and rules out anything heavier. A signed,
  httpOnly, `SameSite`-appropriate JWT cookie gives real session semantics (expiry, tamper-proofing,
  "sign out" = cookie clear) without adding a Redis/Mongo session store as infrastructure.
- **Polling instead of SSE/WebSockets for generation progress.** Generation takes tens of seconds and the
  UI needs "visible progress," not sub-second updates. A 2s poll of `GET /generation-status` gets the same
  perceived responsiveness with far less infrastructure (no long-lived connections to manage across
  restarts/redeploys on a free-tier host), and it degrades gracefully if a request is dropped.
- **DuckDuckGo's HTML endpoint for "public discussion of the interview process."** No search API on the
  free tier is truly keyless; DuckDuckGo's `html.duckduckgo.com/html/` endpoint is. It's used at low
  volume, non-commercially, and every search failure or empty result degrades to an honest "not found"
  rather than blocking the pipeline.

## 2. Setup

### Prerequisites

- Node.js 20+
- A MongoDB connection string (local `mongod`, or a free Atlas cluster)
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) (free tier)

### Local development

```bash
npm install                        # installs both workspaces (server, web)

cp server/.env.example server/.env # fill in MONGODB_URI and GEMINI_API_KEY
cp web/.env.example web/.env.local # NEXT_PUBLIC_API_URL, defaults to http://localhost:4000

npm run dev:server                 # http://localhost:4000
npm run dev:web                    # http://localhost:3000, in a second terminal
```

### Tests / typecheck / build

```bash
npm run test                       # server unit tests (vitest)
npm run typecheck                  # server tsc --noEmit
npm run build                      # builds server (tsc) and web (next build)
```

### The batch entry point (mandatory, Section 9)

Runs the exact same pipeline as the web app — no separate implementation — over a file of cases, without
needing MongoDB running (research/generation is a pure function of `{ jd, companyUrl, days }`; persistence
is a separate concern layered on top for the interactive app only).

```bash
npm install
cp server/.env.example server/.env   # set GEMINI_API_KEY at minimum
npm run evaluate -- --input cases.json --output kits.json
```

`cases.json`:

```json
[
  { "id": "case-01", "jd": "Senior Backend Engineer...\n...", "company_url": "http://localhost:8099/acme/", "days": 5 }
]
```

`kits.json` (written by the script, shape per Appendix B):

```json
{
  "version": "1.0",
  "generated_at": "2026-09-01T09:12:44Z",
  "kits": [
    { "id": "case-01", "status": "ok", "kit": { "...": "Appendix A structure" }, "error": null },
    { "id": "case-04", "status": "failed", "kit": null, "error": { "code": "EXTRACTION_FAILED", "message": "..." } }
  ]
}
```

Company sites passed as `company_url` may be local fixture servers (e.g. `http://localhost:8099/acme/`) —
the crawler follows relative links and never assumes a particular host, and `ALLOW_PRIVATE_NETWORK_TARGETS`
(true by default outside `NODE_ENV=production`) permits fetching them. Cases run with bounded concurrency
(`EVALUATE_CONCURRENCY`, default 2) so five cases complete well inside the 15-minute budget even accounting
for Gemini retries.

### Deployment

- **Backend**: any free Node host that runs a long-lived process (Render, Railway, Fly.io). Build command
  `npm install && npm run build --workspace=server`, start command `npm run start --workspace=server`. Set
  the environment variables from `server/.env.example` — at minimum `MONGODB_URI`, `JWT_SECRET`,
  `GEMINI_API_KEY`, and `CORS_ORIGIN` (the deployed frontend's origin). Set `NODE_ENV=production` so SSRF
  protection actually rejects private-network targets and the session cookie is issued with
  `Secure; SameSite=None` (required for a cross-origin frontend to send it).
- **Frontend**: Vercel (or any Next.js host). Set `NEXT_PUBLIC_API_URL` to the deployed backend's URL.
- **Database**: MongoDB Atlas free tier; add the backend host's outbound IP (or `0.0.0.0/0` for a PaaS with
  no static IP) to its network access list.

No environment variable is optional except the coverage/crawl/fetch tuning knobs, which have working
defaults — see `server/.env.example` for what each one does.

## 3. High-level architecture

```
web/                    Next.js app (App Router), talks to the API only
  app/                  pages: /, /login, /register, /dashboard, /kits/new, /kits/[id]
  components/           NavBar, Tabs, EditableText, ProgressSteps, and per-section kit panels
  lib/                  api client, auth context, shared TS types (mirrors server's Appendix A shape)

server/
  src/
    pipeline/           retrieval + extraction + generation + coverage + schedule — the research/gen engine
    services/           fetcher (SSRF-safe), robots.txt, HTML extraction, rate limiting, hashing
    llm/                Gemini client (retry/backoff, structured-JSON-with-repair) + per-stage prompts
    validation/         Zod schema for the Appendix A kit shape + API request bodies
    models/             Mongoose models: User, Kit (kit content + status + progress log + practice log)
    routes/              Express routers: auth, kits, questions, flashcards, practice
    auth/                password hashing, JWT sessions, requireAuth middleware
    scripts/evaluate.ts  the batch entry point (Section 9) — calls pipeline/orchestrator.ts directly
```

`pipeline/orchestrator.ts` is the single implementation of the full research → generation → validation
sequence. Both `POST /api/kits/:id/generate` (via `services/generationRunner.ts`, which also persists
progress to Mongo for polling) and `scripts/evaluate.ts` call it directly — the brief is explicit that the
batch entry point must not be a parallel implementation, and this is how that's enforced structurally
rather than by convention.

## 4. Retrieval approach & sources used

- **Company site**: crawled starting from the homepage. Links are extracted from the *unmodified* page
  (including nav/header/footer — that's where "Careers" links usually live) and ranked by keyword signal in
  the URL path and anchor text (`career`, `jobs`, `hiring`, `handbook`, `interview`, `engineering`, `about`,
  `culture`, etc. — see `pipeline/linkRanking.ts`), not by trying a fixed list of paths. The top-ranked
  links are fetched (bounded concurrency + 250ms minimum spacing + timeout + retry/backoff on transient
  failures), and a second hop repeats the process from whatever pages turned out to look hiring/about-
  related, so a careers *index* page can lead to a hiring-process page one level deeper. Unreachable or
  disallowed pages are skipped and recorded, never fatal (`pipeline/crawler.ts`).
- **robots.txt**: fetched once per origin and cached; `Disallow`/`Allow`/`Crawl-delay` directives for our
  user agent (falling back to `*`) are honoured before any page on that path is fetched
  (`services/robots.ts`). A missing or unreachable robots.txt is treated as "allow everything," the
  standard interpretation.
- **Public discussion of the interview process**: a separate, distinct step from the company-site crawl —
  a keyless DuckDuckGo HTML search scoped to Glassdoor/Reddit/Blind/levels.fyi
  (`pipeline/publicDiscussionSearch.ts`), summarised from the snippets only. No API key, no scraping of
  search results beyond what the HTML result page already shows.
- Every source URL actually used ends up in `source.pages_used` (company site) and
  `company_brief.sources` / the public-discussion research (surfaced in the "research notes" on the kit
  page) — nothing is asserted about a company without a URL a human could go check.

## 5. Research & generation sequencing

Each step in `pipeline/orchestrator.ts` runs in order and responds to what the previous ones actually
found, matching the brief's explicit list of required capabilities:

1. **Validate the JD** — reject empty/near-empty input outright (nothing to build a kit from).
2. **Validate the company URL** — syntax + SSRF check. Failure here doesn't abort the run; it degrades
   company research to "unknown," recorded as a warning.
3. **robots.txt** — checked per-origin before crawling.
4. **Crawl the company site** — homepage first, then ranked links, two hops.
5. **Extract page content** — noise-stripped text per page (`services/htmlExtract.ts`).
6. **Research the hiring process** — from whichever crawled pages were categorised "hiring." If none were
   found, this is a deterministic short-circuit (no LLM call, no invented process).
7. **Research public discussion** — independent of the crawl, via search.
8. **Extract requirements** — the one LLM call over the pasted JD; also produces the role breakdown
   (title/seniority/location/responsibilities) in the same call, since that breakdown *is* this structured
   extraction, not a second pass over the same text.
9. **Generate questions, one category per call, with different instructions per call**:
   *technical* (from technical/domain requirements), *behavioural* (from behavioural requirements),
   *system-design* (from must-have technical requirements, gated on seniority/role size so a junior/simple
   role doesn't get forced architecture questions), *company-fit* (grounded in the company brief + hiring
   research + public discussion — skipped entirely if none of those found anything, rather than inventing
   culture-fit questions from nothing). A company that published a take-home + system-design process
   therefore produces different company-fit and system-design questions than one that published nothing —
   the model sees that research as context in those specific calls.
10. **Check coverage** (deterministic, see §6) → **fill gaps** (LLM, only for the specific uncovered
    requirements, split by kind into the same technical/behavioural generators) → **check again**, up to
    `MAX_COVERAGE_PASSES` (default 3).
11. **Generate flashcards** — one call over all requirements.
12. **Build the schedule** (deterministic, see §7).
13. **Validate the assembled kit** against the Appendix A Zod schema before it's ever persisted.

Every LLM call is wrapped: pasted JD text and crawled web text are injected inside
`<untrusted_web_content>` / `<untrusted_job_description>` tags, and every system instruction explicitly
tells the model to treat that content as data, never as instructions (`llm/prompts/shared.ts`) — this
matters concretely here, since both inputs are text the application didn't write.

## 6. Second-pass coverage (deterministic)

`pipeline/coverage.ts` is plain code, not a prompt:

```ts
findUncoveredRequirementIds(requirements, questions) // requirement with no question.requirement_ids match
findUncoveredMustHaveIds(requirements, questions)     // same, filtered to priority "must"
```

The orchestrator loops on `findUncoveredMustHaveIds` — gaps in "nice" requirements are recorded honestly in
`coverage.uncovered_requirement_ids` but don't force another generation pass, since the brief's actual bar
is "every must-have requirement has a question." Each pass generates *only* for the specific still-uncovered
requirements (split by kind into the technical/behavioural generators), not a full re-generation, so passes
get cheaper as they converge. The loop stops at `MAX_COVERAGE_PASSES` (default **3**: pass 1 is the initial
generation, which resolves the overwhelming majority of requirements; two gap-filling passes handle the
rest without letting one stubborn requirement — or an LLM that keeps mis-tagging `requirement_ids` — spin
forever burning free-tier tokens). Anything still uncovered after that ships honestly in
`coverage.uncovered_requirement_ids`, exactly as the brief asks for rather than faked.

## 7. Schedule allocation (deterministic)

`pipeline/schedule.ts`, never delegated to the model:

1. Score each question by requirement priority (must > nice) then difficulty, descending.
2. Estimate minutes per question from difficulty (20/30/45 for 1/2/3).
3. Greedily bin-pack the sorted list into exactly `days` bins, capping each day's budget near
   `total minutes / days` (bounded to 30–240 min/day) — so hard, must-priority material lands in the
   earliest days, not shuffled evenly or left for the night before.
4. Every question is scheduled exactly once, so every must-have requirement — which the coverage loop
   guarantees has a question — is guaranteed to appear somewhere in the schedule too.
5. If there are far more days than questions (e.g. a 60-day ask against a short JD), the leftover days
   become explicit "Review and light practice" days with no `question_ids`, not silently omitted — the
   schedule still has exactly `days` entries.
6. If there's 1 day, everything lands in it. Both are covered by `pipeline/schedule.test.ts`.

## 8. Generated / edited / pinned state & regeneration

Every question and flashcard carries a `state`: `"generated"` (untouched machine output), `"edited"` (the
user changed a generated one via inline editing — `PATCH` sets this automatically the first time), or
`"pinned"` (the user added it by hand). Regenerating a category (`POST
/regenerate/questions/:category`) only removes questions that are *both* in that category *and* still
`"generated"` — anything `"edited"` or `"pinned"` survives, is kept in place, and the fresh batch is
appended alongside it. Regenerating the company brief only touches `company_brief`/`source.company`/
`source.pages_used`; regenerating the schedule only touches `schedule`. Nothing else in the kit is ever
overwritten by a regeneration call — the diff is scoped at the API layer (`routes/kitQuestions.routes.ts`,
`routes/kits.routes.ts`), not left to chance in the LLM response.

Adding/deleting a question changes the id set the schedule references, so the schedule is deterministically
rebuilt (not regenerated by the LLM) immediately after any such change — this is a consistency fix, not a
"regenerate a section" action, and it doesn't touch anything else either.

## 9. Practice mode & the "next session" ordering

`services/practice.ts`: never-reviewed cards rank as maximally weak (ahead of even a low-confidence
review), then ascending by last recorded confidence, then by recency (long-unseen cards surface before
recently-seen ones at the same confidence). This is a **confidence-weighted sort**, not a spaced-repetition
interval scheduler — deliberately, since a real SM-2-style scheduler is built for multi-week/month
retention, and this tool's whole premise is a bounded number of days before one interview. A simple,
explainable "show me what I'm worst at, then what I haven't seen, then what's gone stale" ordering fits
the actual time horizon better than an algorithm designed for a longer one.

## 10. Creative feature: Weak Spots Report

`services/practice.ts#buildWeakSpotsReport`, surfaced as its own tab. It combines two independently honest
signals into one prioritized list: requirements the question bank never covered (from the same
deterministic coverage check used during generation) and requirements whose flashcards the user has
practiced but rated consistently low-confidence. The report is sorted must-have-first, then by confidence.
This targets a real gap in the rest of the app: the builder shows *what's in the kit*, and practice mode
shows *per-card* confidence, but neither answers "what should I actually spend my remaining hour on" — a
question a candidate genuinely has a day before an interview.

## 11. Edge cases

| Case | Behaviour |
|---|---|
| Invalid / 404 / timing-out company URL | Non-fatal. Recorded as a warning; company brief is honest ("could not retrieve any pages"), kit still generates from the JD alone. |
| No discoverable hiring/about page | `hiring_insights.found = false`, no LLM call for that stage, company-fit questions skip themselves if there's no grounding at all. |
| Two-line JD stub | Extraction returns a short requirements list rather than padded generic ones (explicit prompt instruction); a thin kit, not a fabricated one. |
| No public discussion found | `"Public interview discussion not found."`, recorded, non-fatal. |
| Invalid/incomplete LLM JSON | `llm/gemini.ts` strips markdown fences, retries once with the parse/validation error fed back to the model, then fails that *stage* (not the whole run) if still broken. |
| Rate limit / transient 5xx | Exponential backoff with jitter, bounded retries, both in the Gemini client and the page fetcher. |
| Duplicate (jd, company_url, days) submission | Fingerprinted (`services/hash.ts`); `POST /api/kits` returns the existing kit instead of creating a new one and re-running generation. |
| 1-day / 60-day schedule | Both produce exactly that many days — see §7 and the schedule tests. |

## 12. Security

- **SSRF**: `services/urlSafety.ts` resolves the hostname and rejects loopback/private/link-local ranges
  (both IPv4 and IPv6) before fetching, in production. `ALLOW_PRIVATE_NETWORK_TARGETS` (default true outside
  `NODE_ENV=production`) is what lets local dev and the batch evaluator target fixture servers — the brief
  explicitly requires the evaluator to work against `http://localhost:...` company sites.
- **Redirects** are followed manually (not by `fetch`'s automatic redirect handling), re-validated against
  the same SSRF check at every hop, capped at 5.
- **Content-type / size limits**: only `text/html` / `text/plain` / `application/xhtml+xml` responses are
  accepted; streamed bodies are cut off past `MAX_RESPONSE_BYTES` (default 3MB) mid-download, not just
  checked against a `Content-Length` header that could lie.
- **Prompt-injection resistance**: see §5 — every fetched page and the pasted JD are wrapped in
  `<untrusted_*>` tags with an explicit instruction, in every prompt that includes them, not to follow
  instructions found inside.
- **Auth**: bcrypt password hashing, JWT session in an httpOnly cookie (`Secure`+`SameSite=None` in
  production for the cross-origin frontend, `SameSite=Lax` over plain HTTP locally), `requireAuth`
  middleware on every kit/practice route, and every kit lookup is scoped to `userId` — a wrong-owner kit id
  404s exactly like a nonexistent one, so ownership is never leaked.

## 13. Testing

`npm run test` (Vitest): coverage checking, schedule allocation (1/5/60-day cases, integer minutes, every
must-have covered, no duplicate ids, no dangling references), Appendix A structure validation (valid kit,
missing field, bad difficulty, bad category, dangling requirement/question references, duplicate ids,
non-integer minutes), link ranking (finds a nonstandard hiring path without a hardcoded list, rejects
cross-origin/blocked links), HTML extraction (finds links inside nav/header/footer — a real bug this
session caught by testing it directly rather than trusting the crawler's end-to-end output), and SSRF IP
classification. 38 tests, all passing.

## 14. Known limitations

- No email verification / password reset (explicitly out of scope per the brief).
- Company name is derived heuristically from the homepage `<title>` (stripped of "| Careers"-style
  boilerplate) with a hostname fallback — occasionally imperfect for sites with unusual titles.
- The batch evaluator and the interactive app share the pipeline but not a job queue; the interactive app's
  generation runs as a fire-and-forget async function on the same Node process, so a server restart
  mid-generation leaves a kit stuck in `"generating"` until the user hits "Retry."
  <br>Regenerating a category doesn't attempt a partial-repair on a single malformed question — a failed
  category call is recorded as a warning and simply contributes no new questions that pass.
- Submitting the same `(jd, companyUrl)` with a *different* `days` value creates a new kit rather than
  reusing prior research — correct (the schedule genuinely differs) but means the crawl/brief/questions are
  redone rather than cloned and only the schedule rebuilt.
- `npm audit` flags a handful of moderate/high advisories in transitive dependencies (Next's internal build
  toolchain's bundled `postcss`, and `uuid` via `@google/genai`'s Google API client). Neither is reachable
  through this app's actual attack surface (no attacker-controlled CSS source maps are served; nothing
  feeds attacker-controlled input into that `uuid` call site) — tracked here rather than silently ignored.
