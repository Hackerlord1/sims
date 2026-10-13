#!/usr/bin/env node
// Creates .env for local development with freshly generated secrets.
// Never overwrites an existing .env.
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envPath = join(root, ".env");

if (existsSync(envPath)) {
  console.log(".env already exists — left unchanged.");
  process.exit(0);
}

const dbPassword = randomBytes(18).toString("base64url");
const content = `# Local development only. Never commit this file.
# MariaDB 10.11 (project-local instance: npm run db:local:init). 127.0.0.1, not localhost: the
# local server listens on IPv4 only. connection_limit is the pool size per Node process.
DATABASE_URL="mysql://sims:${dbPassword}@127.0.0.1:3307/sims?connection_limit=5"
# Used by docker-compose.yml only.
MARIADB_PORT=3307
MARIADB_PASSWORD=${dbPassword}

# 32-byte keys, base64. Rotate for any shared environment.
SESSION_SECRET=${randomBytes(32).toString("base64")}
DATA_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}

APP_URL=http://localhost:3000
STORAGE_DIR=./storage

# Development-only demo administrator (felix). Blocked when NODE_ENV=production.
DEMO_MODE=true
DEMO_ADMIN_PASSWORD=1234
# Password for the fictional role accounts created by the demo seed (demo mode only).
DEMO_USERS_PASSWORD=Demo-${randomBytes(9).toString("base64url").replace(/[-_]/g, "x")}7!

# Background jobs run inside the web server unless a separate \`npm run worker\` is used.
JOBS_INLINE=true
# Statement parser: python (pandas, used when available) or node.
STATEMENT_PARSER=python
`;

writeFileSync(envPath, content, { mode: 0o600 });
console.log("Created .env with generated secrets.");
