
'use strict';

const fs = require('fs');

const SOURCE =
  'https://raw.githubusercontent.com/arsazet17/pozitron-keno-v5/main/keno-history-v62.json';

async function main() {
  const url = SOURCE + '?t=' + Date.now();

  const response = await fetch(url, {
    headers: {
      'cache-control': 'no-cache',
      'user-agent': 'Positron-Keno-v63'
    }
  });

  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }

  const data = await response.json();

  const draws = Array.isArray(data)
    ? data
    : (Array.isArray(data.draws) ? data.draws : []);

  if (!draws.length) {
    throw new Error('База 6.2 пуста');
  }

  draws.sort((a, b) => Number(a.draw) - Number(b.draw));

  const latest = draws[draws.length - 1];

  fs.writeFileSync(
    'keno-history-v63.json',
    JSON.stringify(draws) + '\n'
  );

  fs.writeFileSync(
    'keno-status-v63.json',
    JSON.stringify({
      version: '6.3-clean-6410',
      source: 'KENO 6.2 server mirror',
      updatedAt: new Date().toISOString(),
      drawsStored: draws.length,
      latestDraw: Number(latest.draw),
      latestDate: String(latest.date || ''),
      latestTime: String(latest.time || '')
    }, null, 2) + '\n'
  );

  console.log(
    'KENO 6.3 OK: ' +
    draws.length +
    ' тиражей, последний №' +
    latest.draw
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
