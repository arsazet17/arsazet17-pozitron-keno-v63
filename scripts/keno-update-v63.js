
'use strict';

const fs = require('fs');

const SOURCE_URL = 'https://lucky-numbers.ru/lottery/ru/keno2';
const READER_URL = `https://r.jina.ai/${SOURCE_URL}`;

const BOOTSTRAP_URL =
  'https://raw.githubusercontent.com/arsazet17/pozitron-keno-v5/main/keno-history-v62.json';

const HISTORY_FILE = 'keno-history-v63.json';
const STATUS_FILE = 'keno-status-v63.json';
const VERSION = '6.3-clean-6410';

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

  return Number.isInteger(number) &&
    number >= 100000 &&
    number <= 999999
    ? number
    : null;
}

function validDraw(item) {
  const draw = Number(item?.draw);
  const balls = Array.isArray(item?.balls)
    ? item.balls.map(Number)
    : [];

  return Number.isInteger(draw) &&
    draw >= 100000 &&
    draw <= 999999 &&
    balls.length === 20 &&
    new Set(balls).size === 20 &&
    balls.every(number =>
      Number.isInteger(number) &&
      number >= 1 &&
      number <= 80
    );
}

function normalizeDraw(item) {
  return {
    draw: Number(item.draw),
    date: String(item.date || ''),
    time: String(item.time || ''),
    balls: item.balls.map(Number)
  };
}

function uniqueSorted(items) {
  const map = new Map();

  for (const item of items || []) {
    if (!validDraw(item)) continue;

    const draw = normalizeDraw(item);
    map.set(draw.draw, draw);
  }

  return [...map.values()]
    .sort((a, b) => a.draw - b.draw);
}

function parseHtml(html) {
  const rows = [];
  const tableRows =
    String(html || '').match(/<tr\b[\s\S]*?<\/tr>/gi) || [];

  for (const row of tableRows) {
    const balls = [];
    const buttons =
      row.match(/<button\b[\s\S]*?<\/button>/gi) || [];

    for (const button of buttons) {
      const text = cleanText(button);

      if (!/^\d{1,2}$/.test(text)) continue;

      const number = Number(text);

      if (number >= 1 && number <= 80) {
        balls.push(number);
      }

      if (balls.length === 20) break;
    }

    if (
      balls.length !== 20 ||
      new Set(balls).size !== 20
    ) {
      continue;
    }

    const text = cleanText(row);

    const dateMatch = text.match(
      /(\d{2}\.\d{2}\.\d{2,4})\s*,?\s*(\d{2}:\d{2})/
    );

    if (!dateMatch) continue;

    const beforeDate =
      text.slice(0, text.indexOf(dateMatch[0]));

    const drawMatches =
      beforeDate.match(
        /\b\d{3}[\s\u00a0]?\d{3}\b|\b\d{6}\b/g
      ) || [];

    const draw =
      normalizeDrawNumber(drawMatches.at(-1));

    if (!draw) continue;

    rows.push({
      draw,
      date: dateMatch[1],
      time: dateMatch[2],
      balls
    });
  }

  return uniqueSorted(rows);
}

function parseReaderText(text) {
  const rows = [];

  for (
    const line of String(text || '').split(/\r?\n/)
  ) {
    const buttonMatches =
      [...line.matchAll(/Button:\s*(\d{1,2})/gi)];

    const balls =
      buttonMatches
        .slice(0, 20)
        .map(match => Number(match[1]));

    if (
      balls.length !== 20 ||
      new Set(balls).size !== 20 ||
      balls.some(n => n < 1 || n > 80)
    ) {
      continue;
    }

    const dateMatch = line.match(
      /(\d{2}\.\d{2}\.\d{2,4})\s*,?\s*(\d{2}:\d{2})/
    );

    if (!dateMatch) continue;

    const beforeDate =
      line.slice(0, line.indexOf(dateMatch[0]));

    const drawMatches =
      beforeDate.match(
        /\b\d{3}[\s\u00a0]?\d{3}\b|\b\d{6}\b/g
      ) || [];

    const draw =
      normalizeDrawNumber(drawMatches.at(-1));

    if (!draw) continue;

    rows.push({
      draw,
      date: dateMatch[1],
      time: dateMatch[2],
      balls
    });
  }

  return uniqueSorted(rows);
}

function parseSource(text) {
  const htmlRows = parseHtml(text);

  if (htmlRows.length) {
    return htmlRows;
  }

  return parseReaderText(text);
}

async function fetchText(
  url,
  headers = {},
  attempts = 3
) {
  let lastError;

  for (
    let attempt = 1;
    attempt <= attempts;
    attempt += 1
  ) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent':
            'Mozilla/5.0 GitHub-Actions Positron-Keno-v6.3/6410',
          accept:
            'text/html,text/plain,application/xhtml+xml,application/json,*/*;q=0.8',
          'cache-control': 'no-cache',
          ...headers
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(35000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await new Promise(resolve =>
          setTimeout(resolve, attempt * 2500)
        );
      }
    }
  }

  throw lastError;
}

async function fetchFresh() {
  const sources = [
    {
      name: 'Lucky Numbers',
      url: `${SOURCE_URL}?positron=${Date.now()}`,
      headers: {}
    },
    {
      name: 'Jina Reader',
      url: `${READER_URL}?positron=${Date.now()}`,
      headers: {
        'x-no-cache': 'true',
        'x-return-format': 'markdown'
      }
    }
  ];

  const errors = [];

  for (const source of sources) {
    try {
      const text =
        await fetchText(source.url, source.headers);

      const rows = parseSource(text);

      if (!rows.length) {
        throw new Error('тиражи не распознаны');
      }

      return {
        rows,
        source: source.name
      };
    } catch (error) {
      errors.push(
        `${source.name}: ${error?.message || error}`
      );
    }
  }

  throw new Error(errors.join
