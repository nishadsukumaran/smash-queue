import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { RequestRoleForm, SetPinForm } from "@/components/AccountForms";
import { PushToggle } from "@/components/PushToggle";
import {
  getPlayerStats, myCommunityRecords, myCommunityRequests, myDeletedCommunities, myInvites,
  myRoleRequests,
} from "@/server/queries";
import { forgetDeviceAction, revokeDeviceAction, signOutAction } from "@/server/auth-actions";
import {
  answerInviteAction, leaveCommunityAction, restoreCommunityAction, switchCommunityAction,
  withdrawCommunityRequestAction,
} from "@/server/community-actions";
import { currentAccount, isPlatformAdmin, listMyDevices, pinCandidate } from "@/lib/auth";
import { currentUserId } from "@/lib/identity";
import { ratingBand } from "@/lib/fairness";
import { prettyDate, prettyDateTime } from "@/lib/format";
import type { MemberRole } from "@/db/schema";

export const dynamic = "force-dynamic";

const ROLE: Record<MemberRole, string> = {
  owner: "Owner",
  organizer: "Organizer",
  coordinator: "Coordinator",
  player: "Player",
};

/**
 * Your own page: every community you're in, what you are in each, and your
 * record — overall and community by community.
 *
 * This is the one place the numbers from different communities sit side by
 * side, and it is only ever shown to the person they belong to. No community
 * sees any of it beyond its own games.
 */
