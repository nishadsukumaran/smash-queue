import "./env";
import { and, eq } from "drizzle-orm";
import { openDb } from "./raw";
import { authEmails, groupMembers, groups, users } from "./schema";
import { newId } from "@/lib/ids";

/**
 * Gives an existing player an organizer account, or adds another sign-in
 * address to one they already have.
 *
 *   npm run db:grant-admin -- "Nishad Sukumaran" nishad.me@gmail.com
 *   npm run db:grant-admin -- "Nishad Sukumaran" ns@aiops.ae
 *
 * It attaches addresses to an existing person on purpose. Creating a second
 * user row for the same human is the one mistake that quietly breaks
 * everything downstream: games played, fairness, Elo and partner history all
 * hang off a single user id, and nothing warns you that they have been split
 * in two.
 */
async function main() {
  const { db } = openDb();

  const [name, rawEmail, roleArg] = process.argv.slice(2);
  const email = (rawEmail ?? "").trim().toLowerCase();
  const role = (roleArg ?? "organizer") as "organizer" | "coordinator";

  if (!name || !email) {
    console.error('Usage: npm run db:grant-admin -- "Full Name" email@example.com [organizer|coordinator]');
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    console.error(`"${email}" is not an email address.`);
    process.exit(1);
  }

  const matches = await db.select().from(users).where(eq(users.name, name));
  if (matches.length === 0) {
    console.error(`No player called "${name}". Names are matched exactly — check the roster.`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`"${name}" matches ${matches.length} players. Rename one first; two records for one person break stats.`);
    process.exit(1);
  }
  const user = matches[0];

  const [taken] = await db.select().from(authEmails).where(eq(authEmails.email, email));
  if (taken && taken.userId !== user.id) {
    console.error(`${email} already signs in as a different person. Refusing to move it.`);
    process.exit(1);
  }

  const now = new Date();

  if (!taken) {
    await db.insert(authEmails).values({ id: newId("aem"), userId: user.id, email, createdAt: now });
    console.log(`Added ${email} as a sign-in address for ${user.name}.`);
  } else {
    console.log(`${email} already signs in as ${user.name}.`);
  }

  // The first address doubles as the contact address shown in the UI.
  if (!user.email) {
    await db.update(users).set({ email }).where(eq(users.id, user.id));
    console.log(`Set ${email} as the contact address.`);
  }

  // Staff rights are per group, so grant them everywhere this person is a member.
  const all = await db.select().from(groups);
  for (const group of all) {
    const [member] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, user.id)));

    if (!member) {
      await db.insert(groupMembers).values({
        id: newId("gmb"),
        groupId: group.id,
        userId: user.id,
        role,
        status: "active",
        joinedAt: now,
      });
      console.log(`Added to "${group.name}" as ${role}.`);
    } else if (member.role !== role && role === "organizer") {
      await db.update(groupMembers).set({ role }).where(eq(groupMembers.id, member.id));
      console.log(`Promoted to ${role} in "${group.name}" (was ${member.role}).`);
    } else {
      console.log(`Already ${member.role} in "${group.name}".`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
