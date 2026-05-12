import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

type JwtPayload = {
  adminId: string;
  role: "admin";
};

export type AuthenticatedRequest = Request & {
  admin?: JwtPayload;
};

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const expectedProxySecret = process.env.ADMIN_PROXY_SHARED_SECRET;
  if (expectedProxySecret) {
    const providedProxySecret = req.headers["x-admin-proxy-secret"];
    const tokenizedSecret = Array.isArray(providedProxySecret)
      ? providedProxySecret[0]
      : providedProxySecret;

    if (!tokenizedSecret || tokenizedSecret !== expectedProxySecret) {
      return res.status(403).json({ message: "Admin API access must go through trusted proxy" });
    }
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (!token) {
    return res.status(401).json({ message: "Missing admin token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET ?? "") as JwtPayload;

    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    req.admin = decoded;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
