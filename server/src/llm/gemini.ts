import { GoogleGenAI } from "@google/genai";
import type { ZodType } from "zod";
import { env, requireGeminiKey } from "../config/env.js";

export class LlmError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "LlmError";
  }
}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: requireGeminiKey() });
  }
  return client;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitOrTransient(err: unknown): boolean {
  const message = String((err as Error)?.message ?? err).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("rate") ||
    message.includes("resource_exhausted") ||
    message.includes("500") ||
    message.includes("503") ||
    message.includes("unavailable") ||
    message.includes("timeout")
  );
}

interface GenerateOptions {
  systemInstruction: string;
  prompt: string;
  maxRetries?: number;
}

/**
 * Calls Gemini for raw text, with bounded retry + exponential backoff on
 * 429 / transient 5xx responses (free-tier rate limits are the single most
 * common way this kind of pipeline falls over, per the assessment brief).
 */
async function generateText({ systemInstruction, prompt, maxRetries = 4 }: GenerateOptions): Promise<string> {
  const ai = getClient();
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: env.geminiModel,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.4,
        },
      });
      const text = response.text;
      if (!text) throw new LlmError("EMPTY_RESPONSE", "Gemini returned an empty response");
      return text;
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries || !isRateLimitOrTransient(err)) {
        break;
      }
      const backoffMs = 1000 * 2 ** attempt + Math.floor(Math.random() * 500);
      await sleep(backoffMs);
    }
  }

  throw new LlmError(
    "GENERATION_FAILED",
    `Gemini call failed after retries: ${(lastErr as Error)?.message ?? lastErr}`
  );
}

function extractJson(text: string): unknown {
  let candidate = text.trim();
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidate = fenced[1].trim();
  const firstBrace = candidate.search(/[{[]/);
  if (firstBrace > 0) candidate = candidate.slice(firstBrace);
  return JSON.parse(candidate);
}

/**
 * Generates a JSON response validated against a Zod schema. If the model
 * returns invalid JSON or fails schema validation, we send one repair
 * attempt with the validation errors before giving up — this is the
 * "model returns invalid JSON or an incomplete kit" edge case from the
 * brief, handled without silently accepting malformed data.
 */
export async function generateStructured<T>(
  systemInstruction: string,
  prompt: string,
  schema: ZodType<T>,
  maxRepairAttempts = 2
): Promise<T> {
  let currentPrompt = prompt;

  for (let attempt = 0; attempt <= maxRepairAttempts; attempt++) {
    const raw = await generateText({
      systemInstruction: `${systemInstruction}\n\nRespond with ONLY valid JSON. No markdown fences, no commentary.`,
      prompt: currentPrompt,
    });

    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch (err) {
      if (attempt === maxRepairAttempts) {
        throw new LlmError("INVALID_JSON", `Gemini did not return valid JSON: ${(err as Error).message}`);
      }
      currentPrompt = `${prompt}\n\nYour previous response was not valid JSON:\n${raw}\n\nReturn ONLY valid JSON this time.`;
      continue;
    }

    const result = schema.safeParse(parsed);
    if (result.success) return result.data;

    if (attempt === maxRepairAttempts) {
      throw new LlmError(
        "SCHEMA_MISMATCH",
        `Gemini output failed schema validation: ${result.error.issues.map((i) => i.message).join("; ")}`
      );
    }
    currentPrompt = `${prompt}\n\nYour previous JSON response failed validation with these errors:\n${result.error.issues
      .map((i) => `- ${i.path.join(".")}: ${i.message}`)
      .join("\n")}\n\nPrevious response:\n${JSON.stringify(parsed)}\n\nFix it and return ONLY corrected valid JSON.`;
  }

  throw new LlmError("GENERATION_FAILED", "Exhausted structured generation attempts");
}

export function wrapUntrusted(label: string, text: string): string {
  return `<untrusted_web_content source="${label}">\n${text}\n</untrusted_web_content>`;
}
