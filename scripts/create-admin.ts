/**
 * Creates a System Administrator account — the way to bootstrap a production installation, where the
 * demo accounts do not exist. Prints a one-time temporary password; the administrator must change it
 * at first sign-in and (in production) set up two-step verification. The action is audited.
 *
 *   npm run create-admin -- --username jdoe --email j.doe@example.co.ke --name "Jane Doe"
 */
import { parseArgs } from "node:util";
import { z } from "zod";

const input = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9._-]+$/, "Use lowercase letters, digits, dots, dashes or underscores."),
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(2).max(120),
});

async function main() {
  const { values } = parseArgs({ options: { username: { type: "string" }, email: { type: "string" }, name: { type: "string" } } });
  const parsed = input.safeParse(values);
  if (!parsed.success) {
    console.error('Usage: npm run create-admin -- --username <username> --email <email> --name "<full name>"');
    for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    process.exit(2);
  }
  const { prisma } = await import("@/server/db");
  const { hashPassword, temporaryPassword } = await import("@/server/auth/password");
  const { audit, raiseAlert } = await import("@/server/audit");
  const { username, email, name } = parsed.data;

  if (await prisma.user.findFirst({ where: { OR: [{ username }, { email }] }, select: { id: true } })) {
    console.error("A user with that username or email already exists. Use the Users screen to change roles or reset passwords.");
    process.exit(1);
  }
  const password = temporaryPassword();
  const user = await prisma.user.create({
    data: { username, email, fullName: name, role: "SYSTEM_ADMIN", clearance: "RESTRICTED", passwordHash: await hashPassword(password), permissionDenials: [] },
  });
  await audit({ action: "users.create_admin_cli", actorLabel: "command line", entityType: "user", entityId: user.id, after: { username, email, role: "SYSTEM_ADMIN" } });
  await raiseAlert({ type: "ADMIN_ROLE_CHANGE", severity: "HIGH", message: `Administrator account ${username} was created from the command line.`, subjectUserId: user.id });
  console.log(`Created System Administrator "${username}".`);
  console.log(`Temporary password (shown once): ${password}`);
  console.log("It must be changed at first sign-in. In production, two-step verification set-up follows.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
