import type { GroupSettings, JoinPolicy } from "@/db/schema";

/**
 * How somebody new gets into a group.
 *
 * A plain function rather than an export from actions.ts, because that module
 * is "use server" and may only export async functions — a sync helper there
 * fails the build rather than being quietly wrapped.
 *
 * Falls back to the older boolean so groups created before the three-way
 * setting keep the behaviour their organizer chose.
 */
export function joinPolicyOf(settings: GroupSettings | null | undefined): JoinPolicy {
  if (settings?.joinPolicy) return settings.joinPolicy;
  return settings?.allowSelfSignup === false ? "closed" : "open";
}
