# TEST-REPORT — khayrukum.app, branch `v1` (commit 69792bc)

Independent test pass against REQUIREMENTS v2.1. Date: 2026-11-09. Tester did not write the application.
Nothing in `site/`, `data/` or `tools/` was changed; nothing was committed. Only `tests/**` and this file were added.

Environment: Node 22.23, Playwright with **Chromium 153 only** (WebKit and Firefox executables are not installed
in this sandbox: `browserType.launch: Executable doesn't exist` for both). Audio is off in `site/config.json`, as intended.

---

## (a) Pipeline results

| Step | Result as delivered | Result with the tests added in this pass |
|---|---|---|
| `npm run validate` | pass (286 verses byte-equal; 59 / 61 / 86 questions valid) | same |
| `npm run lint` | pass | same |
| `npm run test:unit` | 21 / 21 pass | 29 tests: **27 pass, 2 fail** (both new, both real content defects) |
| `npm run build` | pass. 76 files precached, 482 KB. Warnings: 8 WOFF2 fonts missing, no OFL texts, abyat 26/28/57 under review, analytics token empty | same |
| `npm run test:e2e` | 12 tests: 11 pass, 1 skipped (axe-core not installed) | 34 tests: **24 pass, 9 fail, 1 skipped** (all 9 failures are new tests that expose defects listed below) |
| `node tools/release-check.mjs` | **fails (3)**: abyat 26/28/57 not verified (LIC-11), OFL texts missing (LIC-30), WOFF2 fonts missing (NFR-TYP-01). All three are owner items already listed in CONTENT-TODO. Audio gate passes (disabled). | same |

`npm test` and CI will now be red until the defects in (b) are fixed. That is deliberate: no failing test was weakened.

Audio in the repository: `git ls-files` and the whole Git history contain **0** audio files; `dist/` contains 0.
`local-audio/` and `dist-audio/` exist on this machine with 72 MP3 files each; both are git-ignored (`local-audio/`, `dist-*/`).

---

## (b) Findings, sorted by severity

"Confirmed" = reproduced by running the built site in Chromium or by a script. "Inferred" = from reading code or data only.

### Blocker

None found in the code. (Release is still blocked by the owner items that `release-check.mjs` reports: fonts, OFL texts, Tuhfa review decision.)

### Major

