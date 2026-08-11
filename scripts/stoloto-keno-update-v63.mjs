// KENO 6.3 · PRODUCTION · STOLOTO OAuth
// Основа: проверенный arsazet17/pozitron-keno-v72/stoloto-keno-update.mjs.
// Адаптация: history/status/FINGERPRINT KENO 6.3.

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
const ARCHIVE_FILE = 'fingerprint-archive-v63.json';
const SOURCE = 'Официальный Столото · OAuth · тройная проверка';

const EMAIL = process.env.STOLOTO_EMAIL || '';
const PASSWORD = process.env.STOLOTO_PASSWORD || '';

if (!EMAIL || !PASSWORD) {
  throw new Error('FAIL: нет GitHub Secrets STOLOTO_EMAIL / STOLOTO_PASSWORD');
}

const MONTHS = {
  'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4,
  'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8,
  'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12
};

const pad2 = n => String(n).padStart(2, '0');

function normalizeSpace(s) {
  return String(s ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function moscowTodayParts() {
  const f = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

function shiftDate({y,m,d}, deltaDays) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function normalizeDateLabel(label) {
  const raw = normalizeSpace(label).toLowerCase();
  const today = moscowTodayParts();
  let p = null;

  if (raw === 'сегодня') p = today;
  else if (raw === 'вчера') p = shiftDate(today, -1);
  else {
    let m = raw.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
    if (m) {
      let y = Number(m[3]);
      if (y < 100) y += 2000;
      p = { d: Number(m[1]), m: Number(m[2]), y };
    } else {
      m = raw.match(/^(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?$/i);
      if (m && MONTHS[m[2]]) {
        let y = m[3] ? Number(m[3]) : today.y;
        p = { d: Number(m[1]), m: MONTHS[m[2]], y };
        if (!m[3] && p.m > today.m + 6) p.y -= 1;
      }
    }
  }

  if (!p) return null;
  return `${pad2(p.d)}.${pad2(p.m)}.${String(p.y).slice(-2)}`;
}

function normalizeTime(t) {
  const m = String(t ?? '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]), ss = Number(m[3] || 0);
  if (hh > 23 || mm > 59 || ss > 59) return null;
  return {
    full: `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`,
    short: `${pad2(hh)}:${pad2(mm)}`
  };
}

function parseParity(text) {
  const s = normalizeSpace(text).toLowerCase();
  if (s.includes('больше нечётных') || s.includes('больше нечетных')) return 'Больше нечётных';
  if (s.includes('больше чётных') || s.includes('больше четных')) return 'Больше чётных';
  if (s.includes('поровну')) return 'Поровну';
  return null;
}

function parseColumn(text) {
  const m = normalizeSpace(text).match(/столбец\s*([1-9]|10)\b/i);
  return m ? Number(m[1]) : null;
}

function parseDraw(text) {
  const m = String(text).match(/№\s*([0-9]{4,})/);
  return m ? Number(m[1]) : null;
}

function parseTime(text) {
  const m = String(text).match(/\b([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/);
  return m ? normalizeTime(m[0]) : null;
}

function findDateLabel(text) {
  const s = String(text);
  const direct = s.match(/(?:^|\n)\s*(Сегодня|Вчера)\s*(?:\n|$)/i);
  if (direct) return normalizeSpace(direct[1]);

  const numeric = s.match(/(?:^|\n)\s*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})\s*(?:\n|$)/);
  if (numeric) return normalizeSpace(numeric[1]);

  const words = s.match(/(?:^|\n)\s*(\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+\d{4})?)\s*(?:\n|$)/i);
  if (words) return normalizeSpace(words[1]);

  return null;
}

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const loginSelectors = [
    'input[type="email"]',
    'input[name*="email" i]',
    'input[name*="login" i]',
    'input[autocomplete="username"]',
    'input[type="text"]'
  ];
  const passSelectors = [
    'input[type="password"]',
    'input[name*="password" i]',
    'input[autocomplete="current-password"]'
  ];

  let login = null;
  for (const sel of loginSelectors) {
    const loc = page.locator(sel).first();
    if (await loc.count()) { login = loc; break; }
  }
  let pass = null;
  for (const sel of passSelectors) {
    const loc = page.locator(sel).first();
    if (await loc.count()) { pass = loc; break; }
  }
  if (!login || !pass) throw new Error('FAIL: не найдены поля OAuth Столото');

  await login.fill(EMAIL);
  await pass.fill(PASSWORD);

  const buttons = [
    page.getByRole('button', { name: /войти/i }).first(),
    page.locator('button[type="submit"]').first(),
    page.locator('input[type="submit"]').first()
  ];

  let clicked = false;
  for (const btn of buttons) {
    if (await btn.count()) {
      await btn.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) throw new Error('FAIL: не найдена кнопка «Войти»');

  await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

async function expandArchive(page, targetRows = 150) {
  let lastCount = 0;
  let stableRounds = 0;

  for (let round = 0; round < 20; round += 1) {
    const currentCount = await page.locator('tr').evaluateAll(list =>
      list.filter(el => /№\s*\d{4,}/.test(el.innerText || '')).length
    );

    if (currentCount >= targetRows) break;

    if (currentCount === lastCount) stableRounds += 1;
    else stableRounds = 0;
    lastCount = currentCount;

    const more = page.getByRole('button', {
      name: /показать\s*(ещё|еще)|загрузить\s*(ещё|еще)|^(ещё|еще)$/i
    }).last();

    if (await more.count()) {
      try {
        if (await more.isVisible()) {
          await more.click({ timeout: 5000 });
          await page.waitForTimeout(1800);
          continue;
        }
      } catch (_) {}
    }

    const moreLink = page.getByRole('link', {
      name: /показать\s*(ещё|еще)|загрузить\s*(ещё|еще)|^(ещё|еще)$/i
    }).last();

    if (await moreLink.count()) {
      try {
        if (await moreLink.isVisible()) {
          await moreLink.click({ timeout: 5000 });
          await page.waitForTimeout(1800);
          continue;
        }
      } catch (_) {}
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1800);

    if (stableRounds >= 3) break;
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

async function collectRows(page) {
  await page.goto(ARCHIVE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);

  await expandArchive(page, 150);

  const rows = await page.locator('body').evaluate(() => {
    const drawRx = /№\s*\d{4,}/;
    const dateRx = /^(Сегодня|Вчера|\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+\d{4})?)$/i;
    const norm = s => String(s || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();

    const all = [...document.querySelectorAll('body *')];

    function nearestDateLabel(el) {
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

    let candidates = [...document.querySelectorAll('tr')].filter(el => drawRx.test(el.innerText || ''));

    if (!candidates.length) {
      candidates = all.filter(el => {
        const text = norm(el.innerText || '');
        if (!drawRx.test(text)) return false;
        if (el.querySelectorAll('button').length < 20) return false;
        return ![...el.children].some(ch =>
          drawRx.test(norm(ch.innerText || '')) && ch.querySelectorAll('button').length >= 20
        );
      });
    }

    return candidates.map(el => ({
      text: el.innerText || '',
      dateLabel: nearestDateLabel(el),
      buttons: [...el.querySelectorAll('button')].map(b => norm(b.innerText || ''))
    }));
  });

  return rows;
}

function parseRows(rawRows) {
  const parsed = [];
  let carryDateLabel = null;

  for (const row of rawRows) {
    const text = String(row.text || '');
    const localDate = normalizeSpace(row.dateLabel || '') || findDateLabel(text);
    if (localDate) carryDateLabel = localDate;

    const draw = parseDraw(text);
    if (!draw) continue;

    const time = parseTime(text);
    const parity = parseParity(text);
    const column = parseColumn(text);

    // ВАЖНО: не пересчитываем ни столбец, ни чётность.
    if (!parity) throw new Error(`FAIL: тираж ${draw}: Столото не отдал метку чёт/нечёт`);
    if (!column) throw new Error(`FAIL: тираж ${draw}: Столото не отдал «Столбец N»`);
    if (!time) throw new Error(`FAIL: тираж ${draw}: не найдено корректное время`);

    const buttonNumbers = (row.buttons || [])
      .map(x => Number(normalizeSpace(x)))
      .filter(n => Number.isInteger(n) && n >= 1 && n <= 80);

    let balls = buttonNumbers;
    if (balls.length > 20) balls = balls.slice(-20);

    if (balls.length !== 20) {
      throw new Error(`FAIL: тираж ${draw}: ожидалось 20 чисел, найдено ${balls.length}`);
    }
    if (new Set(balls).size !== 20) {
      throw new Error(`FAIL: тираж ${draw}: 20 чисел должны быть без повторов`);
    }

    const dateLabel = localDate || carryDateLabel;
    const date = dateLabel ? normalizeDateLabel(dateLabel) : null;
    if (!date) {
      throw new Error(`FAIL: тираж ${draw}: не распознана дата; dateLabel=${JSON.stringify(dateLabel)}`);
    }

    parsed.push({
      draw,
      date,
      time: time.short,
      timeFull: time.full,
      parity,
      column,
      balls
    });
  }

  const map = new Map();
  for (const d of parsed) map.set(d.draw, d);
  return [...map.values()].sort((a, b) => a.draw - b.draw);
}

async function readArchiveThreeTimes(page) {
  const MIN_COMMON = 60;
  const reads = [];

  for (let i = 1; i <= 3; i += 1) {
    const rawRows = await collectRows(page);
    const parsed = parseRows(rawRows);

    if (parsed.length < MIN_COMMON) {
      throw new Error(`FAIL: чтение ${i}: получено только ${parsed.length} тиражей`);
    }

    reads.push(parsed);
    console.log(
      `Чтение ${i}: ${parsed.length} тиражей, диапазон №${parsed[0].draw}–№${parsed.at(-1).draw}`
    );

    if (i < 3) await page.waitForTimeout(1500);
  }

  const maps = reads.map(arr => new Map(arr.map(d => [d.draw, d])));

  // Не сравниваем три массива целиком.
  // Берём только номера, которые есть во всех трёх чтениях.
  const commonDraws = [...maps[0].keys()]
    .filter(draw => maps[1].has(draw) && maps[2].has(draw))
    .sort((a, b) => a - b);

  if (commonDraws.length < MIN_COMMON) {
    throw new Error(
      `FAIL: общих тиражей во всех трёх чтениях только ${commonDraws.length}, нужно минимум ${MIN_COMMON}`
    );
  }

  const stable = [];
  const mismatches = [];

  for (const draw of commonDraws) {
    const d1 = maps[0].get(draw);
    const d2 = maps[1].get(draw);
    const d3 = maps[2].get(draw);

    const c1 = JSON.stringify({
      draw: d1.draw, date: d1.date, time: d1.time,
      parity: d1.parity, column: d1.column, balls: d1.balls
    });
    const c2 = JSON.stringify({
      draw: d2.draw, date: d2.date, time: d2.time,
      parity: d2.parity, column: d2.column, balls: d2.balls
    });
    const c3 = JSON.stringify({
      draw: d3.draw, date: d3.date, time: d3.time,
      parity: d3.parity, column: d3.column, balls: d3.balls
    });

    if (c1 === c2 && c1 === c3) stable.push(d1);
    else mismatches.push(draw);
  }

  if (stable.length < MIN_COMMON) {
    throw new Error(
      `FAIL: после тройной по-тиражной проверки стабильны только ${stable.length} тиражей`
    );
  }

  if (mismatches.length) {
    console.log(
      `WARN: нестабильные строки пропущены (${mismatches.length}): ` +
      mismatches.slice(0, 20).map(n => `№${n}`).join(', ')
    );
  }

  console.log(
    `Тройная проверка PASS: ${stable.length} тиражей полностью совпали во всех 3 чтениях; ` +
    `диапазон стабильных №${stable[0].draw}–№${stable.at(-1).draw}`
  );

  return { stable, readingCounts: reads.map(x => x.length), mismatches };
}

async function readTrustedHistory() {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.draws)) return parsed.draws;
    return [];
  } catch {
    return [];
  }
}

function normalizeHistoryDraw(d) {
  return {
    draw: Number(d?.draw ?? d?.number ?? d?.id),
    date: normalizeSpace(d?.date),
    time: normalizeTime(d?.time)?.short || normalizeSpace(d?.time),
    balls: Array.isArray(d?.balls) ? d.balls.map(Number) :
           Array.isArray(d?.numbers) ? d.numbers.map(Number) : []
  };
}

function trustedHistoryStrict(historyRaw) {
  if (!Array.isArray(historyRaw) || historyRaw.length < 60) {
    throw new Error(
      `FAIL: ${HISTORY_FILE} должен содержать доверенный архив, сейчас ` +
      `${Array.isArray(historyRaw) ? historyRaw.length : 0}`
    );
  }

  const rows = historyRaw
    .map(d => ({ original: d, ...normalizeHistoryDraw(d) }))
    .filter(d =>
      Number.isInteger(d.draw) &&
      /^\d{2}\.\d{2}\.\d{2,4}$/.test(d.date) &&
      /^\d{2}:\d{2}$/.test(d.time) &&
      d.balls.length === 20 &&
      d.balls.every(n => Number.isInteger(n) && n >= 1 && n <= 80)
    )
    .sort((a, b) => a.draw - b.draw);

  if (rows.length !== historyRaw.length) {
    throw new Error(
      `FAIL: в доверенном ${HISTORY_FILE} есть некорректные строки (${rows.length}/${historyRaw.length})`
    );
  }
  return rows;
}

function scheduleMinutesFromHistory(history) {
  const set = new Set();
  for (const d of history.slice(-5000)) {
    const m = String(d.time).match(/^\d{2}:(\d{2})$/);
    if (m) set.add(m[1]);
  }
  return set;
}

function validateProduction(stolotoDraws, historyRaw) {
  const history = trustedHistoryStrict(historyRaw);
  const hMap = new Map(history.map(d => [d.draw, d]));
  const overlap = stolotoDraws.filter(d => hMap.has(d.draw));

  if (!overlap.length) {
    throw new Error(
      `FAIL: нет anchor; Столото №${stolotoDraws[0]?.draw}–№${stolotoDraws.at(-1)?.draw}, ` +
      `локальный последний №${history.at(-1).draw}`
    );
  }

  for (const s of overlap) {
    const h = hMap.get(s.draw);
    if (h.date !== s.date) {
      throw new Error(`FAIL: №${s.draw}: дата отличается (${h.date} != ${s.date})`);
    }
    if (h.time !== s.time) {
      throw new Error(`FAIL: №${s.draw}: время отличается (${h.time} != ${s.time})`);
    }
    if (JSON.stringify(h.balls) !== JSON.stringify(s.balls)) {
      throw new Error(`FAIL: №${s.draw}: 20 чисел отличаются`);
    }
  }

  const lastTrusted = history.at(-1);
  const exactAnchor = stolotoDraws.find(d => d.draw === lastTrusted.draw);
  if (!exactAnchor) {
    throw new Error(`FAIL: официальный архив не содержит последний доверенный anchor №${lastTrusted.draw}`);
  }

  const fresh = stolotoDraws
    .filter(d => d.draw > lastTrusted.draw)
    .sort((a, b) => a.draw - b.draw);

  let expected = lastTrusted.draw + 1;
  for (const d of fresh) {
    if (d.draw !== expected) {
      throw new Error(`FAIL: пропуск тиража: ожидался №${expected}, получен №${d.draw}`);
    }
    expected += 1;
  }

  const allowedParity = new Set(['Больше чётных', 'Больше нечётных', 'Поровну']);
  const allowedMinutes = scheduleMinutesFromHistory(history);

  for (const d of fresh) {
    if (!/^\d{2}\.\d{2}\.\d{2}$/.test(d.date)) {
      throw new Error(`FAIL: №${d.draw}: неверная дата ${d.date}`);
    }
    if (!/^\d{2}:\d{2}$/.test(d.time)) {
      throw new Error(`FAIL: №${d.draw}: неверное время ${d.time}`);
    }
    const minute = d.time.slice(3, 5);
    if (allowedMinutes.size && !allowedMinutes.has(minute)) {
      throw new Error(
        `FAIL: №${d.draw}: минута ${minute} не соответствует расписанию доверенного архива`
      );
    }
    if (!allowedParity.has(d.parity)) {
      throw new Error(`FAIL: №${d.draw}: нет официальной метки чёт/нечёт`);
    }
    if (!Number.isInteger(d.column) || d.column < 1 || d.column > 10) {
      throw new Error(`FAIL: №${d.draw}: нет официального «Столбец N»`);
    }
    if (!Array.isArray(d.balls) || d.balls.length !== 20 || new Set(d.balls).size !== 20) {
      throw new Error(`FAIL: №${d.draw}: неверный формат 20 чисел`);
    }
  }

  console.log(`Anchor PASS: №${lastTrusted.draw}; пересечений ${overlap.length}; новых ${fresh.length}`);
  return { history, fresh, overlap };
}


function mergeWithOfficialFields(historyRaw, stable, fresh) {
  const stableMap = new Map(stable.map(d => [Number(d.draw), d]));
  const freshSet = new Set(fresh.map(d => Number(d.draw)));
  const merged = [];
  const seen = new Set();

  for (const original of historyRaw) {
    const draw = Number(original?.draw ?? original?.number ?? original?.id);
    const official = stableMap.get(draw);
    if (official) {
      merged.push({
        ...original,
        draw,
        date: official.date,
        time: official.time,
        balls: official.balls,
        parity: official.parity,
        column: official.column,
        columnSource: 'stoloto-official',
        source: SOURCE
      });
    } else {
      merged.push(original);
    }
    if (Number.isInteger(draw)) seen.add(draw);
  }

  for (const d of fresh) {
    if (seen.has(Number(d.draw))) continue;
    merged.push({
      draw: d.draw,
      date: d.date,
      time: d.time,
      balls: d.balls,
      parity: d.parity,
      column: d.column,
      columnSource: 'stoloto-official',
      source: SOURCE
    });
  }

  merged.sort((a, b) => Number(a.draw) - Number(b.draw));

  // Новые тиражи должны реально присутствовать после слияния.
  for (const draw of freshSet) {
    if (!merged.some(d => Number(d.draw) === draw)) {
      throw new Error(`FAIL: после слияния потерян новый тираж №${draw}`);
    }
  }
  return merged;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return fallback; }
}

async function writeJsonAtomic(file, value, pretty = false) {
  const tmp = `${file}.tmp`;
  const text = JSON.stringify(value, null, pretty ? 2 : 0) + '\n';
  await fs.writeFile(tmp, text);
  await fs.rename(tmp, file);
}

function validOfficialColumn(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

function selfTest() {
  const t = normalizeTime('07:02:00');
  if (!t || t.short !== '07:02') throw new Error('SELFTEST normalizeTime');
  if (parseParity('Больше чётных') !== 'Больше чётных') throw new Error('SELFTEST parity');
  if (parseColumn('Столбец 10') !== 10) throw new Error('SELFTEST column');
  if (parseDraw('№ 325212') !== 325212) throw new Error('SELFTEST draw');
  if (!normalizeDateLabel('9 августа')) throw new Error('SELFTEST date words');
  console.log('SELFTEST PASS');
}

selfTest();

const browser = await chromium.launch({ headless: true });
let triple;
let historyRaw;
let validated;

try {
  const context = await browser.newContext({
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36'
  });
  const page = await context.newPage();

  await login(page);
  triple = await readArchiveThreeTimes(page);
  historyRaw = await readTrustedHistory();
  validated = validateProduction(triple.stable, historyRaw);
} finally {
  await browser.close();
}

// После PASS тройной проверки безопасно обновляем только подтверждённые строки.
const draws = mergeWithOfficialFields(historyRaw, triple.stable, validated.fresh);
const oldState = await readJson(STATE_FILE, null);
const oldArchive = await readJson(ARCHIVE_FILE, []);
const oldStatus = await readJson(STATUS_FILE, null);

const now = new Date().toISOString();
const fp = processFingerprint(draws, oldState, oldArchive, ENGINE, now);
const latest = draws.at(-1);

if (!latest) throw new Error('FAIL: итоговая история KENO 6.3 пуста');
if (Number(fp.state.nextTargetDraw) !== Number(latest.draw) + 1) {
  throw new Error(
    `FAIL: FINGERPRINT next №${fp.state.nextTargetDraw}, ожидался №${Number(latest.draw)+1}`
  );
}
const pending = fp.archive.filter(p => !p.actual);
if (pending.length !== 1 || Number(pending[0].targetDraw) !== Number(latest.draw) + 1) {
  throw new Error('FAIL: после обучения должен остаться ровно один прогноз latest+1');
}

await writeJsonAtomic(HISTORY_FILE, draws, false);
await writeJsonAtomic(STATE_FILE, fp.state, true);
await writeJsonAtomic(ARCHIVE_FILE, fp.archive, true);

const officialColumn = validOfficialColumn(latest.column);
const status = {
  version: VERSION,
  source: SOURCE,
  sourceUrl: ARCHIVE_URL,
  primarySource: 'Столото',
  primarySourceUrl: ARCHIVE_URL,
  serverLearning: true,
  updatedAt: (validated.fresh.length || fp.changed) ? now : (oldStatus?.updatedAt || fp.state.updatedAt || now),
  drawsStored: draws.length,
  latestDraw: Number(latest.draw),
  latestDate: String(latest.date || ''),
  latestTime: String(latest.time || ''),
  latestParity: String(latest.parity || ''),
  latestColumn: officialColumn,
  latestColumnSource: officialColumn ? 'stoloto-official' : null,
  officialColumnsStored: draws.filter(d => validOfficialColumn(d.column)).length,
  fingerprintNext: Number(fp.state.nextTargetDraw),
  fingerprintArchive: fp.archive.length,
  fingerprintSettled: Number(fp.state.settledCount || 0),
  stolotoTripleCheck: {
    readingCounts: triple.readingCounts,
    stableCount: triple.stable.length,
    unstableSkipped: triple.mismatches.length
  },
  weights: fp.state.weights
};
await writeJsonAtomic(STATUS_FILE, status, true);

console.log('============================================================');
console.log('KENO 6.3 · STOLOTO PRODUCTION PASS');
console.log(`Столото 3 чтения: ${triple.readingCounts.join(' / ')}`);
console.log(`Стабильных строк: ${triple.stable.length}; нестабильных пропущено: ${triple.mismatches.length}`);
console.log(`Добавлено новых тиражей: ${validated.fresh.length}`);
console.log(`Последний №${latest.draw} · ${latest.date} ${latest.time}`);
console.log(`${latest.parity || 'чёт/нечёт —'} · ${officialColumn ? `Столбец ${officialColumn}` : 'Столбец —'}`);
console.log(`FINGERPRINT закрыт по №${fp.state.lastSettledDraw}; следующий №${fp.state.nextTargetDraw}`);
console.log('Источник: Официальный Столото · OAuth · тройная проверка');
console.log('============================================================');
