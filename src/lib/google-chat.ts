import { log } from "@/lib/api-helpers";
import { getValidAccessToken } from "@/lib/google-auth";

/**
 * Google Chat notifications, posted *as the acting human user* (not a bot).
 *
 * We use the signed-in user's stored OAuth token so messages are authored by the
 * real person who triggered the event (requester / approving admin / assessor).
 * That's the whole point of using Chat over email here — no bot avatar, and no
 * domain verification, because we ride Google Workspace's existing auth.
 *
 * Everything here is BEST-EFFORT: a Chat failure must never break the request
 * that triggered it, so no function throws — they log and return null/false.
 *
 * Gated by ENABLE_GOOGLE_CHAT so the feature stays dark until the Chat API is
 * enabled in the GCP project and users have re-consented to the new scopes.
 * Users without a Google token (e.g. dev-login) simply no-op.
 */

const CHAT_API = "https://chat.googleapis.com/v1";

export function chatEnabled(): boolean {
  return process.env.ENABLE_GOOGLE_CHAT === "true";
}

/** Wrap a Google account id into the Chat user resource name used for members/mentions. */
function userRef(googleId: string): string {
  return `users/${googleId}`;
}

/**
 * Render an @mention that Chat will resolve and notify. `googleId` is the user's
 * OAuth `sub` (see User.googleId). Falls back to a plain name when we don't have
 * an id yet (e.g. a user who hasn't re-consented) so the message still reads well.
 */
export function mention(googleId: string | null | undefined, name: string): string {
  return googleId ? `<${userRef(googleId)}>` : name;
}

async function chatFetch(
  actingUserId: string,
  path: string,
  init: RequestInit
): Promise<unknown | null> {
  const token = await getValidAccessToken(actingUserId);
  if (!token) {
    log.warn("chat skipped: no Google token for acting user", { actingUserId, path });
    return null;
  }
  try {
    const res = await fetch(`${CHAT_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      log.error("chat api call failed", {
        actingUserId,
        path,
        status: res.status,
        body: (await res.text()).slice(0, 500),
      });
      return null;
    }
    return (await res.json()) as unknown;
  } catch (e) {
    log.error("chat api call threw", {
      actingUserId,
      path,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * Create a named space owned by `actingUserId`. Returns the space resource name
 * ("spaces/AAAA…") or null on failure. The creator is automatically a member.
 */
export async function createSpace(
  actingUserId: string,
  displayName: string
): Promise<string | null> {
  if (!chatEnabled()) return null;
  const body = await chatFetch(actingUserId, "/spaces", {
    method: "POST",
    body: JSON.stringify({ spaceType: "SPACE", displayName }),
  });
  const name = (body as { name?: string } | null)?.name ?? null;
  if (!name) return null;
  log.info("chat space created", { actingUserId, space: name, displayName });
  return name;
}

/**
 * Add human members to a space, as `actingUserId` (who must already be a member).
 * Best-effort per member: an already-present member (409) or a user who can't be
 * added is logged and skipped, never aborting the batch.
 */
export async function addMembers(
  actingUserId: string,
  space: string,
  googleIds: Array<string | null | undefined>
): Promise<void> {
  if (!chatEnabled()) return;
  const ids = googleIds.filter((id): id is string => Boolean(id));
  await Promise.all(
    ids.map((id) =>
      chatFetch(actingUserId, `/${space}/members`, {
        method: "POST",
        body: JSON.stringify({ member: { name: userRef(id), type: "HUMAN" } }),
      })
    )
  );
}

/**
 * Post a message to a space as `actingUserId`. `text` may embed mentions built
 * with mention(). Returns true when Chat accepted the message.
 */
export async function postMessage(
  actingUserId: string,
  space: string,
  text: string
): Promise<boolean> {
  if (!chatEnabled()) return false;
  const body = await chatFetch(actingUserId, `/${space}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  return body !== null;
}
