import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const releasesToScrape = [
  {
    id: "1",
    track_id: "6ULNS7oJFnrmnzBOaXrcuf",
    title: "she don't want me",
    artist: "HEATIT",
    url: "https://open.spotify.com/track/6ULNS7oJFnrmnzBOaXrcuf",
    type: "single"
  },
  {
    id: "2",
    track_id: "0fziDUsyfHK6d0sbupkxaW",
    title: "BURNING STAR",
    artist: "HEATIT // YOUNGPLXYA",
    url: "https://open.spotify.com/track/0fziDUsyfHK6d0sbupkxaW",
    type: "single"
  },
  {
    id: "3",
    track_id: "7FqVHksygFksRHo8XU0Bp7",
    title: "MONTAGEM XOLO",
    artist: "ANMANE",
    url: "https://open.spotify.com/album/0UpRh1CvKSMZf8COHwq2un",
    type: "ep",
    album_id: "0UpRh1CvKSMZf8COHwq2un",
    ep_tracks: [
      { id: "7FqVHksygFksRHo8XU0Bp7", name: "MONTAGEM XOLO" },
      { id: "1o4cvjZZarlPOjWrymeCE4", name: "MONTAGEM XOLO - Sped Up" },
      { id: "6ajVptR4Vv9XfILOWf8YIW", name: "MONTAGEM XOLO - Slowed" },
      { id: "74AThgedQi5uJFtGaWpiu1", name: "MONTAGEM XOLO - Super Slowed" },
      { id: "5x01M5yHTtvirGZaoLNW7M", name: "MONTAGEM XOLO - Ultra Slowed" }
    ]
  }
];

// Helper to scrape a single track playcount via Puppeteer
async function scrapeTrackPuppeteer(page, trackUrl) {
  try {
    await page.goto(trackUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForSelector('[data-testid="playcount"]', { timeout: 8000 }).catch(() => {});
    const playcountText = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="playcount"]');
      return el ? el.innerText.trim() : null;
    });
    return playcountText ? parseInt(playcountText.replace(/[^\d]/g, ''), 10) : 0;
  } catch (e) {
    return 0;
  }
}

// Scrape with Puppeteer (GitHub Actions)
async function scrapeWithPuppeteer() {
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const results = [];

  for (const item of releasesToScrape) {
    console.log(`Scraping release: ${item.title} (${item.type})...`);
    if (item.type === 'ep' && item.ep_tracks) {
      let epSum = 0;
      const breakdown = [];
      for (const t of item.ep_tracks) {
        const url = `https://open.spotify.com/track/${t.id}`;
        const streams = await scrapeTrackPuppeteer(page, url);
        console.log(`  -> EP Track [${t.name}]: ${streams.toLocaleString('en-US')}`);
        epSum += streams;
        breakdown.push({ id: t.id, name: t.name, streams, formatted: streams.toLocaleString('en-US') });
      }
      results.push({
        ...item,
        streams: epSum,
        formatted_streams: epSum.toLocaleString('en-US'),
        ep_breakdown: breakdown
      });
    } else {
      const streams = await scrapeTrackPuppeteer(page, item.url);
      console.log(`  -> Track [${item.title}]: ${streams.toLocaleString('en-US')}`);
      results.push({
        ...item,
        streams,
        formatted_streams: streams.toLocaleString('en-US')
      });
    }
  }

  await browser.close();
  return results;
}

// Helper to scrape a single track playcount via local CDP browser (Windows)
async function scrapeTrackCDP(browserPath, port, trackUrl) {
  const cdpPort = port;
  const browser = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=' + cdpPort,
    '--window-size=1280,1000',
    trackUrl
  ]);

  let pageTarget = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const list = await res.json();
      pageTarget = list.find(p => p.type === 'page' && p.url.includes('spotify.com'));
      if (pageTarget) break;
    } catch {}
  }

  if (!pageTarget) {
    browser.kill();
    return 0;
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

  // Poll for playcount element up to 10 seconds
  let playcountText = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(r => setTimeout(r, 500));
    const evalResult = await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector('[data-testid="playcount"]');
        return el ? el.innerText.trim() : null;
      })()`,
      returnByValue: true
    });
    playcountText = evalResult?.result?.value;
    if (playcountText) break;
  }

  const num = playcountText ? parseInt(playcountText.replace(/[^\d]/g, ''), 10) : 0;

  ws.close();
  browser.kill();
  return num;
}

// Scrape with CDP
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
  let port = 9265;

  for (const item of releasesToScrape) {
    console.log(`Scraping release: ${item.title} (${item.type})...`);
    if (item.type === 'ep' && item.ep_tracks) {
      let epSum = 0;
      const breakdown = [];
      for (const t of item.ep_tracks) {
        const url = `https://open.spotify.com/track/${t.id}`;
        const streams = await scrapeTrackCDP(browserPath, port++, url);
        console.log(`  -> EP Track [${t.name}]: ${streams.toLocaleString('en-US')}`);
        epSum += streams;
        breakdown.push({ id: t.id, name: t.name, streams, formatted: streams.toLocaleString('en-US') });
      }
      results.push({
        ...item,
        streams: epSum,
        formatted_streams: epSum.toLocaleString('en-US'),
        ep_breakdown: breakdown
      });
    } else {
      const streams = await scrapeTrackCDP(browserPath, port++, item.url);
      console.log(`  -> Track [${item.title}]: ${streams.toLocaleString('en-US')}`);
      results.push({
        ...item,
        streams,
        formatted_streams: streams.toLocaleString('en-US')
      });
    }
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

  const jsonPath = path.join(rootDir, 'streams.json');
  let existingData = null;
  if (fs.existsSync(jsonPath)) {
    try {
      existingData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch {}
  }

  // Preserve previous stream count if transient fetch fails
  results = results.map(r => {
    if (r.type === 'ep' && r.ep_breakdown && existingData?.tracks) {
      const oldEp = existingData.tracks.find(t => t.id === r.id);
      if (oldEp?.ep_breakdown) {
        let newSum = 0;
        r.ep_breakdown = r.ep_breakdown.map(sub => {
          if (sub.streams === 0) {
            const oldSub = oldEp.ep_breakdown.find(s => s.id === sub.id);
            if (oldSub && oldSub.streams > 0) {
              console.log(`Preserving existing stream count for EP track [${sub.name}]: ${oldSub.formatted}`);
              sub.streams = oldSub.streams;
              sub.formatted = oldSub.formatted;
            }
          }
          newSum += sub.streams;
          return sub;
        });
        r.streams = newSum;
        r.formatted_streams = newSum.toLocaleString('en-US');
      }
    } else if (r.streams === 0 && existingData?.tracks) {
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
      type: r.type,
      streams: r.streams,
      formatted_streams: r.formatted_streams,
      spotify_url: r.url,
      ep_breakdown: r.ep_breakdown || undefined
    }))
  };

  fs.writeFileSync(jsonPath, JSON.stringify(outputPayload, null, 2), 'utf8');
  console.log(`Successfully wrote streams data to: ${jsonPath}`);
  console.log(`Total Catalog Streams across releases: ${formattedTotal}`);

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
