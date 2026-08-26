import { createHash, randomBytes, randomUUID } from "crypto";
import db from "../config/database.js";
import { signToken } from "../config/jwt.js";

export const ACCESS_COOKIE = "__Host-access";
export const REFRESH_COOKIE = "__Host-refresh";
export const CSRF_COOKIE = "XSRF-TOKEN";
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const cookieOptions = (maxAge) => ({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge });
const hash = (value) => createHash("sha256").update(value).digest("hex");

export const issueSession = async (userId, res) => {
  const sessionId = randomUUID();
  const refreshToken = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await db("auth_sessions").insert({ id: sessionId, user_id: userId, refresh_token_hash: hash(refreshToken), expires_at: expiresAt });
  res.cookie(ACCESS_COOKIE, signToken({ userId, sessionId }, { expiresIn: ACCESS_TTL_SECONDS }), cookieOptions(ACCESS_TTL_SECONDS * 1000));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(REFRESH_TTL_MS));
};

export const rotateSession = async (refreshToken, res) => {
  if (!refreshToken) return null;
  const session = await db("auth_sessions").where({ refresh_token_hash: hash(refreshToken) }).whereNull("revoked_at").where("expires_at", ">", new Date()).first();
  if (!session) return null;
  await db("auth_sessions").where({ id: session.id }).update({ revoked_at: new Date(), last_used_at: new Date() });
  await issueSession(session.user_id, res);
  return session.user_id;
};

export const revokeSession = async (refreshToken) => {
  if (refreshToken) await db("auth_sessions").where({ refresh_token_hash: hash(refreshToken) }).whereNull("revoked_at").update({ revoked_at: new Date() });
};

export const clearAuthCookies = (res) => {
  res.clearCookie(ACCESS_COOKIE, cookieOptions(0));
  res.clearCookie(REFRESH_COOKIE, cookieOptions(0));
  res.clearCookie(CSRF_COOKIE, { secure: true, sameSite: "lax", path: "/" });
};

export const setCsrfCookie = (res) => {
  const token = randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE, token, { secure: true, sameSite: "lax", path: "/", maxAge: REFRESH_TTL_MS });
  return token;
};