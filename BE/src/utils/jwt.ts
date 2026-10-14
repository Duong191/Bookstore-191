/** File này ký và kiểm tra access/refresh token JWT. */
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { TokenPayload } from "../types";
import { AppError } from "./appError";

export const signAccessToken = (payload: TokenPayload): string =>
  jwt.sign(payload, env.jwt.accessSecret, { expiresIn: env.jwt.accessExpiresIn as jwt.SignOptions["expiresIn"] });

export const signRefreshToken = (payload: TokenPayload): string =>
  jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn as jwt.SignOptions["expiresIn"],
    jwtid: randomUUID()
  });

export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, env.jwt.accessSecret) as unknown as TokenPayload;
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) throw new AppError(401, "jwt expired");
    if (e instanceof jwt.JsonWebTokenError) throw new AppError(401, "Invalid token");
    throw e;
  }
};

export const verifyRefreshToken = (token: string): TokenPayload =>
  jwt.verify(token, env.jwt.refreshSecret) as unknown as TokenPayload;
