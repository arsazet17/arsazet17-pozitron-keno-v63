'use strict';

const fs = require('fs');

const STOLOTO_URL = 'https://www.stoloto.ru/keno2/archive';
const LUCKY_URL = 'https://lucky-numbers.ru/lottery/ru/keno2';
const HISTORY_FILE = 'keno-history-v62.json';
const STATUS_FILE = 'keno-status-v62.json';
const VERSION = '6.2.2';

const RU_MONTHS = Object.freeze({
  'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4,
  'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8,
  'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12
});

function cleanText(value) {
  return String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|\u00a0/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDrawNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const number = Number(digits);
  return Number.isInteger(number) && number >= 100000 && number <= 999999 ? number : null;
}

function validDraw(item) {
  const draw = Number(item?.draw);
  const balls = Array.isArray(item?.balls) ? item.balls.map(Number) : [];
  return Number.isInteger(draw) && draw >= 100000 && draw <= 999999 &&
    balls.length === 20 && new Set(balls).size === 20 &&
    balls.every(number => Number.isInteger(number) && number >= 1 && number <= 80);
}

function normalizeDraw(item) {
  return {
    draw: Number(item.draw),
    date: String(item.date || ''),
    time: String(item.time || '').slice(0, 5),
    balls: item.balls.map(Number)
  };
}

function uniqueSorted(items) {
  const map = new Map();
  for (const item of items) {
    if (!validDraw(item)) continue;
    const draw = normalizeDraw(item);
    map.set(draw.draw, draw);
  }
  return [...map.values()].sort((a, b) => a.draw - b.draw);
}

function moscowNow() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000);
}

