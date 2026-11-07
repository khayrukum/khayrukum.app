# Traceability — REQUIREMENTS v2.1 → implementation

Status: **done** = implemented (and tested where a test is named) · **partial** = implemented with a gap stated ·
**deferred** = not in this branch, reason given · **owner** = needs an owner action outside the code.
Paths are relative to the repo root; `core/` = `site/assets/js/core/`, `pages/` = `site/assets/js/pages/`.
Tests: `unit/*` = `tests/unit/*.test.mjs`, `e2e` = `tests/e2e/e2e.test.mjs`, `a11y` = `tests/e2e/a11y.test.mjs`.

## Summary

| Status | Count |
|---|---|
| done | 187 |
| partial | 25 |
| deferred / owner | 14 |

Counted per requirement ID (ranges expanded); TST rows are listed separately at the end.

## 1.5 Architecture

| ID | Where | Test | Status |
|---|---|---|---|
| ARCH-01 | `core/base.js` (root from `import.meta.url`), relative links in HTML | lint (origin grep), e2e | partial — `404.html` uses root-absolute asset paths (GitHub Pages serves it at any depth); manifest uses `./` URLs so it works from a sub-path |
| ARCH-02 | `core/registry.js`, `site/assets/js/types/*` | validate-data (round types ↔ modules) | done |
| ARCH-03 | `core/audio.js` (play, pause, resume, seek, setRate, setLoop, playSequence, on) | e2e audio | done |
| ARCH-04 | `core/platform.js` | e2e (clipboard) | done |
| ARCH-05 | `core/sw-client.js` (no SW → app works), `store.js` memory fallback | e2e (dev pages) | done |
| ARCH-06 | no server calls; `core/analytics.js` fails silently | e2e (no errors) | done |
| ARCH-07 | static imports only | lint (`import(`) | done |

## 2 Information architecture

| ID | Where | Test | Status |
|---|---|---|---|
| IA-01 | `site/*/index.html`, `ui.canonicalize()` | e2e canonical | done |
| IA-02 | kv keys `exam:<id>`, `random:*`, `plan:baqarah` | — | done |
| IA-03 | `pages/exam.js notFound()` | e2e | done |
| IA-04 | `ui.initPage()` home link + footer | e2e | done |
| IA-05 | directory URLs, `tools/serve.mjs` redirect | — | done |
| IA-06 | `pages/exam.js` `#q=` | e2e | done |
| IA-07 | DNS / Pages | — | owner (DEP-04) |
| §2.2 hub sections | `pages/hub.js` | e2e | done |

## 3.0 Global

| ID | Where | Test | Status |
|---|---|---|---|
| GEN-01 | `core/strings.ar.js`, data | lint colloquial list | done |
| GEN-02 | `core/strings.ar.js` (+ data files) | lint (Arabic only in strings.ar.js; title/h1) | done |
| GEN-03 | `core/fmt.js` | unit/refs | done |
| GEN-04 | all HTML; RTL arrows in strings | e2e lang/dir | done |
| GEN-05 | `store.js` memory fallback, `ui.initPage` warning | — | done (not automated) |
| GEN-06 | `pages/hub.js hints()` + `ui:inapp` | — | done |
| GEN-07 | `ui.confirmInline()`; exemptions kept | lint (no `confirm(`), e2e | done |
| GEN-08 | `ui.renderNotes()`, mailto prefill with page, version, bayt | — | done |
| GEN-09 | CSS `.wrap{overflow-x:clip}` | e2e widths 320/375/768 | done |

## 3.1 Hub

| ID | Where | Test | Status |
|---|---|---|---|
| HUB-01 | `pages/hub.js` | e2e | done |
| HUB-02 | `progress()`, `stats.attemptTally` | e2e AC «٣ من ٥٩ · ٦٧٪» | done |
| HUB-03 | `progress()` random card | — | done |
| HUB-04 | `fmt.when()` | — | done |
| HUB-05 | `plan-logic.planTotals` | unit/logic | done |
| HUB-06 | `audioStatus()` | — | done (audio on only) |
| HUB-07 | `hints()` install card, `strings.hub.iosSteps` by major version | — | partial — iOS step texts are per my best knowledge of iOS 26, to confirm on a device (M-07) |
| HUB-08 | `hints()` | — | done |
| HUB-09 | `sw-client.onReady` | e2e offline | done |

