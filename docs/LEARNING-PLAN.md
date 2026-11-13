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
| 5 | تدريب المتشابهات | Two similar verses side by side with the difference marked, then «which is in verse N?» | app | **waits for a verified source** of mutashabihat (owner, 2026-11-11); not built from the exam pairs alone | on hold |
| 6 | خريطة الصفحة | «Which page? top, middle or bottom?» as multiple choice | app | none (page table) | **done** (Quran exams: page among four near pages + first verse / last verse / in between, from the Tanzil page table; both right = صحيح, one = متردد) |
| 7 | الربط بالمعنى | A topic title per passage, and «what comes after the story of …?» | app | **waits for a verified source** of topic divisions (owner, 2026-11-11); not built from the exam summaries | on hold |
| 8 | التسميع الصوتي | Recite aloud; the app follows and marks slips | app | speech recognition — separate project | later |

## Self-grading

Most current questions are graded by the reader. Three things reduce the weakness of that:

1. More questions the app corrects itself (steps 0, 4, 5, 6, 7).
2. Spaced repetition (step 1): a verse marked «صحيح» too generously comes back and is missed later, so the schedule corrects itself.
3. The history tags questions corrected by the app «مُصحَّح آليًّا» (done). A side-by-side comparison of the two kinds is still to do.

## Beyond Al-Baqarah: general titles and structure

The app covers the whole Quran, so nothing a reader sees should assume Al-Baqarah (owner's request, 2026-11-11).

Done (before launch):
- Exam titles are numbered by the mushaf's rub's, the verses below: «اختبار ٣ · الربعان ٥–٦», «البقرة ٧٥–١٠٥ · ص ١١–١٦».
  The random exam's source chips and question tags use the same names.
- Home page section «اختبارات الحفظ»; plan «خطة التثبيت» («… مع مراجعة ما سبق»).

Kept on purpose:
- Internal exam ids (`baqarah-3`) stay: they key saved progress and history, and readers do not see them
  (except in the address bar). Revisit only if a reason appears.
- Questions and ranges name the sura where it is a fact: «اقرأ الآية رقم ٧ من سورة البقرة», «نطاق الحفظ: سورة البقرة».

To do with the second sura:
- Plan for any range of rub's (Al-Baqarah becomes the first preset); `plan:baqarah` key migrated.
- Random exam range by sura + verse (or juz'/hizb/rub'); refs carry the sura; Quran file per sura loaded on demand.
- Home page grouped by juz' once there is more than one.

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
