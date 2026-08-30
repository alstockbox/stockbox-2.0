import { z } from "zod";

export const NEW_PASSWORD_MIN_LENGTH = 15;
export const NEW_PASSWORD_MAX_LENGTH = 128;

export const newPasswordSchema = z.string()
  .min(NEW_PASSWORD_MIN_LENGTH)
  .max(NEW_PASSWORD_MAX_LENGTH);

export function validateNewPassword(value: unknown) {
  return newPasswordSchema.safeParse(value);
}