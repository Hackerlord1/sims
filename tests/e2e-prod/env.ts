import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { testDatabaseUrl } from "../integration/test-db";

const passwordFile = path.join(tmpdir(), "sims-e2e-prod-temporary-password.txt");

/** Settings for the production-mode smoke tests: their own database, storage and port. */
export const PROD = {
  port: 3300,
  admin: "prod.admin",
  /** The fictional password the administrator sets at first sign-in. */
  newPassword: "Prod-E2e-Rotated-Pass-2026!",
  storage: path.join(tmpdir(), "sims-e2e-prod-storage"),
  databaseUrl(): string {
    const url = new URL(testDatabaseUrl());
    url.pathname = "/sims_e2e_prod";
    return url.toString();
  },
  writeTemporaryPassword(password: string) {
    writeFileSync(passwordFile, password, { mode: 0o600 });
  },
  temporaryPassword(): string {
    return readFileSync(passwordFile, "utf8").trim();
  },
};
