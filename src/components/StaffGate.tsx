import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { pinAction } from "@/server/form-actions";
import { isStaffFor } from "@/lib/identity";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groups } from "@/db/schema";
import { currentAccount, canStaff, canOrganize, isPlatformAdmin } from "@/lib/auth";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/brand";

/**
 * Two gates, two threat models.
 *
 * `StaffGate` guards the screens a coordinator needs mid-session: the court
 * board, check-in, payments, the QR. It accepts either a signed-in account or
 * the group PIN, because the realistic alternative at 7pm in a sports hall
 * with one bar of signal is "go and find your email", and a coordinator who
 * cannot start a game will run the night on paper instead.
 *
 * `OrganizerGate` guards members, venues, fees, settings and anything that
 * spans sessions. That needs an account, full stop: a four-digit PIN shared
 * round a WhatsApp group is not a credential for other people's data, and the
 * moment a second group exists on this deployment it is guarding someone
 * else's roster and money as well.
 */

function GateShell({
  eyebrow,
  title,
  blurb,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="card mx-auto max-w-sm p-5">
      <p className="label">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{blurb}</p>
      {children}
      <p className="mt-4 text-center text-xs text-muted">
        {footer ?? (
          <>
            <Link href="/guide" className="text-teal hover:underline">
              What is this?
            </Link>{" "}
            &middot; Stuck?{" "}
            <a href={supportMailto("Cannot get in")} className="text-teal hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </>
        )}
      </p>
    </div>
  );
}

export async function StaffGate({
  groupId,
  next,
  children,
}: {
  groupId: string;
  next: string;
  children: React.ReactNode;
}) {
  const account = await currentAccount();
  if (canStaff(account, groupId)) return <>{children}</>;
  if (await isStaffFor(groupId)) return <>{children}</>;

  const [group] = await db
    .select({ settings: groups.settings })
    .from(groups)
    .where(eq(groups.id, groupId));
  if (group?.settings?.pinDisabled) {
    return (
      <GateShell
        eyebrow="Coordinator access"
        title="Sign in to run the court"
        blurb={
          account
            ? `You're signed in as ${account.name}, but you aren't a coordinator here. Ask the owner.`
            : "This community runs the court with named accounts, not a shared PIN."
        }
      >
        {!account && (
          <Link href={`/signin?next=${encodeURIComponent(next)}`} className="btn btn-primary mt-4 w-full">
            Sign in
          </Link>
        )}
      </GateShell>
    );
  }

  return (
    <GateShell
      eyebrow="Coordinator access"
      title="Enter the session PIN"
      blurb="Ask the organizer. It unlocks the court board, check-in and payments on this phone."
    >
      <form action={pinAction} className="mt-4 space-y-3">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="next" value={next} />
        <input
          className="input text-center text-2xl tracking-[.5em]"
          name="pin"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          placeholder="----"
          aria-label="Session PIN"
          required
        />
        <SubmitButton className="btn btn-primary w-full" pendingLabel="Checking...">
          Unlock
        </SubmitButton>
      </form>

      <div className="mt-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[.65rem] uppercase tracking-widest text-muted">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <Link
        href={`/signin?next=${encodeURIComponent(next)}`}
        className="btn btn-ghost mt-4 w-full"
      >
        Sign in with email
      </Link>
    </GateShell>
  );
}

export async function OrganizerGate({
  groupId,
  next,
  children,
}: {
  groupId: string;
  next: string;
  children: React.ReactNode;
}) {
  const account = await currentAccount();
  if (canOrganize(account, groupId)) return <>{children}</>;

  // Signed in, but not an organizer here. Say so plainly rather than showing a
  // sign-in form they have already used — that reads as a broken login.
  if (account) {
    return (
      <GateShell
        eyebrow="Organizer access"
        title="Not your group"
        blurb={`You're signed in as ${account.name}, but you don't organise this group. Ask whoever does to add you as an organizer.`}
      >
        <Link href="/" className="btn btn-ghost mt-4 w-full">
          Back to sessions
        </Link>
      </GateShell>
    );
  }

  return (
    <GateShell
      eyebrow="Organizer access"
      title="Sign in to continue"
      blurb="Members, venues, fees and settings need an account. The session PIN doesn't reach this far."
    >
      <Link
        href={`/signin?next=${encodeURIComponent(next)}`}
        className="btn btn-primary mt-4 w-full"
      >
        Email me a sign-in link
      </Link>
    </GateShell>
  );
}

/**
 * The platform console. A third gate rather than a stricter organizer gate,
 * because the thing it protects is different in kind: not one community's
 * money and roster, but the power to create communities and appoint the
 * people who run them.
 *
 * It says nothing about what is behind it to somebody who has no business
 * there. A page that announces "platform administration" to every visitor is
 * an invitation to go looking.
 */
export async function PlatformGate({
  next,
  children,
}: {
  next: string;
  children: React.ReactNode;
}) {
  const account = await currentAccount();
  if (isPlatformAdmin(account)) return <>{children}</>;

  if (account) {
    return (
      <GateShell
        eyebrow="Not available"
        title="Nothing here for you"
        blurb={`You're signed in as ${account.name}. This screen isn't part of your account.`}
      >
        <Link href="/" className="btn btn-ghost mt-4 w-full">
          Back to your communities
        </Link>
      </GateShell>
    );
  }

  return (
    <GateShell
      eyebrow="Sign in"
      title="Sign in to continue"
      blurb="This screen needs an account."
    >
      <Link
        href={`/signin?next=${encodeURIComponent(next)}`}
        className="btn btn-primary mt-4 w-full"
      >
        Email me a sign-in link
      </Link>
    </GateShell>
  );
}
