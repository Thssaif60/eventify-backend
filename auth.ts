import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/tokens.js";
import { HttpError } from "../utils/httpError.js";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        businessId?: string;
        role?: "ADMIN" | "ACCOUNTANT" | "VIEWER";
      };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const [kind, token] = header.split(" ");

  if (kind !== "Bearer" || !token) return next(new HttpError(401, "Missing Authorization Bearer token"));

  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub, businessId: payload.bid, role: payload.role };
    return next();
  } catch {
    return next(new HttpError(401, "Invalid or expired token"));
  }
}

export function requireRole(roles: Array<"ADMIN" | "ACCOUNTANT" | "VIEWER">) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.auth?.role;
    if (!role) return next(new HttpError(403, "Missing role"));
    if (!roles.includes(role)) return next(new HttpError(403, "Insufficient permissions"));
    next();
  };
}
