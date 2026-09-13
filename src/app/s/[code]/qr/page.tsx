import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { StaffGate } from "@/components/StaffGate";
import { getSessionByCode } from "@/server/queries";
import { signCheckInToken } from "@/lib/qr";
import { prettyDate, prettyTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function QrPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) notFound();
  return (
    <StaffGate groupId={session.groupId} next={`/s/${code}/qr`}>
      <Qr code={code} />
    </StaffGate>
  );
}

async function Qr({ code }: { code: string }) {
  const session = await getSessionByCode(code);
  if (!session) notFound();

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const token = signCheckInToken(session.id);
  const url = `${base}/s/${session.code}/checkin?t=${encodeURIComponent(token)}`;

  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    color: { dark: "#06100D", light: "#FFFFFF" },
    errorCorrectionLevel: "M",
  });

  return (
    <div className="space-y-4">
      <div className="card p-5 text-center">
        <p className="label">Check-in code</p>
        <h2 className="mt-1 text-lg font-bold">{session.name}</h2>
        <p className="text-sm text-muted">
          {prettyDate(session.date)} &middot; {prettyTime(session.startTime)}
        </p>

        <div
          className="mx-auto mt-4 w-full max-w-xs rounded-2xl bg-white p-4"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <p className="mt-4 text-sm text-muted">
          Prop your phone or a printout at the door. Players scan, tap their name, and they are in
          the queue.
        </p>
        <p className="mt-3 break-all font-mono text-[.65rem] text-muted">{url}</p>
      </div>

      <div className="card p-4">
        <h3 className="label">Sharing the session</h3>
        <p className="mt-2 text-sm">
          Post this in the WhatsApp group so people can book:
        </p>
        <p className="mt-2 rounded-lg border border-line bg-court p-3 font-mono text-xs">
          {base}/s/{session.code}
        </p>
        <p className="mt-3 text-xs text-muted">
          The QR code is signed and only works for this session for 24 hours, so last week&apos;s
          screenshot will not check anyone in.
        </p>
      </div>
    </div>
  );
}
