import "express-async-errors";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.routes.js";
import { kitsRouter } from "./routes/kits.routes.js";
import { kitQuestionsRouter } from "./routes/kitQuestions.routes.js";
import { kitFlashcardsRouter } from "./routes/kitFlashcards.routes.js";
import { kitPracticeRouter } from "./routes/kitPractice.routes.js";

export function createApp() {
  const app = express();

  // origin as an array: cors reflects back the specific matched Origin
  // header (never "*"), which is required whenever credentials: true.
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/kits", kitsRouter);
  app.use("/api/kits", kitQuestionsRouter);
  app.use("/api/kits", kitFlashcardsRouter);
  app.use("/api/kits", kitPracticeRouter);

  app.use((req, res) => {
    res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
  });

  // Centralized error handler: turns any thrown error into a structured
  // JSON response instead of an HTML stack trace or a hung request.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error("[unhandled]", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: env.isProduction ? "Something went wrong" : String((err as Error)?.message ?? err) },
    });
  });

  return app;
}
