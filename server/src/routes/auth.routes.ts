import { Router } from "express";
import { UserModel } from "../models/User.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signSession } from "../auth/jwt.js";
import { clearSessionCookie, requireAuth, setSessionCookie, type AuthedRequest } from "../auth/middleware.js";
import { validateBody } from "../middleware/validate.js";
import { LoginSchema, RegisterSchema } from "../validation/requestSchemas.js";

export const authRouter = Router();

authRouter.post("/register", validateBody(RegisterSchema), async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  const existing = await UserModel.findOne({ email });
  if (existing) {
    res.status(409).json({ error: { code: "EMAIL_TAKEN", message: "An account with this email already exists" } });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await UserModel.create({ email, passwordHash });
  const token = signSession({ sub: user.id, email: user.email });
  setSessionCookie(res, token);
  res.status(201).json({ user: { id: user.id, email: user.email } });
});

authRouter.post("/login", validateBody(LoginSchema), async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  const user = await UserModel.findOne({ email });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password" } });
    return;
  }

  const token = signSession({ sub: user.id, email: user.email });
  setSessionCookie(res, token);
  res.json({ user: { id: user.id, email: user.email } });
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).send();
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await UserModel.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: { code: "SESSION_EXPIRED", message: "User no longer exists" } });
    return;
  }
  res.json({ user: { id: user.id, email: user.email } });
});