| # | Req. | Finding | Reproduction | Expected | Actual | How known |
|---|---|---|---|---|---|---|
| M1 | DATA-25, LIC-05, EX-16 | **Wrong answer shown for a Tuhfa question.** The human override for `tuhfa/codes/03` (and summary item «الإدغام بغنة») points at `t:10:2:2`. Word 2 of that hemistich is «بِغُنَّةٍ»; the code word the baseline asks for («ينمو», the token «بِيَنْمُو») is word **3**. The override's own reason text names the right token but the ref is off by one. | Open `/exam/?id=tuhfa` → «الرموز والحروف» → question 3 «حروف الإدغام بغنة» → «اكشف الإجابة». Also «قبل أن تبدأ» → «الرموز» → «الإدغام بغنة». | «بِيَنْمُو» | «بِغُنَّةٍ» (the tip below still says «٤ حروف: ي ن م و») | Confirmed (screenshot, DOM, independent script). Test: `tests/unit/content-findings.test.mjs` #1 fails. |
| M2 | LIC-02, LIC-05, DATA-26 | **Quran words shown under the wrong verse number.** `tuhfa/quran-to-tuhfa/15` renders `2:62:19-21` («وَلَا خَوْفٌ عَلَيْهِمْ») with the note «البقرة ٣٨». Verse 38 reads «فَلَا خَوْفٌ عَلَيْهِمْ». The baseline typed «ولا خوف عليهم (البقرة ٣٨)» from memory; the port matched the words in verse 62 and kept the old label. The porting log does not list it, although DATA-26 requires every "ref resolved differently than the typed text suggested". | `/exam/?id=tuhfa` → «من القرآن للتحفة» → question 15. | Either the words of 2:38 with «البقرة ٣٨», or the note «البقرة ٦٢» | Words of verse 62 labelled as verse 38 | Confirmed. Test: `content-findings.test.mjs` #3 fails. |
| M3 | HIS-08, HIS-10 | **«انسخ الملخص» gives wrong verse / bayt numbers.** `refsText()` in `pages/history.js` takes the wrong number from refs that carry a word range: `2:20:5-9` → «٥» (first word index) and `t:10:2:2` → «٢» (hemistich). Only whole-verse refs and `-n` / `n-` forms come out right. The same function labels the answer of «سؤال قديم» items. | Grade «خطأ» on baqarah-1 «الكلمة المتكررة» question 3 and on tuhfa «الرموز والحروف» question 3 → `/history/` → «انسخ الملخص» → paste. | «• البقرة ١ · الكلمة المتكررة · آية ٢٠، ٢٥» and «• تحفة الأطفال · الرموز والحروف · بيت ١٠» | «… آية ٥، ١٣» and «… بيت ٢» (the exam page's own slip list says «آية ٢٠، ٢٥» correctly) | Confirmed. Test: `tests/e2e/findings.test.mjs` "HIS-08" fails. |
| M4 | OFF-02a.5, OFF-03 | **A failed update can delete the cache of the service worker that is still in control.** `build.json` contains the build time, so re-building identical content gives a different `sw.js` but the **same** `BUILD_HASH`, hence the same cache name `khayr-app-<hash>`. The new worker installs into the live cache, and on any install failure the handler runs `caches.delete(APP_CACHE)`. The old worker stays active with no cache: the site stops working offline until a later install succeeds. | Build twice with no change (`node tools/build.mjs --out dist-tst-a`, again `--out dist-tst-a2`). Visit A until «جاهز للعمل دون إنترنت». Serve A2 with one asset returning 503. Trigger an update check, wait ~7 s. Go offline, open `/plan/`. | A's cache untouched; `/plan/` opens offline ("the previous SW stays in control unchanged") | `caches.keys()` is `[]`; offline navigation fails | Confirmed. Test: `tests/e2e/update.test.mjs` #3 fails. A re-run of the deploy workflow on the same tag produces exactly this pair of builds. |
| M5 | NFR-PRV-05, DATA-61 | **Import validates events but not the shape of `kv` values; a bad backup permanently breaks pages.** Only the key names are checked (`schemas/backup.schema.json` also says just `"kv": {"type":"object"}`). A value such as `"exam:baqarah-1": {"grades": null, "updatedAt": 9e15}` is merged (last-writer-wins) and the exam page then throws on every load; `random:prefs` with a non-array `src` makes `/random/` show «تعذّر تحميل المحتوى». The only recovery is «امحُ كل بياناتي». | `/settings/` → paste a backup whose `kv` holds `{"exam:baqarah-1":{"grades":null,"updatedAt":9e15},"random:prefs":{"src":"x","updatedAt":9e15}}` → «استورد النص الملصق» → «ادمج النسخة» → open `/exam/?id=baqarah-1` and `/random/`. | «هذا الملف ليس نسخة صالحة من «خيركم».», or the pages ignore the bad values | Import reports success; exam page is empty with `Cannot read properties of null (reading 'baqarah-1/pages/01')`; random page shows the load error | Confirmed. Test: `findings.test.mjs` "NFR-PRV-05 / DATA-61" fails. Needs a hand-edited or corrupted file, so likelihood is low; impact is total for the affected page. HTML in imported text is escaped correctly (no injection). |

### Minor

| # | Req. | Finding | Reproduction | Expected vs actual | How known |
|---|---|---|---|---|---|
| m1 | GEN-03 | Western digits on «سجلي» for a graded random-number question: the snapshot prompt is `String(q.number)`. | `/random/` → grade «خطأ» on a «اقرأ البيت رقم …» question → `/history/` → «ما تحتاج إلى مراجعته». | «١٧» only; actual: a line «17» above «١٧». | Confirmed. Test "GEN-03" fails. |
| m2 | NFR-A11Y-04 | Choosing a theme sets `aria-pressed` on `<html>`: `settings.js` updates every `[data-theme]` element, and `<html data-theme>` matches. Invalid ARIA on the root; axe would flag it. | `/settings/` → «داكن» → inspect `<html>`. | No `aria-pressed` on `<html>`; actual `aria-pressed="true"`. | Confirmed. Test fails. |
| m3 | NFR-A11Y-04 | The backup file chooser has no visible keyboard focus. The real `<input type=file>` is `.sr-only` (1 px, clipped) and its visible `<label class="btn">` has no focus style. | `/settings/` → Tab from «انسخ النسخة نصًّا». | A visible focus ring; actual: focus disappears for one Tab stop (Enter/Space still opens the chooser). | Confirmed. Test fails. |
| m4 | EX-15, DATA-01 | A slip line can end with a dangling pause mark: "first 5 words" splits on spaces and counts a mark-only token as a word. | baqarah-1 → «الصفحات» → question 3 → «خطأ». | «(ٱلَّتِى وَقُودُهَا ٱلنَّاسُ وَٱلْحِجَارَةُ أُعِدَّتْ)»; actual «(… وَٱلْحِجَارَةُ ۖ)». | Confirmed. Test fails. |
| m5 | GEN-08 | «سجلي» shows Quran and Tuhfa text (review items with answers) but only the device note; `initPage({notes: []})`. | Grade one Baqarah and one Tuhfa question «خطأ» → `/history/` → footer. | «المصحف هو المرجع عند أي شك» and the Tuhfa note; actual: neither. | Confirmed. Test fails. |
| m6 | IA-05 | Under the service worker, `/plan`, `/exam?id=…`, `/history` (no trailing slash) are answered directly and the address bar keeps the slash-less URL. Without the worker the server redirects. Pages still work at the domain root; under a sub-path the relative `../assets/…` links would resolve one level too high (ARCH-01). | After the first visit, open `/plan`. | `/plan/`; actual `/plan`. | Confirmed at root. Sub-path breakage inferred. Test fails. |
| m7 | DATA-02, EX-16 | Tuhfa words typed by hand, unvocalized, outside tokens: summary look-alike line `«[[t:9:1:1-2]]»: بستة أتت، بغير غنه، بمثلها أتى` in `tuhfa.json`. The lint misses it because the fragments are not inside «». Single typed Quran words also remain («يشعرون», «رغدا», «خوف») — the lint allows one-word quotes, but they are unvocalized copies next to Uthmani text. | Read `site/data/exams/tuhfa.json` line 43; baqarah-1 line 48. | Tokens; actual typed text. | Inferred (data read). |
| m8 | GEN-01 | No Egyptian-dialect word found in `strings.ar.js`, the HTML, or any data file (own word list, Arabic-aware word boundaries). Fuṣḥā slips only: «(١٥ حرف)», «(١٤ حرف)» ×2 → «حرفًا»; «من المشددتين لآخر المثلين» and «من أقصى الحلق لأدناه» (لـ for إلى); «سنة النظم بالهجري». | `tuhfa.json` codes 06–08, chain/02 ask, codes/13 tip, chain/05 tip. | — | Confirmed by scan and reading. |
| m9 | GEN-03 | Version line «الإصدار 1.0.0 · ٩ نوفمبر ٢٠٢٦» uses Western digits for the version. Arguable (identifier). | `/settings/`, `/about/`. | — | Confirmed. |
| m10 | LIC-21 | «تلاوة» is used for the poem's recitation on «عن الموقع» (heading «التلاوة», «تُستعمل التلاوة بإذن…», «التلاوة: جميع الحقوق…»), while LIC-21 reserves the word for the Quran. (The hub tail «مع تلاوة كل بيت» is dictated by §2.2 itself.) | `/about/`. | — | Confirmed. |
| m11 | OFF-02a.1, OFF-10 | The build is not reproducible: `build.json` carries the timestamp, so every rebuild changes `sw.js`. A re-deploy of unchanged content shows «يتوفر تحديث» to everyone, and it is the precondition of M4. | Build twice, compare `sw.js`. | Same bytes for same content. | Confirmed (precondition asserted in `update.test.mjs` #3). |
| m12 | LIC-30 | «عن الموقع» says the font licence texts are «مرفقة مع الموقع»; none ship. Already in TRACEABILITY as partial and caught by `release-check`. | `/about/` → «الخطوط». | — | Confirmed. |
| m13 | EX-17 | Writes are not awaited or flushed on `pagehide`. A grade followed by navigation **in the same task (0 ms)** lost the history event in 5 of 8 runs and the attempt grade in 1 of 8; at ≥ 10 ms nothing was lost in 24 runs. Not reachable by a person; listed for completeness. | Script only. | — | Confirmed by script. No test added. |
| m14 | PL-12 | Changing the active pair keeps `week.checks`; review keys are `d<day>:rv<rub>`, so a tick made for one rub' stays ticked when the same rub' appears under the new pair. | — | — | Inferred (code read). Not run. |
| m15 | DATA-25 | TRACEABILITY states "508 match, 6 override, 0 mismatch — done". Two of the six override rows (M1) are wrong, and `tests/unit/align.test.mjs` cannot see it because it re-runs the tool under test. | — | — | Confirmed. |

### Requirements inconsistencies (not code bugs) — which reading the code follows

- **AUD-30 / AUD-31 duplicate IDs.** Both readings are implemented: §5.3 in `tools/check-audio.mjs`; §5.x in `data/audio/index.json` (collections, reciters) and `audio-cache.js` (`collection`, `collectionsOfType`, `quranItem`).
- **DATA-27 vs §5.x.** The manifest follows §5.x (`items[]` + `segments`), not the top-level `bayt / chapter / full` shape of DATA-27.
- **LIC-20 vs AUD-33.** Both: `permission.json` holds `{status, granted, date, scope, ref}` per collection, and each collection in `index.json` carries `permission.granted`.
- **DATA-10/12 vs the delivered Tanzil download.** The download has rub'-el-hizb and sajdah signs on. The text is kept byte-exact, so «۞» appears inside full-verse answers (2:26, 2:44, 2:60). Labels (plan header, selectors) do not show it. Documented in CONTENT-TODO.
- **OFF-01.** `start_url` / `scope` are `./?source=pwa` / `./` rather than absolute; equivalent at the apex.
- **§4.10 migration.** Not in v1 by D-6. Verified: old localStorage keys (`baqarah-plan-v1`, `baqarah-exam-public-1/2`, `tuhfa-exam-1`, `random-exam-prefs`, `random-exam-current`, `khayr-history-v1`) are neither read nor deleted, and a `khayr-legacy` payload pasted into import is rejected with the "not a valid backup" message. No migration code exists.

### What was checked and found correct

- **Every page, 390 × 844 and 1280 × 800, Chromium:** no console errors, no page errors, no failed or 4xx requests (missing fonts are not referenced, so no 404 and no failed precache), no horizontal scroll, `lang="ar" dir="rtl"`, one `h1`, heading order sane, `main`/`nav`/`footer` landmarks, 0 CSP violations, no external request at all (analytics token empty).
- **Offline:** after the first visit all 12 canonical URLs plus `?source=pwa`, `exam/index.html?id=…&x=1`, an unknown path (→ 404 page) open and reload offline; grading offline persists; the offline banner shows. Precache = `dist/` minus `CNAME`, `robots.txt`, `sw.js`, `LICENSES/README.md`; all 76 hashes match the files.
- **Update:** two tabs get «يتوفر تحديث»; nothing reloads before the tap; after «حدّث الآن» each tab reloads exactly once; old cache removed; state kept; works offline on the new build. A stale file behind a proxy: the new worker never reaches `waiting`, is retried once after 5 s, the old build keeps serving online and offline, and installs once the proxy is fixed.
- **Persistence (reload and full browser restart with a persistent profile):** exam round, grades, revealed answers, rolled random number; random-exam sources, size, ranges, the same set, position and «تابعتَ من حيث توقفت»; plan reps, checkboxes, mistakes; history. Exam resume scrolls the first ungraded question into view. Only `khayrukum.theme` in localStorage; only the `khayrukum` database; only `khayr-app-<hash>` in Cache Storage.
- **Random exam:** 31 sets inspected (765 questions): no duplicate in any run, all 24 (source, type) pairs of the three exams occurred, one adjacent same-source-and-type pair in 750. Range selects offer only 1–74 and 1–61; «من» above «إلى» moves the other; quick ranges per rub' and per chapter with the matching one pressed; a narrow range drops questions whose answers leave it and keeps generated numbers inside it; no-source and empty states disable «اختبار جديد ↻»; results screen and hub card texts match RND-09 / HUB-03.
- **Plan:** tap rules, Friday done state, mistakes (escaped, tombstoned), Saturday banner on a Saturday with Friday activity (clock mocked), confirmation text, advance, weak-week banner, map counts, short day names under 360 px.
- **History:** events from all three exams and the random exam; filter chips; tiles; clear-with-confirmation keeps exam attempts.
- **Storage blocked:** warning shown once per page; exam, random and plan work in memory.
- **Hints:** WhatsApp UA → in-app hint, dismissible; iOS 26 and iOS 17 UAs → their own install steps; «لاحقًا» persists.
- **Accessibility (hand-rolled audit, both themes, 11 pages, with graded and revealed states):** 0 text-contrast failures (4.5:1, 3:1 large), 0 controls without an accessible name, no duplicate ids, no dangling `aria-controls` / `aria-labelledby`; Tab order follows reading order; exam round tabs work with ArrowLeft / ArrowRight / Home / End (RTL-correct); reveal and grade work with Enter / Space and keep focus; a `prefers-reduced-motion` rule exists. Exceptions: m2, m3.
- **Audio-off behaviour:** no play control on the Tuhfa exam or the listening page, «الاستماع قريبًا إن شاء الله», hub tail «· الصوت قريبًا», settings has no audio section, abyat 26 / 28 / 57 carry «قيد المراجعة».
- **Audio engine and download-all** on a local audio build: see (d).

---

## (c) Requirements not tested here, and why

| Requirement | Why |
|---|---|
| NFR-BRW-01, TST-50 (M-01…M-11), AUD-16, HUB-07 iOS steps, HUB-08 | Need a real iPhone and Android phone (silent switch, lock screen, background audio, home-screen app storage, install flow). |
| WebKit and Firefox runs (TST plan §10) | Browsers are not installed for Playwright in this sandbox. Everything above is Chromium only. |
| NFR-A11Y-01 / TST-13 (axe-core) | `axe-core` is not installed and the npm registry was unreachable (`npm install` failed with a network error). Replaced by the hand-rolled audit above, which is narrower than axe. |
| NFR-TYP-01, NFR-PERF-05, M-11 | The 8 WOFF2 files are not supplied. With this sandbox's fallback font, Chromium leaves gaps where it lacks Uthmani glyphs (e.g. the small high meem in «أَلِيمٌۢ» in 2:10). No layout overflow results. How real phones render it cannot be judged here. |
| NFR-PERF-01, -02, -04; DATA-43 | Lighthouse, transfer size to `load`, and the 20,000-event timing / pruning test were not run. Not reached. |
| TST-24, audio parts | "A tab that is playing defers the reload", "audio cache survives the update" and "stale audio entries are removed" were not automated. Not reached. |
| AUD-06, AUD-10 blob fallback on a non-seekable range, AUD-11, AUD-13, AUD-14 (Media Session), AUD-15, LIS-03 chapter highlight | Not tested. Not reached. |
| TST-35 (check-audio on synthetic bad files), AUD-30 §5.x fixture collections (`quran`, `lesson`), LIC-22 | Not written. Not reached. |
| NFR-PRV-03 / TST-27 with GPC / DNT | The analytics token is empty, so the beacon never loads; the DNT/GPC branch was not exercised with a dummy token. |
| TST-26 installability (`beforeinstallprompt`) | Does not fire in headless Chromium. |
| DEP-01…07, IA-07 | Owner / DNS / hosting actions. |
| PL-10/11 full ten-week run, PL-12 (m14), HIS-04 strengths, HIS-05 over 30 items, HIS-10 with a truly retired qid | Only partly exercised by hand; no dedicated test. |

---

## (d) Tests added

All under `tests/`. `npm run test:unit` and `npm run test:e2e` pick them up without changing `package.json`.

| File | Covers | Status |
|---|---|---|
| `tests/lib/tanzil.mjs` | Independent Tanzil parser and reference resolver (shares no code with `refs.js` or `tools/`) | helper |
| `tests/unit/quran-integrity.test.mjs` | Tanzil parses to 6236 verses; `002.json` byte-equal; Tuhfa byte-equal to its source; every reference in `site/data` resolves and the app's resolver output is an exact substring of the claimed verse | 4 / 4 pass |
| `tests/unit/content-findings.test.mjs` | Baseline phrase ↔ resolved text for all 514 alignment rows; overrides present in data with reasons; «البقرة N» notes ↔ refs; `pages` questions against Tanzil's page table; `next` / `topic-end` / `next-bayt` / `complete-hemistich` / `chapters` adjacency | 2 pass, **2 fail** (M1, M2) |
| `tests/e2e/update.test.mjs` | **TST-24** (two tabs), **TST-24b** (stale file behind a proxy), same-hash failed install | 2 pass, **1 fail** (M4) |
| `tests/e2e/extension.test.mjs` | **TST-30**: `baqarah-3` fixture (refs only) in a temp copy of `site/` appears on the hub, in the random exam with rub' 5 and 6 quick ranges, and in history | 1 / 1 pass |
| `tests/e2e/audio.test.mjs` | **TST-21** a–e: `play()` synchronous in the tap, one media element, per-bayt files, pause/resume; selection ascending with measured `ended → playing` gaps of 17 and 16 ms (limit 300), stop on last, loop restarts; rate / pitch / loop persist; early-end recovery from a blob; touch drag on the seek bar does not scroll, previews, seeks on release, RTL keys. **TST-25**: size, progress, «أوقف», leaving the page stops the download, resume requests only missing files, done state on settings / listen / hub, delete with confirmation, short-quota message | 6 / 6 pass locally. **Skipped when `local-audio/` is absent** (so skipped in CI). Builds and removes `dist-tst-audio`. |
| `tests/e2e/persistence.test.mjs` | Reload + browser-restart persistence for exam, random, plan, history; legacy keys ignored; offline for every URL with precache completeness and "no audio file in dist"; IA-05; every rendered Quran fragment against Tanzil | 4 pass, **1 fail** (m6) |
| `tests/e2e/findings.test.mjs` | One regression test per defect: M3, M5, m1, m2, m3, m4, m5 | **7 fail** (by design until fixed) |

Totals: unit 29 (27 pass, 2 fail); e2e 34 (24 pass, 9 fail, 1 skip). The 11 failures map one-to-one to M1–M5 and m1–m6.
TST-21 uses real media with `play()` and element creation instrumented, not a fake-media harness. TST-24's audio-specific clauses are not covered.

---

## (e) Quran text integrity

Source of truth: `scratchpad/tanzil/quran-uthmani.txt` (6236 verses). `data/source/quran-uthmani.txt` in the repo is byte-identical to it (`cmp`).
The repo's alignment tool was not used; checks were done with `tests/lib/tanzil.mjs` and separate scripts.

| Check | Count | Mismatches |
|---|---|---|
| Verses of Al-Baqarah in `site/data/quran/002.json` vs Tanzil, byte for byte (basmala separated, notice present) | 286 | **0** |
| Tuhfa hemistichs in `abyat.json` vs `tuhfa-tashkeel.json`, byte for byte | 122 | 0 |
| References in `site/data/**` (exams, summaries, tips, inline tokens, chains, rub' openings): app resolver vs independent resolver, and exact substring of the verse / hemistich the reference names | 798 (554 Quran, 244 Tuhfa) | **0** |
| Quran fragments actually rendered in the DOM (three exams, every round, every answer opened; plan review items) vs Tanzil verses | 491 | **0** |
| Alignment-table rows: baseline phrase vs the text the ref resolves to (own consonant-skeleton comparison) | 514 | 510 agree. 4 differ: 1 by design (`2:21:1-1`: «يا» is one Uthmani token with «أيها», DATA-01); 1 documented override (`2:35:9-11`, word order); **2 wrong** (`t:10:2:2`, Tuhfa — M1) |
| Verse label «البقرة N» vs reference | 15 labelled quran-to-tuhfa prompts | **1 wrong** (M2: text of 2:62 labelled 38) |

**Result: no Quran text in the product differs from Tanzil by a single byte, and every Quran phrase is an exact substring of the verse its reference names.** One Quran phrase is labelled with the wrong verse number (M2). No Quran text was typed in any test.

The 6 manual overrides:

| Override | Ref | Verdict |
|---|---|---|
| `baqarah-1/summary/1.1` «أولئك هم المفلحون» | `2:5:-3` | Correct; adds the «وَ» the verse has. |
| `baqarah-2/lookalikes/02` «شئتما رغدا» | `2:35:9-11` | Correct; shows the real order «رَغَدًا حَيْثُ شِئْتُمَا», and the tip explains it. |
| `tuhfa/quran-to-tuhfa/02` «ومن يقول» | `2:8:3-4` | Correct; «مَن يَقُولُ» is the nun-sakinah + ya example. |
| `tuhfa/codes/04` «اللام والراء» | `t:12:2:2-3` | Correct; quotes the bayt's «اللَّامِ وَالرَّا». |
| `tuhfa/codes/03` «ينمو» | `t:10:2:2` | **Wrong** — resolves to «بِغُنَّةٍ»; should be word 3 (M1). |
| `tuhfa/summary/2.2` «ينمو» | `t:10:2:2` | **Wrong** — same ref (M1). |

Question quality: all 206 questions were rendered and read. 98 were verified by program against Tanzil's page table and
verse / bayt order (16 pages, 25 next, 15 topic-end, 13 next-bayt, 18 complete-hemistich, 11 chapters): all correct.
The 19 repeated-word questions' occurrence counts, the «وَإِذْ» count of 12 in 2:44–74, the 2:123 and 2:171 cross-references,
and the tajweed rule named for each of the 16 quran-to-tuhfa prompts were checked by hand against the text: correct apart from M1 and M2.
No ask line or round title gives away an answer. At least two «عمّ يتحدث هذا البيت؟» prompts contain the rule's name in the hemistich shown
(questions 1 and 4; e.g. question 1 shows «وَالثَّالِثُ الْإِقْلَابُ…» and the answer is the iqlab rule); this is inherited from the baseline.
`baqarah-1/pages/01` and `baqarah-1/topic-end/01` have the same prompt and answer under different asks.

---

## Resolution (after the report)

Fixed in the commit that adds this report; every regression test above now passes (unit 29/29, e2e 33 pass + 1 skip for axe-core).

| Finding | Fix |
|---|---|
| M1 | Override ref corrected to `t:10:2:3` («بِيَنْمُو»). |
| M2 | Label corrected to «البقرة ٦٢» through `patches.json`; listed in the porting log. |
| M3 | `refsText` now uses `parseRef` (verse / bayt number). |
| M4, m11 | The install handler never deletes a cache that existed before it started; deploy builds use `SOURCE_DATE_EPOCH` (commit time), so a re-deploy of the same commit is byte-identical. |
| M5 | `checkKvValue` validates the shape of every `kv` value on import; a bad backup is refused. |
| m1 | Random-number snapshot uses Arabic-Indic digits. |
| m2 | Theme buttons only (`button[data-theme]`). |
| m3 | Focus ring on the visible label of the file chooser. |
| m4 | Trailing pause marks trimmed from the slip line. |
| m5 | «سجلي» shows the Quran / Tuhfa notes for the sources it lists. |
| m6 | The service worker redirects «/plan» to «/plan/». |
| m8 | «حرفًا», «إلى آخر المثلين», «إلى أدناه», «سنة النظم الهجرية». |
| m10 | «عن الموقع» says «التسجيلات الصوتية» instead of «التلاوة». |
| m14 | Changing the pair clears the review ticks of the old pair. |

Left open: m7 (single unvocalized words outside tokens), m9 (version digits — identifier), m12 (font licence texts, owner item), m13 (not reachable by a person).
