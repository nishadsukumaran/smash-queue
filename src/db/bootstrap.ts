import "./env";
import { eq } from "drizzle-orm";
import { openDb } from "./raw";
import { authEmails, groupMembers, groups, users, venues } from "./schema";
import { newId } from "@/lib/ids";
import { colorFor } from "@/lib/format";
import { DEFAULT_WEIGHTS, BALANCE_BY_TYPE } from "@/lib/queue-engine";

/**
 * Production bootstrap. Creates the group, its first venue and the owner, and
 * nothing else - no demo players, no fake match history.
 *
 * Safe to run twice: it stops if the group already exists rather than making a
 * second one.
 *
 *   GROUP_NAME="Abu Dhabi Smashers" OWNER_NAME="Nishad Sukumaran" \
 *   VENUE_NAME="Zayed Sports City, Hall 2" STAFF_PIN=4821 \
 *   npm run db:bootstrap
 */
async function main() {
  const { db } = openDb();

  const groupName = process.env.GROUP_NAME?.trim() || "Badminton Group";
  const ownerName = process.env.OWNER_NAME?.trim() || "Organizer";
  const venueName = process.env.VENUE_NAME?.trim() || "Main Hall";
  const location = process.env.GROUP_LOCATION?.trim() || "Abu Dhabi, UAE";
  const currency = process.env.CURRENCY?.trim() || "AED";
  const fee = Number(process.env.DEFAULT_FEE ?? 40);
  const courts = Number(process.env.COURT_COUNT ?? 4);
  const pin = (process.env.STAFF_PIN ?? "").trim();
  const ownerEmail = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();

  if (!/^\d{4,8}$/.test(pin)) {
    console.error("STAFF_PIN must be 4 to 8 digits. Refusing to bootstrap with a guessable PIN.");
    process.exit(1);
  }

  // Without this the group exists but nobody can reach /admin: the organizer
  // screens need an account, and an account is an email.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ownerEmail)) {
    console.error("OWNER_EMAIL must be a real address — it is how the organizer signs in.");
    process.exit(1);
  }

  const existing = await db.select().from(groups).limit(1);
  if (existing.length) {
    console.log(`Group "${existing[0].name}" already exists. Nothing to do.`);
    return;
  }

  const now = new Date();
  const ownerId = newId("usr");
  await db.insert(users).values({
    id: ownerId,
    name: ownerName,
    email: ownerEmail,
    avatarColor: colorFor(ownerName),
    rating: 1200,
    createdAt: now,
  });

  await db.insert(authEmails).values({
    id: newId("aem"),
    userId: ownerId,
    email: ownerEmail,
    createdAt: now,
  });

  const groupId = newId("grp");
  await db.insert(groups).values({
    id: groupId,
    name: groupName,
    ownerId,
    location,
    defaultFee: fee,
    currency,
    settings: {
      staffPin: pin,
      pointsTo: Number(process.env.POINTS_TO ?? 30),
      defaultGameType: "balanced",
      weights: { ...DEFAULT_WEIGHTS, balance: BALANCE_BY_TYPE.balanced },
      requireScoreConfirmation: false,
      allowSelfSignup: true,
    },
    createdAt: now,
  });

  await db.insert(groupMembers).values({
    id: newId("gm"),
    groupId,
    userId: ownerId,
    role: "organizer",
    joinedAt: now,
  });

  await db.insert(venues).values({
    id: newId("ven"),
    groupId,
    name: venueName,
    address: process.env.VENUE_ADDRESS?.trim() || null,
    courtCount: courts,
  });

  const check = await db.select().from(groups).where(eq(groups.id, groupId));
  console.log(`Created group "${check[0].name}" with owner ${ownerName} and venue ${venueName}.`);
  console.log("Staff PIN is set. Create your first session at /admin/new.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
