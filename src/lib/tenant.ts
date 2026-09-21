import "server-only";
import { cookies } from "next/headers";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { groupMembers, groups, type Group, type MemberRole } from "@/db/schema";
import { currentUserId } from "@/lib/identity";
import { currentAccount, isPlatformAdmin, type Account } from "@/lib/auth";

/**
 * Which community the person is currently looking at.
 *
 * Every screen except the platform console and the public directory is scoped
 * to exactly one community, and this is the single place that decides which.
 * Before this existed the app took the first row of `groups` and hoped there
 * was only ever one; the moment a second community exists that is not a
 * simplification, it is a data leak with a countdown on it.
 *
 * Nothing here trusts the cookie on its own. The cookie only *selects* among
 * communities the viewer has already been shown to belong to, so a hand-edited
 * value gets somebody nothing.
 */

const ACTIVE = "bq_group";
const YEAR = 60 * 60 * 24 * 365;

export type Membership = { group: Group; role: MemberRole };

const RANK: Record<MemberRole, number> = { organizer: 3, coordinator: 2, player: 1 };

/**
 * Every user id this browser might be acting as.
 *
 * Two identities can be live at once: the `bq_uid` cookie that says which
 * player this phone belongs to, and a signed-in account. They are usually the
 * same person and occasionally not — a coordinator signs in on the club's
 * shared tablet that is still set to somebody else's name. For deciding what
 * this browser may *see*, either one counts; for recording who did something,
 * the caller still picks deliberately.
 */
export async function viewerIds(account?: Account | null): Promise<string[]> {
  const acc = account === undefined ? await currentAccount() : account;
  const uid = await currentUserId();
  return Array.from(new Set([acc?.id, uid].filter(Boolean) as string[]));
}

/** Communities this browser actually belongs to. Archived ones are left out. */
export async function myCommunities(account?: Account | null): Promise<Membership[]> {
  const ids = await viewerIds(account);
  if (ids.length === 0) return [];

  const rows = await db
    .select({ group: groups, role: groupMembers.role })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(
      and(
        inArray(groupMembers.userId, ids),
        eq(groupMembers.status, "active"),
        isNull(groups.archivedAt),
      ),
    );

  // Two identities can both be members of the same community; keep the
  // stronger role rather than showing the place twice.
  const best = new Map<string, Membership>();
  for (const row of rows) {
    const held = best.get(row.group.id);
    if (!held || RANK[row.role] > RANK[held.role]) best.set(row.group.id, row);
  }

  return [...best.values()].sort(
    (a, b) => RANK[b.role] - RANK[a.role] || a.group.name.localeCompare(b.group.name),
  );
}

/**
 * The community the rest of the app should render, or null when the person
 * belongs to none — which is now a real state, and the reason the home page
 * has something to say to a stranger.
 */
export async function activeCommunity(account?: Account | null): Promise<Membership | null> {
  const acc = account === undefined ? await currentAccount() : account;
  const mine = await myCommunities(acc);
  const jar = await cookies();
  const pinned = jar.get(ACTIVE)?.value;

  if (pinned) {
    const hit = mine.find((m) => m.group.id === pinned);
    if (hit) return hit;

    // A platform admin can hold a community open that they are not a member
    // of — that is the whole job. Everybody else falls through to their own
    // list, so a stale or forged cookie is simply ignored.
    if (isPlatformAdmin(acc)) {
      const [group] = await db.select().from(groups).where(eq(groups.id, pinned));
      if (group) return { group, role: "organizer" };
    }
  }

  return mine[0] ?? null;
}

/** Only ever called from a Server Action: cookie writes are refused elsewhere. */
export async function setActiveCommunity(groupId: string) {
  const jar = await cookies();
  jar.set(ACTIVE, groupId, { path: "/", maxAge: YEAR, sameSite: "lax" });
}

export async function clearActiveCommunity() {
  const jar = await cookies();
  jar.delete(ACTIVE);
}

/** Is this browser an active member of that community? */
export async function isMemberOf(groupId: string, account?: Account | null) {
  const mine = await myCommunities(account);
  return mine.some((m) => m.group.id === groupId);
}
