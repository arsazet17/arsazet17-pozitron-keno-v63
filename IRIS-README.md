# Iris 0.1.0 inside KENO 6.3

Separate panel, independent immutable five-draw series, MINI3/MINI4, dedicated archive and statistics. The baseline modules are unchanged. Iris data lives in iris-archive-v63.json (server) and a separate IndexedDB database poz itron_iris_v63 (name in code: pozitron_iris_v63). Local extra series are not uploaded to GitHub; export JSON is available. The server generates its own identical deterministic candidates and continues without the phone.

## Provisional selection rules

The original Iris formula and A/B thresholds were not recovered. This release explicitly labels the following rules as research v0.1. They are not claimed to reproduce the original player exactly or outperform random selection.

Use five consecutive draws in chronological order. All must have 20 unique integers 1..80 and consecutive scheduled timestamps. A requires: next scheduled draw still in the future, last draw not in the future, at least five numbers with one of the strong patterns, and a geometric link between two of them. B is disabled pending its actual definition.

Strong pattern scores: 01010=5, 11010=4.8, 10101=4.6, 10100=4.4. Other seen numbers: 1 + 0.2 * frequency. Absent numbers are excluded. Geometry: column +0.8, row +0.6, same row step 2 +0.7, same column step 20 +0.7, adjacent diagonal +0.6. Greedy selection adds 1.5 * mean geometric connection; regular Iris penalizes previous combination reuse by 1.1 per use. Different strong seeds generate up to four nonnested combinations of 7,6,8,5. Reject overlaps >75% of the shorter combination. MINI3 and MINI4 use separate greedy searches, independent of regular Iris combinations. These are temporary explicit engineering choices for later correction.

## Frozen series

Stable ID = algorithm version + source cutoff + mode + numbers. Target range cutoff+1..cutoff+5. All checks must be later than the recorded creation timestamp. Same mode and numbers cannot start a duplicate active series. Missing draw remains pending, never replaced by the sixth draw. Existing results are immutable; altered source facts get a conflict marker. Wins do not stop a series. No retrospective forecasts: startup only evaluates the latest available window at current time. Stale windows cannot produce forecasts. Server script fails closed on malformed stored JSON.

## Payouts

Only existing KENO 6.3 size 3,4,5 entries are reused; they are not reverified against current official prices. For size 6..10 the payout is unknown (null), not zero. The interface reports partial known totals and the count of checks without calculated payouts. Amounts are payouts, not net profit; stakes are not subtracted.

## Server

update-iris-v63.yaml runs after successful existing Stoloto workflows, on relevant code pushes, and at minutes 9,24,39,54 UTC. It reads the existing keno-history-v63.json and commits only iris-archive-v63.json. It does not acquire lottery results itself. If the source history is delayed, it settles existing series but waits before generating new ones. Old archives and other prediction engines are not touched.

## Verification

node scripts/test-iris-v63.js
node scripts/iris-update-v63.js

User interface: Iris tool / footer button, generate, check, series details, map, history, separated archives, statistics (all/20/50), local auto toggle, JSON export. Network timeout 15s; IndexedDB writes acknowledged only after transaction completion; concurrent local tabs merge within one transaction.
