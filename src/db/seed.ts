import "./env";
import { eq } from "drizzle-orm";
import { openDb } from "./raw";
import {
  bookings, checkIns, groupMembers, groups, matchPlayers, matchScores, matches,
  notifications, overrides, payments, preferences, sessionCosts, sessions, users, venues,
  authEmails, authSessions, authTokens,
} from "./schema";
import { newId } from "@/lib/ids";
import { colorFor } from "@/lib/format";
import { simulateSession, type SimPlayer } from "@/lib/sim";
import { updateRatings } from "@/lib/fairness";
import { DEFAULT_WEIGHTS, BALANCE_BY_TYPE } from "@/lib/queue-engine";

const { db } = openDb();

const ROSTER: Array<[string, number]> = [
  ["Nishad Sukumaran", 1340], ["Arun Menon", 1285], ["Nikhil Varma", 1410],
  ["Ravi Shankar", 1225], ["Faisal Al Hammadi", 1370], ["Mohammed Rashid", 1150],
  ["Raj Patel", 1495], ["Ahmed Saeed", 1080], ["John Peter", 1305],
  ["Ali Hassan", 1190], ["Sanjay Nair", 1260], ["Vinod Kumar", 1330],
  ["Deepa Raghavan", 1405], ["Sneha Pillai", 1240], ["Priya Menon", 1160],
  ["Jomon Jacob", 1520], ["Rakesh Iyer", 1095], ["Shibu Thomas", 1275],
  ["Anoop Krishnan", 1355], ["Melvin Dsouza", 1210], ["Riya Thomas", 1130],
  ["Karthik Subramanian", 1445], ["Basil Mathew", 1180], ["Hashir Ali", 1290],
  ["Maria George", 1250], ["Jerin Paul", 1320], ["Suhail Ahmed", 1105],
  ["Tony Fernandes", 1385], ["Neha Sharma", 1200], ["Bijoy Varghese", 1265],
];