## 3.2 Plan

| ID | Where | Test | Status |
|---|---|---|---|
| PL-01 | `content.suraRubs`, `data/quran/meta.json` (Tanzil) | validate | done |
| PL-02 | `pages/plan.js render()` + `rub-openings.json` | — | done |
| PL-03 | `plan-logic` (`tapRep`, `planTotals`, `dayDone`), short day names < 360 px | unit/logic, e2e | done |
| PL-04 | `renderDay()` + `data/plan/baqarah.json` | — | done |
| PL-05 | `plan-logic.reviewFor` | unit/logic | done |
| PL-06 | Friday section | — | done |
| PL-07 | mistakes `{id,text,deleted,updatedAt}`, escaped | e2e | done |
| PL-08 | map + `planTotals.y` | unit, e2e | done |
| PL-09 | `plan-logic.advance` + inline confirm | unit, e2e | done |
| PL-10 | weak banner | — | done |
| PL-11 | all-done banner | — | done |
| PL-12 | settings pair selector | — | done |
| PL-13 | rules from data | — | done |
| PL-14 | `data/plan/baqarah.json` | validate | done |
| PL-15 | `plan-logic.showSaturdayBanner`, `satBannerDismissed` | unit/logic | done |

## 3.3 Exams

| ID | Where | Test | Status |
|---|---|---|---|
| EX-01 | `pages/exam.js header()` | e2e | done |
| EX-02 | `scoreLine()` (current data only) | e2e | done |
| EX-03 | `.rounds` sticky tablist, `centerTab()` | e2e sticky + scrollWidth | done |
| EX-04 / EX-05 | `data/round-types.json`, exam `rounds` | validate | done |
| EX-06 | `content.normalizeExam` (roundText overrides) | — | done |
| EX-07 | `summaryHtml()` (outline, pageStarts, lookalikes, codes, chapters + ▶ استمع) | — | done |
| EX-08 | `questionHtml()`, `render.js` | unit/refs | done |
| EX-09 | reveal toggle, `open` persisted | e2e | done |
| EX-10 | grade buttons `aria-pressed`, tint, DATA-41 | e2e, unit | done |
| EX-11 | first bayt ref ▶, random bayt ▶ | — | done (audio on) |
| EX-12 | `randomRound()` | — | done |
| EX-13 | round nav, scroll to intro | — | done |
| EX-14 | restore + «تابعتَ…» | e2e | done |
| EX-15 | slips panel, copy, reset (new session) | e2e (slips) | done |
| EX-16 | all text from refs | validate, unit | done |
| EX-17 | `exam:<id>` in IndexedDB | e2e reload/offline | done |

## 3.4 Random

| ID | Where | Test | Status |
|---|---|---|---|
| RND-01…04 | `pages/random.js controls()` | e2e (loads, sources) | done |
| RND-05 | `core/random-logic.buildPool`, `inRange` | unit/logic | done |
| RND-06 | `orderSet`, auto first set, new session | unit/logic | done |
| RND-07 | `questionView()` | e2e | done |
| RND-08 | resume note | — | done |
| RND-09 | `results()` | — | done |
| RND-10 | `random:prefs` | — | done |
| RND-11 | reads exam files | — | done |

## 3.5 History

| ID | Where | Test | Status |
|---|---|---|---|
| HIS-01 | one `events` store | e2e (4 events) | done |
| HIS-02 | filter chips | e2e | done |
| HIS-03…07 | `core/stats.js`, `pages/history.js` | unit/logic | done |
| HIS-08 | copy summary, clear with confirm (events only) | e2e copy | done |
| HIS-09 | link `exam/?id=…#q=` | — | done |
| HIS-10 | «سؤال قديم» from snapshot | — | done |
| HIS-11 | empty state | e2e (first load) | done |

