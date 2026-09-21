import type { MemberRole } from "@/db/schema";

/**
 * Shapes shared between the community actions and the forms that call them.
 *
 * They live outside the `"use server"` module because such a module may only
 * export async functions; anything else fails the build rather than being
 * quietly tolerated.
 */

export type CommunityFormState =
  | null
  | { ok: true; message: string; url?: string }
  | { ok: false; message: string };

export type JoinFormState =
  | null
  | { ok: true; status: "joined" | "waiting" | "already" }
  | { ok: false; message: string; duplicate?: { id: string; name: string } };

export type InviteView = {
  token: string;
  groupId: string;
  groupName: string;
  slug: string;
  role: MemberRole;
  name: string | null;
  /** Already a member — the link has nothing left to do. */
  alreadyIn: boolean;
};

export const COMMUNITY_IDLE: CommunityFormState = null;
export const JOIN_IDLE: JoinFormState = null;
