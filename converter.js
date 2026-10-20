/** 
 * Shared services (popup, service worker, CLI).
 * 
 *   Convert Spotify link to a Youtube Music one
 * 
 * Sources used: 
 *   1. Spotify Official oEmbed (JSON stable) -> title, type, id
 *   2. "embed" page Spotify (JSON __NEXT_DATA__)  -> artist (track and albums)
 *   3. metadata from HTML page -> backup if 1 and 2 fail
 * 
 */
const SPOTIFY_URL_RE = /^https?:\/\/(open\.spotify\.com|spotify\.link|spotify\.app\.link)\//i;
const KIND_RE = /\/(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/;
const ARTIST_KINDS = new Set(["track", "album"]);

export const isSpotifyUrl = (url) => typeof url === "string" && SPOTIFY_URL_RE.test(url.trim());

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

const meta = (html, property) => {
  const m =
    html.match(new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, "i")) ||
    html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${property}"`, "i"));
  return m ? decodeEntities(m[1]) : null;
};

function cleanUrl(raw) {
  let url = raw.trim().replace(/\/intl-[a-z]+(?:-[a-z]+)?\//i, "/"); // préfixe de langue
  if (/^https?:\/\/open\.spotify\.com\//i.test(url)) url = url.replace(/[?#].*$/, ""); // ?si=...
  return url;
}

// 1. oEmbed -------------------------------------------------------------
async function fromOembed(url) {
  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.title) return null;
  const m = `${data.iframe_url ?? ""} ${data.html ?? ""}`.match(
    /\/embed\/(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/
  );
  return { title: decodeEntities(String(data.title)), kind: m?.[1] ?? null, id: m?.[2] ?? null };
}

// 2. embed page : searching artist in the JSON ---------------
function findArtistName(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 12) return null;
  if (Array.isArray(node.artists) && typeof node.artists[0]?.name === "string") {
    return node.artists[0].name;
  }
  if ((node.type === "track" || node.type === "album") && typeof node.subtitle === "string") {
    return node.subtitle;
  }
  for (const value of Object.values(node)) {
    const found = findArtistName(value, depth + 1);
    if (found) return found;
  }
  return null;
}

async function artistFromEmbed(kind, id) {
  const res = await fetch(`https://open.spotify.com/embed/${kind}/${id}`, {
    headers: { "Accept-Language": "en" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const raw = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!raw) return null;
  return findArtistName(JSON.parse(raw));
}

// 3. backup : HTML metadata in the page (does not work most of the time) ---------------------
async function fromPageMeta(url) {
  const res = await fetch(url, { redirect: "follow", headers: { "Accept-Language": "en" } });
  if (!res.ok) return null;
  const html = await res.text();

  const title = meta(html, "og:title");
  let artist = null;
  const pageTitle = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const byMatch = pageTitle && decodeEntities(pageTitle).match(/ by (.+?) \| Spotify/i);
  if (byMatch) artist = byMatch[1];
  else {
    const desc = meta(html, "og:description");
    if (desc) artist = desc.split(" · ")[0];
  }
  return { title, artist };
}

// -----------------------------------------------------------------------
export async function spotifyToYtm(rawUrl) {
  const url = cleanUrl(rawUrl);

  const oembed = await fromOembed(url).catch(() => null);
  let title = oembed?.title ?? null;
  let kind = oembed?.kind ?? null;
  let id = oembed?.id ?? null;
  if (!kind) {
    const m = url.match(KIND_RE);
    kind = m?.[1] ?? null;
    id = m?.[2] ?? null;
  }

  // Artists only for tracks and albums (or unknow type)
  const wantsArtist = !kind || ARTIST_KINDS.has(kind);
  let artist = null;
  if (wantsArtist && kind && id) {
    artist = await artistFromEmbed(kind, id).catch(() => null);
  }

  if (!title || (wantsArtist && !artist)) {
    const page = await fromPageMeta(url).catch(() => null);
    title ??= page?.title ?? null;
    if (wantsArtist) artist ??= page?.artist ?? null;
  }

  if (!title) {
    throw new Error("Title not found : Spotify may have changed its format or data scheme");
  }

  const query = [wantsArtist ? artist : null, title].filter(Boolean).join(" ");
  return {
    title,
    artist: wantsArtist ? artist : null,
    kind,
    ytm: `https://music.youtube.com/search?q=${encodeURIComponent(query)}`,
  };
}
