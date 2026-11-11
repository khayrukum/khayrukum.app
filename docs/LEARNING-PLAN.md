# خطة «أسئلة تُحفِّظ» — Learning features roadmap

The exams so far *measure* memorisation and rely on the reader grading himself. This plan adds
features that *build* memorisation, and question kinds the app can correct by itself.
One step at a time; each step ships on its own.

| # | Step | What it is | Corrected by | New content needed | Status |
|---|---|---|---|---|---|
| 0 | «ما رقمها؟» | Multiple choice: the verse / bayt is shown, pick its number among four close numbers | app | none | **done** (random exam) |
| 0 | Balanced random exam | Every selected source gets an equal share of the questions | — | none | **done** |
| 1 | المراجعة المتباعدة «وِرد اليوم» | Questions answered wrong come back tomorrow, then after 3 days, a week, a month | as the question | none (uses the history) | **done** (`random/?due=1`, `core/srs.js`: steps 1, 3, 7, 16, 35 days) |
| 2 | أول حرف من كل كلمة | The verse is shown as first letters only; recite from them | reader | none (generated from the text) | **done** (round «أوائل الحروف» in every exam: ten per batch, tap a letter for its word, a non-«صحيح» grade brings it back) |
| 3 | الإخفاء التدريجي | The verse is shown in full, then words disappear step by step | reader | none (generated) | **done** (round in every exam: verses in order, five per batch, four steps of a quarter each, the first word stays, tap a hidden word to see it) |
| 4 | رتّب الآيات | Four or five shuffled verses to put in order | app | none (generated) | **done** (round in every exam: four consecutive verses shown by their opening words, tap in order, checked by the app; five groups per batch, a missed group comes back) |
| 5 | تدريب المتشابهات | Two similar verses side by side with the difference marked, then «which is in verse N?» | app | uses the existing «المتشابهات» rounds; more pairs need review | next |
| 6 | خريطة الصفحة | «Which page? top, middle or bottom?» as multiple choice | app | none (page table) | |
| 7 | الربط بالمعنى | A topic title per passage, and «what comes after the story of …?» | app | **yes — titles must be written and reviewed** | |
| 8 | التسميع الصوتي | Recite aloud; the app follows and marks slips | app | speech recognition — separate project | later |

## Self-grading

Most current questions are graded by the reader. Three things reduce the weakness of that:

1. More questions the app corrects itself (steps 0, 4, 5, 6, 7).
2. Spaced repetition (step 1): a verse marked «صحيح» too generously comes back and is missed later, so the schedule corrects itself.
3. The history tags questions corrected by the app «مُصحَّح آليًّا» (done). A side-by-side comparison of the two kinds is still to do.

## Beyond Al-Baqarah: general titles and structure

The app covers the whole Quran, so nothing a reader sees should assume Al-Baqarah. To do before the
second sura gets an exam (owner's request, 2026-11-11):

| Where | Today | Target |
|---|---|---|
| Exam titles (`data/exams/index.json`) | «اختبار ٣ · البقرة ٧٥–١٠٥» | Numbered by the mushaf, not the sura: «الحزب ٣ · الربعان ٥–٦» with the verses as the subtitle («البقرة ٧٥–١٠٥»). An exam that crosses two suras names both («البقرة ٢٥٣ – آل عمران ١٤»). |
| Exam ids | `baqarah-3` | `rub-05-06` (by rub'), with the old ids kept as aliases so saved progress and history still match. |
| Home page | section «اختبارات البقرة» | «اختبارات الحفظ», grouped by juz' once there are more than one |
| Plan | «خطة تثبيت البقرة», `plan:baqarah` | «خطة التثبيت» for any range of rub's the reader chooses; Al-Baqarah becomes the first preset |
| Random exam | «نطاق سورة البقرة (الآيات)», «البقرة كلها», «اقرأ الآية رقم ٧ من سورة البقرة» | Range by sura + verse (or juz'/hizb/rub'), shortcuts per rub', the question names the sura |
| Code | refs built as `2:${n}`, one Quran range family `quran2`, the page table filtered on sura 2 | refs carry the sura; ranges are «sura:verse» pairs; the Quran file per sura is loaded on demand |
| «عن التطبيق» | «يبدأ المحتوى بسورة البقرة …» | keep, it is a fact about the content |

Data stays as it is (refs already carry the sura: `2:75`), so this is mostly titles, ids and the range picker.

## Daily reminders (owner's request, 2026-11-11)

A daily reminder of the day's wird: new memorisation, consolidation (the plan's repetitions) and review
(«وِرد اليوم», with the number due). The app has no server and works offline, which decides how:

| Stage | How | Reach | Notes |
|---|---|---|---|
| B — Android, installed app | Periodic Background Sync + a local notification with today's count | Chrome on Android only, roughly daily, not at an exact minute | best effort; iOS has no equivalent for a web app |
| C — the Android and iOS apps | Local scheduled notifications (Capacitor), computed on the device: «في وِردك اليوم ٧ أسئلة، وتكرار الربعين ١٢ من ٢٠» | both platforms, exact time, offline | the real solution; part of the native apps milestone |
| (D — optional) | Web Push from a small server | all installed web apps incl. iOS 16.4+ | needs a server and storing a push subscription per device: only with accounts/sync, and stated in the privacy policy |

Settings: on/off, time of day, which parts (new memorisation / consolidation / review). Off by default.

Decision (owner, 2026-11-11): no calendar workaround. Reminders wait for real notifications (stage B, then C).