/** Session names should match the day they actually land on. */
function weekday(dateIso: string) {
  return new Date(`${dateIso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  });
}

function isoDate(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function at(dateIso: string, hhmm: string) {
  return new Date(`${dateIso}T${hhmm}:00`).getTime();
}

/** Child rows first: the foreign keys are real in Postgres. */
async function wipe() {
  for (const table of [
    authSessions, authEmails, authTokens,
    notifications, overrides, preferences, sessionCosts, payments,
    matchScores, matchPlayers, matches, checkIns, bookings,
    sessions, venues, groupMembers, groups, users,
  ]) {
    await db.delete(table);
  }
}

async function main() {
  await wipe();
  const now = new Date();

  /* ------------------------------------------------------------- people */

  const people = ROSTER.map(([name, rating]) => ({
    id: newId("usr"),
    name,
    phone: null,
    email: null,
    avatarColor: colorFor(name),
    rating,
    ratingGames: 0,
    active: true,
    createdAt: now,
  }));
  await db.insert(users).values(people);

  const owner = people[0];

  // The demo organizer needs an email, or nothing can sign in to /admin.
  // Overridable so a real clone can point it at a real inbox.
  const ownerEmail = (process.env.OWNER_EMAIL || "organizer@example.com").toLowerCase();
  await db.update(users).set({ email: ownerEmail }).where(eq(users.id, owner.id));
  await db.insert(authEmails).values({
    id: newId("aem"),
    userId: owner.id,
    email: ownerEmail,
    createdAt: now,
  });

  const groupId = newId("grp");
  await db.insert(groups)
    .values({
      id: groupId,
      name: "Abu Dhabi Smashers",
      ownerId: owner.id,
      location: "Abu Dhabi, UAE",
      defaultFee: 40,
      currency: "AED",
      settings: {
        staffPin: "1234",
        pointsTo: 30,
        defaultGameType: "balanced",
        weights: { ...DEFAULT_WEIGHTS, balance: BALANCE_BY_TYPE.balanced },
        requireScoreConfirmation: false,
        allowSelfSignup: true,
      },
      createdAt: now,
    });

  await db.insert(groupMembers)
    .values(
      people.map((p, i) => ({
        id: newId("gm"),
        groupId,
        userId: p.id,
        role: i === 0 ? ("organizer" as const) : i < 3 ? ("coordinator" as const) : ("player" as const),
        status: "active" as const,
        joinedAt: now,
      })),
    );

  const venueId = newId("ven");
  const venueId2 = newId("ven");
  await db.insert(venues)
    .values([
      {
        id: venueId,
        groupId,
        name: "Zayed Sports City, Hall 2",
        address: "Zayed Sports City, Abu Dhabi",
        // Real coordinates, so the demo shows a map with something on it and
        // the Directions link goes somewhere. The second venue is left without
        // any, because "no location set" is a state the UI has to handle too.
        latitude: 24.4164,
        longitude: 54.4542,
        courtCount: 4,
      },
      {
        id: venueId2,
        groupId,
        name: "Al Bateen Community Courts",
        address: "Al Bateen, Abu Dhabi",
        courtCount: 3,
      },
    ]);

  const ratings = new Map(people.map((p) => [p.id, p.rating]));
  const ratingGames = new Map(people.map((p) => [p.id, 0]));

  /* ------------------------------------------- three completed sessions */

  const past = [
    { offset: -21, attendees: 24, courts: 4 },
    { offset: -14, attendees: 26, courts: 4 },
    { offset: -7, attendees: 22, courts: 4 },
  ];

  for (const [index, cfg] of past.entries()) {
    const date = isoDate(cfg.offset);
    const startMs = at(date, "19:00");
    const sessionId = newId("ses");
    const attendees = people.slice(0, cfg.attendees);

    await db.insert(sessions)
      .values({
        id: sessionId,
        groupId,
        venueId,
        code: `SMSH${String(index + 1).padStart(2, "0")}`,
        name: `${weekday(date)} Badminton`,
        date,
        startTime: "19:00",
        endTime: "22:00",
        courtCount: cfg.courts,
        capacity: 28,
        fee: 40,
        currency: "AED",
        notes: "Yonex Aerosensa 30 shuttles",
        coordinatorId: owner.id,
        status: "closed",
        gameType: "balanced",
        pointsTo: 30,
        queueMode: "assisted",
        weights: { ...DEFAULT_WEIGHTS, balance: BALANCE_BY_TYPE.balanced },
        createdAt: new Date(startMs - 5 * 86400000),
        closedAt: new Date(startMs + 3 * 3600000),
      });

    await db.insert(bookings)
      .values(
        attendees.map((p) => ({
          id: newId("bkg"),
          sessionId,
          userId: p.id,
          status: "confirmed" as const,
          waitlistPosition: null,
          bookedAt: new Date(startMs - 3 * 86400000),
          cancelledAt: null,
        })),
      );

    await db.insert(checkIns)
      .values(
        attendees.map((p, i) => ({
          id: newId("chk"),
          sessionId,
          userId: p.id,
          checkedInAt: new Date(startMs - 6 * 60000 + i * 20000),
          method: (i % 5 === 0 ? "manual" : "qr") as "manual" | "qr",
          availability: "left" as const,
          leftAt: new Date(startMs + 3 * 3600000),
          lastFinishedAt: null,
          consecutiveGames: 0,
        })),
      );

    const simPlayers: SimPlayer[] = attendees.map((p) => ({
      id: p.id,
      name: p.name,
      rating: ratings.get(p.id) ?? 1200,
    }));
    const result = simulateSession(simPlayers, {
      courts: cfg.courts,
      startAt: startMs,
      minutes: 175,
      gameMinutes: 15,
      seed: 1000 + index * 7,
    });

    for (const m of result.matches) {
      const matchId = newId("mtc");
      await db.insert(matches)
        .values({
          id: matchId,
          sessionId,
          court: m.court,
          status: "completed",
          mode: "assisted",
          gameType: "balanced",
          createdAt: new Date(m.startedAt - 30000),
          startedAt: new Date(m.startedAt),
          finishedAt: new Date(m.finishedAt),
        });
      await db.insert(matchPlayers)
        .values([
          ...m.teamA.map((userId) => ({ id: newId("mp"), matchId, userId, team: "A" as const })),
          ...m.teamB.map((userId) => ({ id: newId("mp"), matchId, userId, team: "B" as const })),
        ]);
      await db.insert(matchScores)
        .values({
          id: newId("scr"),
          matchId,
          teamAScore: m.scoreA,
          teamBScore: m.scoreB,
          winner: m.scoreA > m.scoreB ? "A" : "B",
          enteredBy: owner.id,
          enteredAt: new Date(m.finishedAt),
          confirmed: true,
        });

      const input = [
        ...m.teamA.map((id) => ({
          id, rating: ratings.get(id)!, ratingGames: ratingGames.get(id)!, team: "A" as const,
        })),
        ...m.teamB.map((id) => ({
          id, rating: ratings.get(id)!, ratingGames: ratingGames.get(id)!, team: "B" as const,
        })),
      ];
      const next = updateRatings(input, m.scoreA, m.scoreB, 30);
      for (const [id, r] of Object.entries(next)) {
        ratings.set(id, r);
        ratingGames.set(id, (ratingGames.get(id) ?? 0) + 1);
      }
    }

    await db.insert(payments)
      .values(
        attendees.map((p, i) => ({
          id: newId("pay"),
          sessionId,
          userId: p.id,
          amount: 40,
          status: (i % 11 === 0 ? "unpaid" : "paid") as "unpaid" | "paid",
          method: (i % 3 === 0 ? "cash" : "transfer") as "cash" | "transfer",
          paidAt: i % 11 === 0 ? null : new Date(startMs + 3600000),
          recordedBy: owner.id,
        })),
      );

    await db.insert(sessionCosts)
      .values([
        { id: newId("cst"), sessionId, label: "Court hire", amount: 600 },
        { id: newId("cst"), sessionId, label: "Shuttles", amount: 150 },
        { id: newId("cst"), sessionId, label: "Water and misc", amount: 50 },
      ]);
  }

  for (const p of people)
    await db.update(users)
      .set({ rating: ratings.get(p.id)!, ratingGames: ratingGames.get(p.id)! })
      .where(eq(users.id, p.id));

  /* ------------------------------------------------ tonight, mid-session */

  const liveDate = isoDate(0);
  const liveStart = Date.now() - 62 * 60000; // started about an hour ago
  const liveId = newId("ses");
  const liveAttendees = people.slice(0, 24);
  const liveBooked = people.slice(0, 26); // two booked and never showed

  await db.insert(sessions)
    .values({
      id: liveId,
      groupId,
      venueId,
      code: "TONITE",
      name: `${weekday(liveDate)} Badminton`,
      date: liveDate,
      startTime: "19:00",
      endTime: "22:00",
      courtCount: 4,
      capacity: 26,
      fee: 40,
      currency: "AED",
      notes: "Yonex Aerosensa 30. Two shuttles per court.",
      coordinatorId: owner.id,
      status: "live",
      gameType: "balanced",
      pointsTo: 30,
      queueMode: "assisted",
      weights: { ...DEFAULT_WEIGHTS, balance: BALANCE_BY_TYPE.balanced },
      createdAt: new Date(liveStart - 4 * 86400000),
      closedAt: null,
    });

  await db.insert(bookings)
    .values(
      liveBooked.map((p) => ({
        id: newId("bkg"),
        sessionId: liveId,
        userId: p.id,
        status: "confirmed" as const,
        waitlistPosition: null,
        bookedAt: new Date(liveStart - 3 * 86400000),
        cancelledAt: null,
      })),
    );

  const liveSim = simulateSession(
    liveAttendees.map((p) => ({ id: p.id, name: p.name, rating: ratings.get(p.id) ?? 1200 })),
    { courts: 4, startAt: liveStart, minutes: 62, gameMinutes: 15, seed: 777 },
  );

  const lastFinish = new Map<string, number>();
  const consecutive = new Map<string, number>();
  const finished = liveSim.matches.filter((m) => m.finishedAt <= Date.now());
  const running = liveSim.matches.filter((m) => m.finishedAt > Date.now()).slice(0, 3);

  for (const m of finished) {
    const matchId = newId("mtc");
    await db.insert(matches)
      .values({
        id: matchId,
        sessionId: liveId,
        court: m.court,
        status: "completed",
        mode: "assisted",
        gameType: "balanced",
        createdAt: new Date(m.startedAt - 30000),
        startedAt: new Date(m.startedAt),
        finishedAt: new Date(m.finishedAt),
      });
    await db.insert(matchPlayers)
      .values([
        ...m.teamA.map((userId) => ({ id: newId("mp"), matchId, userId, team: "A" as const })),
        ...m.teamB.map((userId) => ({ id: newId("mp"), matchId, userId, team: "B" as const })),
      ]);
    await db.insert(matchScores)
      .values({
        id: newId("scr"),
        matchId,
        teamAScore: m.scoreA,
        teamBScore: m.scoreB,
        winner: m.scoreA > m.scoreB ? "A" : "B",
        enteredBy: owner.id,
        enteredAt: new Date(m.finishedAt),
        confirmed: true,
      });
    for (const id of [...m.teamA, ...m.teamB]) {
      lastFinish.set(id, m.finishedAt);
      consecutive.set(id, (consecutive.get(id) ?? 0) + 1);
    }
  }

  for (const m of running) {
    const matchId = newId("mtc");
    await db.insert(matches)
      .values({
        id: matchId,
        sessionId: liveId,
        court: m.court,
        status: "playing",
        mode: "assisted",
        gameType: "balanced",
        createdAt: new Date(m.startedAt - 30000),
        startedAt: new Date(m.startedAt),
        finishedAt: null,
      });
    await db.insert(matchPlayers)
      .values([
        ...m.teamA.map((userId) => ({ id: newId("mp"), matchId, userId, team: "A" as const })),
        ...m.teamB.map((userId) => ({ id: newId("mp"), matchId, userId, team: "B" as const })),
      ]);
  }

  await db.insert(checkIns)
    .values(
      liveAttendees.map((p, i) => ({
        id: newId("chk"),
        sessionId: liveId,
        userId: p.id,
        checkedInAt: new Date(liveStart - 6 * 60000 + i * 15000),
        method: (i % 6 === 0 ? "manual" : "qr") as "manual" | "qr",
        availability: "available" as const,
        leftAt: null,
        lastFinishedAt: lastFinish.has(p.id) ? new Date(lastFinish.get(p.id)!) : null,
        consecutiveGames: Math.min(2, consecutive.get(p.id) ?? 0),
      })),
    );

  await db.insert(payments)
    .values(
      liveBooked.map((p, i) => ({
        id: newId("pay"),
        sessionId: liveId,
        userId: p.id,
        amount: 40,
        status: (i % 7 === 0 ? "unpaid" : "paid") as "unpaid" | "paid",
        method: (i % 2 === 0 ? "cash" : "transfer") as "cash" | "transfer",
        paidAt: i % 7 === 0 ? null : new Date(liveStart + 600000),
        recordedBy: owner.id,
      })),
    );

  await db.insert(sessionCosts)
    .values([
      { id: newId("cst"), sessionId: liveId, label: "Court hire", amount: 600 },
      { id: newId("cst"), sessionId: liveId, label: "Shuttles", amount: 150 },
    ]);

  /* ------------------------------------------------- upcoming sessions */

  const openDate = isoDate(7);
  const openId = newId("ses");
  await db.insert(sessions)
    .values({
      id: openId,
      groupId,
      venueId,
      code: "NEXTSA",
      name: `${weekday(openDate)} Badminton`,
      date: openDate,
      startTime: "19:00",
      endTime: "22:00",
      courtCount: 4,
      capacity: 26,
      fee: 40,
      currency: "AED",
      notes: "Bring your own grip. Shuttles provided.",
      coordinatorId: owner.id,
      status: "scheduled",
      gameType: "balanced",
      pointsTo: 30,
      queueMode: "assisted",
      weights: { ...DEFAULT_WEIGHTS, balance: BALANCE_BY_TYPE.balanced },
      createdAt: now,
      closedAt: null,
    });

  const openBooked = people.slice(1, 19);
  await db.insert(bookings)
    .values(
      openBooked.map((p, i) => ({
        id: newId("bkg"),
        sessionId: openId,
        userId: p.id,
        status: "confirmed" as const,
        waitlistPosition: null,
        bookedAt: new Date(Date.now() - (18 - i) * 3600000),
        cancelledAt: null,
      })),
    );
  await db.insert(payments)
    .values(
      openBooked.map((p) => ({
        id: newId("pay"),
        sessionId: openId,
        userId: p.id,
        amount: 40,
        status: "unpaid" as const,
        method: null,
        paidAt: null,
        recordedBy: null,
      })),
    );

  // A full one, so the waitlist is visible out of the box.
  const fullDate = isoDate(4);
  const fullId = newId("ses");
  await db.insert(sessions)
    .values({
      id: fullId,
      groupId,
      venueId: venueId2,
      code: "MIDWK",
      name: `${weekday(fullDate)} Doubles`,
      date: fullDate,
      startTime: "20:00",
      endTime: "22:00",
      courtCount: 3,
      capacity: 18,
      fee: 35,
      currency: "AED",
      notes: "Faster rotation, three courts only.",
      coordinatorId: people[1].id,
      status: "scheduled",
      gameType: "casual",
      pointsTo: 30,
      queueMode: "assisted",
      weights: { ...DEFAULT_WEIGHTS, balance: BALANCE_BY_TYPE.casual },
      createdAt: now,
      closedAt: null,
    });

  const fullConfirmed = people.slice(0, 18);
  const waitlisted = people.slice(18, 22);
  await db.insert(bookings)
    .values([
      ...fullConfirmed.map((p, i) => ({
        id: newId("bkg"),
        sessionId: fullId,
        userId: p.id,
        status: "confirmed" as const,
        waitlistPosition: null,
        bookedAt: new Date(Date.now() - (30 - i) * 3600000),
        cancelledAt: null,
      })),
      ...waitlisted.map((p, i) => ({
        id: newId("bkg"),
        sessionId: fullId,
        userId: p.id,
        status: "waitlisted" as const,
        waitlistPosition: i + 1,
        bookedAt: new Date(Date.now() - (4 - i) * 3600000),
        cancelledAt: null,
      })),
    ]);
  await db.insert(payments)
    .values(
      fullConfirmed.map((p) => ({
        id: newId("pay"),
        sessionId: fullId,
        userId: p.id,
        amount: 35,
        status: "unpaid" as const,
        method: null,
        paidAt: null,
        recordedBy: null,
      })),
    );

  const played = await db.select({ id: matches.id }).from(matches);
  console.log(`Seeded ${people.length} players, 6 sessions, ${played.length} matches.`);
  console.log("Live session code: TONITE   Staff PIN: 1234");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
