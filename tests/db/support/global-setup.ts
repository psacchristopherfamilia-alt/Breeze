/**
 * Crea una base de datos NUEVA y desechable para cada ejecución de `pnpm test:db`:
 * shim de Supabase → migraciones (en orden) → datos de prueba. Al terminar, la borra.
 *
 * Conexión: TEST_DATABASE_URL o, por defecto, el Postgres de `supabase start` (puerto 54322).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import type { TestProject } from "vitest/node";

const ROOT = join(__dirname, "..", "..", "..");
const BASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:54322/postgres";

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const dbName = `breeze_test_${Date.now()}`;
  const admin = new pg.Client({ connectionString: BASE_URL });
  await admin.connect();
  await admin.query(`create database ${dbName}`);

  const url = new URL(BASE_URL);
  url.pathname = `/${dbName}`;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(readFileSync(join(__dirname, "supabase-shim.sql"), "utf8"));
    const dir = join(ROOT, "supabase", "migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      try {
        await db.query(readFileSync(join(dir, file), "utf8"));
      } catch (e) {
        throw new Error(`Falló la migración ${file}: ${(e as Error).message}`);
      }
    }
    await db.query(readFileSync(join(__dirname, "fixtures.sql"), "utf8"));
  } finally {
    await db.end();
  }

  project.provide("dbUrl", url.toString());

  return async () => {
    await admin.query(`drop database if exists ${dbName} with (force)`);
    await admin.end();
  };
}
