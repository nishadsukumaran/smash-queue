import type { CategoryGender, Gender, PlayerLevel } from "@/db/schema";

/**
 * The player profile: labels, the country list, and the two rules tournaments
 * lean on — is the profile complete enough to enter, and does a player (or
 * pair) fit a category. Pure functions, so the rules are unit-tested.
 */

export const GENDERS: Array<{ value: Gender; label: string }> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

/**
 * Self-declared playing level. The letters are how most GCC communities
 * already talk about levels, so a player can match themselves to a
 * "Men's Doubles B" without translating.
 */
export const LEVELS: Array<{ value: PlayerLevel; label: string; letter: string; hint: string }> = [
  { value: "beginner", label: "Beginner", letter: "D", hint: "Learning the strokes and the rules" },
  { value: "intermediate", label: "Intermediate", letter: "C", hint: "Comfortable rallies, plays regularly" },
  { value: "advanced", label: "Advanced", letter: "B", hint: "Strong club player, good footwork and tactics" },
  { value: "expert", label: "Expert", letter: "A", hint: "Competitive, plays tournaments to win" },
];

export const levelLabel = (v: PlayerLevel | null | undefined) => {
  const l = LEVELS.find((x) => x.value === v);
  return l ? `${l.label} (${l.letter})` : null;
};

export const genderLabel = (v: Gender | null | undefined) => GENDERS.find((g) => g.value === v)?.label ?? null;

export function ageFrom(birthYear: number | null | undefined, now = new Date()) {
  if (!birthYear) return null;
  return now.getFullYear() - birthYear;
}

export const MIN_BIRTH_YEAR = 1930;
export const maxBirthYear = (now = new Date()) => now.getFullYear() - 5;

/** What a tournament entry needs from a player's profile. */
export function missingForTournaments(u: { gender: Gender | null; level: PlayerLevel | null }): string[] {
  const missing: string[] = [];
  if (!u.gender) missing.push("gender");
  if (!u.level) missing.push("playing level");
  return missing;
}

/**
 * Does this line-up fit the category's gender rule?
 *   men    — every player male
 *   women  — every player female
 *   mixed  — one male and one female
 *   open   — anyone
 * Returns null when it fits, or the reason in words.
 */
export function genderFit(category: CategoryGender, genders: Array<Gender | null>): string | null {
  if (category === "open") return null;
  if (genders.some((g) => !g)) return "Every player needs their gender on their profile.";
  if (category === "men" && genders.some((g) => g !== "male")) return "This category is for men.";
  if (category === "women" && genders.some((g) => g !== "female")) return "This category is for women.";
  if (category === "mixed") {
    if (genders.length !== 2 || !genders.includes("male") || !genders.includes("female"))
      return "Mixed doubles is one man and one woman.";
  }
  return null;
}

/* ------------------------------------------------------------- countries */

/** ISO 3166-1 alpha-2. Names come from Intl, so there is no list to keep spelled right. */
const CODES =
  "AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BA BW BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW XK".split(
    " ",
  );

let cached: Array<{ code: string; name: string }> | null = null;

export function countries() {
  if (cached) return cached;
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  cached = CODES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return cached;
}

export function countryName(code: string | null | undefined) {
  if (!code) return null;
  return countries().find((c) => c.code === code)?.name ?? code;
}

export const isCountry = (code: string) => CODES.includes(code);
