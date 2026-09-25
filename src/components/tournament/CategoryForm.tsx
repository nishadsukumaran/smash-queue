import type { TournamentCategory } from "@/db/schema";

/** Fields for one category. Name can be left blank: it's built from the rest. */
export function CategoryFields({ c, currency }: { c?: TournamentCategory; currency: string }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Who</span>
          <select className="input mt-1" name="gender" defaultValue={c?.gender ?? "men"}>
            <option value="men">Men</option>
            <option value="women">Women</option>
            <option value="mixed">Mixed</option>
            <option value="open">Open (anyone)</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Singles or doubles</span>
          <select className="input mt-1" name="teamSize" defaultValue={String(c?.teamSize ?? 2)}>
            <option value="2">Doubles</option>
            <option value="1">Singles</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Level</span>
          <input className="input mt-1" name="level" defaultValue={c?.level ?? ""} placeholder="A, B, C, Open, 40+" maxLength={40} />
        </label>
      </div>

      <label className="block">
        <span className="label">Category name</span>
        <input className="input mt-1" name="name" defaultValue={c?.name ?? ""} placeholder="Blank = e.g. Men's Doubles A" maxLength={80} />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Entry fee ({currency})</span>
          <input className="input mt-1" name="fee" type="number" min={0} step="any" defaultValue={c?.fee ?? 50} />
        </label>
        <label className="block">
          <span className="label">Fee is</span>
          <select className="input mt-1" name="feeBasis" defaultValue={c?.feeBasis ?? "player"}>
            <option value="player">Per player</option>
            <option value="team">Per entry (pair)</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Max entries</span>
          <input className="input mt-1" name="maxEntries" type="number" min={2} max={256} defaultValue={c?.maxEntries ?? 16} />
          <span className="mt-1 block text-xs text-muted">Blank for no limit</span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Format</span>
          <select className="input mt-1" name="format" defaultValue={c?.format ?? "groups_knockout"}>
            <option value="groups_knockout">Groups, then knockout</option>
            <option value="knockout">Straight knockout</option>
            <option value="round_robin">Round robin (everyone plays everyone)</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Teams per group</span>
          <input className="input mt-1" name="groupSize" type="number" min={3} max={8} defaultValue={c?.groupSize ?? 4} />
        </label>
        <label className="block">
          <span className="label">Go through per group</span>
          <input className="input mt-1" name="advancePerGroup" type="number" min={1} max={4} defaultValue={c?.advancePerGroup ?? 2} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Match length</span>
          <select className="input mt-1" name="bestOf" defaultValue={String(c?.bestOf ?? 1)}>
            <option value="1">One game</option>
            <option value="3">Best of three</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Points per game</span>
          <input className="input mt-1" name="pointsTo" type="number" min={5} max={51} defaultValue={c?.pointsTo ?? 21} />
        </label>
      </div>
    </div>
  );
}
