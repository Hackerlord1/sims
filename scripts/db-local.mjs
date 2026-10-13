#!/usr/bin/env node
// Manages a project-local MariaDB 10.11 instance (./mariadb-data) using the portable ZIP distribution.
// Used when Docker is not available. Usage: node scripts/db-local.mjs <init|start|stop|status>
//
// MARIADB_BIN — directory holding mariadbd/mariadb/mariadb-admin (default: ~/mariadb1011/bin)
// Reads DATABASE_URL from .env for the user, password, port and database name.
//
// The instance mirrors the production cPanel host on purpose (MariaDB 10.11, binary logging off,
// empty sql_mode, latin1 server default, 18 connections per user, the machine's time zone) and the
// application user has no global privileges, so host-specific problems show up locally first.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
// No leading dot: MySQL-family servers on Windows can fail to restart from a dot-named datadir.
const dataDir = join(root, "mariadb-data");
const configFile = join(root, "mariadb-data.cnf");
const logFile = join(root, "mariadb-data.log");
const exe = process.platform === "win32" ? ".exe" : "";
const mariadbBin = process.env.MARIADB_BIN ?? join(homedir(), "mariadb1011", "bin");
const bin = (name) => join(mariadbBin, name + exe);

function readDatabaseUrl() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) throw new Error(".env not found. Run `npm run setup:env` first.");
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL missing from .env");
  const url = new URL(line.slice("DATABASE_URL=".length).replace(/^"|"$/g, ""));
  if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must be a mysql:// URL.");
  return url;
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

const [, , command] = process.argv;
const url = readDatabaseUrl();
const port = url.port || "3306";
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const database = url.pathname.slice(1);

// Passwords go through MYSQL_PWD rather than the command line, where other processes could read them.
const asRoot = (rootPassword) => ({ env: { ...process.env, MYSQL_PWD: rootPassword } });
const client = ["--host=127.0.0.1", `--port=${port}`, "--user=root", "--protocol=TCP"];

function writeConfig() {
  const forward = (p) => p.replace(/\\/g, "/");
  writeFileSync(
    configFile,
    `[mysqld]
datadir=${forward(dataDir)}
port=${port}
bind-address=127.0.0.1
log-error=${forward(logFile)}
# Table names keep their case on disk but compare case-insensitively (Windows). Fixed at initialisation.
lower_case_table_names=2
# Production host settings (MariaDB 10.11.19 on cPanel, probed 2026-10-07).
skip-log-bin
sql_mode=""
character-set-server=latin1
collation-server=latin1_swedish_ci
max_user_connections=18
`,
  );
}

function ping(rootPassword) {
  return spawnSync(bin("mariadb-admin"), [...client, "ping"], { stdio: "ignore", ...asRoot(rootPassword) }).status === 0;
}

async function startServer(rootPassword) {
  if (ping(rootPassword)) {
    console.log(`MariaDB already running on 127.0.0.1:${port}`);
    return;
  }
  const child = spawn(bin("mariadbd"), [`--defaults-file=${configFile}`], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  for (let i = 0; i < 60; i++) {
    if (ping(rootPassword)) {
      console.log(`MariaDB running on 127.0.0.1:${port} (log: mariadb-data.log)`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("MariaDB did not start within 60 s. See mariadb-data.log.");
}

const quote = (s) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

switch (command) {
  case "init": {
    if (existsSync(join(dataDir, "mysql"))) {
      console.log("Instance already initialised at mariadb-data");
      break;
    }
    writeConfig();
    // Creates the system tables with a password-less root; the password is set over stdin below.
    run(bin("mariadb-install-db"), [`--datadir=${dataDir}`, `--port=${port}`]);
    await startServer("");
    // root keeps the same password as the application user; it is bound to 127.0.0.1 only.
    const sql = [
      ...["localhost", "127.0.0.1", "::1"].map((host) => `ALTER USER IF EXISTS 'root'@'${host}' IDENTIFIED BY ${quote(password)};`),
      // Same as cPanel: the server default stays latin1; Prisma names utf8mb4 on every table.
      `CREATE DATABASE \`${database}\`;`,
      ...["localhost", "127.0.0.1"].flatMap((host) => [
        `CREATE USER ${quote(user)}@'${host}' IDENTIFIED BY ${quote(password)};`,
        `GRANT ALL PRIVILEGES ON \`sims%\`.* TO ${quote(user)}@'${host}';`,
        `GRANT ALL PRIVILEGES ON \`prisma\\_migrate\\_shadow\\_db%\`.* TO ${quote(user)}@'${host}';`,
      ]),
    ].join("\n");
    // Through stdin, not -e: the statements contain passwords.
    run(bin("mariadb"), [...client, "--skip-password"], { input: sql, stdio: ["pipe", "inherit", "inherit"] });
    console.log(`Created database "${database}" and user "${user}" on port ${port}.`);
    break;
  }
  case "start":
    if (!existsSync(configFile)) throw new Error("Not initialised. Run `npm run db:local:init` first.");
    await startServer(password);
    break;
  case "stop":
    run(bin("mariadb-admin"), [...client, "shutdown"], asRoot(password));
    break;
  case "status": {
    const ok = ping(password);
    console.log(ok ? `MariaDB is running on 127.0.0.1:${port}` : "MariaDB is not running.");
    process.exit(ok ? 0 : 1);
  }
  default:
    console.error("Usage: node scripts/db-local.mjs <init|start|stop|status>");
    process.exit(2);
}
