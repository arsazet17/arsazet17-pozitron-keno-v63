# ПОЗИТРОН КЕНО 6.3 — CLEAN 6410 SERVER

Чистая архитектура 6.3.

## Поток тиражей

Lucky Numbers → GitHub Actions (каждые 5 минут) → `keno-history-v63.json` → приложение 6.3.

При первом запуске workflow пустая база 6.3 один раз стартует с полной проверенной
`keno-history-v62.json`, затем пополняется самостоятельно.

В приложении собственная база 6.3 — основной источник. RAW / Pages / jsDelivr базы
6.2.2 оставлены резервом, чтобы экран не откатывался при задержке одного канала.

## FINGERPRINT

Обучение не перенесено в workflow и не упрощено. Оно работает в движке 6.3:
прогноз → факт → проверка → корректировка весов → следующий прогноз.

Единая память прогнозов и обученных весов: IndexedDB (`storage-v63.js`).

## Серверные файлы

- `.github/workflows/update-keno-v63.yaml`
- `scripts/keno-update-v63.js`
- `keno-history-v63.json`
- `keno-status-v63.json`

## Клиент

- `index.html`
- `app-v63.js`
- `engine-v63.js`
- `storage-v63.js`
- `styles-v63.css`
- `sw.js`
- `manifest.webmanifest`
- `icon.svg`
