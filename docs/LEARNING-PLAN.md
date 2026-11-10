# خطة «أسئلة تُحفِّظ» — Learning features roadmap

The exams so far *measure* memorisation and rely on the reader grading himself. This plan adds
features that *build* memorisation, and question kinds the app can correct by itself.
One step at a time; each step ships on its own.

| # | Step | What it is | Corrected by | New content needed | Status |
|---|---|---|---|---|---|
| 0 | «ما رقمها؟» | Multiple choice: the verse / bayt is shown, pick its number among four close numbers | app | none | **done** (random exam) |
| 0 | Balanced random exam | Every selected source gets an equal share of the questions | — | none | **done** |
| 1 | المراجعة المتباعدة «وِرد اليوم» | Questions answered wrong come back tomorrow, then after 3 days, a week, a month | as the question | none (uses the history) | **done** (`random/?due=1`, `core/srs.js`: steps 1, 3, 7, 16, 35 days) |
| 2 | أول حرف من كل كلمة | The verse is shown as first letters only; recite from them | reader | none (generated from the text) | next |
| 3 | الإخفاء التدريجي | The verse is shown in full, then words disappear step by step | reader | none (generated) | |
| 4 | رتّب الآيات | Four or five shuffled verses to put in order | app | none (generated) | |
| 5 | تدريب المتشابهات | Two similar verses side by side with the difference marked, then «which is in verse N?» | app | uses the existing «المتشابهات» rounds; more pairs need review | |
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
