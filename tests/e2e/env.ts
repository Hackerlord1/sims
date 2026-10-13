import { tmpdir } from "node:os";
import path from "node:path";

/** Fixed, fictional credentials used only against the throwaway sims_test database. */
export const E2E = {
  password: "E2e-Fictional-Pass-2026!",
  felixTemp: "E2e-Temporary-1234!",
  felixNew: "E2e-Secure-Rotated-Pass-2026!",
  storage: path.join(tmpdir(), "sims-e2e-storage"),
  port: 3200,
};
