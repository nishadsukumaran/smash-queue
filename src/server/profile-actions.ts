"use server";

/**
 * A player's own profile. Only the signed-in player can change it, and only
 * their own: every action reads the id from the session, never from the form.
 */

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { preferredPartners, users, type Gender, type PlayerLevel } from "@/db/schema";
import { currentAccount, isRegistered } from "@/lib/auth";
import { newId } from "@/lib/ids";
import { safeNext } from "@/lib/safe-next";
import { GENDERS, LEVELS, MIN_BIRTH_YEAR, isCountry, maxBirthYear } from "@/lib/profile";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const MAX_PARTNERS = 12;

function back(fd: FormData, message: string, error = false): never {
  const to = safeNext(str(fd, "back"), "/me/profile");
  const sep = to.includes("?") ? "&" : "?";
  redirect(`${to}${sep}${error ? "e" : "m"}=${encodeURIComponent(message)}`);
}

async function me() {
  const account = await currentAccount();
  if (!account || !account.onboarded) redirect("/signin?next=/me/profile");
  return account;
}

export async function saveProfileAction(fd: FormData) {
  const account = await me();

  const name = str(fd, "name").replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) back(fd, "Your name should be 2 to 40 characters.", true);

  const gender = str(fd, "gender") as Gender;
  const level = str(fd, "level") as PlayerLevel;
  const yearRaw = str(fd, "birthYear");
  const year = yearRaw ? Number(yearRaw) : null;
  if (year !== null && (!Number.isInteger(year) || year < MIN_BIRTH_YEAR || year > maxBirthYear()))
    back(fd, `Birth year should be between ${MIN_BIRTH_YEAR} and ${maxBirthYear()}.`, true);
  const nationality = str(fd, "nationality").toUpperCase();
  const hand = str(fd, "handedness");
  const phone = str(fd, "phone").replace(/[^\d+ ]/g, "").slice(0, 20);

  await db
    .update(users)
    .set({
      name,
      phone: phone || null,
      gender: GENDERS.some((g) => g.value === gender) ? gender : null,
      level: LEVELS.some((l) => l.value === level) ? level : null,
      birthYear: year,
      nationality: nationality && isCountry(nationality) ? nationality : null,
      handedness: hand === "left" || hand === "right" ? hand : null,
      profileUpdatedAt: new Date(),
    })
    .where(eq(users.id, account.id));

  revalidatePath("/", "layout");
  // Coming from a tournament entry: straight back to it.
  const next = safeNext(str(fd, "next"), "");
  if (next) redirect(`${next}${next.includes("?") ? "&" : "?"}m=${encodeURIComponent("Profile saved. You can enter now.")}`);
  back(fd, "Profile saved.");
}

export async function addPreferredPartnerAction(fd: FormData) {
  const account = await me();
  const no = Number(str(fd, "partnerNo").replace(/[^0-9]/g, ""));
  if (!no) back(fd, "Enter their player number. It's on their profile.", true);

  const [p] = await db
    .select({ id: users.id, name: users.name, active: users.active })
    .from(users)
    .where(eq(users.playerNo, no));
  if (!p || !p.active) back(fd, `No player has the number ${no}.`, true);
  if (p.id === account.id) back(fd, "That's your own number.", true);
  if (!(await isRegistered(p.id))) back(fd, `${p.name} doesn't have a SmashQ account yet.`, true);

  const mine = await db
    .select({ partnerId: preferredPartners.partnerId })
    .from(preferredPartners)
    .where(eq(preferredPartners.userId, account.id));
  if (mine.some((m) => m.partnerId === p.id)) back(fd, `${p.name} is already on your list.`, true);
  if (mine.length >= MAX_PARTNERS) back(fd, `${MAX_PARTNERS} is the most you can keep. Remove one first.`, true);

  await db.insert(preferredPartners).values({
    id: newId("pp"),
    userId: account.id,
    partnerId: p.id,
    createdAt: new Date(),
  });
  revalidatePath("/me/profile");
  back(fd, `Added ${p.name}.`);
}

export async function removePreferredPartnerAction(fd: FormData) {
  const account = await me();
  await db
    .delete(preferredPartners)
    .where(and(eq(preferredPartners.userId, account.id), eq(preferredPartners.partnerId, str(fd, "partnerId"))));
  revalidatePath("/me/profile");
  back(fd, "Removed.");
}
