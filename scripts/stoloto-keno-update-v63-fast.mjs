// KENO v6.3 · FAST STOLOTO READER
// Retrieval model copied from the proven M5M approach:
// frame-aware OAuth, recent tail only, 3 reads, 2-of-3 consensus.
// The existing v6.3 history/FINGERPRINT logic is preserved.

import fs from 'node:fs/promises';
import process from 'node:process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const ENGINE = require('../engine-v63.js');
const { VERSION, processFingerprint } = require('./fingerprint-server-v63.js');

const LOGIN_URL = 'https://oauth.stoloto.ru/login';
const ARCHIVE_URL = 'https://m.stoloto.ru/keno2/archive/';
const HISTORY_FILE = 'keno-history-v63.json';
const STATUS_FILE = 'keno-status-v63.json';
const STATE_FILE = 'fingerprint-state-v63.json';
const FP_ARCHIVE_FILE = 'fingerprint-archive-v63.json';
const SOURCE = 'Официальный Столото · M5M-style tail 2-of-3';
const TAIL_SIZE = 10;
const READS = 3;
const LOGIN_TIMEOUT_MS = 20000;
const PAGE_TIMEOUT_MS = 60000;

const EMAIL = process.env.STOLOTO_EMAIL || '';
const PASSWORD = process.env.STOLOTO_PASSWORD || '';
if (!EMAIL || !PASSWORD) throw new Error('FAIL: нет GitHub Secrets STOLOTO_EMAIL / STOLOTO_PASSWORD');

const SCHEDULE = new Set([
  '00:02','00:17','00:32','01:02','01:17','01:32','02:02','02:17','02:32','03:02','03:32',
  '04:02','04:17','04:32','05:02','05:17','05:32','06:02','06:17','06:32','07:02','07:32',
  '08:02','08:17','08:32','09:02','09:17','09:32','10:02','10:17','10:32','11:02','11:32',
  '12:02','12:17','12:32','13:02','13:17','13:32','14:02','14:17','14:32','15:02','15:32',
  '16:02','16:17','16:32','17:02','17:17','17:32','18:02','18:17','18:32','19:02','19:32',
  '20:02','20:17','20:32','21:02','21:17','21:32','22:02','22:17','22:32','23:02','23:32'
]);
const MONTHS = {
  'января':1,'февраля':2,'марта':3,'апреля':4,'мая':5,'июня':6,
  'июля':7,'августа':8,'сентября':9,'октября':10,'ноября':11,'декабря':12
};

