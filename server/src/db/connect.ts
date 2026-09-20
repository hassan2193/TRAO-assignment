import mongoose from "mongoose";
import { env } from "../config/env.js";

let connected = false;

export async function connectDb(): Promise<void> {
  if (connected) return;
  await mongoose.connect(env.mongoUri);
  connected = true;
  // eslint-disable-next-line no-console
  console.log(`[db] connected to ${env.mongoUri}`);
}
