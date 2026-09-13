import { SubmitButton } from "@/components/SubmitButton";
import { pinAction } from "@/server/form-actions";
import { isStaffFor } from "@/lib/identity";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/brand";

/** Wraps coordinator and organizer screens behind the group's staff PIN. */
export async function StaffGate({
  groupId,
  next,
  children,
}: {
  groupId: string;
  next: string;
  children: React.ReactNode;
}) {
  if (await isStaffFor(groupId)) return <>{children}</>;

  return (
    <div className="card mx-auto max-w-sm p-5">
      <p className="label">Coordinator access</p>
      <h2 className="mt-1 text-lg font-bold">Enter the session PIN</h2>
      <p className="mt-1 text-sm text-muted">
        Ask the organizer. It unlocks the court board, check-in and payments on this phone.
      </p>
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
          required
        />
        <SubmitButton className="btn btn-primary w-full" pendingLabel="Checking...">
          Unlock
        </SubmitButton>
      </form>
      <p className="mt-4 text-center text-xs text-muted">
        Lost the PIN?{" "}
        <a href={supportMailto("Lost staff PIN")} className="text-teal hover:underline">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </div>
  );
}
