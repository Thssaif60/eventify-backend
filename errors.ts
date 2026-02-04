import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError.js";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not Found" });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const e = err as any;

  if (e instanceof HttpError) {
    return res.status(e.status).json({ error: e.message, details: e.details });
  }

  const status = typeof e?.status === "number" ? e.status : 500;
  const message = typeof e?.message === "string" ? e.message : "Internal Server Error";
  return res.status(status).json({ error: message });
}