## 3.6 Listening

| ID | Where | Test | Status |
|---|---|---|---|
| LIS-01 | header + `credit.audio` | — | done |
| LIS-02 | sticky now bar, seek, ±5, loop, speed pop-over | e2e audio | done |
| LIS-03 | `full.mp3` + measured `chapterOffsets` | — | done |
| LIS-04 | chapter cards, persisted open state | — | done |
| LIS-05 | selection mode, range «حدّد» adds, persisted | e2e audio | done |
| LIS-06 | `audio.playSequence` ascending, loop restarts | — | done (not automated) |
| LIS-07 | `audio.setLoop` uses `loop` | — | done |
| LIS-08 | 9 speeds, `preservesPitch` | — | done |
| LIS-09 | custom slider, clamp to dur − 0.1 | — | done |
| LIS-10 | Media Session | — | done |
| LIS-11 | `dlState()` | — | done |
| LIS-12 | audio off view | e2e TST-36 | done |

## 3.7–3.8 Settings, About, Privacy

| ID | Where | Test | Status |
|---|---|---|---|
| SET-01 | theme chips + inline script | — | done |
| SET-02 | download/stop/resume/delete | — | done (TST-25 not automated) |
| SET-03 | `platform.estimate/persisted` | — | done |
| SET-04 | export (download/share sheet), copy, file or paste import | e2e TST-40 | done |
| SET-05 | version line + «حدّث الآن» | — | done |
| SET-06 | double confirmation wipe | — | done |
| ABT-01 | `pages/about.js` (+ Tanzil notice from `source.json`) | — | done |
| ABT-02 | `pages/privacy.js` | — | done |

## 4 Data

| ID | Where | Test | Status |
|---|---|---|---|
| DATA-01 | `core/refs.js` (mark-only tokens, trailing mark) | unit/refs (2:2, 2:21, t:25) | done |
| DATA-02 | inline tokens; `plainQuotes` | lint | done |
| DATA-10 | `data/quran/source.json` | validate | partial — the delivered download has sajdah, rub'-el-hizb and superscript-alef-tatweel ON; recorded as-is (see CONTENT-TODO) |
| DATA-11 | `meta.json` from Tanzil `quran-data.js` | validate (604/240) | done |
| DATA-12 | `002.json` with notice; basmala separate | validate | partial — the ۞ sign is in the verse text (download option); it is a mark token, never a word, never in labels |
| DATA-13 | `rub-openings.json` (aligned baseline phrases) | — | done |
| DATA-14 | `tools/import-tanzil.mjs` sole writer | validate byte check | done |
| DATA-15…17 | `tools/import-tuhfa.mjs`, `abyat.json`, «قيد المراجعة» | validate | done |
| DATA-20…23 | `data/exams/index.json`, exam files, `round-types.json`, `tools/validate-data.mjs` | validate | done |
| DATA-24 | counts 59 (8/13/7/9/9/8/5), 61, 86 | validate | done |
| DATA-25 | `tools/port/{extract-baseline,align,resolve}.mjs`, `alignment-table.tsv` | unit/align | done (508 match, 6 override, 0 mismatch) |
| DATA-26 | `tools/port/porting-log.md` (+ `porting-notes.md`) | unit/align | done |
| DATA-27 | `data/audio/tuhfa.json` | — | partial — follows the §5.x collection shape (`items[]` + `segments`) instead of top-level `bayt/chapter/full` |
| DATA-30 | `data/plan/baqarah.json` | validate | done |
| DATA-40…42 | `core/grading.js` | unit/logic | done |
| DATA-43 | `store.prune()` | — | partial — implemented, not load-tested |
| DATA-44 | `core/backup.js mergeKv/mergeEvents` | unit/logic | done |
| DATA-50…52 | `core/store.js` | e2e namespace, lint | done |
| DATA-53 | `ui.initPage` → `platform.persist()` | — | done |
| DATA-54 | BroadcastChannel + `visibilitychange` | — | done |
| DATA-60/61 | `core/backup.js`, `schemas/backup.schema.json` | unit, e2e | done |

