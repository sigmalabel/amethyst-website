import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceRoot = resolve(projectRoot, "site-src");

const [htmlSource, css, app, logo, favicon] = await Promise.all([
  readFile(resolve(sourceRoot, "index.html"), "utf8"),
  readFile(resolve(sourceRoot, "styles.css"), "utf8"),
  readFile(resolve(sourceRoot, "app.js"), "utf8"),
  readFile(resolve(sourceRoot, "assets/amethyst-logo.png")),
  readFile(resolve(sourceRoot, "assets/amethyst-favicon.png")),
]);

const logoData = "data:image/png;base64," + logo.toString("base64");
const faviconData = "data:image/png;base64," + favicon.toString("base64");
const inlineApp = app.replaceAll("</script>", "<\\/script>");
const page = htmlSource
  .replace('<link rel="icon" type="image/png" href="./assets/amethyst-favicon.png" />', '<link rel="icon" type="image/png" href="' + faviconData + '" />')
  .replace('<link rel="stylesheet" href="./styles.css" />', "<style>" + css + "</style>")
  .replaceAll("./assets/amethyst-logo.png", logoData)
  .replace('<script src="./app.js"></script>', "<script>" + inlineApp + "</script>");

const runtime = [
  "let spotifyAccessToken = '';",
  "let spotifyAccessTokenExpiresAt = 0;",
  "",
  "const json = (payload, status = 200) => new Response(JSON.stringify(payload), {",
  "  status,",
  "  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },",
  "});",
  "",
  "const queryFrom = (url) => (url.searchParams.get('q') || '').trim().slice(0, 80);",
  "",
  "async function getSpotifyToken(env) {",
  "  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return null;",
  "  if (spotifyAccessToken && Date.now() < spotifyAccessTokenExpiresAt) return spotifyAccessToken;",
  "  const credentials = btoa(env.SPOTIFY_CLIENT_ID + ':' + env.SPOTIFY_CLIENT_SECRET);",
  "  const response = await fetch('https://accounts.spotify.com/api/token', {",
  "    method: 'POST',",
  "    headers: { Authorization: 'Basic ' + credentials, 'content-type': 'application/x-www-form-urlencoded' },",
  "    body: 'grant_type=client_credentials',",
  "  });",
  "  if (!response.ok) throw new Error('Spotify authorization failed');",
  "  const payload = await response.json();",
  "  spotifyAccessToken = payload.access_token;",
  "  spotifyAccessTokenExpiresAt = Date.now() + Math.max(60, payload.expires_in - 60) * 1000;",
  "  return spotifyAccessToken;",
  "}",
  "",
  "async function searchSpotify(url, env) {",
  "  const q = queryFrom(url);",
  "  if (q.length < 2) return json({ results: [] });",
  "  const token = await getSpotifyToken(env);",
  "  if (!token) return json({ code: 'spotify_unconfigured', results: [] }, 503);",
  "  const response = await fetch('https://api.spotify.com/v1/search?type=artist&limit=8&q=' + encodeURIComponent(q), {",
  "    headers: { Authorization: 'Bearer ' + token },",
  "  });",
  "  if (!response.ok) return json({ code: 'spotify_search_failed', results: [] }, 502);",
  "  const payload = await response.json();",
  "  const results = (payload.artists?.items || []).map((artist) => ({",
  "    id: artist.id,",
  "    name: artist.name,",
  "    url: artist.external_urls?.spotify || '',",
  "    image: artist.images?.[1]?.url || artist.images?.[0]?.url || '',",
  "    subtitle: artist.followers?.total ? artist.followers.total.toLocaleString('en-US') + ' followers' : (artist.genres?.[0] || 'Spotify artist'),",
  "  })).filter((artist) => artist.url);",
  "  return json({ results });",
  "}",
  "",
  "async function searchApple(url) {",
  "  const q = queryFrom(url);",
  "  if (q.length < 2) return json({ results: [] });",
  "  const endpoint = 'https://itunes.apple.com/search?media=music&entity=musicArtist&country=US&limit=8&term=' + encodeURIComponent(q);",
  "  const response = await fetch(endpoint, { headers: { accept: 'application/json' } });",
  "  if (!response.ok) return json({ code: 'apple_search_failed', results: [] }, 502);",
  "  const payload = await response.json();",
  "  const seen = new Set();",
  "  const results = (payload.results || []).map((artist) => ({",
  "    id: String(artist.artistId || ''),",
  "    name: artist.artistName || '',",
  "    url: artist.artistLinkUrl || artist.artistViewUrl || '',",
  "    image: artist.artworkUrl100 || '',",
  "    subtitle: artist.primaryGenreName || 'Apple Music artist',",
  "  })).filter((artist) => artist.id && artist.name && artist.url && !seen.has(artist.id) && seen.add(artist.id));",
  "  return json({ results });",
  "}",
  "",
  "export default {",
  "  async fetch(request, env) {",
  "    const url = new URL(request.url);",
  "    try {",
  "      if (request.method === 'GET' && url.pathname === '/api/spotify-artists') return await searchSpotify(url, env);",
  "      if (request.method === 'GET' && url.pathname === '/api/apple-artists') return await searchApple(url);",
  "      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {",
  "        return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });",
  "      }",
  "      if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 });",
  "      return new Response('Not found', { status: 404 });",
  "    } catch (error) {",
  "      return json({ code: 'search_unavailable', results: [] }, 502);",
  "    }",
  "  },",
  "};",
].join("\n");

const workerSource = "const PAGE = " + JSON.stringify(page) + ";\n\n" + runtime + "\n";
await writeFile(resolve(projectRoot, "worker/index.js"), workerSource, "utf8");
console.log("Embedded Amethyst site and search endpoints into worker/index.js");
