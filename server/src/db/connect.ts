import mongoose from "mongoose";
import { env } from "../config/env.js";

let connected = false;

export async function connectDb(): Promise<void> {
  if (connected) return;
  await mongoose.connect(env.mongoUri);
  connected = true;
  // Never log env.mongoUri: it carries the username/password for the
  // deployed cluster.
  // eslint-disable-next-line no-console
  console.log("[db] MongoDB connected successfully");
}