## 5 Audio

| ID | Where | Test | Status |
|---|---|---|---|
| AUD-01…03 | `core/audio.js` | e2e (one element) | done |
| AUD-04 | sequence via `ended`; gaps recorded in `audio.gaps` | — | partial — ≤ 300 ms not measured (TST-21) |
| AUD-05 | src+play() synchronous in tap handlers | — | done |
| AUD-06/07/10 | retry on `canplay`, blob fallback, early-end recovery | — | partial — implemented, not tested with fake media |
| AUD-08, 09, 11, 13, 14 | `core/audio.js` | — | done |
| AUD-12 | custom slider in `pages/listen.js` | lint (no range input) | partial — drag-does-not-scroll not automated |
| AUD-15 | `currentBayt()` from segments + offsets | — | done |
| AUD-16 | — | — | deferred — needs a real iPhone; limitation stated on «عن الموقع» and README |
| AUD-30 (§5.3) | `tools/check-audio.mjs` (rules 1–8, cross-correlation) | run on provided files: pass | partial — TST-35 synthetic bad files not written |
| AUD-31 (§5.3) | `check-audio.mjs --waveforms` | — | done |
| AUD-30 (§5.x) | `data/audio/index.json` collections + reciters, `audio-cache.collection/collectionsOfType` | — | partial — fixture `quran`/`lesson` collections test not written |
| AUD-31 (§5.x) | `audio-cache.quranItem(sura, aya)` | — | partial — hook exists; no Quran button yet (none shown without a collection, as required) |
| AUD-32 | — | — | deferred (later phase) |
| AUD-33 | per-collection permission, `release-check.mjs` | — | done |
| AUD-40 | `config.json audio.enabled=false`, build drops audio | e2e TST-36 | done |
| AUD-41 | `.gitignore *.mp3`, release-check | release-check | done |

## 6 Offline / PWA

| ID | Where | Test | Status |
|---|---|---|---|
| OFF-01 | `site/manifest.webmanifest`, `tools/icons.mjs` (51 KB icons) | — | partial — `start_url`/`scope` are `./?source=pwa` / `./` (equal to `/` at the apex; keeps ARCH-01 sub-path support) |
| OFF-02 / 02a | `site/sw.template.js`, `tools/build.mjs` | e2e offline | done (TST-24b proxy test deferred) |
| OFF-03 / 04 | install precache, navigation fallback | e2e offline | done |
| OFF-05 | build budget (482 KB now) | build | done |
| OFF-06, 09 | `audio-cache.cacheItem/warm` | — | done |
| OFF-07 / 08 | SW `rangeResponse` | e2e Range (206/416, no 206 stored) | done |
| OFF-10 | `core/sw-client.js` | — | partial — two-tab update test (TST-24) not automated |
| OFF-11 / 12 | SW activate, registration after load | — | done |
| OFF-20…22 | `audio-cache.downloadAll/deleteAll/cachedCount`, settings | — | partial — TST-25 not automated |
| OFF-24 | `ui.initPage` banner, `audio` notCached toast | e2e offline | done |

## 7 Non-functional

