// ROTIUM Funker – postet Neuigkeiten per Webhook in den Discord.
// Aufruf (aus .github/workflows/discord.yml):
//   node funker.mjs release   → Patchnotes + Download-Link (Ereignis „release“ oder neuestes Release)
//   node funker.mjs playtest  → Aufruf zur neuen Testversion
//   node funker.mjs social    → neue YouTube-Videos und Shorts (Zustand in state.json)
//   node funker.mjs test      → je eine Probe-Nachricht in alle eingerichteten Kanäle
// Webhooks/IDs kommen aus Umgebungsvariablen (GitHub Secrets / Variables).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const REPO = process.env.GITHUB_REPOSITORY || 'beydo7/rotium-releases';
const PAGES = 'https://beydo7.github.io/rotium-releases';
const NAME = 'ROTIUM Funker';
const AVATAR = `${PAGES}/media/discord/funker.png`;
const AMBER = 0xE8A33D, ROT = 0xC0392B, GRUEN = 0x7FA043;
const FOOTER = { text: 'PROJEKT ROTIUM · KESSEL 9 · STRENG GEHEIM' };
const env = (k) => (process.env[k] || '').trim();

// ---------- Discord ----------
async function send(hookVar, payload, ping) {
  const url = env(hookVar);
  if (!url) { console.log(`– ${hookVar} nicht gesetzt, übersprungen`); return false; }
  const body = { username: NAME, avatar_url: AVATAR, ...payload, allowed_mentions: { parse: [], roles: ping ? [ping] : [] } };
  if (ping) body.content = `<@&${ping}> ${body.content || ''}`.trim();
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url + '?wait=true', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await sleep(((j.retry_after ?? 2) + 0.5) * 1000); continue; }
    if (!r.ok) throw new Error(`${hookVar}: Discord meldet ${r.status} ${await r.text()}`);
    console.log(`✓ gesendet über ${hookVar}`);
    return true;
  }
  throw new Error(`${hookVar}: zu viele Anfragen`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- GitHub ----------
async function gh(path) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'rotfall-funker' };
  if (env('GITHUB_TOKEN')) headers.Authorization = `Bearer ${env('GITHUB_TOKEN')}`;
  const r = await fetch(`https://api.github.com/${path}`, { headers });
  if (!r.ok) throw new Error(`GitHub ${path}: ${r.status}`);
  return r.json();
}
async function currentRelease() {
  const p = env('GITHUB_EVENT_PATH');
  if (p && existsSync(p)) {
    const ev = JSON.parse(readFileSync(p, 'utf8'));
    if (ev.release) return ev.release;
  }
  return gh(`repos/${REPO}/releases/latest`);
}