function formatDate(date) {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(date.getUTCFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

function parseRussianDate(text) {
  const value = String(text || '');
  let match = value.match(/\b(\d{2})[.\-/](\d{2})[.\-/](\d{2,4})\b/);
  if (match) {
    const year = match[3].length === 4 ? match[3].slice(-2) : match[3];
    return `${match[1]}.${match[2]}.${year}`;
  }

  match = value.match(/\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?/i);
  if (match) {
    const day = Number(match[1]);
    const month = RU_MONTHS[match[2].toLowerCase()];
    const now = moscowNow();
    let year = match[3] ? Number(match[3]) : now.getUTCFullYear();
    if (!match[3]) {
      const candidate = Date.UTC(year, month - 1, day);
      const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      if (candidate - today > 7 * 86400000) year -= 1;
    }
    return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${String(year).slice(-2)}`;
  }

  const now = moscowNow();
  if (/\bсегодня\b/i.test(value)) return formatDate(now);
  if (/\bвчера\b/i.test(value)) return formatDate(new Date(now.getTime() - 86400000));
  return '';
}

function parseTime(text) {
  const match = String(text || '').match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
  if (!match) return '';
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

function parseRowText(text, balls) {
  if (balls.length !== 20 || new Set(balls).size !== 20) return null;
  const drawMatch = String(text || '').match(/№\s*[\u2009\u00a0 ]*(\d{3})[\s\u00a0\u2009]?(\d{3})|\b(\d{6})\b/);
  const draw = normalizeDrawNumber(drawMatch ? (drawMatch[3] || `${drawMatch[1]}${drawMatch[2]}`) : '');
  const date = parseRussianDate(text);
  const time = parseTime(text);
  if (!draw || !date || !time) return null;
  return { draw, date, time, balls };
}

function parseHtml(html) {
  const rows = [];
  const tableRows = String(html || '').match(/<tr\b[\s\S]*?<\/tr>/gi) || [];

  for (const row of tableRows) {
    const balls = [];
    const buttons = row.match(/<button\b[\s\S]*?<\/button>/gi) || [];
    for (const button of buttons) {
      const text = cleanText(button);
      if (!/^\d{1,2}$/.test(text)) continue;
      const number = Number(text);
      if (number >= 1 && number <= 80) balls.push(number);
      if (balls.length === 20) break;
    }

    const parsed = parseRowText(cleanText(row), balls);
    if (parsed) rows.push(parsed);
  }

  return uniqueSorted(rows);
}

function parseReaderText(text) {
  const rows = [];
  const source = String(text || '');
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const windowText = lines.slice(Math.max(0, index - 2), index + 3).join(' ');
    const buttonMatches = [...windowText.matchAll(/\[Button:\s*(\d{1,2})\]/gi)];
    const balls = buttonMatches.slice(0, 20).map(match => Number(match[1]));
    if (balls.length !== 20) continue;
    const parsed = parseRowText(windowText, balls);
    if (parsed) rows.push(parsed);
  }

  return uniqueSorted(rows);
}

function parseSource(text) {
  const htmlRows = parseHtml(text);
  if (htmlRows.length) return htmlRows;
  return parseReaderText(text);
}

async function fetchText(url, headers = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 GitHub-Actions Positron-Keno/3.0',
          accept: 'text/html,text/plain,application/xhtml+xml,*/*;q=0.8',
          'cache-control': 'no-cache',
          pragma: 'no-cache',
          ...headers
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(35000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 2500));
    }
  }
  throw lastError;
}

async function fetchFresh() {
  const stamp = Date.now();
  const sources = [
    { name: 'Столото', url: `${STOLOTO_URL}?positron=${stamp}`, canonicalUrl: STOLOTO_URL, priority: 4, headers: {} },
    { name: 'Столото Reader', url: `https://r.jina.ai/${STOLOTO_URL}?positron=${stamp}`, canonicalUrl: STOLOTO_URL, priority: 3, headers: { 'x-no-cache': 'true', 'x-return-format': 'markdown' } },
    { name: 'Lucky Numbers', url: `${LUCKY_URL}?positron=${stamp}`, canonicalUrl: LUCKY_URL, priority: 2, headers: {} },
    { name: 'Lucky Numbers Reader', url: `https://r.jina.ai/${LUCKY_URL}?positron=${stamp}`, canonicalUrl: LUCKY_URL, priority: 1, headers: { 'x-no-cache': 'true', 'x-return-format': 'markdown' } }
  ];

  const successful = [];
  const errors = [];

  for (const source of sources) {
    try {
      const text = await fetchText(source.url, source.headers);
      const rows = parseSource(text);
      if (!rows.length) throw new Error('тиражи не распознаны');
      successful.push({ ...source, rows, latest: rows.at(-1).draw });
      console.log(`${source.name}: ${rows.length} тиражей, последний №${rows.at(-1).draw}`);
    } catch (error) {
      const message = `${source.name}: ${error?.message || error}`;
      errors.push(message);
      console.warn(message);
    }
  }

  if (!successful.length) throw new Error(errors.join('; '));

  successful.sort((a, b) => b.latest - a.latest || b.priority - a.priority);
  const winner = successful[0];

  // Объединяем ответы. При совпадении номера официальный Столото имеет приоритет.
  const merged = new Map();
  for (const source of [...successful].sort((a, b) => a.priority - b.priority)) {
    for (const row of source.rows) merged.set(row.draw, row);
  }
  const rows = uniqueSorted([...merged.values()]);

  console.log(`Выбран главный свежий источник: ${winner.name}, последний №${winner.latest}`);
  return { rows, source: winner.name, sourceUrl: winner.canonicalUrl };
}

function readStored() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  const payload = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  return uniqueSorted(Array.isArray(payload) ? payload : (payload?.draws || []));
}

function sameDraw(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function writeAtomic(path, text) {
  const tempPath = `${path}.tmp`;
  fs.writeFileSync(tempPath, text);
  fs.renameSync(tempPath, path);
}

async function main() {
  const stored = readStored();
  const { rows: fresh, source, sourceUrl } = await fetchFresh();
  const storedMap = new Map(stored.map(item => [item.draw, item]));
  let changed = false;

  for (const item of fresh) {
    if (!sameDraw(storedMap.get(item.draw), item)) changed = true;
    storedMap.set(item.draw, item);
  }

  const draws = [...storedMap.values()].sort((a, b) => a.draw - b.draw);
  const latest = draws.at(-1);
  if (!latest) throw new Error('Итоговая база пуста');

  const statusExists = fs.existsSync(STATUS_FILE);
  if (!changed && statusExists) {
    console.log(`ПОЗИТРОН v6.2: новых тиражей нет, последний №${latest.draw}; свежий источник ${source}`);
    return;
  }

  writeAtomic(HISTORY_FILE, `${JSON.stringify(draws)}\n`);
  writeAtomic(STATUS_FILE, `${JSON.stringify({
    version: VERSION,
    source,
    sourceUrl,
    primarySource: 'Столото',
    primarySourceUrl: STOLOTO_URL,
    updatedAt: new Date().toISOString(),
    drawsStored: draws.length,
    latestDraw: latest.draw,
    latestDate: latest.date,
    latestTime: latest.time
  }, null, 2)}\n`);

  console.log(`ПОЗИТРОН v6.2: база ${draws.length}, последний №${latest.draw}, источник ${source}`);
}

main().catch(error => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
