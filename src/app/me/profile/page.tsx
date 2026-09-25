import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash } from "@/components/tournament/bits";
import { currentAccount } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import {
  GENDERS, LEVELS, MIN_BIRTH_YEAR, ageFrom, countries, genderLabel, levelLabel, maxBirthYear,
  missingForTournaments,
} from "@/lib/profile";
import { getProfile, myPreferredPartners } from "@/server/profile-queries";
import {
  addPreferredPartnerAction, removePreferredPartnerAction, saveProfileAction,
} from "@/server/profile-actions";

export const dynamic = "force-dynamic";

/**
 * Your player profile. Everything is optional; gender and level become
 * required only when you enter a tournament, and the page says so.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; e?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const account = await currentAccount();
  if (!account) redirect("/signin?next=/me/profile");
  if (!account.onboarded) redirect("/welcome?next=/me/profile");

  const [u, partners] = await Promise.all([getProfile(account.id), myPreferredPartners(account.id)]);
  if (!u) redirect("/signin?next=/me/profile");
  const next = sp.next ? safeNext(sp.next, "") : "";
  const missing = missingForTournaments(u);
  const back = `/me/profile${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const age = ageFrom(u.birthYear);
  const thisYear = new Date().getFullYear();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Flash m={sp.m} e={sp.e} />

      {next && missing.length > 0 && (
        <p className="card border-amber/50 p-3 text-sm text-amber">
          To enter a tournament, add your {missing.join(" and ")}. You&apos;ll go straight back afterwards.
        </p>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="label">Your profile</p>
            <h1 className="mt-1 text-xl font-extrabold">{u.name}</h1>
            <p className="text-sm text-muted">
              Player <span className="font-mono font-bold text-shuttle">#{u.playerNo}</span>
            </p>
          </div>
          <Link href="/me" className="btn btn-ghost btn-sm">Back</Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {u.gender && <span className="chip">{genderLabel(u.gender)}</span>}
          {u.level && <span className="chip chip-teal">{levelLabel(u.level)}</span>}
          {age !== null && <span className="chip">{age} years</span>}
          {u.nationality && <span className="chip">{countries().find((c) => c.code === u.nationality)?.name}</span>}
          {u.handedness && <span className="chip">{u.handedness === "left" ? "Left-handed" : "Right-handed"}</span>}
        </div>
      </section>

      <form action={saveProfileAction} className="card space-y-4 p-5">
        <input type="hidden" name="back" value={back} />
        {next && <input type="hidden" name="next" value={next} />}

        <label className="block">
          <span className="label">Name</span>
          <input className="input mt-1" name="name" defaultValue={u.name} required minLength={2} maxLength={40} />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Gender <span className="normal-case tracking-normal text-amber">· needed for tournaments</span></span>
            <select className="input mt-1" name="gender" defaultValue={u.gender ?? ""}>
              <option value="">Not set</option>
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Year of birth</span>
            <input className="input mt-1" name="birthYear" type="number" inputMode="numeric"
              min={MIN_BIRTH_YEAR} max={maxBirthYear()} placeholder={String(thisYear - 30)} defaultValue={u.birthYear ?? ""} />
            <span className="mt-1 block text-xs text-muted">Just the year. Used for age categories like 40+.</span>
          </label>
        </div>

        <fieldset>
          <legend className="label">Playing level <span className="normal-case tracking-normal text-amber">· needed for tournaments</span></legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {LEVELS.map((l) => (
              <label key={l.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-court p-3 has-[:checked]:border-teal has-[:checked]:bg-teal/10">
                <input type="radio" name="level" value={l.value} defaultChecked={u.level === l.value} className="mt-1" />
                <span>
                  <span className="font-bold">{l.label}</span> <span className="chip ml-1">{l.letter}</span>
                  <span className="mt-0.5 block text-xs text-muted">{l.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Your own call. Organizers may still place you differently.</p>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="label">Nationality</span>
            <select className="input mt-1" name="nationality" defaultValue={u.nationality ?? ""}>
              <option value="">Not set</option>
              {countries().map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Plays</span>
            <select className="input mt-1" name="handedness" defaultValue={u.handedness ?? ""}>
              <option value="">Not set</option>
              <option value="right">Right-handed</option>
              <option value="left">Left-handed</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="label">Phone / WhatsApp</span>
          <input className="input mt-1" name="phone" type="tel" defaultValue={u.phone ?? ""} placeholder="+971 50 123 4567" maxLength={20} />
        </label>

        <p className="rounded-xl border border-line bg-court/70 p-3 text-xs text-muted">
          Only you see this page. When you enter a tournament, its organizers see your gender and
          level, because that&apos;s how entries are placed. Nothing else here is shown to anyone.
        </p>

        <SubmitButton className="btn btn-primary w-full" pendingLabel="Saving...">
          {next && missing.length ? "Save and go back to the tournament" : "Save profile"}
        </SubmitButton>
      </form>

      <section className="card space-y-3 p-5">
        <div>
          <h2 className="font-bold">Preferred partners</h2>
          <p className="text-xs text-muted">
            People you like to play with. They show up as one-tap picks when you enter a doubles
            category. Private to you — they aren&apos;t told they&apos;re on your list.
          </p>
        </div>
        {partners.length === 0 && <p className="text-sm text-muted">Nobody yet.</p>}
        <ul className="divide-y divide-line/60">
          {partners.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{p.name}</span>{" "}
                <span className="font-mono text-xs text-muted">#{p.playerNo}</span>
              </span>
              <form action={removePreferredPartnerAction}>
                <input type="hidden" name="partnerId" value={p.id} />
                <input type="hidden" name="back" value={back} />
                <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="...">Remove</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
        <form action={addPreferredPartnerAction} className="flex gap-2">
          <input type="hidden" name="back" value={back} />
          <input className="input" name="partnerNo" inputMode="numeric" placeholder="Their player number, e.g. 1042" required aria-label="Partner's player number" />
          <SubmitButton className="btn btn-primary" pendingLabel="...">Add</SubmitButton>
        </form>
      </section>
    </div>
  );
}
