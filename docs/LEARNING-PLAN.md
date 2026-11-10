# خطة «أسئلة تُحفِّظ» — Learning features roadmap

The exams so far *measure* memorisation and rely on the reader grading himself. This plan adds
features that *build* memorisation, and question kinds the app can correct by itself.
One step at a time; each step ships on its own.

| # | Step | What it is | Corrected by | New content needed | Status |
|---|---|---|---|---|---|
| 0 | «ما رقمها؟» | Multiple choice: the verse / bayt is shown, pick its number among four close numbers | app | none | **done** (random exam) |
| 0 | Balanced random exam | Every selected source gets an equal share of the questions | — | none | **done** |
| 1 | المراجعة المتباعدة «وِرد اليوم» | Questions answered wrong come back tomorrow, then after 3 days, a week, a month | as the question | none (uses the history) | next |
| 2 | أول حرف من كل كلمة | The verse is shown as first letters only; recite from them | reader | none (generated from the text) | |
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
3. The history separates «مُصحَّح آليًّا» from «تقييم ذاتي» (to do with step 1), so the reader sees where the two disagree.
