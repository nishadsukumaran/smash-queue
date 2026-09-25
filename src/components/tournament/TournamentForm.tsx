import type { Tournament, Venue } from "@/db/schema";
import { SubmitButton } from "@/components/SubmitButton";

/** The tournament's own details, for creating and for editing. */
export function TournamentFields({ t, venues }: { t?: Tournament; venues: Venue[] }) {
  return (
    <>
      <label className="block">
        <span className="label">Tournament name</span>
        <input className="input mt-1" name="name" defaultValue={t?.name ?? ""} placeholder="Abu Dhabi Smashers Open 2026" required minLength={3} maxLength={120} />
      </label>

      <label className="block">
        <span className="label">About it</span>
        <textarea className="input mt-1 min-h-24" name="description" defaultValue={t?.description ?? ""}
          placeholder="What it is, who it's for, shuttles used, food, anything players should know" maxLength={4000} />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Starts</span>
          <input className="input mt-1" name="startDate" type="date" defaultValue={t?.startDate ?? ""} required />
        </label>
        <label className="block">
          <span className="label">Ends</span>
          <input className="input mt-1" name="endDate" type="date" defaultValue={t?.endDate ?? ""} />
          <span className="mt-1 block text-xs text-muted">Blank for a one-day event</span>
        </label>
        <label className="block">
          <span className="label">First match</span>
          <input className="input mt-1" name="startTime" type="time" defaultValue={t?.startTime ?? "09:00"} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Venue</span>
          <select className="input mt-1" name="venueId" defaultValue={t?.venueId ?? venues[0]?.id ?? ""}>
            <option value="">Somewhere else (type below)</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Or the venue&apos;s name</span>
          <input className="input mt-1" name="venueText" defaultValue={t?.venueText ?? ""} placeholder="Only if not in the list" maxLength={200} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Who can enter</span>
          <select className="input mt-1" name="visibility" defaultValue={t?.visibility ?? "community"}>
            <option value="community">Our members only</option>
            <option value="public">Any SmashQ player (listed publicly)</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Entries close</span>
          <input className="input mt-1" name="entryDeadline" type="date" defaultValue={t?.entryDeadline ?? ""} />
          <span className="mt-1 block text-xs text-muted">At the end of this day</span>
        </label>
        <label className="block">
          <span className="label">New entries</span>
          <select className="input mt-1" name="approval" defaultValue={t?.approval ?? "manual"}>
            <option value="manual">I confirm each one</option>
            <option value="auto">In straight away</option>
          </select>
        </label>
      </div>

      <label className="block">
        <span className="label">How to pay the entry fee</span>
        <textarea className="input mt-1 min-h-20" name="paymentNote" defaultValue={t?.paymentNote ?? ""}
          placeholder="e.g. Bank transfer to ... (IBAN AE..), reference your player number. Or cash at the desk before your first match." maxLength={2000} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Rules</span>
          <textarea className="input mt-1 min-h-20" name="rules" defaultValue={t?.rules ?? ""}
            placeholder="Scoring, shuttle, reporting time, walkover after 10 minutes..." maxLength={6000} />
        </label>
        <label className="block">
          <span className="label">Contact for questions</span>
          <input className="input mt-1" name="contact" defaultValue={t?.contact ?? ""} placeholder="Name and phone / WhatsApp" maxLength={200} />
        </label>
      </div>
    </>
  );
}

export function SaveButton({ label }: { label: string }) {
  return (
    <SubmitButton className="btn btn-primary w-full" pendingLabel="Saving...">
      {label}
    </SubmitButton>
  );
}
