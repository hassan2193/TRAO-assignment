import mongoose, { Schema, type Document, type Types } from "mongoose";
import type { Kit } from "../validation/kitSchema.js";

export type KitStatus = "pending" | "generating" | "ready" | "failed";

export interface ProgressLogEntry {
  step: string;
  status: string;
  detail?: string;
  at: Date;
}

export interface PracticeLogEntry {
  flashcardId: string;
  confidence: 1 | 2 | 3;
  reviewedAt: Date;
}

export interface KitDocument extends Document {
  userId: Types.ObjectId;
  status: KitStatus;
  input: { jd: string; companyUrl: string; days: number };
  fingerprint: string;
  kit: Kit | null;
  warnings: { code: string; message: string }[];
  error: { code: string; message: string } | null;
  progressEvents: ProgressLogEntry[];
  practiceLog: PracticeLogEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const progressEventSchema = new Schema<ProgressLogEntry>(
  { step: String, status: String, detail: String, at: { type: Date, default: Date.now } },
  { _id: false }
);

const practiceLogSchema = new Schema<PracticeLogEntry>(
  {
    flashcardId: { type: String, required: true },
    confidence: { type: Number, required: true, min: 1, max: 3 },
    reviewedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const kitSchema = new Schema<KitDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["pending", "generating", "ready", "failed"], default: "pending" },
    input: {
      jd: { type: String, required: true },
      companyUrl: { type: String, required: true },
      days: { type: Number, required: true },
    },
    fingerprint: { type: String, required: true, index: true },
    kit: { type: Schema.Types.Mixed, default: null },
    warnings: [{ code: String, message: String, _id: false }],
    error: { code: String, message: String },
    progressEvents: [progressEventSchema],
    practiceLog: [practiceLogSchema],
  },
  { timestamps: true }
);

kitSchema.index({ userId: 1, fingerprint: 1 });

export const KitModel = mongoose.model<KitDocument>("Kit", kitSchema);
