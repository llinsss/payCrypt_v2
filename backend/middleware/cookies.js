import { CSRF_COOKIE } from "../utils/authCookies.js";

export const parseCookies = (req, _res, next) => {
  const header = req.headers.cookie || "";
  req.cookies = Object.fromEntries(header.split(";").filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
  next();
};

export const csrfProtection = (req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method) || req.path.endsWith("/auth/csrf")) return next();
  if (req.get("Authorization") || req.get("X-API-Key")) return next();
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get("X-CSRF-Token");
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length || cookieToken !== headerToken) return res.status(403).json({ error: "CSRF validation failed" });
  next();
};