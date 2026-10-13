import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { testDatabaseUrl } from "./test-db";

// Point every PrismaClient created by the code under test at the test database, and keep stored
// files in a throwaway directory.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.SESSION_SECRET ??= randomBytes(32).toString("base64");
process.env.DATA_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.DEMO_MODE = "true";
process.env.STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "sims-test-storage-"));
process.env.APP_URL = "http://127.0.0.1";
process.env.JOBS_INLINE = "false";
