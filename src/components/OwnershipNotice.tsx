import { SubmitButton } from "@/components/SubmitButton";
import { acceptOwnershipAction } from "@/server/community-actions";

/**
 * Shown to an owner once, before the organizer screens, and recorded when they
 * accept. Every line here has to stay true of the code: if a platform-admin
 * shortcut ever reappears in lib/auth, this notice becomes a lie.
 */
export function OwnershipNotice({ groupId, name }: { groupId: string; name: string }) {
  return (
    <section className="card mx-auto max-w-lg border-shuttle/40 p-5">
      <p className="label text-shuttle">Before you start</p>
      <h1 className="mt-1 text-xl font-extrabold tracking-tight">This community is yours.</h1>
      <p className="mt-3 text-sm">
        You own <span className="font-semibold">{name}</span>: its members, sessions, scores and
        payment records. You decide who joins, who organizes, and whether it carries on.
      </p>

      <h2 className="label mt-5">What Smash Queue will never do</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-chalk/90">
        <li>Share your members&apos; details with any other community.</li>
        <li>
          Contact your members about anything you didn&apos;t trigger. The only emails they get are
          sign-in codes they ask for, invitations you send, and notices about your sessions.
        </li>
        <li>
          Add organizers, remove members, or take control of your community. Platform
          administrators have no access to it.
        </li>
      </ul>

      <h2 className="label mt-5">What that means for you</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-chalk/90">
        <li>
          There is no admin rescue. If you want a backup, make someone a co-owner under Members.
        </li>
        <li>If you stop running it, it simply goes quiet.</li>
        <li>
          You can delete it at any time. You&apos;ll have 30 days to change your mind; after that it
          is gone for good.
        </li>
      </ul>

      <form action={acceptOwnershipAction} className="mt-6">
        <input type="hidden" name="groupId" value={groupId} />
        <SubmitButton className="btn btn-primary w-full" haptic="confirm">
          I understand — take me to my community
        </SubmitButton>
      </form>
    </section>
  );
}