// Markdown der Release-Notes für Discord aufbereiten
function notesForDiscord(md) {
  md = md.replace(/\r/g, '').split(/\n## Download\b/)[0].trim();
  let title = null;
  const m = md.match(/^##\s+(.+)\n/);
  if (m) { title = m[1].trim(); md = md.slice(m[0].length).trim(); }
  md = md.replace(/^#{1,6}\s+(.+)$/gm, '**$1**');      // Überschriften → fett
  md = md.replace(/^(\s*)[-*]\s+/gm, '$1• ');           // Listenpunkte
  return { title, text: md };
}
function chunks(text, max = 3900) {
  const out = []; let cur = '';
  for (const block of text.split(/\n(?=\n|\*\*)/)) {
    if ((cur + '\n' + block).length > max && cur) { out.push(cur.trim()); cur = ''; }
    if (block.length > max) { for (let i = 0; i < block.length; i += max) out.push(block.slice(i, i + max)); continue; }
    cur += '\n' + block;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const mb = (b) => `${(b / 1048576).toFixed(0)} MB`;

async function release() {
  const rel = await currentRelease();
  const ver = rel.tag_name.replace(/\.0$/, '');
  const { title, text } = notesForDiscord(rel.body || '');
  const parts = chunks(text);

  // 1) Patchnotes
  for (let i = 0; i < parts.length; i++) {
    const e = { color: AMBER, description: parts[i] };
    if (i === 0) { e.title = `📝 ${rel.name || 'ROTIUM ' + ver}${title ? ' – ' + title.replace(/^Neu in v[\d.]+\s*[–-]\s*/, '') : ''}`; e.url = rel.html_url; }
    if (i === parts.length - 1) { e.footer = FOOTER; e.timestamp = rel.published_at || new Date().toISOString(); }
    await send('DISCORD_PATCHNOTES', { content: i === 0 ? `**ROTIUM ${ver} ist da!** 🧟` : '', embeds: [e] }, i === 0 ? env('ROLE_PATCH') : null);
    await sleep(800);
  }

  // 2) Download-Link
  const win = rel.assets.find((a) => /windows/i.test(a.name));
  const web = rel.assets.find((a) => /browser/i.test(a.name));
  const fields = [];
  if (win) fields.push({ name: '🪟 Windows', value: `**[${win.name}](${win.browser_download_url})** · ${mb(win.size)}\nEntpacken (Rechtsklick → „Alle extrahieren“) → \`ROTIUM.exe\` starten.\nWarnt Windows: „Weitere Informationen“ → „Trotzdem ausführen“.\nAlles zum Download: [Download-Seite](${PAGES}/release/)` });
  fields.push({ name: '🌐 Direkt im Browser spielen', value: `**[Jetzt spielen](${PAGES}/play/)** – nichts installieren, läuft in Chrome und Edge.` });
  if (web) fields.push({ name: '📦 Browser-Version zum Mitnehmen', value: `[${web.name}](${web.browser_download_url}) · ${mb(web.size)} – entpacken, \`ROTIUM.html\` öffnen.` });
  fields.push({ name: '📜 Was ist neu?', value: `[Patchnotes ${ver}](${rel.html_url}) · [Alle Versionen](https://github.com/${REPO}/releases)` });
  await send('DISCORD_DOWNLOAD', { embeds: [{
    color: ROT,
    title: `🎮 ROTIUM ${ver} – jetzt herunterladen`,
    url: `${PAGES}/release/`,
    description: 'Dein Fortschritt bleibt beim Update erhalten.',
    fields,
    image: { url: `${PAGES}/media/site/hero.jpg` },
    footer: FOOTER,
    timestamp: rel.published_at || new Date().toISOString(),
  }] });
}

// ---------- Testversion ----------
async function playtest() {
  let notes = '';
  if (existsSync('test/NOTES.md')) notes = readFileSync('test/NOTES.md', 'utf8').trim();
  if (!notes) {
    const p = env('GITHUB_EVENT_PATH');
    const ev = p && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
    notes = (ev.head_commit?.message || '').trim();
  }
  const { text } = notesForDiscord(notes || 'Neue Testversion – schaut rein!');
  await send('DISCORD_PLAYTEST', { content: '**Neue Testversion im Feldlabor!** 🧪', embeds: [{
    color: GRUEN,
    title: '🧪 Testversion bereit',
    url: `${PAGES}/test/`,
    description: `${text.slice(0, 3500)}\n\n**[▶ Testversion öffnen](${PAGES}/test/?v=${Date.now()})**\nFehler gefunden? Im Spiel **F8** drücken und in #fehlerberichte posten. Rückmeldung gern im Thread unter dieser Nachricht.`,
    footer: FOOTER,
    timestamp: new Date().toISOString(),
  }] }, env('ROLE_PLAYTEST'));
}

// ---------- YouTube (Videos + Shorts) ----------
function parseFeed(xml) {
  const items = [];
  const re = /<(entry|item)\b[\s\S]*?<\/\1>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[0];
    const tag = (t) => { const x = b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return x ? x[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''; };
    const link = (b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || tag('link');
    const id = tag('yt:videoId') || tag('guid') || tag('id') || link;
    const date = tag('published') || tag('pubDate') || tag('updated');
    if (id && link) items.push({ id, link: decode(link), title: decode(tag('title')), date: date ? Date.parse(date) : 0 });
  }
  return items.sort((a, b) => a.date - b.date);
}
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function youtubeFeed() {
  let v = env('YOUTUBE');
  if (!v) return null;
  let id = (v.match(/UC[\w-]{22}/) || [])[0];
  if (!id) {
    // @Handle oder Kanal-Link → Kanal-ID von der Kanalseite lesen
    const url = v.startsWith('http') ? v : `https://www.youtube.com/${v.startsWith('@') ? v : '@' + v}`;
    const html = await (await fetch(url, { headers: { 'Accept-Language': 'de' } })).text();
    id = (html.match(/"(?:channelId|externalId)":"(UC[\w-]{22})"/) || [])[1];
    if (!id) throw new Error('YouTube-Kanal nicht gefunden – bitte die Kanal-ID (beginnt mit UC…) als Variable YOUTUBE eintragen');
  }
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;
}

// Liste der neuesten Hauptvideos (ohne Shorts) für die Linkseite (links/) → videos.json im Zweig discord-state
function writeVideoList(items, feedUrl) {
  const vids = items.filter((i) => !i.link.includes('/shorts/')).sort((a, b) => b.date - a.date).slice(0, 8)
    .map((i) => ({ id: i.id, title: i.title, date: new Date(i.date).toISOString() }));
  const prev = existsSync('videos.json') ? JSON.parse(readFileSync('videos.json', 'utf8')) : {};
  if (JSON.stringify(prev.videos) === JSON.stringify(vids)) return;
  const channel = env('YOUTUBE_URL') || (env('YOUTUBE').startsWith('@') ? `https://www.youtube.com/${env('YOUTUBE')}` : prev.channel || 'https://www.youtube.com/@beydo7');
  writeFileSync('videos.json', JSON.stringify({ updated: new Date().toISOString(), channel, videos: vids }, null, 1));
  console.log(`videos.json: ${vids.length} Videos`);
}

async function social() {
  const state = existsSync('state.json') ? JSON.parse(readFileSync('state.json', 'utf8')) : {};
  const sources = [
    { key: 'youtube', url: await youtubeFeed(), text: (it) => `📺 **Neues Video:** ${it.title}\n${it.link}` },
  ];
  for (const s of sources) {
    if (!s.url) { console.log(`– ${s.key}: nicht eingerichtet`); continue; }
    let items;
    try {
      const r = await fetch(s.url, { headers: { 'User-Agent': 'Mozilla/5.0 rotfall-funker' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      items = parseFeed(await r.text());
    } catch (e) { console.log(`⚠️ ${s.key}: Feed nicht lesbar (${e.message}) – nächstes Mal wieder`); continue; }
    if (s.key === 'youtube') writeVideoList(items, s.url);
    // Kontrolle im Log: die neuesten Einträge im Feed
    for (const i of items.slice(-3)) console.log(`  Feed: ${new Date(i.date).toISOString()} ${i.id} ${i.title}`);
    const seen = new Set(state[s.key] || []);
    if (!state[s.key]) {
      // Erster Lauf: alles Vorhandene merken, nichts posten (kein Spam mit alten Videos)
      state[s.key] = items.map((i) => i.id).slice(-50);
      console.log(`${s.key}: ${items.length} vorhandene Beiträge gemerkt (erster Lauf, nichts gepostet)`);
      continue;
    }
    const fresh = items.filter((i) => !seen.has(i.id));
    for (const it of fresh) {
      await send('DISCORD_VIDEOS', { content: s.text(it) }, env('ROLE_VIDEOS'));
      seen.add(it.id);
      await sleep(800);
    }
    state[s.key] = [...seen].slice(-50);
    console.log(`${s.key}: ${fresh.length} neu`);
  }
  writeFileSync('state.json', JSON.stringify(state, null, 1));
}

// ---------- Probe ----------
async function test() {
  const probe = (hook, what) => send(hook, { embeds: [{ color: AMBER, title: '📻 Funkprobe', description: `Hier spricht der ROTIUM Funker. In diesem Kanal erscheinen ab jetzt: **${what}**.`, footer: FOOTER }] });
  await probe('DISCORD_PATCHNOTES', 'Patchnotes zu jeder neuen Version');
  await probe('DISCORD_DOWNLOAD', 'Download-Links zu jeder neuen Version');
  await probe('DISCORD_PLAYTEST', 'Aufrufe zu neuen Testversionen');
  await probe('DISCORD_VIDEOS', 'neue YouTube-Videos und Shorts');
}

const cmd = process.argv[2];
const run = { release, playtest, social, test }[cmd];
if (!run) { console.error('Aufruf: node funker.mjs release|playtest|social|test'); process.exit(1); }
run().catch((e) => { console.error('❌', e.message); process.exit(1); });
