/**
 * The Instagram Graph API calls the journey publisher needs, and nothing else.
 *
 * Auth model: the **Instagram Login** flavour of the platform (host
 * `graph.instagram.com`), not Facebook Login. It talks to an Instagram
 * Professional account directly and needs no linked Facebook Page, no Business
 * Manager and no Page Publishing Authorization, which is three fewer things to
 * keep alive for an account that exists to post one walk. The cost is that
 * Page-scoped features are unavailable: location tagging in particular, since
 * `location_id` comes from Page search. The publisher does not want location
 * tags anyway (see ADR-012), so the trade is free here.
 *
 * Publishing is deliberately two-phase on Meta's side: you create a *container*
 * describing the media, Instagram fetches the image from your public URL and
 * processes it asynchronously, and only then may you publish the container.
 * `publishImagePost` below hides the phases but not the wait: it polls the
 * container's status rather than publishing optimistically, because a container
 * that is still IN_PROGRESS fails the publish call and the failure looks
 * identical to a permanently broken one.
 */

/**
 * Graph API version, pinned rather than floating. Meta ships one about every
 * quarter and supports each for roughly two years; an unversioned call silently
 * follows the newest, which is how a working integration breaks on a morning
 * nobody deployed anything. Bump this deliberately, after reading the changelog
 * at https://developers.facebook.com/docs/graph-api/changelog.
 */
const IG_API_VERSION = 'v26.0';
const IG_API = `https://graph.instagram.com/${IG_API_VERSION}`;

/** Instagram's own cap: 100 API-published posts per rolling 24 hours. */
export const IG_DAILY_POST_LIMIT = 100;

/** Instagram's cap on carousel children. A day's post is trimmed to fit. */
export const IG_CAROUSEL_MAX_ITEMS = 10;

/**
 * How long to wait for Instagram to finish fetching and processing an image
 * before giving up on the container. Images are quick (a second or two); the
 * ceiling is here for the case where Storage is slow to serve a 4 MB photo over
 * a cold CDN edge, not as a routine wait.
 */
const CONTAINER_POLL_TIMEOUT_MS = 60_000;
const CONTAINER_POLL_INTERVAL_MS = 3_000;

export interface InstagramCredentials {
  /** The Instagram-scoped user id of the professional account being posted to. */
  igUserId: string;
  /** A long-lived Instagram user access token (60 days, refreshable). */
  accessToken: string;
}

export interface PublishedPost {
  /** The published media's id. */
  mediaId: string;
  /** Public URL of the post, stored so a failed run can be told from a silent one. */
  permalink: string | null;
}

class InstagramApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    context: string
  ) {
    super(`instagram ${context} failed: ${status} ${body}`);
    this.name = 'InstagramApiError';
  }
}

/**
 * True when the failure is Instagram refusing this request as written (a bad
 * image, an over-long caption, a revoked token) rather than a transient one.
 * A caller that retries on the next scheduled run wants to stop retrying these:
 * tomorrow's identical request fails identically.
 */
export function isPermanentApiError(error: unknown): boolean {
  return error instanceof InstagramApiError && error.status >= 400 && error.status < 500;
}