const pad2 = n => String(n).padStart(2, '0');
const norm = s => String(s ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();

function moscowToday() {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}

function shiftDate({ y, m, d }, delta) {
  const x = new Date(Date.UTC(y, m - 1, d));
  x.setUTCDate(x.getUTCDate() + delta);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
}

function parseDateLabel(label) {
  const raw = norm(label).toLowerCase();
  const today = moscowToday();
  let p = null;
  if (raw === 'сегодня') p = today;
  else if (raw === 'вчера') p = shiftDate(today, -1);
  else {
    let m = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
    if (m) {
      let y = Number(m[3]); if (y < 100) y += 2000;
      p = { d: Number(m[1]), m: Number(m[2]), y };
    } else {
      m = raw.match(/^(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?$/i);
      if (m && MONTHS[m[2]]) {
        let y = m[3] ? Number(m[3]) : today.y;
        const mm = MONTHS[m[2]];
        if (!m[3] && mm > today.m + 6) y -= 1;
        p = { d: Number(m[1]), m: mm, y };
      }
    }
  }
  if (!p) return null;
  return `${pad2(p.d)}.${pad2(p.m)}.${String(p.y).slice(-2)}`;
}

function parseDraw(text) {
  const m = String(text || '').match(/№\s*([0-9]{4,})/);
  return m ? Number(m[1]) : null;
}
function parseTime(text) {
  const m = String(text || '').match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/);
  if (!m) return null;
  return `${pad2(Number(m[1]))}:${m[2]}`;
}
function parseParity(text) {
  const s = norm(text).toLowerCase();
  if (s.includes('больше нечётных') || s.includes('больше нечетных')) return 'Больше нечётных';
  if (s.includes('больше чётных') || s.includes('больше четных')) return 'Больше чётных';
  if (s.includes('поровну')) return 'Поровну';
  return null;
}
function parseColumn(text) {
  const m = norm(text).match(/столб(?:ец)?\s*[:№#-]?\s*([1-9]|10)\b/i);
  return m ? Number(m[1]) : null;
}
function validColumn(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

async function firstVisible(scope, selectors) {
  for (const sel of selectors) {
    const loc = scope.locator(sel).first();
    try {
      if (await loc.count() && await loc.isVisible()) return loc;
    } catch (_) {}
  }
  return null;
}

async function waitForLoginFields(page) {
  const loginSelectors = [
    'input[type="email"]','input[name*="email" i]','input[name*="login" i]',
    'input[autocomplete="username"]','input[type="text"]'
  ];
  const passSelectors = [
    'input[type="password"]','input[name*="password" i]','input[autocomplete="current-password"]'
  ];
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const login = await firstVisible(frame, loginSelectors);
      const pass = await firstVisible(frame, passSelectors);
      if (login && pass) return { frame, login, pass };
    }
    await page.waitForTimeout(250);
  }
  return null;
}

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
  const fields = await waitForLoginFields(page);
  if (!fields) throw new Error(`FAIL: OAuth-поля не появились за ${LOGIN_TIMEOUT_MS / 1000} сек`);
  await fields.login.fill(EMAIL);
  await fields.pass.fill(PASSWORD);

  const buttons = [
    fields.frame.getByRole('button', { name: /войти/i }).first(),
    fields.frame.locator('button[type="submit"]').first(),
    fields.frame.locator('input[type="submit"]').first()
  ];
  let clicked = false;
  for (const btn of buttons) {
    try {
      if (await btn.count() && await btn.isVisible()) {
        await btn.click(); clicked = true; break;
      }
    } catch (_) {}
  }
  if (!clicked) throw new Error('FAIL: OAuth-кнопка «Войти» не найдена');
  await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

async function collectFromScope(scope) {
  return scope.locator('body').evaluate(() => {
    const drawRx = /№\s*\d{4,}/;
    const dateRx = /^(Сегодня|Вчера|\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+\d{4})?)$/i;
    const norm = s => String(s || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
    const all = [...document.querySelectorAll('body *')];
    function nearestDate(el) {
      let best = null;
      for (const node of all) {
        if (node === el || el.contains(node)) continue;
        const pos = node.compareDocumentPosition(el);
        if (!(pos & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        const t = norm(node.innerText || node.textContent || '');
        if (!t || t.length > 40 || !dateRx.test(t)) continue;
        if (node.children && node.children.length > 3) continue;
        best = t;
      }
      return best;
    }
    let rows = [...document.querySelectorAll('tr')].filter(el => drawRx.test(el.innerText || ''));
    if (!rows.length) {
      rows = all.filter(el => {
        const t = norm(el.innerText || '');
        if (!drawRx.test(t)) return false;
        const buttons = el.querySelectorAll('button');
        if (buttons.length < 20) return false;
        return ![...el.children].some(ch => drawRx.test(norm(ch.innerText || '')) && ch.querySelectorAll('button').length >= 20);
      });
    }
    return rows.map(el => ({
      text: el.innerText || '',
      dateLabel: nearestDate(el),
      buttons: [...el.querySelectorAll('button')].map(b => norm(b.innerText || ''))
    }));
  });
}

function parseRawRows(rawRows) {
  const out = [];
  let carryDate = null;
  for (const row of rawRows) {
    const text = String(row.text || '');
    const label = norm(row.dateLabel || '');
    if (label) carryDate = label;
    const draw = parseDraw(text);
    const time = parseTime(text);
    const parity = parseParity(text);
    const column = parseColumn(text);
    const date = parseDateLabel(label || carryDate || '');
    if (!draw || !date || !time || !SCHEDULE.has(time) || !parity || !column) continue;

    let balls = (row.buttons || [])
      .map(x => Number(norm(x)))
      .filter(n => Number.isInteger(n) && n >= 1 && n <= 80);
    if (balls.length > 20) balls = balls.slice(-20);
    if (balls.length !== 20 || new Set(balls).size !== 20) continue;
    out.push({ draw, date, time, parity, column, balls });
  }
  const map = new Map(out.map(x => [x.draw, x]));
  return [...map.values()].sort((a, b) => a.draw - b.draw);
}

async function collectTail(page) {
  let lastDiag = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(ARCHIVE_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    } catch (_) {}
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2200 + attempt * 500);

    const merged = new Map();
    const scopes = [page, ...page.frames().filter(f => f !== page.mainFrame())];
    for (const scope of scopes) {
      try {
        const rows = await collectFromScope(scope);
        for (const x of parseRawRows(rows)) merged.set(x.draw, x);
      } catch (_) {}
    }
    const parsed = [...merged.values()].sort((a, b) => a.draw - b.draw);
    lastDiag = `page attempt ${attempt}: parsed=${parsed.length}, url=${page.url()}`;
    console.log(lastDiag);
    if (parsed.length >= TAIL_SIZE) return parsed.slice(-TAIL_SIZE);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  throw new Error(`FAIL: не удалось получить последние ${TAIL_SIZE} тиражей; ${lastDiag}`);
}

function recordKey(r) {
  return JSON.stringify({
    draw: Number(r.draw), date: r.date, time: r.time,
    parity: r.parity, column: Number(r.column), balls: r.balls
  });
}
function contiguousRuns(records) {
  const ordered = [...records].sort((a, b) => a.draw - b.draw);
  const runs = [];
  for (const r of ordered) {
    if (!runs.length || r.draw !== runs.at(-1).at(-1).draw + 1) runs.push([r]);
    else runs.at(-1).push(r);
  }
  return runs;
}
function chooseConsensus(reads) {
  const minimum = TAIL_SIZE - 1;
  const candidates = [];
  for (let a = 0; a < reads.length - 1; a += 1) {
    for (let b = a + 1; b < reads.length; b += 1) {
      const ma = new Map(reads[a].map(x => [x.draw, x]));
      const mb = new Map(reads[b].map(x => [x.draw, x]));
      const agreed = [];
      for (const draw of [...ma.keys()].filter(x => mb.has(x)).sort((x, y) => x - y)) {
        if (recordKey(ma.get(draw)) === recordKey(mb.get(draw))) agreed.push(ma.get(draw));
      }
      for (const run of contiguousRuns(agreed)) {
        if (run.length >= minimum) {
          const tail = run.slice(-TAIL_SIZE);
          candidates.push({ tail, last: tail.at(-1).draw, pair: [a + 1, b + 1] });
        }
      }
    }
  }
  if (!candidates.length) throw new Error(`FAIL: нет непрерывного ${minimum}-тиражного 2-of-3 consensus`);
  candidates.sort((x, y) => y.last - x.last || y.tail.length - x.tail.length);
  return candidates[0];
}

async function stableTail(page) {
  const reads = [];
  for (let i = 1; i <= READS; i += 1) {
    const tail = await collectTail(page);
    reads.push(tail);
    console.log(`Read ${i}/${READS}: №${tail[0].draw}–№${tail.at(-1).draw}`);
    if (i < READS) await page.waitForTimeout(700);
  }
  const chosen = chooseConsensus(reads);
  console.log(`M5M-style consensus PASS: checks ${chosen.pair.join('+')}, №${chosen.tail[0].draw}–№${chosen.tail.at(-1).draw}`);
  return { stable: chosen.tail, readingCounts: reads.map(x => x.length), pair: chosen.pair };
}

async function readJson(path, fallback) {
  try { return JSON.parse(await fs.readFile(path, 'utf8')); }
  catch (_) { return fallback; }
}
async function writeJsonAtomic(path, value, pretty = true) {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  const body = JSON.stringify(value, null, pretty ? 2 : 0) + '\n';
  await fs.writeFile(tmp, body, 'utf8');
  await fs.rename(tmp, path);
}

function normalizeHistoryDraw(d) {
  return {
    draw: Number(d?.draw ?? d?.number ?? d?.id),
    date: norm(d?.date),
    time: parseTime(d?.time) || norm(d?.time),
    balls: Array.isArray(d?.balls) ? d.balls.map(Number) : Array.isArray(d?.numbers) ? d.numbers.map(Number) : []
  };
}
function validateHistory(history) {
  if (!Array.isArray(history) || history.length < 60) throw new Error('FAIL: доверенный KENO v6.3 архив отсутствует');
  let prev = 0;
  for (const original of history) {
    const d = normalizeHistoryDraw(original);
    if (!Number.isInteger(d.draw) || d.draw <= prev) throw new Error(`FAIL: история не отсортирована около №${d.draw}`);
    if (!/^\d{2}\.\d{2}\.\d{2,4}$/.test(d.date) || !/^\d{2}:\d{2}$/.test(d.time)) throw new Error(`FAIL: плохая дата/время №${d.draw}`);
    if (d.balls.length !== 20 || new Set(d.balls).size !== 20) throw new Error(`FAIL: плохие 20 чисел №${d.draw}`);
    prev = d.draw;
  }
}

function mergeRecent(history, stable) {
  validateHistory(history);
  const latest = history.at(-1);
  const latestDraw = Number(latest.draw ?? latest.number ?? latest.id);
  const stableMap = new Map(stable.map(x => [x.draw, x]));
  const anchor = stableMap.get(latestDraw);
  if (!anchor) {
    const first = stable[0]?.draw, last = stable.at(-1)?.draw;
    throw new Error(`FAIL: recent tail №${first}–№${last} не содержит anchor №${latestDraw}`);
  }
  const trustedAnchor = normalizeHistoryDraw(latest);
  if (trustedAnchor.date !== anchor.date || trustedAnchor.time !== anchor.time || JSON.stringify(trustedAnchor.balls) !== JSON.stringify(anchor.balls)) {
    throw new Error(`FAIL: официальный anchor №${latestDraw} отличается от доверенной истории`);
  }

  const fresh = stable.filter(x => x.draw > latestDraw).sort((a, b) => a.draw - b.draw);
  let expected = latestDraw + 1;
  for (const x of fresh) {
    if (x.draw !== expected) throw new Error(`FAIL: пропуск: ожидался №${expected}, получен №${x.draw}`);
    expected += 1;
  }

  const official = stableMap;
  const draws = history.map(original => {
    const draw = Number(original.draw ?? original.number ?? original.id);
    const o = official.get(draw);
    if (!o) return original;
    return {
      ...original,
      draw,
      date: o.date,
      time: o.time,
      balls: o.balls,
      parity: o.parity,
      column: o.column,
      columnSource: 'stoloto-official',
      source: SOURCE
    };
  });
  for (const x of fresh) {
    draws.push({
      draw: x.draw, date: x.date, time: x.time, balls: x.balls,
      parity: x.parity, column: x.column,
      columnSource: 'stoloto-official', source: SOURCE
    });
  }
  draws.sort((a, b) => Number(a.draw) - Number(b.draw));
  return { draws, fresh };
}

const browser = await chromium.launch({ headless: true });
let triple;
try {
  const context = await browser.newContext({
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36'
  });
  const page = await context.newPage();
  await login(page);
  triple = await stableTail(page);
} finally {
  await browser.close();
}

const historyRaw = await readJson(HISTORY_FILE, []);
const { draws, fresh } = mergeRecent(historyRaw, triple.stable);
const oldState = await readJson(STATE_FILE, null);
const oldArchive = await readJson(FP_ARCHIVE_FILE, []);
const oldStatus = await readJson(STATUS_FILE, null);
const now = new Date().toISOString();
const fp = processFingerprint(draws, oldState, oldArchive, ENGINE, now);
const latest = draws.at(-1);
if (!latest) throw new Error('FAIL: итоговая история пуста');
if (Number(fp.state.nextTargetDraw) !== Number(latest.draw) + 1) throw new Error('FAIL: FINGERPRINT nextTargetDraw не latest+1');
const pending = fp.archive.filter(p => !p.actual);
if (pending.length !== 1 || Number(pending[0].targetDraw) !== Number(latest.draw) + 1) throw new Error('FAIL: должен остаться один pending latest+1');

await writeJsonAtomic(HISTORY_FILE, draws, false);
await writeJsonAtomic(STATE_FILE, fp.state, true);
await writeJsonAtomic(FP_ARCHIVE_FILE, fp.archive, true);

const latestColumn = validColumn(latest.column);
const status = {
  version: VERSION,
  source: SOURCE,
  sourceUrl: ARCHIVE_URL,
  primarySource: 'Столото',
  primarySourceUrl: ARCHIVE_URL,
  serverLearning: true,
  updatedAt: (fresh.length || fp.changed) ? now : (oldStatus?.updatedAt || fp.state.updatedAt || now),
  drawsStored: draws.length,
  latestDraw: Number(latest.draw),
  latestDate: String(latest.date || ''),
  latestTime: String(latest.time || ''),
  latestParity: String(latest.parity || ''),
  latestColumn,
  latestColumnSource: latestColumn ? 'stoloto-official' : null,
  officialColumnsStored: draws.filter(d => validColumn(d.column)).length,
  fingerprintNext: Number(fp.state.nextTargetDraw),
  fingerprintArchive: fp.archive.length,
  fingerprintSettled: Number(fp.state.settledCount || 0),
  stolotoTripleCheck: {
    readingCounts: triple.readingCounts,
    stableCount: triple.stable.length,
    unstableSkipped: 0,
    consensusPair: triple.pair
  },
  weights: fp.state.weights
};
await writeJsonAtomic(STATUS_FILE, status, true);

console.log('============================================================');
console.log('KENO 6.3 · M5M-STYLE FAST STOLOTO PASS');
console.log(`Tail reads: ${triple.readingCounts.join(' / ')}; consensus ${triple.pair.join('+')}`);
console.log(`Добавлено новых тиражей: ${fresh.length}`);
console.log(`Последний №${latest.draw} · ${latest.date} ${latest.time} · ст${latestColumn ?? '—'}`);
console.log(`FINGERPRINT следующий №${fp.state.nextTargetDraw}`);
console.log('============================================================');