export default async function MePage() {
  const account = await currentAccount();

  if (!account) return <NotSignedIn />;

  const [overall, communities, invites, requests, deleted, roleAsks, devices, pin] =
    await Promise.all([
      getPlayerStats(account.id),
      myCommunityRecords(account.id),
      myInvites(account.id),
      myCommunityRequests(account.id),
      myDeletedCommunities(account.id),
      myRoleRequests(account.id),
      listMyDevices(account.id),
      pinCandidate(),
    ]);
  const hasPinHere = Boolean(pin && pin.playerNo === account.playerNo);
  const askedFor = new Set(roleAsks.map((r) => r.group.id));

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex items-center gap-3">
          <Avatar name={account.name} size={54} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold">{account.name}</h1>
            <p className="text-sm text-muted">
              Player <span className="font-mono font-bold text-shuttle">#{account.playerNo}</span>
              {account.email ? ` · ${account.email}` : ""}
            </p>
          </div>
          <form action={signOutAction} className="ml-auto">
            <SubmitButton className="btn btn-ghost btn-sm">Sign out</SubmitButton>
          </form>
        </div>
        {overall && overall.recentForm.length > 0 && (
          <div className="mt-4 flex gap-1" aria-label="Recent results">
            {overall.recentForm.map((f, i) => (
              <span
                key={i}
                className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-bold ${
                  f === "W" ? "bg-teal/20 text-teal" : f === "L" ? "bg-rose/20 text-rose" : "bg-surface-2 text-muted"
                }`}
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </section>

      {invites.length > 0 && (
        <section className="card border-shuttle/40 p-4">
          <h2 className="label text-shuttle">Invitations ({invites.length})</h2>
          <ul className="mt-2 divide-y divide-line">
            {invites.map(({ invite, group, inviter }) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{group.name}</p>
                  <p className="text-xs text-muted">
                    {inviter ? `From ${inviter.name}` : "Invitation"}
                    {invite.role !== "player" ? ` · as ${ROLE[invite.role].toLowerCase()}` : ""} ·
                    expires {prettyDate(invite.expiresAt.toISOString().slice(0, 10))}
                  </p>
                </div>
                <form action={answerInviteAction} className="flex gap-2">
                  <input type="hidden" name="inviteId" value={invite.id} />
                  <SubmitButton className="btn btn-primary btn-sm" name="accept" value="1">
                    Join
                  </SubmitButton>
                  <SubmitButton className="btn btn-ghost btn-sm" name="accept" value="0">
                    No thanks
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {overall && (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Sessions" value={String(overall.sessionsAttended)} />
          <Tile label="Games" value={String(overall.games)} />
          <Tile label="Won" value={String(overall.wins)} />
          <Tile label="Win rate" value={`${overall.winRate.toFixed(0)}%`} />
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="label">Your communities ({communities.length})</h2>
          <Link href="/communities" className="text-xs text-teal hover:underline">
            Find more
          </Link>
        </div>
        {communities.length === 0 && (
          <p className="card p-4 text-sm text-muted">
            You haven&apos;t joined one yet.{" "}
            <Link href="/communities" className="text-teal underline">
              Find a community
            </Link>{" "}
            or give an organizer your number, #{account.playerNo}.
          </p>
        )}
        {communities.map(({ membership, group, stats }) => {
          const band = ratingBand(membership.rating);
          const pending = membership.status === "pending";
          const runs = membership.role === "owner" || membership.role === "organizer";
          return (
            <article key={membership.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{group.name}</h3>
                    <span className={`chip ${runs ? "chip-teal" : ""}`}>
                      {pending ? "Waiting to be let in" : ROLE[membership.role]}
                    </span>
                  </div>
                  {!pending && (
                    <p className="mt-1 text-xs" style={{ color: band.color }}>
                      {band.label} &middot; {Math.round(membership.rating)} here
                    </p>
                  )}
                  {!pending && stats && (
                    <p className="mt-1 text-xs text-muted">
                      {stats.games} games &middot; {stats.wins}W {stats.losses}L &middot;{" "}
                      {stats.sessionsAttended} sessions
                      {stats.favouritePartner ? ` · best partner ${stats.favouritePartner.name}` : ""}
                    </p>
                  )}
                </div>
                {!pending && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <form action={switchCommunityAction}>
                      <input type="hidden" name="groupId" value={group.id} />
                      <input type="hidden" name="next" value="/" />
                      <SubmitButton className="btn btn-ghost btn-sm">Open</SubmitButton>
                    </form>
                    {runs && (
                      <form action={switchCommunityAction}>
                        <input type="hidden" name="groupId" value={group.id} />
                        <input type="hidden" name="next" value="/admin" />
                        <SubmitButton className="btn btn-primary btn-sm">Manage</SubmitButton>
                      </form>
                    )}
                  </div>
                )}
              </div>
              {!pending && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                  {membership.role === "player" || membership.role === "coordinator" ? (
                    askedFor.has(group.id) ? (
                      <span className="text-xs text-muted">Your request is with the owner.</span>
                    ) : (
                      <RequestRoleForm groupId={group.id} />
                    )
                  ) : (
                    <span />
                  )}
                  <form action={leaveCommunityAction}>
                    <input type="hidden" name="groupId" value={group.id} />
                    <SubmitButton className="btn btn-ghost btn-sm text-muted">Leave</SubmitButton>
                  </form>
                </div>
              )}
            </article>
          );
        })}
      </section>

      {deleted.length > 0 && (
        <section className="card border-rose/30 p-4">
          <h2 className="label text-rose">Deleted — still recoverable</h2>
          <ul className="mt-2 divide-y divide-line">
            {deleted.map(({ group }) => {
              const until = new Date(group.deletedAt!.getTime() + 30 * 86_400_000);
              return (
                <li key={group.id} className="flex flex-wrap items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{group.name}</p>
                    <p className="text-xs text-muted">Erased for good after {prettyDateTime(until)}</p>
                  </div>
                  <form action={restoreCommunityAction}>
                    <input type="hidden" name="groupId" value={group.id} />
                    <SubmitButton className="btn btn-primary btn-sm">Restore</SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card p-4">
        <div className="flex items-center justify-between">
          <h2 className="label">Start a community</h2>
          <Link href="/communities/new" className="btn btn-ghost btn-sm">
            Ask for one
          </Link>
        </div>
        {requests.length > 0 && (
          <ul className="mt-2 divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{r.name}</p>
                  <p className="text-xs text-muted">
                    {r.status === "pending"
                      ? `Waiting for approval · asked ${prettyDateTime(r.createdAt)}`
                      : r.status === "approved"
                        ? "Approved — it's yours"
                        : r.status === "declined"
                          ? `Not approved${r.decisionNote ? `: ${r.decisionNote}` : ""}`
                          : "Withdrawn"}
                  </p>
                </div>
                {r.status === "pending" && (
                  <form action={withdrawCommunityRequestAction}>
                    <input type="hidden" name="requestId" value={r.id} />
                    <SubmitButton className="btn btn-ghost btn-sm">Withdraw</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="label">Notifications</h2>
        <div className="mt-2">
          <PushToggle />
        </div>
      </section>

      <section className="card p-4">
        <h2 className="label">Signing in on this phone</h2>
        <p className="mt-1 text-xs text-muted">
          {hasPinHere
            ? "This phone unlocks with your PIN. Five wrong tries and it goes back to email."
            : "Set a four-digit PIN and this phone won't need an email code again."}
        </p>
        <div className="mt-3">
          <SetPinForm hasPin={hasPinHere} />
        </div>

        {devices.length > 1 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="label">Other phones and browsers</p>
            <ul className="mt-2 divide-y divide-line/60">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs">{describeAgent(d.userAgent)}</p>
                    <p className="text-[.68rem] text-muted">
                      {d.pinHash ? "PIN set" : "No PIN"} · last used{" "}
                      {d.lastUsedAt ? prettyDateTime(d.lastUsedAt) : "—"}
                    </p>
                  </div>
                  <form action={revokeDeviceAction}>
                    <input type="hidden" name="deviceId" value={d.id} />
                    <SubmitButton className="btn btn-ghost btn-sm">Forget</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form action={forgetDeviceAction} className="mt-3">
          <SubmitButton className="btn btn-ghost btn-sm text-muted">
            Sign out and forget this phone
          </SubmitButton>
        </form>
      </section>

      {isPlatformAdmin(account) && (
        <p className="text-center text-xs text-muted">
          <Link href="/hq" className="text-teal hover:underline">
            Platform console
          </Link>
        </p>
      )}
    </div>
  );
}

/** A browser described in words a person would use. */
function describeAgent(ua: string | null) {
  if (!ua) return "Unknown browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iPhone"
    : /Android/.test(ua)
      ? "Android phone"
      : /Mac OS X/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows PC"
          : "Computer";
  const browser = /CriOS|Chrome/.test(ua)
    ? "Chrome"
    : /Safari/.test(ua)
      ? "Safari"
      : /Firefox/.test(ua)
        ? "Firefox"
        : "browser";
  return `${browser} on ${os}`;
}

/**
 * Not signed in. If this phone plays as an unregistered name, show that
 * history and invite them to keep it — registering here takes it over.
 */
async function NotSignedIn() {
  const uid = await currentUserId();
  const stats = uid ? await getPlayerStats(uid) : null;

  return (
    <div className="card mx-auto max-w-sm space-y-4 p-5 text-center">
      {stats ? (
        <>
          <Avatar name={stats.user.name} size={54} />
          <div>
            <h1 className="text-lg font-bold">{stats.user.name}</h1>
            <p className="text-sm text-muted">
              {stats.games} games &middot; {stats.wins}W {stats.losses}L
            </p>
          </div>
          <p className="text-sm">
            Create your account on this phone and this history becomes yours — every community,
            every game, with a player number and your own profile.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">
          Sign in to see your communities, your games and your record.
        </p>
      )}
      <Link href="/signin?next=/me" className="btn btn-primary w-full">
        {stats ? "Create my account" : "Sign in or create an account"}
      </Link>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3 text-center">
      <p className="text-xl font-extrabold tabular">{value}</p>
      <p className="text-[.6rem] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}