async function call(
  path: string,
  params: Record<string, string>,
  context: string,
  method: 'GET' | 'POST' = 'GET'
): Promise<Record<string, unknown>> {
  const query = new URLSearchParams(params);
  const url = method === 'GET' ? `${IG_API}${path}?${query}` : `${IG_API}${path}`;
  const res = await fetch(url, {
    method,
    ...(method === 'POST'
      ? {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: query,
        }
      : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new InstagramApiError(res.status, text, context);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Publish one image post: a single photo when given one URL, a carousel when
 * given several. Resolves once Instagram has the post live.
 *
 * `imageUrls` must be publicly fetchable JPEGs. Instagram pulls them itself
 * from its own servers, so a signed URL that only works from Japan, or a
 * PNG, or a link behind auth, fails at container creation with a message that
 * does not say which of the three it was.
 */
export async function publishImagePost(
  credentials: InstagramCredentials,
  imageUrls: string[],
  caption: string
): Promise<PublishedPost> {
  if (imageUrls.length === 0) {
    throw new Error('instagram publish called with no images');
  }
  const urls = imageUrls.slice(0, IG_CAROUSEL_MAX_ITEMS);

  const containerId =
    urls.length === 1
      ? await createImageContainer(credentials, urls[0], { caption })
      : await createCarouselContainer(credentials, urls, caption);

  await waitForContainer(credentials, containerId);

  const published = await call(
    `/${credentials.igUserId}/media_publish`,
    { creation_id: containerId, access_token: credentials.accessToken },
    'media_publish',
    'POST'
  );
  const mediaId = String(published.id);
  return { mediaId, permalink: await fetchPermalink(credentials, mediaId) };
}

async function createImageContainer(
  credentials: InstagramCredentials,
  imageUrl: string,
  options: { caption?: string; isCarouselItem?: boolean }
): Promise<string> {
  const params: Record<string, string> = {
    image_url: imageUrl,
    access_token: credentials.accessToken,
  };
  if (options.caption !== undefined) params.caption = options.caption;
  if (options.isCarouselItem) params.is_carousel_item = 'true';

  const created = await call(`/${credentials.igUserId}/media`, params, 'media container', 'POST');
  return String(created.id);
}

async function createCarouselContainer(
  credentials: InstagramCredentials,
  imageUrls: string[],
  caption: string
): Promise<string> {
  // Children are created one at a time rather than in parallel: Instagram
  // rate-limits container creation per account, and a burst of ten is the
  // shape that trips it. A recap post is not in a hurry.
  const children: string[] = [];
  for (const imageUrl of imageUrls) {
    children.push(await createImageContainer(credentials, imageUrl, { isCarouselItem: true }));
  }

  const created = await call(
    `/${credentials.igUserId}/media`,
    {
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption,
      access_token: credentials.accessToken,
    },
    'carousel container',
    'POST'
  );
  return String(created.id);
}

/** Block until the container is FINISHED, or throw with why it will never be. */
async function waitForContainer(
  credentials: InstagramCredentials,
  containerId: string
): Promise<void> {
  const deadline = Date.now() + CONTAINER_POLL_TIMEOUT_MS;
  for (;;) {
    const status = await call(
      `/${containerId}`,
      { fields: 'status_code,status', access_token: credentials.accessToken },
      'container status'
    );
    const code = String(status.status_code);
    if (code === 'FINISHED') return;
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new Error(`instagram container ${containerId} is ${code}: ${String(status.status ?? '')}`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`instagram container ${containerId} still ${code} after ${CONTAINER_POLL_TIMEOUT_MS} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, CONTAINER_POLL_INTERVAL_MS));
  }
}

/**
 * The post's public URL. Best-effort: a post that published but whose permalink
 * lookup failed is still published, and losing the link must not make the run
 * look like a failure and repost the day tomorrow.
 */
async function fetchPermalink(
  credentials: InstagramCredentials,
  mediaId: string
): Promise<string | null> {
  try {
    const media = await call(
      `/${mediaId}`,
      { fields: 'permalink', access_token: credentials.accessToken },
      'permalink'
    );
    return typeof media.permalink === 'string' ? media.permalink : null;
  } catch {
    return null;
  }
}

/** Posts already published in the rolling 24-hour window, against the 100 cap. */
export async function fetchPublishedCount(credentials: InstagramCredentials): Promise<number> {
  const limit = await call(
    `/${credentials.igUserId}/content_publishing_limit`,
    { fields: 'quota_usage', access_token: credentials.accessToken },
    'publishing limit'
  );
  const rows = limit.data as { quota_usage?: number }[] | undefined;
  return rows?.[0]?.quota_usage ?? 0;
}

/**
 * Exchange a long-lived token for a fresh one, resetting its 60-day clock.
 *
 * Meta will not refresh a token younger than 24 hours or already expired, so
 * this is a periodic job, not a per-request one, and a token left unrefreshed
 * for 60 days cannot be recovered by any API call: it needs the OAuth flow
 * again by hand. That is the failure mode the scheduled refresh exists to
 * prevent, and why it runs weekly rather than monthly.
 */
export async function refreshLongLivedToken(
  accessToken: string
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: accessToken,
    })}`
  );
  const text = await res.text();
  if (!res.ok) {
    throw new InstagramApiError(res.status, text, 'token refresh');
  }
  const body = JSON.parse(text) as { access_token: string; expires_in: number };
  return { accessToken: body.access_token, expiresInSeconds: body.expires_in };
}
