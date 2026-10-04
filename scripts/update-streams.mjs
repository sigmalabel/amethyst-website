import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const tracksToScrape = [
  {
    id: "1",
    track_id: "6ULNS7oJFnrmnzBOaXrcuf",
    title: "she don't want me",
    artist: "HEATIT",
    url: "https://open.spotify.com/track/6ULNS7oJFnrmnzBOaXrcuf"
  },
  {
    id: "2",
    track_id: "0fziDUsyfHK6d0sbupkxaW",
    title: "BURNING STAR",
    artist: "HEATIT // YOUNGPLXYA",
    url: "https://open.spotify.com/track/0fziDUsyfHK6d0sbupkxaW"
  },
  {
    id: "3",
    track_id: "7FqVHksygFksRHo8XU0Bp7",
    title: "MONTAGEM XOLO",
    artist: "ANMANE",
    url: "https://open.spotify.com/track/7FqVHksygFksRHo8XU0Bp7",
    album_url: "https://open.spotify.com/album/0UpRh1CvKSMZf8COHwq2un"
  }
];

// Helper to scrape using Puppeteer if available (GitHub Actions)
async function scrapeWithPuppeteer() {
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const results = [];
  for (const track of tracksToScrape) {
    console.log(`Scraping ${track.title} via Puppeteer: ${track.url}...`);
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.goto(track.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Wait for playcount element
      await page.waitForSelector('[data-testid="playcount"]', { timeout: 12000 }).catch(() => {});
      
      const playcountText = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="playcount"]');
        return el ? el.innerText.trim() : null;
      });

      const num = playcountText ? parseInt(playcountText.replace(/[^\d]/g, ''), 10) : null;
      console.log(`-> ${track.title}: ${playcountText} (${num})`);
      results.push({
        ...track,
        streams: num || 0,
        formatted_streams: playcountText || '0'
      });
      await page.close();
    } catch (err) {
      console.error(`Error scraping ${track.title}:`, err.message);
      results.push({ ...track, streams: 0, formatted_streams: '0' });
    }
  }

  await browser.close();
  return results;
}

// Helper to scrape using local browser CDP (Windows / Edge / Chrome)
async function scrapeWithCDP() {
  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ];
  const browserPath = edgePaths.find(p => fs.existsSync(p));
  if (!browserPath) {
    throw new Error('No compatible browser found for CDP scraping');
  }

  const results = [];
  let port = 9260;

  for (const track of tracksToScrape) {
    console.log(`Scraping ${track.title} via Browser CDP: ${track.url}...`);
    const cdpPort = port++;
    const browser = spawn(browserPath, [
      '--headless=new',
      '--disable-gpu',
      '--remote-debugging-port=' + cdpPort,
      '--window-size=1280,1000',
      track.url
    ]);

    let pageTarget = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        const list = await res.json();
        pageTarget = list.find(p => p.type === 'page' && p.url.includes('spotify.com'));
        if (pageTarget) break;
      } catch {}
    }

    if (!pageTarget) {
      console.error(`Could not connect to browser for ${track.title}`);
      browser.kill();
      continue;
    }

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let id = 1;
    const pending = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result);
        pending.delete(msg.id);
      }
    };
    const send = (method, params = {}) => new Promise(r => {
      const reqId = id++;
      pending.set(reqId, r);
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });

    await new Promise(r => ws.onopen = r);
    await send('Page.enable');
    await send('Runtime.enable');
    await new Promise(r => setTimeout(r, 4500));

    const evalResult = await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector('[data-testid="playcount"]');
        return el ? el.innerText.trim() : null;
      })()`,
      returnByValue: true
    });

    const playcountText = evalResult?.result?.value;
    const num = playcountText ? parseInt(playcountText.replace(/[^\d]/g, ''), 10) : null;
    console.log(`-> ${track.title}: ${playcountText} (${num})`);

    results.push({
      ...track,
      streams: num || 0,
      formatted_streams: playcountText || '0'
    });

    ws.close();
    browser.kill();
  }

  return results;
}

async function main() {
  console.log('=== Amethyst Spotify Stream Scraper ===');
  let results = null;

  try {
    results = await scrapeWithPuppeteer();
  } catch (e) {
    console.log('Puppeteer not installed or failed, falling back to local CDP browser...');
    results = await scrapeWithCDP();
  }

  if (!results || !results.length) {
    console.error('Failed to scrape track streams');
    process.exit(1);
  }

  // If any track returned 0 streams, preserve previous known value if streams.json already exists
  const jsonPath = path.join(rootDir, 'streams.json');
  let existingData = null;
  if (fs.existsSync(jsonPath)) {
    try {
      existingData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch {}
  }

  results = results.map(r => {
    if (r.streams === 0 && existingData?.tracks) {
      const old = existingData.tracks.find(t => t.id === r.id);
      if (old && old.streams > 0) {
        console.log(`Preserving existing stream count for ${r.title}: ${old.formatted_streams}`);
        return { ...r, streams: old.streams, formatted_streams: old.formatted_streams };
      }
    }
    return r;
  });

  const totalStreams = results.reduce((sum, t) => sum + (t.streams || 0), 0);
  const formattedTotal = totalStreams.toLocaleString('en-US');

  const outputPayload = {
    updated_at: new Date().toISOString(),
    total_streams: totalStreams,
    formatted_total: formattedTotal,
    tracks: results.map(r => ({
      id: r.id,
      track_id: r.track_id,
      title: r.title,
      artist: r.artist,
      streams: r.streams,
      formatted_streams: r.formatted_streams,
      spotify_url: r.url,
      album_url: r.album_url || undefined
    }))
  };

  fs.writeFileSync(jsonPath, JSON.stringify(outputPayload, null, 2), 'utf8');
  console.log(`Successfully wrote streams data to: ${jsonPath}`);
  console.log(`Total Streams across releases: ${formattedTotal}`);

  // Also sync to site-src/streams.json
  const siteSrcJson = path.join(rootDir, 'site-src', 'streams.json');
  try {
    fs.writeFileSync(siteSrcJson, JSON.stringify(outputPayload, null, 2), 'utf8');
  } catch {}

  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal error running scraper:', err);
  process.exit(1);
});