| ID | Where | Test | Status |
|---|---|---|---|
| NFR-PERF-01 | — | — | deferred (advisory Lighthouse) |
| NFR-PERF-02 | small pages, no framework | — | partial — transfer to `load` not measured |
| NFR-PERF-03 | build budget check | build | done |
| NFR-PERF-04 | cached events, CSSOM bars | — | partial — 20 000-event timing not measured |
| NFR-PERF-05 | `tools/fonts.mjs` self-hosting, swap | — | owner — WOFF2 files missing (CONTENT-TODO) |
| NFR-A11Y-01 | `a11y` axe test | skipped locally (axe-core not installable here), runs in CI | partial |
| NFR-A11Y-02 | CSS min sizes | a11y target-size | done |
| NFR-A11Y-03 | theme tokens; grade tags in text | unit/contrast | done |
| NFR-A11Y-04…05, 07…09 | CSS + ARIA tabs, `role=status` toasts | lint | done |
| NFR-A11Y-06 | `.wrap` clip | e2e (8 checks incl. 200 % text) | done |
| NFR-TYP-01 | `app.css` font roles, `fonts.mjs` | — | owner — font files |
| NFR-TYP-02…04, 06 | `.qtext/.frag.qf`, `﴿n﴾`, bayt layout, logical props | lint | done |
| NFR-TYP-05 | Arabic punctuation | lint | done (Latin only for domain, email, browser and font names in text given by the requirements) |
| NFR-THM-01…03 | tokens, `data-theme`, inline script + CSP hash | lint (hash) | done |
| NFR-BRW-01 | — | — | owner (TST-50 on devices) |
| NFR-PRV-01…06 | CSP meta, analytics DNT/GPC, escaping, referrer | e2e (0 CSP violations), unit (import validation) | done |

## 8 Content and licensing

| ID | Where | Status |
|---|---|---|
| LIC-01 / 02 | Tanzil import, notice on «عن الموقع» and in data | done |
| LIC-03 | — | not used (MAY) |
| LIC-04 | `validate-data.mjs` page checks | done |
| LIC-05 | alignment + porting log | done |
| LIC-10 | `import-tuhfa.mjs`, byte check | done |
| LIC-11 | «قيد المراجعة» fallback, `release-check --accept-review` | done (fallback; verification is owner) |
| LIC-20 | audio off, `permission.json`, release-check | done (fallback; permission is owner) |
| LIC-21 | `S.credit.audio` | done |
| LIC-22 | `tools/audio/cut.mjs` + `segments-baseline.json` | partial — not verified to reproduce the provided files byte-for-byte |
| LIC-30 | `assets/fonts/LICENSES/`, hadith «رواه البخاري» | partial — OFL texts to add with the fonts |
| LIC-31 | README «Licenses», `LICENSE` | done |

## 9 Deployment

| ID | Where | Status |
|---|---|---|
| DEP-01 | `.github/workflows/deploy.yml` (gated) | partial — Pages must be enabled by the owner |
| DEP-02…07 | — | owner (CONTENT-TODO §4–5) |
| DEP-08 | max-age handled by OFF-02a | done |
| DEP-09 | tag → deploy, `release-check.mjs` | done |

## 10 Tests

| ID | File | Status |
|---|---|---|
| TST-10/11 | `tools/validate-data.mjs` | done |
| TST-12 | `tools/content-lint.mjs` | done |
| TST-13 | `tests/e2e/a11y.test.mjs` | partial (axe in CI only) |
| TST-14 | e2e + a11y | done (Chromium only) |
| TST-15/16 | `tests/unit/*` | done |
| TST-20 | e2e (hub, exam, random, history, plan, settings) | partial — subset |
| TST-21 | — | deferred (fake-media harness) |
| TST-22 | e2e Range | done |
| TST-23 | e2e offline | done (cached-bayt playback offline not automated) |
| TST-24 / 24b / 25 | — | deferred |
| TST-26 | build budgets | partial (installability check not automated) |
| TST-27 | e2e CSP | partial (GPC/DNT check not automated) |
| TST-28 | e2e namespace | partial (blocked storage, 20 k events not automated) |
| TST-30 | — | deferred (baqarah-3 fixture) |
| TST-31/32/36/40 | e2e | done |
| TST-35 | `check-audio.mjs` | partial (synthetic bad files) |
| TST-50 | — | owner (devices) |
| TST-60 | `tools/release-check.mjs` | done |
| WebKit / Firefox projects | — | deferred — only Chromium is available here |
