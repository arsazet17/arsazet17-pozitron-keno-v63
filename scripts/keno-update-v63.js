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
    .replace(/<style\b[\s\S]*?<\/style>/gi,
