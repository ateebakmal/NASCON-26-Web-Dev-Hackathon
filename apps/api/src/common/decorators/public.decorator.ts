import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "is_public";

/** Opts a route out of session auth entirely -- signup, login, and signature-verified webhooks only. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
