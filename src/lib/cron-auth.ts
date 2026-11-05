import { timingSafeEqual } from "node:crypto";

/** ¿La petición trae `Authorization: Bearer <CRON_SECRET>`? (la usan pg_cron/pg_net y el hosting). */
export function isCronAuthorized(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  const got = authorization ?? "";
  const expected = `Bearer ${secret}`;
  return !!secret && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
