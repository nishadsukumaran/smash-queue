import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { switchCommunityAction } from "@/server/community-actions";
import type { Membership } from "@/lib/tenant";

/**
 * Which community you are looking at, when you are in more than one.
 *
 * A row of plain form buttons rather than a dropdown, because on a phone the
 * realistic number is two or three and a select is a worse tap target than a
 * chip. Renders nothing for the overwhelmingly common case of belonging to
 * exactly one — chrome that never changes is chrome nobody should pay for.
 */
export function CommunitySwitcher({
  mine,
  activeId,
  next = "/",
}: {
  mine: Membership[];
  activeId: string;
  next?: string;
}) {
  if (mine.length < 2) return null;

  return (
    <nav className="-mx-4 overflow-x-auto px-4" aria-label="Your communities">
      <div className="flex min-w-max items-center gap-2">
        {mine.map(({ group }) => {
          const here = group.id === activeId;
          return (
            <form key={group.id} action={switchCommunityAction}>
              <input type="hidden" name="groupId" value={group.id} />
              <input type="hidden" name="next" value={next} />
              <SubmitButton
                className={`btn btn-sm whitespace-nowrap ${here ? "btn-teal" : "btn-ghost"}`}
                aria-current={here ? "true" : undefined}
              >
                {group.name}
              </SubmitButton>
            </form>
          );
        })}
        <Link href="/communities" className="btn btn-ghost btn-sm whitespace-nowrap">
          Find more
        </Link>
      </div>
    </nav>
  );
}
