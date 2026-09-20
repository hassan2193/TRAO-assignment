import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body failed validation",
          details: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
