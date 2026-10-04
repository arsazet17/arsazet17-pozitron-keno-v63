# IRIS inside KENO 6.3

IRIS is a separate full dashboard inside **ПОЗИТРОН КЕНО v6.3**. It keeps the original KENO 6.3 modules intact and has its own active series, archive, checks, statistics and local cache.

## Restored project principle

- Analysis history: up to the latest **700 draws**.
- The live source window is the latest **5 consecutive draws**.
- Every number 1–80 receives a five-step 0/1 rhythm. Priority rhythms: `01010`, `11010`, `10101`, `10100`.
- The 1–80 field is treated as a 10×8 geometry. Structural links used by IRIS: row ±2, vertical +10/+20/+30 and diagonal ±9/11.
- Numbers absent from all five source draws are not used to invent a missing cell.
- IRIS creates several independent regular combinations. They may share numbers, but they are not one CORE/MAIN/FULL combination cut into several sizes.
- MINI-3 and MINI-4 are separate searches with their own five-draw series and archive.

## Permission A / B

The project gate is evaluated on a structural FULL-9 service set.

**A / PLAY** is allowed when:
1. FULL-9 has no more than 2 numbers in any horizontal row;
2. in the five source draws, no more than 8 numbers appeared 3 or more times.

**B / PLAY+** requires A and additionally:
1. FULL-9 occupies at least 7 of 8 rows;
2. FULL-9 has at least 3 vertical +10 links.

A and B are shown separately in the interface. MINI-3/MINI-4 start only when A is allowed.

## Five-draw series

Every generated combination is fixed **before** the next draw and then checked unchanged on the next five draw numbers. A win on draw 1–4 does not close the series early. After all five facts are recorded, the series moves to the archive.

The archive stores: source cutoff, source window, fixation time, target draw range, immutable numbers, A/B state, selection trace, all five facts, hits, best single-draw result, known payout total and conflict markers. “Best 4/7” means the best result in one of the five checks; hits from different draws are never added together.

## Persistence and closed-phone operation

Server series live in `iris-archive-v63.json`. The server workflow reads the common `keno-history-v63.json`, settles existing series and can create new ones after A. Local state uses IndexedDB database `pozitron_iris_v63`. The server can continue checking series when the phone is closed as new draw facts arrive.

The server and IRIS do not rewrite old KENO prediction archives.

## Payouts

KENO 6.3 already contains verified internal payout entries for 3–5 number combinations. Exact 6–10 number hit→rubles tables were not present in the recovered project data, so IRIS records hits for those sizes but leaves the ruble amount unknown instead of inventing a value.

## UI

The IRIS dashboard contains:
- Home / New / Archive / Statistics / Settings navigation;
- next draw and countdown;
- A and B status;
- current regular, MINI-3 and MINI-4 series;
- “Calculate new combinations” and fact checking;
- number map 1–80;
- draw history;
- separate archives by mode;
- statistics and full rules page.

## Verification

```bash
node scripts/test-iris-v63.js
node scripts/iris-update-v63.js
```
