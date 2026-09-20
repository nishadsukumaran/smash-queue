import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import {
  deleteAnnouncementAction, pinAnnouncementAction, postAnnouncementAction,
} from "@/server/form-actions";
import { prettyDateTime } from "@/lib/format";
import type { AnnouncementRow } from "@/server/queries";

/**
 * The organizer talking to the group.
 *
 * Deliberately not a chat. There is no reply, because the WhatsApp group these
 * people are already in does that better and a second half-used inbox helps
 * nobody. What this does that WhatsApp cannot is attach a notice to a session,
 * so "we're on courts 5 and 6 tonight" sits on the page everyone attending
 * already has open instead of scrolling away at the wrong moment.
 *
 * Renders nothing at all when there is nothing to say and the viewer cannot
 * post — an empty box labelled "Announcements" is just furniture.
 */
export function Announcements({
  rows,
  groupId,
  sessionId,
  canPost,
  title = "Notices",
  collapseRead = false,
}: {
  rows: AnnouncementRow[];
  groupId: string;
  sessionId?: string | null;
  canPost: boolean;
  title?: string;
  /**
   * On the session page, older notices fold away. That page exists to answer
   * "when am I next", and three weeks of announcements pushing the queue
   * position below the fold would quietly break the thing people open it for.
   */
  collapseRead?: boolean;
}) {
  if (rows.length === 0 && !canPost) return null;

  const shown = collapseRead
    ? rows.filter((r) => r.unread || r.announcement.pinned)
    : rows;
  const folded = collapseRead ? rows.filter((r) => !shown.includes(r)) : [];

  return (
    <section className="space-y-3">
      {shown.length > 0 && (
        <div className="space-y-2">
          {shown.map(({ announcement: a, author, unread }) => (
            <article
              key={a.id}
              className={`card p-4 ${
                unread ? "border-shuttle/50" : a.pinned ? "border-teal/40" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <Avatar name={author.name} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-semibold text-chalk">{author.name}</span>
                    <span>{prettyDateTime(a.createdAt)}</span>
                    {a.pinned && <span className="chip chip-teal">Pinned</span>}
                    {a.sessionId && !sessionId && <span className="chip">This session</span>}
                    {unread && <span className="chip chip-amber">New</span>}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-chalk/90">{a.body}</p>

                  {canPost && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={pinAnnouncementAction}>
                        <input type="hidden" name="groupId" value={groupId} />
                        <input type="hidden" name="announcementId" value={a.id} />
                        <input type="hidden" name="pinned" value={a.pinned ? "0" : "1"} />
                        <SubmitButton className="btn btn-ghost btn-sm">
                          {a.pinned ? "Unpin" : "Pin"}
                        </SubmitButton>
                      </form>
                      <form action={deleteAnnouncementAction}>
                        <input type="hidden" name="groupId" value={groupId} />
                        <input type="hidden" name="announcementId" value={a.id} />
                        <SubmitButton className="btn btn-ghost btn-sm">Delete</SubmitButton>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {folded.length > 0 && (
        <details className="card p-3">
          <summary className="cursor-pointer text-xs text-muted">
            {folded.length} earlier {folded.length === 1 ? "notice" : "notices"}
          </summary>
          <div className="mt-3 space-y-3">
            {folded.map(({ announcement: a, author }) => (
              <div key={a.id} className="border-l-2 border-line pl-3">
                <p className="text-xs text-muted">
                  <span className="font-semibold text-chalk">{author.name}</span>{" "}
                  {prettyDateTime(a.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-chalk/80">{a.body}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      {canPost && (
        <form action={postAnnouncementAction} className="card p-4">
          <p className="label">{title}</p>
          <input type="hidden" name="groupId" value={groupId} />
          {sessionId && <input type="hidden" name="sessionId" value={sessionId} />}
          <textarea
            name="body"
            className="input mt-2 min-h-20 resize-y"
            maxLength={1000}
            placeholder={
              sessionId
                ? "Something everyone playing tonight should know"
                : "Something the whole group should know"
            }
            aria-label="Announcement"
            required
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="pinned" value="1" className="accent-shuttle" />
              Keep it at the top
            </label>
            <SubmitButton className="btn btn-primary btn-sm ml-auto" pendingLabel="Posting...">
              Post
            </SubmitButton>
          </div>
        </form>
      )}
    </section>
  );
}
