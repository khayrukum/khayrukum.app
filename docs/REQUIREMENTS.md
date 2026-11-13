# «خيركم من تعلّمه» (Khayrukum) — Website Requirements

> v2.1 (2026-11-07): added §5.x multi-collection audio (Quran recitation and lessons from the same reciter).

| | |
|---|---|
| Product | khayrukum.app: Quran memorization and Tuhfat al-Atfal review tools for a study group |
| Version | **v2 · 2026-11-07** |
| Changelog | **v2**: applied the independent review (REVIEW.md); every finding's disposition is in Appendix A. Rebuilt the content-reference model (B1) and added hash-verified precache (B2). Migration of old progress moved out of v1 (M1). Added launch fallbacks for audio and Tuhfa verification (M5). Open questions are now decisions plus a short list of pending owner decisions (M9). **v1**: initial draft. |
| Baseline | The hand-built pages in `scratchpad/project/reference/` (hub, plan, exam-1/2, random, history, tuhfa-exam, tuhfa-listen). Section 3 lists every behaviour v1 must keep from them. |
| Keywords | **MUST** = required for v1 release. **SHOULD** = expected in v1; skipping one needs a written reason. **LATER** = a later phase, listed only to set architecture constraints. |
| Requirement IDs | `AREA-NN`. IDs are stable and never renumbered. Retired IDs are marked ~~struck through~~. |

---

## 0. Decisions recorded in this version (v2)
These are settled defaults. The owner may overturn any of them, but none blocks building.

| ID | Decision |
|---|---|
| D-1 | Quran text is shown only in Uthmani script with full tashkeel in v1, from Tanzil Uthmani. There is no plain-text mode. Tanzil also publishes a Simple-Clean (undiacritized) edition under the same license, so a plain mode would be allowed by the license. It is excluded only by the owner's rule. |
| D-2 | `full.mp3` is kept for gapless whole-poem playback. Total audio is about 31.7 MB. |
| D-3 | Page numbers follow the Madinah Mushaf (Hafs, 604 pages), as the baseline already states («مصحف المدينة»). |
| D-4 | Plan weeks advance only when the member confirms. On Saturdays the plan suggests confirming (PL-15). Weeks never advance automatically. |
| D-5 | Code is licensed MIT. Content and audio are not covered by MIT: the Quran text keeps Tanzil's terms, the recitation is all rights reserved to its owner and used with permission, and other content is © the project. |
| D-6 | Moving progress from the old artifact pages is **not in v1**. Everyone starts fresh (section 4.10). In-app backup export/import is in v1 (SET-04). |

---

## 1. Purpose, users, scope

### 1.1 Purpose
Help a small group memorize Surat Al-Baqarah gradually, two rub' per week, and review the tajweed poem «تحفة الأطفال» (61 abyat in 10 chapters). The site provides:
- self-graded exams;
- a weekly consolidation plan;
- one personal history across all tools;
- listening with repeat, using verified texts and the recitation of الشيخ أحمد مهدي.

Everything works offline on a phone.

### 1.2 Users
- **Member (primary).** An Arabic speaker on an iPhone or Android phone, often not technical. Members open links shared in WhatsApp groups. They study alone or in pairs, where one holds the mushaf and asks and the other recites. Sessions are short and often offline.
- **Friday partner.** Uses the same exams to examine a member. No separate role exists.
- **Content maintainer (owner).** Edits data files in the GitHub repo to add exams or fix texts. Knows basic Git, not front-end development.

### 1.3 v1 scope
1. Feature parity with the baseline pages (section 3), each at one canonical URL on khayrukum.app.
2. One history and progress store for all tools. This fixes two baseline problems: the Tuhfa history lived in a separate origin, and the same question type appeared under two names.
3. Content separated from code. Quran text comes from a verified source. Tuhfa text, questions, chapter and page boundaries, and audio timing are data files with schemas.
4. An installable PWA that works fully offline after the first visit, with an option to download all audio.
5. Settings: theme, audio storage, and backup export/import.
6. «عن الموقع» and «الخصوصية» pages.
7. Automated checks: data validation, Quran checksum, audio content check, and Playwright functional, offline, layout and accessibility tests.

### 1.4 Later phases (not in v1)
| Phase | Content | Constraint on v1 |
|---|---|---|
| 1.1 | Exam 3 (rub' 5–6, Baqarah 75–105) and later exams | Adding an exam is data only (DATA-20, TST-30). |
| 1.x (only if the owner asks) | Moving progress from the old artifacts (section 4.10) | Backup import format (DATA-60) |
| 2 | Android/iOS store apps via Capacitor; local reminder notifications | ARCH-01…06 |
| 3 | Optional accounts and local-first sync | Event and kv merge rules (DATA-40…44) |
| 3 | Record your recitation and send it | Audio and platform adapters (ARCH-03/04) |
| 4 | New exam types: fill the missing word, order the verses, match look-alikes, timed challenge, spaced repetition | Type registry (ARCH-02); per-question event log (DATA-40) |
| 5 | On-device recitation checking; audio never leaves the device | ARCH-03 |

Never in scope without an explicit owner decision: ads, tracking, third-party login, server storage of results.

### 1.5 Architecture constraints for later phases
- **ARCH-01** MUST: Every link and asset URL is built by one base-path helper and is relative to the site root. JS never contains the site origin. The only exceptions are canonical `<link>` tags and share text, and share text lives in `strings.ar.js`, which is exempt from the grep test.
  - *AC:* the site runs unchanged from `http://localhost:8080/`, from the Capacitor origins (`https://localhost` on Android, `capacitor://localhost` on iOS), and from a sub-path.
- **ARCH-02** MUST: Each question type is a module in a type registry. A module provides `render(question)` and `answerView(question)`, and declares `gradable` for each context (exam or random; DATA-23). Exams, the random exam and history reach types only through the registry.
  - *AC:* a fixture type can be added without editing any page code outside the registry.
- **ARCH-03** MUST: All playback goes through `audio.js`, which exposes `play(item)`, `pause`, `resume`, `seek`, `setRate`, `setLoop`, `playSequence(items)` and events. A native plugin can replace it later.
- **ARCH-04** MUST: Clipboard, file save and open, share, the install prompt and the persistent-storage request all go through `platform.js`, with feature detection.
- **ARCH-05** MUST: The app works without service workers (Capacitor on iOS, Firefox private mode). Only offline caching is lost.
- **ARCH-06** MUST: No v1 feature depends on a server. Cloudflare Web Analytics is optional and fails silently.
- **ARCH-07** MUST: All JS modules are imported statically from each page's entry module; dynamic `import()` is not used. This keeps a page's code set fixed for the life of the page, which supports OFF-10.

---

## 2. Information architecture and URLs

### 2.1 Canonical URLs
| Path (canonical) | Arabic title | Replaces |
|---|---|---|
| `/` | «خيركم من تعلّمه» | hub-index.html |
| `/plan/` | «خطة تثبيت البقرة» | plan.html |
| `/exam/?id=baqarah-1` | «اختبار ١ · البقرة ١–٤٣» | exam-1.html (and older `baqarah-exam-public*` copies) |
| `/exam/?id=baqarah-2` | «اختبار ٢ · البقرة ٤٤–٧٤» | exam-2.html |
| `/exam/?id=tuhfa` | «اختبار تحفة الأطفال» | tuhfa-exam.html (separate artifact today) |
| `/random/` | «الاختبار العشوائي» | random.html |
| `/history/` | «سجلي» | history.html |
| `/listen/` | «استماع تحفة الأطفال» | tuhfa-listen.html (separate artifact today) |
| `/settings/` | «الإعدادات» | new |
| `/about/` | «عن الموقع» | new |
| `/privacy/` | «الخصوصية» | new; also the store privacy-policy URL in phase 2 |
| `/404.html` | «الصفحة غير موجودة» | new |

- **IA-01** MUST: Each tool has exactly one canonical URL. All exams share the page `/exam/` and pick their content by `id` (DATA-20).
  - The `<link rel="canonical">` for `/exam/` is set by JS per `id`. Crawlers may ignore a canonical set by JS; this is accepted.
  - Variants are rewritten to the canonical form with `history.replaceState`. Examples: `/exam/index.html?id=baqarah-1`, `/exam/?id=baqarah-1&x=1`.
  - *AC:* a variant URL shows the same state as the canonical URL, and the address bar shows the canonical URL.
- **IA-02** MUST: Tool state is keyed by logical ID, never by URL.
- **IA-03** MUST: An unknown or missing `id` shows «لم نجد هذا الاختبار» with a link to the hub. An exam with status `soon` shows «هذا الاختبار لم يُنشر بعد».
- **IA-04** MUST: Every page except `/` has a home link «→ خيركم من تعلّمه» at the top. Every footer links to «الإعدادات», «عن الموقع» and «الخصوصية».
- **IA-05** MUST: Directory URLs end in `/`.
- **IA-06** SHOULD: `/exam/?id=…#q=<qid>` opens that question's round and scrolls to the question.
- **IA-07** MUST: `www.khayrukum.app` redirects to the apex domain (DEP-04).

### 2.2 Hub sections (order, with card sub-lines)
1. Header:
   - group icon;
   - «خيركم من تعلّمه»;
   - «خيركم من تعلّم القرآن وعلّمه» followed by «رواه البخاري»;
   - «حفظ وتثبيت المصحف ربعًا ربعًا، ومراجعة التجويد».
2. «اختبار شامل»:
   - «الاختبار العشوائي», with «أسئلة مختلطة من جميع الاختبارات، تتغيّر في كل مرة»;
   - «سجلي», with «نقاط قوّتك، وما تحتاج إلى مراجعته، وجميع إجاباتك».
3. «الخطة»: «خطة تثبيت البقرة», with «ربعان في الأسبوع يُكرَّران ٢٠ مرة، مع مراجعة بقية السورة».
4. «اختبارات البقرة»:
   - one card per published Baqarah exam, built from `index.json`, with its `card` sub-line (e.g. «الربعان الأول والثاني · ص ٢–٧»);
   - the line «الاختبار القادم: <card>» for each exam with status `soon`, hidden when there is none.
5. «التجويد»: «اختبار تحفة الأطفال», with «المتن كاملًا · ٦١ بيتًا · مع تلاوة كل بيت». The tail «مع تلاوة كل بيت» is replaced by «· الصوت قريبًا» while audio is disabled (AUD-40).
6. «للاستماع والتكرار»: «استماع تحفة الأطفال», with «كل باب أو كل بيت على حدة، مع التكرار».
7. Footer (IA-04).

---

## 3. Functional requirements

### 3.0 Global (GEN)
- **GEN-01** MUST: All visible text is فصحى.
  - *AC:* the content lint passes (TST-12).
  - Today `random-data.json` contains colloquial text (e.g. «كمّل بعد الآية», «البيت ده عن إيه؟», «وإنت تقول أول اللي بعدها»). It is replaced by the فصحى wording of the exam pages.
- **GEN-02** MUST: UI strings live in `assets/js/strings.ar.js` or in data files.
  - Exception: static `<title>` and `<h1>` in HTML. TST-12 checks that they equal their entries in `strings.ar.js`.
- **GEN-03** MUST: Numbers use Arabic-Indic digits with no grouping, through one formatter (`Intl.NumberFormat('ar-EG',{useGrouping:false})`). Decimals use «٫», e.g. «٠٫٥×». Percentages use «٪». Dates use Arabic names (`ar-EG`, Gregorian).
- **GEN-04** MUST: Every page has `<html lang="ar" dir="rtl">`. Arrows follow the reading direction: «التالي ←» and «→ السابق».
- **GEN-05** MUST: If storage is unavailable, each page shows this warning once, and the tools still work in memory: «هذا المتصفح لا يسمح بحفظ تقدّمك، فستبدأ من جديد في كل مرة. افتح الرابط في Safari أو Chrome العادي (لا التصفح الخفي) ليُحفَظ تقدّمك.»
- **GEN-06** SHOULD: Inside a known in-app browser (WhatsApp, Instagram or Facebook user-agent markers), the hub shows a dismissible hint: «للحفظ والعمل دون إنترنت، افتح الرابط في المتصفح». Dismissal is stored in `ui:inapp`.
- **GEN-07** MUST: Destructive actions that erase more than one item ask for confirmation inline, never with `window.confirm`. Inline confirmation means a «امحُ…» button paired with «تراجع». Two single-item actions are exempt, as in the baseline:
  - deleting one plan mistake («×»);
  - clearing the listening selection («امحُ»).
- **GEN-08** MUST: Every page states «يُحفَظ تقدّمك على هذا الجهاز فقط». In addition:
  - Pages that show Quran text add «المصحف هو المرجع عند أي شك».
  - Pages that show Tuhfa text add «فإن وجدت فرقًا عن نسخة المتن التي معك فنسختك هي المرجع، وأرسل إلينا لنصحّحه», with a `mailto:info@khayrukum.app` link. The link is prefilled with the page, the app version, and the bayt number of the item currently playing or last revealed, if there is one.
- **GEN-09** MUST: No horizontal page scroll at the widths and text sizes in NFR-A11Y-06.

### 3.1 Hub `/` (HUB)
- **HUB-01** MUST: The hub shows the sections in 2.2. Every card links within the site. External links appear only on «عن الموقع». `mailto:` links are allowed anywhere.
- **HUB-02** MUST: Each exam card, including the Tuhfa exam, shows a bar and «<graded> من <total> · <pct>٪ صحيح» once the current attempt has at least one grade.
  - `total` = questions in the exam's current data that are gradable in exam context (random-number is excluded).
  - `graded` counts only qids present in the current data.
  - `pct` = ok ÷ graded.
  - *AC:* grading 3 of baqarah-1's 59 questions, 2 of them ok, shows «٣ من ٥٩ · ٦٧٪ صحيح».
- **HUB-03** MUST: The random card shows «اختبار جارٍ: السؤال <i> من <n> · <d> مُقيَّم» while a set is unfinished, «آخر اختبار: <ok> صحيح من <n>» after a set is finished, and nothing when there is no set.
- **HUB-04** MUST: The history card shows «<n> إجابة · <pct>٪ صحيح · آخر مراجعة <when>». `<when>` is the weekday name if the last event was within 6 days, otherwise the date (e.g. «٣ نوفمبر»).
- **HUB-05** MUST: The plan card shows a bar and «هذا الأسبوع: <x> من ٢٠ مرة · <y> من ٢٠ ربعًا ثُبِّتت». `x` and `y` are defined by PL-03 and PL-08.
- **HUB-06** SHOULD: When all Tuhfa audio is cached, the listening card shows «الصوت محفوظ للعمل دون إنترنت ✓». (OFF-23 is merged into this requirement.)
- **HUB-07** MUST: When not running standalone, the hub shows an install card «أضِف الموقع إلى شاشتك الرئيسية». It can be dismissed for 30 days.
  - Android and Chromium: an install button driven by `beforeinstallprompt`.
  - iOS: written steps. The steps are kept in `strings.ar.js` for each iOS major version and chosen by the detected version. iOS 26 moved Share into the «•••» menu and added the «فتح كتطبيق ويب» toggle.
- **HUB-08** MUST: In iOS standalone mode with empty storage, the hub shows once: «إن كان لك تقدّم محفوظ في Safari فانقله من الإعدادات ← النسخ الاحتياطي». iOS keeps home-screen storage separate from Safari storage.
- **HUB-09** MUST: The hub shows «جاهز للعمل دون إنترنت» after precaching completes (OFF-03).
- ~~HUB-10~~ Merged into 2.2 item 4.

### 3.2 Plan `/plan/` (PL)
- **PL-01** MUST: The plan covers the 20 rub' of Al-Baqarah in 10 weeks. Week p covers rub' 2p−1 and 2p. Boundaries and opening phrases come from Quran metadata (DATA-11, DATA-13).
  - *AC:* week 1 = 1–25 and 26–43; week 10 = 272–282 and 283–286.
- **PL-02** MUST: The header shows:
  - «أسبوع التثبيت <p> من ١٠»;
  - the two opening phrases, each prefixed with «۞». The rub'-el-hizb sign from the source text is not rendered in labels (DATA-12).
  - the ring «<x> من ٢٠ مرة».
- **PL-03** MUST: Day tabs and repetitions.
  - Seven day tabs from السبت to الجمعة. Below 360 px they use short names (سبت … جمعة). Today's tab is selected on load and labelled «اليوم».
  - Targets are 3 per day from Saturday to Thursday («الصباح», «الظهر أو العصر», «الليل») and 2 on Friday («وحدك», «تسميع مع شريكك»).
  - Tapping repetition button j sets reps to j+1. Tapping an already-filled button j sets reps to j.
  - `x` = Σ min(reps[d], target[d]), with a maximum of 20.
  - A day is done when reps ≥ target and every one of that day's task checkboxes (`week.checks`) is ticked. A done day shows a dot on its tab and «أتممتَ يومك ✓» in its header.
- **PL-04** MUST: Saturday to Thursday each show:
  - the checkbox task «اقرأ موضع الربط بين الربعين مرة إضافية», sub-line «آخر صفحة من «…» وأول صفحة من «…»»;
  - «مرة واحدة على الأقل دون مصحف».
  Thursday also shows the hint about a slow night reading from the mushaf.
- **PL-05** MUST: Review section «المراجعة», tag «٣ أرباع».
  - Day d (Saturday to Thursday) shows items 3d to 3d+2 from the 18 rub' that are not in the current pair.
  - Each item is a checkbox showing the opening phrase in Quran typography and «الربع <n> · آية <a>–<b>».
- **PL-06** MUST: Friday shows «جلسة التسميع».
  - Three checkbox tasks:
    - «الربعان دون مصحف», sub-line «يعلّم شريكك على كل خطأ أو تردّد»;
    - «اختبار عشوائي», sub-line «يقرأ لك أول آية من أي موضع، وتكمل أنت نصف صفحة»;
    - «وتسمّع له أنت بالطريقة نفسها».
  - The question «هل كان التسميع متقنًا؟» with two chips, «نعم، خطأ أو خطآن» and «لا، يحتاج إلى عمل». A second tap on the selected chip resets the answer to none.
  - The note «بعد الجلسة سجّل الأخطاء في الأسفل، وابدأ بها يوم السبت».
- **PL-07** MUST: «أخطاء أراجعها», tag «تظهر يوم السبت».
  - Add a mistake with the text field (placeholder «مثال: آية ١٧٧ – ترتيب «والصابرين»») and «أضف».
  - «×» deletes one mistake (no confirmation, GEN-07).
  - Empty state: «لا توجد أخطاء مسجّلة.».
  - While the list is not empty, Saturday shows the task «ابدأ بأخطاء الأسبوع الماضي», sub-line = the mistakes joined by « · ».
  - Mistakes are stored as `{id, text, deleted, updatedAt}` (DATA-44) and rendered escaped.
- **PL-08** MUST: «خريطة التثبيت»: 20 cells, each showing the rub' number and its verse range.
  - States: «هذا الأسبوع», «ثُبِّت» and «قادم». «هذا الأسبوع» takes precedence when a cell qualifies for both.
  - Count «<y> من ٢٠ ربع», where y = 2 × |done| and `done` is the set of distinct completed pairs. This is the same y as HUB-05.
- **PL-09** MUST: «أتممتَ الأسبوع؟ ابدأ الأسبوع التالي» opens an inline confirmation:
  - text: «سيُسجَّل الربعان <a> و<b> مثبَّتَين، ويبدأ الأسبوع الجديد بالربعين <c> و<d>.»;
  - buttons: «ابدأ الأسبوع الجديد» and «تراجع».
  On confirm:
  - add the pair to `done`;
  - append `{pair, clean, endedAt}` to the plan history;
  - move to the next pair (10 wraps to 1);
  - reset the week;
  - select Saturday.
- **PL-10** MUST: If the last recorded week was marked «لا، يحتاج إلى عمل», show a banner suggesting the same pair be repeated (see PL-12).
- **PL-11** MUST: After all 10 pairs are done, show «الحمد لله، أتممتَ تثبيت سورة البقرة كلها…» and hide the next-week button.
- **PL-12** MUST: «الإعدادات» (a disclosure) contains a selector for the active pair. Changing the pair keeps the mistakes list.
- **PL-13** MUST: The 4 baseline rules are shown at the bottom.
- **PL-14** MUST: The plan structure comes from `data/plan/baqarah.json` (DATA-30).
- **PL-15** MUST (D-4): Saturday suggestion.
  - When: today is Saturday, and the current week has any Friday activity (reps[6] > 0, or a Friday checkbox ticked, or `clean` set).
  - What: the banner «بدأ أسبوع جديد. إن أتممتَ أسبوعك فسجّله وابدأ التالي». Its button scrolls to and opens the PL-09 confirmation.
  - Dismissing it hides it until the next Saturday.
  - The week never advances without confirmation.

### 3.3 Exams `/exam/?id=…` (EX)
- **EX-01** MUST: The header shows the exam's title, its sub-line (e.g. «سورة البقرة · الآيات ١–٤٣ · من ص ٢ إلى ٧ في مصحف المدينة»), and the usage line «يصلح للمراجعة وحدك أو مع غيرك: يمسك السائلُ المصحف، ويجيب المُسمِّع. بعد كل سؤال اكشف الإجابة وقيّم نفسك.». The Tuhfa exam says «المتن» instead of «المصحف».
- **EX-02** MUST: The score line reads «نتيجتك: ✓ <ok> · متردد <mid> · ✗ <bad> · من <total> سؤال». It counts only the current data (HUB-02).
- **EX-03** MUST: Round tabs (`role="tablist"`) appear in data order.
  - Each gradable round shows «<graded>/<total>».
  - The tab bar is `position:sticky` at the top. It scrolls horizontally inside itself only. The selected tab is centred.
  - *AC:* at 375 px, after scrolling down 2000 px, the bar is still visible, and the document's `scrollWidth` equals its `clientWidth`.
- **EX-04** MUST: Baqarah rounds, with type IDs in brackets:
  - «قبل أن تبدأ» [summary]
  - «الصفحات» [pages]
  - «أكمل بعد الآية» [next]
  - «نهاية الموضوع» [topic-end]
  - «الكلمة المتكررة» [repeated-word]
  - «المتشابهات» [lookalikes]
  - «من وسط الآية» [mid-verse]
  - «السلسلة» [chain]
  - «رقم عشوائي» [random-number]
- **EX-05** MUST: Tuhfa rounds, with type IDs in brackets:
  - «قبل أن تبدأ» [summary]
  - «الأبواب» [chapters]
  - «أكمل البيت» [complete-hemistich]
  - «البيت التالي» [next-bayt]
  - «عمّ يتحدث هذا البيت؟» [bayt-topic]
  - «الرموز والحروف» [codes]
  - «من القرآن للتحفة» [quran-to-tuhfa]
  - «السلسلة» [chain]
  - «رقم عشوائي» [random-number]
- **EX-06** MUST: Each round shows its title and instruction from DATA-23. An exam's data may override them.
- **EX-07** MUST: «قبل أن تبدأ» renders the summary blocks (DATA-21): topic outline, page openings (derived from page metadata), look-alikes, and Tuhfa codes. It ends with «ابدأ الاختبار ←».
  - In the Tuhfa exam, each chapter line has «▶ استمع», which plays that chapter's clip. The button is hidden while audio is disabled (AUD-40).
- **EX-08** MUST: A question card shows «سؤال <i>», the optional ask line, and the prompt.
  - «…» is shown muted.
  - Quran fragments use Quran typography; Tuhfa fragments use the abyat style.
- **EX-09** MUST: «اكشف الإجابة» toggles the answer, and the button then reads «أخفِ». The answer lists its items (DATA-21), then the tip if there is one. Which questions are revealed is saved.
- **EX-10** MUST: The grade buttons «صحيح», «متردد» and «خطأ» use `aria-pressed`. They work whether or not the answer is revealed. Tapping the active grade clears it. History is written as in DATA-41. The card is tinted by its grade.
- **EX-11** MUST: In the Tuhfa exam, a revealed answer shows «▶ استمع إلى البيت» for the bayt of the answer's **first** bayt reference, as in the baseline. The revealed random bayt has the same button. While playing, the button reads «⏸ إيقاف». Only one item plays at a time. The button is hidden while audio is disabled.
- **EX-12** MUST: The random-number round is not graded in exam context.
  - Button: «اختر آية عشوائية» or «اختر بيتًا عشوائيًّا».
  - Shows a large number from the exam range, never the same number twice in a row, and «اقرأ الآية رقم <n>».
  - «اكشف» shows the verse or bayt.
- **EX-13** MUST: At the bottom, «→ <previous round>» and «الجولة التالية: <next round> ←». Both scroll to the round intro, below the sticky bar.
- **EX-14** MUST: On load, the last round is restored. If it has grades, the page scrolls to the first ungraded question (or the last question) and shows «تابعتَ من حيث توقفت: <k> من <n> مُقيَّمة في هذه الجولة.».
- **EX-15** MUST: The panel «المواضع التي تحتاج إلى مراجعة» lists every question graded متردد or خطأ in the current attempt, as «<tag> <round>: آية/بيت <refs> (<first 5 words of prompt>)», with the count «<k> موضع».
  - Empty state: «لا يوجد شيء بعد. اختر «متردد» أو «خطأ» لأي سؤال ليظهر هنا.».
  - Buttons:
    - «سجلي الكامل ←»;
    - «انسخ القائمة»: shows «نُسخت» for 1.5 s; falls back to selecting the text;
    - «ابدأ من جديد»: asks for confirmation with «سيُمحى تقييمك وجميع الإجابات المكشوفة.», «امحُ وابدأ» and «تراجع».
  - Reset clears grades, reveals and the random number of the current attempt. It never deletes history, and it starts a new session (DATA-41).
- **EX-16** MUST: Questions come only from the exam's data. Quran and Tuhfa text is always rendered from references (DATA-21), never from typed copies.
- **EX-17** MUST: Exam state persists across reloads, offline use and app updates.

### 3.4 Random exam `/random/` (RND)
- **RND-01** MUST: Source chips, one per published exam, show the short name and sub-line (e.g. «البقرة ١ · آية ١–٤٣»). By default all are selected.
- **RND-02** MUST: Each selected text family gets range selects, «من» and «إلى»:
  - «نطاق سورة البقرة (الآيات)»: the options are only the verses covered by published Baqarah exams (1–74 today; gaps are not offered);
  - «نطاق تحفة الأطفال (الأبيات)»: 1–61.
  If «من» is set above «إلى», the other select is moved to the same value.
- **RND-03** MUST: Quick-range buttons:
  - Baqarah: «البقرة كلها» plus one per covered rub' (from rub' metadata);
  - Tuhfa: «المتن كله» plus one per chapter, using the chapter `short` name.
  The button that matches the current range is shown pressed.
- **RND-04** MUST: Set size chips ١٠ / ١٥ / ٢٥; the default is 15.
  - Below them: «الأسئلة المتاحة في هذا النطاق: <n>».
  - When n = 0: «لا توجد أسئلة في هذا النطاق، فوسّعه أو اختر مصدرًا آخر», and «اختبار جديد ↻» is disabled.
  - With no source selected: «اختر مصدرًا واحدًا على الأقل، ثم اضغط «اختبار جديد».», and «اختبار جديد ↻» is disabled.
- **RND-05** MUST: The pool is built as follows.
  - It contains every question of the selected sources that is gradable in random context and whose answer refs all fall inside the range.
  - A question that cites a verse outside the range (DATA-22 `outOfRange`) drops out of narrow ranges. This matches the baseline.
  - Each source also contributes up to 6 generated random-number questions within the range: «اقرأ الآية رقم <n> من سورة البقرة» or «اقرأ البيت رقم <n> من التحفة». Their qid is `<examId>/random-number/<n>` and they are graded (DATA-23).
- **RND-06** MUST: Building a set:
  - shuffle the pool and take min(size, pool) questions;
  - avoid the same source and type twice in a row where possible;
  - start a new session.
  On the first visit, a set is built automatically.
- **RND-07** MUST: The question view shows:
  - tags for source and type, and «سؤال <i> من <n>»;
  - the ask line, or the round's instruction when there is no ask;
  - the prompt (a large number for random-number questions);
  - «اكشف الإجابة» (not persisted) and the grade buttons (DATA-41);
  - «→ السابق», and «التالي ←» (scrolls to the top) or «النتيجة»;
  - progress dots.
- **RND-08** MUST: An unfinished set persists. On return, the page shows «تابعتَ من حيث توقفت · <d> من <n> مُقيَّم. أتريد البدء من جديد؟ اضغط «اختبار جديد ↻».».
- **RND-09** MUST: The results screen shows:
  - «أتممتَ الاختبار»;
  - the counts;
  - «راجع هذه» with the متردد and خطأ items, or «ما شاء الله، لا أخطاء.»;
  - the buttons «اختبار جديد ↻», «راجع الأسئلة من البداية» and «سجلي ←».
- **RND-10** MUST: Preferences persist.
- **RND-11** MUST: The random exam uses the exam data files directly. No separate copy of `random-data.json` is kept.
  - *AC:* editing a tip in `baqarah-1.json` changes it on both pages.

### 3.5 History «سجلي» `/history/` (HIS)
- **HIS-01** MUST: History reads every live event from every tool, all from one store.
  - *AC:* one grade in each of the three exams plus one in the random exam gives 4 events.
- **HIS-02** MUST: Source filter chips («الكل» plus one per source) appear when events come from 2 or more sources. Every section applies the filter.
- **HIS-03** MUST: Tiles:
  - «<n> إجابة»;
  - «<pct>٪ صحيح»;
  - «<m> سؤال راسخ (صحيح مرتين متتاليتين)», counting questions whose last two live events are ok;
  - «<d> أيام مراجعة», counting distinct local days, with «يوم» when d = 1.
- **HIS-04** MUST: «نقاط قوتك» lists (source, type) pairs with at least 4 events and an ok rate of at least 75 %. Sorted by ok rate, top 6. Otherwise the baseline explanation is shown.
- **HIS-05** MUST: «ما تحتاج إلى مراجعته», with the count «<n> سؤال».
  - It lists questions whose most recent event is not ok.
  - Sort order: last grade خطأ first, then by number of خطأ, then most recent first.
  - The first 30 are shown. When there are more than 30, the note «وهذه أول ٣٠ فقط.» is added.
  - Each item shows: source; type; «آخر مرة: <grade> · <date>»; «صحيح ×a · متردد ×b · خطأ ×c»; the ask line; the prompt; the answer refs and text.
  - When there is nothing to review: «ما شاء الله، كانت آخر إجابة في كل سؤال صحيحة.».
- **HIS-06** MUST: «حسب نوع السؤال» shows, per source, one row per type ID: a stacked bar and «<pct>٪ · <n>», sorted by ok rate ascending, with a legend. Rows group by type ID, so the same type from the exam page and from the random exam is merged.
- **HIS-07** MUST: «السجل الكامل» groups events by day, newest first, with the latest day expanded.
  - Day header: «<k> إجابة · <pct>٪ صحيح».
  - Each line shows: grade, time, source, type, and the first 70 characters of the ask line or prompt.
- **HIS-08** MUST: Two actions.
  - «انسخ الملخص» shows «نُسخ» for 1.5 s and copies:
    - line 1: «سجلي · <n> إجابة · <pct>٪ صحيح»;
    - line 2: «نقاط القوة: …»;
    - line 3: «يحتاج إلى مراجعة:»;
    - up to 30 lines in the form «• <source> · <type> · <unit> <refs>».
  - «امحُ السجل» asks for confirmation with «سيُمحى السجل كله من هذا الجهاز، ولا يمكن استرجاعه.». It removes all events but keeps exam attempts.
- **HIS-09** SHOULD: Each review item links to its question (IA-06).
- **HIS-10** MUST: Events for retired or unknown qids are shown from their snapshot, labelled «سؤال قديم».
- **HIS-11** MUST: Empty state: «لا يوجد سجل بعد», followed by the baseline explanation.

### 3.6 Listening `/listen/` (LIS)
- **LIS-01** MUST: The header reads «منظومة الشيخ سليمان الجمزوري · ٦١ بيتًا · ١٠ أبواب», then «استماع تحفة الأطفال», the usage line, and the credit string `credit.audio` = «بصوت الشيخ أحمد مهدي».
- **LIS-02** MUST: A sticky now-playing bar contains:
  - play/pause, disabled when idle;
  - a title and subtitle. Idle: «اختر بابًا أو بيتًا» / «لا يعمل شيء الآن». Playing, e.g.: «بيت ١٣ · <first hemistich>», «التحفة كاملة · <chapter>», «الأبيات المختارة · i من n», plus «· يتكرر» when looping;
  - the custom seek bar, «↺ ٥» and «٥ ↻», and elapsed/total time;
  - «↻ كرّر»;
  - the speed button, which opens a pop-over labelled «السرعة:».
- **LIS-03** MUST: «شغّل التحفة كاملة», sub-line «الأبواب العشرة متتابعة دون توقف · نحو ١١ دقيقة», plays `full.mp3` gaplessly. The current chapter is taken from `chapterOffsets` and highlighted live.
- **LIS-04** MUST: 10 chapter cards. Each shows:
  - number, `name`, bayt range, duration, «▶ الباب»;
  - a disclosure listing its abyat (number, both hemistichs, ▶). Open/closed state persists.
  A card is highlighted while any of its items is playing.
- **LIS-05** MUST: Selection mode, toggled by «☑ اختر أبياتًا» / «✓ أنهيت الاختيار».
  - Entering the mode expands every chapter.
  - Tapping a row toggles that bayt. Each chapter gets «☐ الباب» / «☑ الباب».
  - A sticky bar contains:
    - the range picker «من بيت … إلى بيت … حدّد». It **adds** the range to the selection and swaps reversed ends. Default ١–٥.
    - the count: «لم تُختر أبيات», «بيت مختار» or «أبيات مختارة»;
    - «امحُ» (no confirmation, GEN-07);
    - «▶ شغّل المختار».
  - The selection persists.
- **LIS-06** MUST: A selection plays in ascending order on one media element (AUD-03).
  - With «كرّر» on, it restarts from the first bayt after the last; otherwise it stops on the last bayt.
  - The current bayt is highlighted.
- **LIS-07** MUST: With «كرّر» on, a single bayt, a chapter or the whole poem loops seamlessly using `loop`. The setting persists.
- **LIS-08** MUST: Speeds are «٠٫٥×», «٠٫٧٥×», «١×», «١٫٢٥×», «١٫٥×», «١٫٧٥×», «٢×», «٢٫٥×», «٣×». Pitch is preserved. The speed persists and applies immediately.
- **LIS-09** MUST: Seek uses the custom slider (AUD-12). ±5 s is clamped to [0, duration − 0.1].
- **LIS-10** MUST: Media Session controls are supported (AUD-14).
- **LIS-11** MUST: The page shows the download state: «حمّل الصوت كله (≈ <size> م.ب)», «أكمل التحميل (<k> من <n>)», or «الصوت محفوظ على الجهاز ✓», each linking to settings.
- **LIS-12** MUST: While audio is disabled (AUD-40), the page shows «الاستماع قريبًا إن شاء الله» and the abyat list without play controls. The hub card stays linked.

### 3.7 Settings `/settings/` (SET)
- **SET-01** MUST: Theme: «تلقائي», «فاتح» or «داكن». The choice persists and is applied before first paint.
- **SET-02** MUST: Audio:
  - «حمّل الصوت كله», showing the size;
  - progress and «أوقف»;
  - resume with «أكمل التحميل» (OFF-20);
  - once downloaded, «الصوت محفوظ ✓» and «احذف الصوت المحفوظ», which asks for confirmation.
  Hidden while audio is disabled.
- **SET-03** MUST: Storage: approximate usage (from `navigator.storage.estimate()`) and the persistence status: «محمي من الحذف التلقائي», or advice to install the app.
- **SET-04** MUST: Backup.
  - «صدّر نسختي» saves `khayrukum-backup-YYYY-MM-DD.json` through the platform adapter: a download, or the iOS share sheet.
  - «انسخ النسخة نصًّا» copies the same JSON to the clipboard.
  - «استورد نسخة» accepts a file (`accept=".json,application/json,text/plain"`) **or** text pasted into «الصق النسخة هنا».
  - Import validates and merges (DATA-61), then reports «أُضيف <n> إجابة، وحُدِّث <k> من الاختبارات».
- **SET-05** MUST: The version line «الإصدار <version> · <date>». When an update is waiting, «حدّث الآن» (OFF-10).
- **SET-06** SHOULD: «امحُ كل بياناتي» asks for confirmation twice, then clears all app storage and the audio cache.

### 3.8 About and Privacy (ABT)
- **ABT-01** MUST: «عن الموقع» contains:
  - the purpose;
  - the audio credit `credit.audio` and the permission statement (LIC-20);
  - the poem's author, «الشيخ سليمان الجمزوري»;
  - the Quran text source, with Tanzil's notice and a link (LIC-01);
  - the Tuhfa verification status (LIC-11);
  - font licenses;
  - the contact address info@khayrukum.app;
  - a link to the repository;
  - the licenses (D-5);
  - the version.
- **ABT-02** MUST: «الخصوصية» states in فصحى:
  - results stay on the device;
  - there are no accounts and no cookies;
  - Cloudflare Web Analytics (cookieless) counts page views only;
  - nothing is sold or shared;
  - how to delete your data;
  - the contact address.

---

## 4. Data model and file schemas

All content is static UTF-8 JSON under `/data/`. Quran and Tuhfa texts are kept **byte-exact** from their sources, with no Unicode normalization: NFC would reorder marks (e.g. kasra and shadda). Every other string is NFC. Every file carries `"schema"` and `"version"`. A JSON Schema for each file lives in `/schemas/`, and `tools/validate-data.mjs` enforces it (TST-10).

### 4.1 Reference grammar
| Form | Meaning |
|---|---|
| `2:27` | Surah 2, verse 27 |
| `2:27:5-9` | Uthmani words 5–9 of 2:27 (1-based, inclusive) |
| `2:27:-4` / `2:27:4-` | Last 4 words / word 4 to end |
| `2:1-10` | Verse range |
| `t:16` | Tuhfa bayt 16 (both hemistichs) |
| `t:16:1`, `t:16:2` | First / second hemistich |
| `t:16:2:3-4`, `t:16:1:-2`, `t:16:2:3-` | Words of a hemistich |
| Inline token `[[q:2:171:-6]]`, `[[t:25:2:2-5]]`, `[[q:2:54:4-6\|2:54:9-10]]` | Text quoted inside `ask`, `tip`, `note` or summary strings. Rendered from the corpus in its own typography. Multiple refs joined with `\|` render separated by « … ». |

- **DATA-01** MUST: Word indexing.
  - **Quran:** the words are the stored **Uthmani** verse split on spaces. Tokens made only of Quranic annotation marks (U+06D6–U+06ED, including pause marks and ۞) are not words. A mark between two selected words is rendered. A mark right after the last selected word is not rendered.
  - **Tuhfa:** the words are the stored hemistich split on spaces.
  - Indices always refer to these tokens, never to imla'i spellings. Example: «يا أيها الناس» is the 2 tokens `2:21:1-2`.
  - *AC:* unit tests on 2:2 (which contains pause marks), 2:21 and t:25.
- **DATA-02** MUST: Quoted Quran or Tuhfa text inside content strings is written as inline tokens.
  - The content lint fails on any run of 2 or more Arabic words inside «» that is not a token, unless the quote is listed in that file's `plainQuotes` allow-list. The allow-list is for chapter and rule names and other quotes that are not from the corpus.

### 4.2 Item model (used by prompts, answers, chain entries and summary items)
```json
{ "ref": "2:27:5-9" }                                  // one reference
{ "refs": ["2:54:4-6","2:54:9-10"], "join": "dots" }   // gapped: rendered «… » between parts
{ "text": "حروف الإظهار الحلقي" }                      // non-corpus text (prompt only)
// optional on any of the above:
"dots": "before"|"after"|"both"   // leading/trailing «…»
"label": "الكتاب"                  // rendered before the text, followed by «: »
"note": "قمرية"                    // rendered after the text in parentheses, may hold tokens
"showRef": true                    // append the verse/bayt number in parentheses, e.g. «(٤٩)»
"outOfRange": "bridge"|"lookalike"|"context"   // ref intentionally outside the exam range
```
Exactly one of `ref`, `refs` or `text` is set. Examples from the baseline:
- «ولهم عذاب عظيم (الكافرين)» → `{"ref":"2:7:-3","dots":"before","note":"الكافرين"}`
- «الكتاب: قمرية (ابغ حجك وخف عقيمه)» → `{"text":"الكتاب","note":"قمرية · [[t:25:2:2-5]]"}`
- «إنكم ظلمتم أنفسكم … فاقتلوا أنفسكم» → `{"refs":["2:54:<a>-<b>","2:54:<c>-<d>"],"join":"dots"}`, where the porting tool fills in the indices.

Chain answers are an explicit ordered list:
```json
{ "chain": [ {"ref":"2:63:1-3"}, {"ref":"2:64:1-2"}, …,
             {"ref":"2:68:1-2","note":"ما هي"}, {"ref":"2:69:1-2","note":"ما لونها"} ],
  "sep": " · " }
```
There is also a shorthand, which the loader expands into an explicit list:
`{"chainFrom":"2:43","chainTo":"2:30","words":2,"override":{"2:35":3}}`.
- `chainTo < chainFrom` is allowed and gives a reversed chain (baseline 43→30 and 74→63).
- `words` is the default number of words per verse; `override` sets it per verse.

Non-consecutive chains, such as «كل «وإذ» في الربعين بالترتيب» (49, 50, 51, 53 …) and «كل «والثان / والثالث»» (t:9, 12, 13, 21, 22), use the explicit list, with `showRef` where the baseline shows numbers.

### 4.3 Quran corpus
- **DATA-10** `data/quran/source.json`:
  ```json
  { "source": "Tanzil Quran Text", "edition": "Uthmani", "version": "1.1",
    "url": "https://tanzil.net", "retrieved": "YYYY-MM-DD", "sha256": "…",
    "options": { "pauseMarks": true, "sajdah": false, "rubElHizb": false,
                 "superscriptAlefTatweel": false, "basmala": "separate" },
    "notice": "<verbatim Tanzil notice>" }
  ```
  `options` records the exact download options, so TST-11 can reproduce the byte check.
- **DATA-11** `data/quran/meta.json` holds:
  - `suras`;
  - `pages` (604 Madinah page starts);
  - `rubs` (240 hizb quarters);
  - `mushaf`: «مصحف المدينة».
  It is generated from Tanzil metadata by `tools/import-tanzil.mjs`.
- **DATA-12** `data/quran/002.json` is `{ "sura":2, "basmala":"…", "ayat":[…], "notice":"<Tanzil notice>" }`. The notice is included in every verbatim copy, as Tanzil requires.
  - The rub'-el-hizb sign is **not** included in the text (`rubElHizb:false`). The UI adds «۞» only where the design calls for it (PL-02).
  - v1 ships surah 2 only.
- **DATA-13** MUST: Rub' openings for the plan are references: `data/quran/rub-openings.json` = `{ "2": [{"rub":1,"ref":"2:1:1-1"}, …] }`.
- **DATA-14** MUST: `import-tanzil.mjs` is the only writer of `data/quran/*`. TST-11 recomputes every verse from the original download.

### 4.4 Tuhfa corpus
- **DATA-15** `data/tuhfa/abyat.json`:
  ```json
  { "title":"تحفة الأطفال", "author":"سليمان الجمزوري",
    "source":{"file":"tuhfa-tashkeel.json","verifiedAgainst":null},
    "chapters":[{"n":1,"name":"المقدمة","short":"المقدمة","from":1,"to":5}, …],
    "abyat":{"1":["…","…"], …},
    "review":{"26":"pending","28":"pending","57":"pending"} }
  ```
- **DATA-16** MUST: Chapter names are defined once.
  - `name`: the long names from the listening page, used on the listening page and in headings.
  - `short`: the exam's names («المشددتان», «اللامات», «المثلان», …), used for quick ranges and tags.
  - Boundaries: 1–5, 6–16, 17, 18–23, 24–29, 30–34, 35–41, 42–47, 48–57, 58–61.
- **DATA-17** MUST: Any bayt whose `review` value is not `"verified"` is shown everywhere with the small note «قيد المراجعة». The build prints a warning listing these abyat, and LIC-11 governs release.

### 4.5 Exams and question bank
- **DATA-20** `data/exams/index.json`. Example entries:
  - `{"id":"baqarah-1","kind":"quran","status":"published","title":"اختبار ١ · البقرة ١–٤٣","short":"البقرة ١","sub":"آية ١–٤٣","card":"الربعان الأول والثاني · ص ٢–٧","sura":2,"range":[1,43],"rubs":[1,2],"pages":[2,7],"file":"baqarah-1.json","unit":"آية"}`
  - `{"id":"baqarah-3","status":"soon","card":"الربعان الخامس والسادس", …}`
  - `{"id":"tuhfa","kind":"tuhfa","range":[1,61],"file":"tuhfa.json","unit":"بيت","audio":"tuhfa", …}`
  - *AC:* a new published entry and its file appear on the hub, in the random exam and in history, with no code change (TST-30).
- **DATA-21** Exam file `data/exams/<id>.json`:
  ```json
  { "id":"baqarah-1", "version":"…",
    "summary":[ {"kind":"outline","title":"الربع الأول (١–٢٥): أصناف الناس",
                 "items":[{"range":"2:1-5","text":"المؤمنون: … وختامها «[[q:2:5:-3]]»"}]},
                {"kind":"pageStarts","pages":[3,7]},
                {"kind":"lookalikes","items":[{"refs":["2:36","2:38"],"text":"«[[q:2:36:1-2]]» بالواو، وبعدها «[[q:2:38:1-2]]» من غير واو"}]},
                {"kind":"codes","items":[{"label":"الإدغام","ref":"t:9:2:2"}]},
                {"kind":"chapters","playable":true} ],
    "rounds":["summary","pages","next", …,"random-number"],
    "roundText":{},
    "plainQuotes":[],
    "questions":[
      {"id":"baqarah-1/pages/01","type":"pages","page":{"from":2,"to":3,"dir":"forward"},
       "prompt":[{"ref":"2:5:-3","dots":"before"}],"answer":[{"ref":"2:6"}]},
      {"id":"baqarah-1/next/05","type":"next","prompt":[{"ref":"2:18","dots":"before"}],
       "answer":[{"ref":"2:19"}],"tip":"في السورة نفسها (آية ١٧١): «[[q:2:171:-6]]»، وهنا «[[q:2:18:-2]]»."},
      {"id":"baqarah-1/chain/05","type":"chain","ask":"التحدي الأكبر: بالعكس من ٤٣ إلى ٣٠",
       "prompt":[{"ref":"2:43:1-2"},{"text":"←"}],
       "answer":[{"chainFrom":"2:43","chainTo":"2:30","words":2,"override":{}}]},
      {"id":"tuhfa/quran-to-tuhfa/01","type":"quran-to-tuhfa",
       "prompt":[{"ref":"2:5:4-5","note":"البقرة ٥"}],"answer":[{"ref":"t:12"}],
       "tip":"إدغام بغير غنة: نون ساكنة بعدها راء"} ],
    "retired":[] }
  ```
  - `pages` questions carry `page`. Their `ask` is generated from the template «آخر صفحة <from>، فما أول صفحة <to>؟» (and «بالعكس: …» when `dir` is `back`). The validator checks the refs against `meta.pages`.
- **DATA-22** MUST: Question IDs have the form `<examId>/<type>/<nn>`. They are unique and never reused; removed IDs go into `retired`. The validator rejects:
  - duplicate IDs and reuse of retired IDs;
  - unknown types;
  - refs that do not resolve;
  - word ranges out of bounds;
  - answer or prompt refs outside the exam `range` that are not marked `outOfRange`. For example, baqarah-2's bridge to 2:43 and its look-alike citations of 2:35, 2:37 and 2:38 are marked `outOfRange`.
- **DATA-23** `data/round-types.json`:
  ```json
  {"id":"next","title":{"quran":"أكمل بعد الآية"},"intro":{"quran":"…"},"gradable":{"exam":true,"random":true}}
  ```
  - `random-number` has `"gradable":{"exam":false,"random":true}`.
  - `summary` is gradable in neither context.
  - These titles are the only source of round labels. History groups rows by type ID.
- **DATA-24** MUST: Porting the baseline content produces these question counts: baqarah-1 = 59 (pages 8, next 13, topic-end 7, repeated-word 9, lookalikes 9, mid-verse 8, chain 5), baqarah-2 = 61, tuhfa = 86. Any difference is explained in the porting log (DATA-26).
- **DATA-25** MUST (B1 comparison method): `tools/port/align.mjs` converts every baseline phrase into references.
  1. Normalize both the baseline phrase and **Tanzil Simple-Clean** (used only as a tool input, never shipped). Normalization:
     - remove tashkeel, Quranic marks and tatweel;
     - map أ إ آ ٱ to ا;
     - map ى to ي;
     - map ة to ه;
     - map ؤ to و and ئ to ي.
  2. Find the phrase's word span in the Simple-Clean verse.
  3. Map Simple-Clean word indices to Uthmani token indices with a per-verse alignment.
     - When the word counts are equal, the alignment is the identity.
     - Otherwise, an Uthmani token aligns to 2 Simple words when its normalized form equals their joined form, e.g. «يا» + «أيها».
     - Anything still unresolved is resolved by an entry in `tools/port/align-overrides.json`, written by a human.
  4. Write an alignment table for every phrase: `qid · field · baseline phrase · ref · normalized source phrase · match | mismatch | override`.
  - Tuhfa phrases are matched against `abyat.json` with the same normalization.
  - *AC:* 0 rows are `mismatch`. Every `override` row has a one-line reason.
- **DATA-26** MUST: Porting deliverable `tools/port/porting-log.md`. It lists every question whose content changed while porting: wording moved to فصحى, a ref resolved differently than the typed text suggested, or a split or merge. It gives the old text and the new text for each.

### 4.6 Audio manifest
- **DATA-27** `data/audio/tuhfa.json` (DATA-25 in v1):
  ```json
  { "reciter":"الشيخ أحمد مهدي", "format":{"codec":"mp3","bitrate":128000,"sampleRate":44100},
    "bayt":{"1":{"src":"audio/tuhfa/bayt/01.mp3","bytes":…,"dur":9.85,"sha256":"…"}, …},
    "chapter":{"1":{"src":"…","bytes":…,"dur":63.95,"sha256":"…"}, …},
    "full":{"src":"audio/tuhfa/full.mp3","bytes":…,"dur":680.93,"sha256":"…","chapterOffsets":[…]},
    "segments":{"1":[0,8.43,18.23], …} }
  ```
  `bytes`, `dur`, `sha256` and `chapterOffsets` are written by `check-audio.mjs --write` (AUD-30).

### 4.7 Plan definition
- **DATA-30** `data/plan/baqarah.json` = `{ sura, rubs:[1,20], perWeek:2, targets:[3,3,3,3,3,3,2], repLabels, reviewPerDay:3, dayTasks, fridayTasks, rules, weekStart:"saturday" }`.

### 4.8 Storage (one namespace)
- **DATA-50** MUST: All state lives in the IndexedDB database `khayrukum`, in two stores:
  - `kv`;
  - `events` (keyPath `id`; indexes `t`, `qid`, `src`).
  The one exception is the localStorage key `khayrukum.theme`. Cache Storage holds only the caches in OFF-02.
  - *AC:* after using every tool, the localStorage keys are a subset of {`khayrukum.theme`}, and the only IndexedDB database is `khayrukum`.
- **DATA-51** `kv` keys:

| Key | Value |
|---|---|
| `device` | `{id, createdAt}` |
| `exam:<examId>` | `{round, grades:{qid:g}, open:{qid:true}, rand:{n,open}, session, startedAt, updatedAt}` |
| `random:prefs` | `{src:[examId], n, ranges:{quran2:[a,b], tuhfa:[a,b]}, updatedAt}` |
| `random:current` | `{set:[qid], idx, grades:[g], session, startedAt, done, updatedAt}` |
| `plan:baqarah` | `{pair, week:{reps[7], checks{}, clean, satBannerDismissed}, mistakes:[{id,text,deleted,updatedAt}], done:[pair], history:[{pair,clean,endedAt}], updatedAt}` |
| `listen:prefs` | `{sel:[n], rate, loop, open:{}, updatedAt}` |
| `ui:install`, `ui:inapp`, `ui:standaloneHint` | `{dismissedAt}` |

- **DATA-52** MUST: All storage access goes through `store.js`.
  - *AC:* a grep finds no `localStorage` or `indexedDB` anywhere else, except the inline theme script.
- **DATA-53** MUST: On first run the app calls `navigator.storage.persist()` and shows the result in SET-03. Safari may otherwise erase a non-installed site's storage after 7 days without a visit.
- **DATA-54** MUST: Other tabs learn of state changes through BroadcastChannel `khayrukum`. The hub refreshes on `visibilitychange`.

### 4.9 History events
- **DATA-40** Event:
  ```json
  {"id":"<uuid>","t":…,"updatedAt":…,"dev":"<uuid>","session":"<id>","tool":"exam"|"random",
   "src":"baqarah-1","type":"next","qid":"baqarah-1/next/05","g":"ok"|"mid"|"bad","deleted":false,
   "snap":{"ask":"…","prompt":"<≤160>","answerRefs":["2:19"],"answer":"<≤160>","unit":"آية"}}
  ```
- **DATA-41** MUST: Grading rules. They keep the baseline semantics.
  - **Sessions.** A session is one exam page load or one random set. On the exam page, «ابدأ من جديد» also starts a new session. The baseline did not do this, and a reset followed by a re-grade then overwrote the earlier attempt's event; the new session keeps both attempts.
  - **Grade, or re-grade in the same session.** If the qid already has a live event in the current session, that event is updated (new `g`, new `updatedAt`). Otherwise a new event is appended.
  - **Clear.** Only an event of the **current** session is tombstoned (`deleted:true`). If the current session has none, for example because the grade was made in an earlier session and restored from `exam:<id>`, history is unchanged and only the attempt's grade is cleared.
  - **Re-grade in a new session.** The previous grade was restored from `exam:<id>`; the new grade appends a new event.
  - All statistics ignore tombstones.
- **DATA-42** MUST: `snap` is written when the grade is given.
- **DATA-43** MUST: At least 20,000 live events are kept. Beyond that, the oldest events are pruned, and tombstones older than 90 days are removed.
- **DATA-44** MUST: Merging (import now, sync later):
  - Events are merged as a union by `id`; the newer `updatedAt` wins.
  - kv keys are last-writer-wins, using `updatedAt`.
  - `plan.mistakes` is merged per item `id` with tombstones, so deleted mistakes do not come back.
  - `plan.done` is merged as a union.
- **DATA-60** Backup = `{format:"khayrukum-backup", schema:1, exportedAt, appVersion, device, kv, events}`.
- **DATA-61** MUST: Import:
  - validates the backup against its schema;
  - shows a summary and asks for confirmation;
  - merges per DATA-44;
  - is idempotent and never deletes data.

### 4.10 Legacy progress migration (not in v1, D-6)
~~MIG-01…04~~ are retired from v1. Members start fresh. If the owner asks for migration later, use this design.
- **Origins.** There are 3 legacy origins:
  - the hub bundle: hub, plan, exams 1–2, random, history;
  - the Tuhfa exam artifact;
  - the Tuhfa listening artifact.
  Only the first two hold progress worth moving; listening preferences are not migrated.
- **Export.** Each of the two old artifacts gets a button «انقل تقدّمي». It **copies** `{"format":"khayr-legacy","origin":"hub"|"tuhfa-exam","keys":{…}}` to the clipboard, because file downloads from a sandboxed artifact are not guaranteed. A download is offered only as a secondary option. The member pastes the text into SET-04.
- **Mapping.** Mapping is per exam, through `tools/migrate/legacy-map.json`:
  - positional IDs such as `pages0` and `next4` map to qids;
  - round titles in both فصحى and colloquial wording map to type IDs;
  - for Tuhfa, `next` maps to `next-bayt`;
  - `tool` is best-effort.
- **Keys.**
  - `khayr-history-v1`: events.
  - `baqarah-exam-public-1/2` and `tuhfa-exam-1`: `exam:<id>`.
  - `baqarah-plan-v1`: `plan:baqarah`.
  - `random-exam-prefs`: `random:prefs`.
  - `random-exam-current`: discarded.

---

## 5. Audio requirements

### 5.1 Assets
| Set | Files | Size | Used by |
|---|---|---|---|
| Per bayt | `audio/tuhfa/bayt/01–61.mp3` (from `abyat2/`) | ≈ 9.8 MB | Bayt buttons, selections, Tuhfa exam |
| Per chapter | `audio/tuhfa/chapter/01–10.mp3` (from `audio2/`) | ≈ 11 MB | «▶ الباب», exam summary |
| Whole poem | `audio/tuhfa/full.mp3` | ≈ 10.9 MB, 680.93 s | «شغّل التحفة كاملة» (D-2) |

Measured format: MP3, 128 kbps, 44.1 kHz, stereo. Total ≈ 31.7 MB.

- **AUD-01** MUST: A single bayt or a selection plays the per-bayt files. Bayt playback never seeks inside a chapter file or `full.mp3`.
- **AUD-02** MUST: Playback uses an `HTMLAudioElement` with `playsinline` and `preload="auto"`. Web Audio is never used for playback, because the iPhone silent switch mutes it. Where available, set `navigator.audioSession.type="playback"`.
- **AUD-03** MUST: Each page has exactly one media element. A sequence moves to the next item by changing `src` inside the `ended` handler.
- **AUD-04** MUST: The whole poem plays `full.mp3`, and a chapter plays its own clip. In a selection, the gap between abyat (cached files) is at most 300 ms, measured from `ended` to the next `playing` event (TST-21, M-04).
- **AUD-05** MUST: `audio.src = …; audio.play()` runs synchronously inside the tap handler: no `await`, fetch or timer comes before `play()`.
- **AUD-06** MUST: Play failures:
  - If `play()` rejects with something other than a media error, retry once on `canplay`.
  - On a media error, fetch the file (from cache if possible), play it from a `blob:` URL, and resume at the same position.
  - If that also fails, show «تعذّر تشغيل الصوت. تحقّق من الاتصال أو من تحميل الصوت.» in a `role="status"` toast for 8 s, and reset the play button.
- **AUD-07** MUST: Early-end recovery. If `ended` fires while `currentTime < dur − 1.5 s`, reload the file from a blob URL, seek to that position and resume. This is done at most once per item.
- **AUD-08** MUST: Only one item plays at a time on the page.
- **AUD-09** MUST: Set `playbackRate` and `defaultPlaybackRate`, and `preservesPitch=true` (plus the webkit alias). Apply them again after every `src` change.
- **AUD-10** MUST: Pause and resume keep the position. A seek into a range that is not seekable falls back to the blob URL.
- **AUD-11** MUST: When a selection plays, the next 3 items are fetched into the audio cache in the background.
- **AUD-12** MUST: The seek bar is a custom slider, never `<input type=range>`:
  - `role="slider"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and `aria-valuetext` (e.g. «٠:٤٢ من ١:٠٤»);
  - `touch-action:none`, pointer capture, a preview while dragging, and the seek applied on release;
  - RTL mapping (start = right edge);
  - keys: ArrowLeft = +5 s, ArrowRight = −5 s, Home, End.
  - *AC:* a touch drag at 375 px leaves the page scroll position unchanged.
- **AUD-13** MUST: Time and position update at least 4 times per second while playing. Polling stops when nothing is playing.
- **AUD-14** MUST: Media Session:
  - title (LIS-02), artist «الشيخ أحمد مهدي», album «تحفة الأطفال», 512 px artwork;
  - actions: play, pause, seekbackward and seekforward (5 s), previoustrack and nexttrack (selection items, or chapters in the whole poem), stop;
  - `setPositionState` on every change.
- **AUD-15** SHOULD: In chapter and whole-poem playback, highlight the current bayt using `segments` and the measured `chapterOffsets`.
- **AUD-16** MUST (spike on the first day of the build): On the current iOS, check that background audio keeps playing with the screen locked, in Safari and as a home-screen web app, including advancing through a selection. If the home-screen web app fails, record this as a known limitation in «عن الموقع» and the README. It does not block release.

### 5.2 Audio launch switch
- **AUD-40** MUST: `site/config.json` contains `{"audio":{"enabled":true|false}}`. When `false`:
  - No audio file is deployed: the build leaves out `site/audio/`.
  - The audio manifest is not precached.
  - Every audio control is hidden (EX-07, EX-11, SET-02, LIS-11). `/listen/` shows LIS-12. The hub card text follows 2.2.
  - *AC:* TST-36 builds with `false` and finds no `.mp3` in the artifact, no 404s, and no visible play control.
- **AUD-41** MUST: Audio files are not committed to the public repository until LIC-20 is granted. Until then they are kept out of Git (listed in `.gitignore`) and added to CI from private storage, or the site is built with `audio.enabled=false`. A public repository is itself a form of publishing.

### 5.3 Audio verification
- **AUD-30** MUST: `tools/check-audio.mjs` (using ffmpeg and ffprobe) fails CI when any of these holds:
  1. a file is missing, or its codec, sample rate or bitrate differs from `format`;
  2. a per-bayt duration differs from its segment's end − start by more than 0.15 s (current maximum 0.113 s), or from `dur` by more than 0.05 s;
  3. a per-bayt file has an internal silence of 0.6 s or more (`silencedetect=noise=-40dB`; the current maximum is under 0.4 s);
  4. a chapter file or `full.mp3` has an internal silence of 2.5 s or more (current maximum 1.61 s);
  5. a per-bayt file is non-silent for less than 85 % of its duration, or its mean volume is below −30 dB;
  6. the sum of chapter durations differs from the `full` duration by more than 0.5 s (current difference 0.37 s);
  7. `chapterOffsets` were not **measured**. The tool cross-correlates the first 3 s of each chapter clip against `full.mp3` and writes the offsets. The check fails if a match is weak (peak correlation below 0.8) or if an offset differs from the stored value by more than 50 ms;
  8. `sha256` or `bytes` do not match the files.
  These checks catch the earlier fade-at-the-wrong-timestamp bug, which silenced most of each bayt.
- **AUD-31** SHOULD: The tool writes a waveform PNG for each chapter as a CI artifact.

---


### 5.x Multi-collection audio from the same reciter (v2.1, owner input 2026-11-07)
The owner states that الشيخ أحمد مهدي will also provide **Quran recitation** and **lessons (دروس)**, not only the Tuhfa abyat.
- **AUD-30** MUST: The audio manifest is collection-based: `collections[]` each with `id`, `type` (`poem` | `quran` | `lesson`), `reciter` (reference to a `reciters[]` entry with name and credit string), `items[]`, and optional `segments` (per bayt / per ayah / chapters with timings). The Tuhfa is one collection of type `poem`. v1 ships only this collection; adding a Quran or lesson collection is data-only plus audio files (TST: add a fixture `quran` collection with 2 ayat and a `lesson` with 2 chapters; pages that list collections pick them up without code changes).
- **AUD-31** MUST: Quran recitation items are addressable by `surah:ayah` (and optionally by page and rub'), so exams can attach "listen to this ayah" to any Quran question later. In v1 this button stays hidden unless a `quran` collection containing that ayah exists.
- **AUD-32** SHOULD (later phase, not v1): a lessons page listing `lesson` collections (title, duration, chapters, speed, resume position per lesson, offline download per lesson).
- **AUD-33** MUST: Credit and permission are tracked per collection (`permission: {granted: bool, date, scope: ["web","apps","offline","segmenting","speed"]}`); a collection with `granted:false` is never served or committed (the release check enforces this per collection, extending the audio gate).

## 6. Offline / PWA requirements

- **OFF-01** MUST: Manifest:
  - `name` «خيركم من تعلّمه», `short_name` «خيركم»;
  - `lang` "ar", `dir` "rtl";
  - `start_url` "/?source=pwa", `scope` "/", `display` "standalone";
  - theme and background colours;
  - icons: 192, 512 and 512 maskable, plus a 180 apple-touch-icon. The icons are derived from `group-icon-baqarah.png` and total at most 150 KB. The 672 KB original is not shipped.
- **OFF-02** MUST: `/sw.js` with scope `/`. It uses exactly two caches:
  - `khayr-app-<buildHash>`: all HTML, CSS, JS, fonts, icons, `/data/**` and `config.json`;
  - `khayr-audio-v1`: audio files, kept independent of the app version.
- **OFF-02a** MUST (B2, precache integrity):
  1. The build **inlines** `BUILD_HASH` and the precache list (`[{url, sha256, bytes}]`) into `sw.js`. Every deploy that changes any file therefore changes the bytes of `sw.js`.
  2. The SW is registered with `updateViaCache:'none'`.
  3. During `install`, each file is fetched with `cache:'reload'` from the URL `<url>?__v=<sha256[0..8]>`. This bypasses both the HTTP cache and GitHub Pages' CDN edge cache, which is keyed on the full URL.
  4. Each response body is hashed with SHA-256 and compared with the list. The file is stored under its clean URL only if the hashes match.
  5. If any file mismatches or fails, the SW retries it once after 5 s. If it still fails, `install` throws. The previous SW stays in control unchanged, and the browser's next update check retries the install.
  - *AC:* see TST-24b.
- **OFF-03** MUST: The precache completes during `install`, and the page is then notified (HUB-09).
  - *AC:* after the first visit completes, every canonical URL works offline, and grading works offline.
- **OFF-04** MUST: Navigation requests are served cache-first from the app cache, ignoring the query string (`/exam/?id=…` is served `/exam/index.html`), with `/404.html` as the fallback. `/data/**` is served cache-first.
- **OFF-05** MUST: Excluding audio, the precache is at most 2.0 MB. The build fails if this is exceeded.
- **OFF-06** MUST: Audio is cached in two ways:
  - on the first online play, by a full non-range background fetch that is deduplicated;
  - by «حمّل الصوت كله».
  Cached audio survives app updates.
- **OFF-07** MUST: Range handling. For a request with a `Range` header whose URL is in `khayr-audio-v1`, the SW responds from the cached body:
  - `206` with `Content-Range: bytes s-e/total`, `Content-Length`, `Accept-Ranges: bytes` and `Content-Type: audio/mpeg`;
  - supported forms: `bytes=s-e`, `bytes=s-` and `bytes=-n`;
  - an unsatisfiable range gets `416` with `Content-Range: bytes */total`;
  - a request without `Range` gets `200` with the full body.
- **OFF-08** MUST: A `206` response is never stored. Uncached Range requests go to the network unchanged.
- **OFF-09** MUST: Audio is cached only if its body's `bytes` (and `sha256`, when downloading all) match the manifest.
- **OFF-10** MUST (update flow, multi-tab safe):
  - The new SW installs per OFF-02a, then waits.
  - Pages show «يتوفر تحديث» with «حدّث الآن», except on a page that is playing audio, which shows it after playback stops.
  - «حدّث الآن» posts `SKIP_WAITING`.
  - On `controllerchange`, every open tab reloads exactly once. The guard reloads only when the previous controller was not null and this tab has not already reloaded for this controller.
  - A tab that is playing audio instead shows «يتوفر تحديث — أعد التحميل بعد انتهاء الاستماع». Because all modules load statically (ARCH-07), it keeps working until then.
  - Activation is also announced on BroadcastChannel `khayrukum`.
  - Nothing reloads without a user tap, except the coordinated reload after the user chose «حدّث الآن».
- **OFF-11** MUST: On `activate`, old `khayr-app-*` caches are deleted, and so are audio entries whose URL (including `?v=<sha8>`) is not in the current manifest. `khayr-audio-v1` itself is never deleted on update.
- **OFF-12** MUST: The SW is registered after `load`. The app works if registration fails.
- **OFF-20** MUST: «حمّل الصوت كله» is **driven by the page**:
  - it shows the size;
  - it checks `storage.estimate()`, and if space is short shows «لا توجد مساحة كافية على الجهاز»;
  - it calls `persist()`;
  - it fetches 3 files at a time and writes each verified file to `khayr-audio-v1` as soon as it is complete;
  - it shows «<k> من <n> ملفًا · <MB>», with «أوقف»;
  - it ends with «الصوت محفوظ على الجهاز ✓».
  Leaving the page stops the download. The settings and listening pages then offer «أكمل التحميل (<k> من <n>)», which skips files already cached.
- **OFF-21** MUST: «احذف الصوت المحفوظ» deletes `khayr-audio-v1`.
- **OFF-22** MUST: Audio status is computed from the cache.
- ~~OFF-23~~ Merged into HUB-06.
- **OFF-24** MUST: When `navigator.onLine` is false, a banner reads «أنت الآن دون اتصال — كل شيء يعمل من الجهاز». «هذا الصوت غير محفوظ بعد» appears only when an uncached file is requested while offline or after its fetch failed.

---

## 7. Non-functional requirements

### 7.0 Product feel (NFR-FEEL) — standing requirement (owner, 2026-11-11)

The product must always be **interactive, fast, smooth and seamless**. This applies to every page and every
feature, now and later, and outranks convenience in implementation. A change that makes the app slower,
jumpier or less direct is a regression even if every functional test passes.

- **NFR-FEEL-01 Interactive** MUST: Learning features ask the reader to act (tap, choose, order, reveal,
  recite) and answer every action with immediate, visible feedback. Reading-only screens are the exception.
- **NFR-FEEL-02 Fast** MUST: A tap shows its result within 100 ms on a mid-range phone (4× CPU throttling in
  Chromium); interaction to next paint ≤ 200 ms. Pages open from the cache within 1 s, offline included. Local
  data never shows a spinner. The UI is updated first and saved after, never the other way round.
- **NFR-FEEL-03 Smooth** MUST: No layout shift when answering, revealing or moving to the next question; the
  scroll position follows the reader's focus (the next question comes into view; the page never jumps to the
  top). Motion is short (≤ 200 ms), never blocks input, and is off under `prefers-reduced-motion`. Audio
  repeats and joins without gaps.
- **NFR-FEEL-04 Seamless** MUST: No dead ends: every finished state offers the next step. Work is never lost:
  every answer, position and setting survives reload, closing the app and going offline, and the reader
  resumes where they left. No confirmation dialogs except for destructive actions. Wording, controls and
  behaviour are consistent across pages and rounds.
- **NFR-FEEL-05 Gate** MUST: Every feature is checked against FEEL-01..04 before release, on a phone-width
  viewport, and the check is recorded in its commit or PR. Measurable parts become automated tests (TST-60).

### 7.1 Performance (NFR-PERF)
- **NFR-PERF-01** SHOULD: Lighthouse mobile on `/` and `/exam/?id=baqarah-1`: Performance ≥ 90, LCP ≤ 2.5 s, CLS ≤ 0.05. This is advisory in CI (TST-26).
- **NFR-PERF-02** MUST: Bytes transferred until the `load` event, excluding the SW precache: at most 400 KB gzip for `/`, and at most 250 KB more for each other page, excluding the data JSON it needs.
- **NFR-PERF-03** MUST: First-party JS is at most 120 KB uncompressed per page, as native ES modules with no framework. CSS is at most 40 KB.
- **NFR-PERF-04** MUST: With 20,000 events, in Chromium with 4× CPU throttling, a grade updates the UI within 100 ms and `/history/` renders within 1 s.
- **NFR-PERF-05** MUST: Fonts are self-hosted WOFF2 with `font-display:swap`. Google Fonts are not used at runtime.

### 7.2 Accessibility (NFR-A11Y), WCAG 2.2 AA
- **NFR-A11Y-01** MUST: axe-core reports zero violations with impact serious or critical on every page, in both themes. Moderate and minor violations are reported but do not fail.
- **NFR-A11Y-02** MUST: Every interactive target is at least 24 × 24 CSS px with no overlap (WCAG 2.5.8). This is the tested minimum. SHOULD: targets are at least 44 × 44 where the layout allows. Named exceptions to the 44 px goal: day tabs, rub'-map cells, speed chips, and progress dots (which are not interactive).
- **NFR-A11Y-03** MUST: Contrast:
  - at least 4.5:1 for text, and 3:1 for large text and UI boundaries, in both themes;
  - grades are never shown by colour alone.
- **NFR-A11Y-04** MUST: Full keyboard operation:
  - `:focus-visible` outlines;
  - the ARIA tabs pattern;
  - `aria-pressed` and `aria-expanded`;
  - `role="status"` for toasts.
- **NFR-A11Y-05** MUST: `prefers-reduced-motion` is respected.
- **NFR-A11Y-06** MUST: Reflow. No horizontal scroll:
  - at 320, 360, 375, 390, 414, 430, 768 and 1280 px with default text;
  - at 375 px with text at 200 %;
  - at 320 CSS px equivalent with 400 % page zoom (WCAG 1.4.10).
  The design targets 375–430 px, with a maximum content width of about 720 px.
- **NFR-A11Y-07** MUST: Safe-area insets are respected by sticky bars and toasts.
- **NFR-A11Y-08** MUST: `overflow-x:hidden` and `overflow:hidden` are never set on `html` or `body`; they break `position:sticky`. Fix overflow at its source, or use `overflow-x:clip` on an inner wrapper. The lint in TST-12 enforces this.
- **NFR-A11Y-09** MUST: Sizes are in `rem`.

### 7.3 RTL and typography (NFR-TYP)
- **NFR-TYP-01** MUST: Fonts by role:
  - headings: Reem Kufi 500/700;
  - UI text: IBM Plex Sans Arabic 400/500/600, at least 16 px;
  - abyat: Amiri 400/700;
  - Quran: Amiri Quran, which supports the Tanzil Uthmani encoding.
  All fonts are self-hosted and licensed under the OFL.
- **NFR-TYP-02** MUST: Quran text:
  - at least 1.375 rem with line-height at least 2.0;
  - verse numbers in «﴿٦﴾» style;
  - never `text-align:justify`.
- **NFR-TYP-03** MUST: A bayt shows two hemistichs, stacked on phones and side by side from 600 px. «قيد المراجعة» is shown where DATA-17 applies.
- **NFR-TYP-04** MUST: Only logical CSS properties are used. The only exception is the seek knob.
- **NFR-TYP-05** MUST: Arabic punctuation («،», «؛», «؟», «»), and no Latin text in the UI except the domain and email.
- **NFR-TYP-06** MUST: No text is rendered as an image. Quran and Tuhfa diacritics are never stripped.

### 7.4 Themes (NFR-THM)
- **NFR-THM-01** MUST: Light and dark themes are defined as CSS custom properties. The default follows the system. The `data-theme` attribute overrides it.
- **NFR-THM-02** MUST: Both themes define accent, surface, line, muted, and the ok/mid/bad colours with soft variants. `theme-color` is set for both.
- **NFR-THM-03** MUST: No flash of the wrong theme: an inline script, allowed by a CSP hash, applies the theme before first paint.

### 7.5 Browser and device matrix (NFR-BRW)
| Tier | Platform | Versions | Level |
|---|---|---|---|
| A | iOS Safari and the iOS home-screen web app | iOS 17+. Tested on the current major (26.x) and the previous major. iOS 16.4 is best-effort. | Full, except a home-screen background-audio limitation if AUD-16 finds one |
| A | Chrome on Android | Latest 2 major versions, Android 10+ | Full |
| A | Samsung Internet | Latest | Full |
| B | Desktop Chrome/Edge, Safari 17+, Firefox | Latest 2 | Full; install where the browser supports it |
| C | WhatsApp, Instagram and Facebook in-app browsers | Current | Functional, with the GEN-06 hint |

- **NFR-BRW-01** MUST: Before any release that touches audio, the SW or storage, Tier A passes TST-50 on real devices.

### 7.6 Privacy and security (NFR-PRV)
- **NFR-PRV-01** MUST: No accounts, cookies, fingerprinting, third-party scripts or third-party fonts. The only exception is the Cloudflare Web Analytics beacon.
- **NFR-PRV-02** MUST: User data leaves the device only through an export or copy that the user starts.
- **NFR-PRV-03** MUST: Analytics:
  - Cloudflare Web Analytics only, without custom events;
  - skipped when DNT or GPC is set;
  - not loaded in the phase-2 apps unless the owner decides otherwise.
- **NFR-PRV-04** MUST: CSP is set with a `<meta http-equiv>` tag: `default-src 'self'; script-src 'self' 'sha256-<theme>' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`.
  - Because inline style attributes are blocked, dynamic styles (bar widths, swatches) are set only through the CSSOM (`el.style.setProperty`), never as `style="…"` in markup.
- **NFR-PRV-05** MUST: User and imported text is always escaped before rendering. Imports are schema-validated.
- **NFR-PRV-06** MUST: `referrer` policy is `strict-origin-when-cross-origin`.

---

## 8. Content sourcing and licensing

- **LIC-01** MUST: The Quran text is Tanzil Uthmani 1.1 with full tashkeel, imported by script and never typed (D-1). Tanzil's terms:
  - verbatim copies only;
  - attribution with a link to tanzil.net;
  - the notice is kept in every copy (DATA-12).
  The notice is also shown on «عن الموقع».
- **LIC-02** MUST: The Quran text is never modified. Word ranges are rendered from the unmodified verse. The baseline showed unvocalized, hand-typed text; v1 replaces it.
- **LIC-03** MAY: The King Fahd Complex (KFGQPC) Hafs text and its font may be used instead, but only after its license terms are confirmed in writing and recorded in `source.json`.
- **LIC-04** MUST: Page and rub' boundaries come from Tanzil metadata (Madinah Mushaf, 604 pages, D-3), and the `page` fields of questions are validated against them.
- **LIC-05** MUST: Every baseline question is ported through DATA-25 (alignment table with 0 unexplained mismatches) and DATA-26 (porting log).
- **LIC-10** MUST: Tuhfa text comes from `tuhfa-tashkeel.json`, byte for byte.
- **LIC-11** MUST: Release gate with a fallback.
  - The gate: a qualified person checks abyat **26** («…وَرَمْزُهَا فَعِ»), **28** («وَاللَّامَ الُاولَى… الُاخْرَى…») and **57** («…الْأَرْبَعْ عَشَرْ… قَطَعَكْ…») against a named printed edition, and records edition, page, verifier and date in `review` and in `source.verifiedAgainst`.
  - The fallback: if verification is still pending at launch and the owner agrees (OWNER-2), v1 ships with those abyat marked «قيد المراجعة» (DATA-17), and «عن الموقع» states the status.
  - SHOULD: spot-check the remaining abyat against the same edition.
- **LIC-20** MUST: Release gate with a fallback.
  - The gate: written permission from الشيخ أحمد مهدي (or the rights holder). It must cover the website and, as a separate scope, the store apps. It is recorded in `data/audio/permission.json` as `{status, date, scope, ref}`; the document itself is kept outside the repository.
  - The fallback: if permission is pending and the owner agrees (OWNER-1), v1 ships with `audio.enabled=false` (AUD-40, AUD-41).
  - `release-check.mjs` passes only if `status=="granted"` **or** `audio.enabled==false`.
- **LIC-21** MUST: The credit text is defined once, as `credit.audio` = «بصوت الشيخ أحمد مهدي» in `strings.ar.js` («تلاوة» is reserved for the Quran). It appears on `/listen/`, on the Tuhfa exam, on «عن الموقع» and in Media Session.
- **LIC-22** MUST: The audio cutting and fading steps can be reproduced from the scripts in `tools/audio/`.
- **LIC-30** MUST: The OFL license texts ship in `/assets/fonts/LICENSES/`. The hub hadith is attributed «رواه البخاري».
- **LIC-31** MUST: Licensing follows D-5:
  - `LICENSE` (MIT) covers code;
  - `data/quran/` is under Tanzil's terms;
  - `audio/` is all rights reserved to the reciter;
  - other content is © the project, all rights reserved.

---

## 9. Repository structure and deployment

### 9.1 Build step
A **minimal Node build** (Node ≥ 20, no bundler or transpiler) is used. The source in `site/` runs as-is, e.g. with `npx http-server site`; in dev mode the SW does not precache. The build is justified because four jobs cannot be done reliably by hand:
1. generating `sw.js` with the inlined hash list (OFF-02a);
2. data validation, alignment checks and content lint;
3. the audio check;
4. budget checks.
Nothing in the output is minified or rewritten, apart from `sw.js` and the generated files.

### 9.2 Layout
```
<repo>
├─ site/   index.html  plan/ exam/ random/ history/ listen/ settings/ about/ privacy/  404.html
│          sw.template.js  manifest.webmanifest  config.json  robots.txt
│          assets/css/  assets/js/{core,types,pages}/  assets/fonts/(+LICENSES)  assets/icons/
│          data/{quran,tuhfa,exams,plan,audio}/  data/round-types.json
│          audio/tuhfa/{bayt,chapter}/ full.mp3        # git-ignored until LIC-20 (AUD-41)
├─ schemas/
├─ tools/  build.mjs validate-data.mjs content-lint.mjs check-audio.mjs import-tanzil.mjs release-check.mjs
│          port/{align.mjs, align-overrides.json, porting-log.md}   audio/
├─ tests/  e2e/  unit/  fixtures/
├─ .github/workflows/ ci.yml  deploy.yml
├─ LICENSE (MIT)  README.md (adding an exam; releasing)
```

### 9.3 Deployment (DEP)
- **DEP-01** MUST: The repository is public and owned by the GitHub owner `khayrukum`. The account type (organization or personal) is OWNER-5; the default is an organization. Pages is deployed from GitHub Actions (`upload-pages-artifact` then `deploy-pages`). The deploy runs only if build, validation, the audio check (or audio disabled), unit tests and Playwright all pass.
- **DEP-02** MUST: The custom domain `khayrukum.app` is configured and verified for the owner (TXT `_github-pages-challenge-<owner>`), and «Enforce HTTPS» is on.
- **DEP-03** MUST: Cloudflare DNS records, all **DNS only**:
  - apex A: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153;
  - apex AAAA: 2606:50c0:8000::153, 2606:50c0:8001::153, 2606:50c0:8002::153, 2606:50c0:8003::153;
  - `www` CNAME `<owner>.github.io`;
  - if any CAA record exists, add `0 issue "letsencrypt.org"`.
- **DEP-04** MUST: The apex is canonical, and `www` redirects to it.
- **DEP-05** MUST: `.app` is HSTS-preloaded, so browsers always use https, and `http://` links are upgraded automatically. HTTPS must be working, with the certificate shown as issued in Pages, before any link is shared.
- **DEP-06** MUST: Email for `info@khayrukum.app` uses Cloudflare Email Routing (MX and SPF), forwarding to the inbox chosen in OWNER-6, plus a DMARC record with `p=none`.
- **DEP-07** MUST: Cloudflare Web Analytics is set up as a manual site. Its token is in `config.json`.
- **DEP-08** MUST: GitHub Pages limits apply:
  - `max-age=600` cannot be changed (handled by OFF-02a);
  - no custom headers;
  - at most 1 GB per site;
  - about 100 GB/month soft bandwidth, roughly 3,000 full audio downloads. Beyond that, move the audio to a CDN (LATER).
- **DEP-09** MUST: Release process:
  1. tag the release;
  2. `release-check.mjs` passes;
  3. TST-50 is signed off in the release PR.

---

## 10. Test plan outline

CI runs Playwright on Chromium (Pixel 7 profile), WebKit (iPhone 14 profile; real iOS is covered by TST-50) and Firefox desktop.

| ID | Test | Method | Covers |
|---|---|---|---|
| TST-10 | Schemas, qid rules, ref resolution, word bounds, `outOfRange`, `page` fields vs `meta.pages`, contiguous chapter boundaries, chain expansion (including reversed), question counts | node | DATA-01, 11, 15–24, LIC-04 |
| TST-11 | Every verse byte-equal to the Tanzil download made with the recorded `options`; `notice` present in every Quran file | node | DATA-10…14, LIC-01/02 |
| TST-12 | Content and code lint: colloquial word list («إنت», «اللي», «ده», «إيه», «كمّل», «يقرا», «جت», «التانية», …); untokenized quotes (DATA-02); `<title>`/`<h1>` equal to strings; no `overflow-x:hidden` on html/body; no physical margins; no origin in JS outside `strings.ar.js`; no storage access outside `store.js`; no `<input type=range>`; no `style="` in JS template strings; no dynamic `import()` | node | GEN-01/02, DATA-02/52, ARCH-01/07, NFR-A11Y-08, NFR-TYP-04, NFR-PRV-04, AUD-12 |
| TST-13 | axe-core on every page × both themes × 375 px | Playwright | NFR-A11Y-01, 03, 04 |
| TST-14 | `scrollWidth ≤ clientWidth` at every NFR-A11Y-06 width and zoom; sticky bars visible after scrolling; target-size check ≥ 24 px. Visual review is manual, at release. | Playwright | GEN-09, NFR-A11Y-02/06, EX-03, LIS-02 |
| TST-15 | Unit tests: word indexing (2:2, 2:21, t:25); item rendering (gapped, note, label, showRef); chain shorthand expansion; history aggregates; plan arithmetic (x, y, day done, Saturday banner); random pool; merge rules including mistake tombstones; DATA-41 cases (re-grade in the same session updates; clear in the same session tombstones; clear of an earlier-session grade leaves history unchanged; re-grade in a new session appends; reset starts a new session) | node:test | DATA-01, 41, 44, HIS-03…06, PL-03/08/15, RND-05/06 |
| TST-16 | Alignment: `align.mjs` on the baseline gives 0 mismatches; every override has a reason; porting log present | node | DATA-25/26, LIC-05 |
| TST-20 | End-to-end flows for hub, exam, random, history, plan and settings, including copy feedback texts and empty states | Playwright | HUB-*, EX-*, RND-*, HIS-*, PL-*, SET-01/04 |
| TST-21 | Audio engine with fake media: `play()` called synchronously; one `<audio>` element; selection gap ≤ 300 ms (`ended` to `playing`); loop; rate and pitch persist; early-end recovery; seek drag does not scroll | Playwright | AUD-02…13, LIS-05…09 |
| TST-22 | Offline Range requests: `bytes=0-1`, `bytes=1000-`, `bytes=-500`, out-of-range → exact bytes and headers, 416; no 206 responses in the cache | Playwright | OFF-07/08 |
| TST-23 | Offline: first visit → precache → offline → every URL, grading, cached bayt plays; uncached bayt shows its message only when offline | Playwright | OFF-03/04/24 |
| TST-24 | Update: build A, then build B; toast; «حدّث الآن»; **two tabs**: the second tab reloads once and works; a tab playing audio defers the reload; audio cache survives; stale audio entries are removed | Playwright | OFF-10/11 |
| TST-24b | Integrity: serve build B with `Cache-Control: max-age=600` behind a proxy that returns one stale file from build A. B's install fails, A keeps control offline and online, and the next check after the proxy is fixed installs B | Playwright + proxy | OFF-02a |
| TST-25 | Download all: progress, «أوقف», navigate away (download stops), return («أكمل التحميل» skips cached files), short-quota path, delete | Playwright | OFF-20…22, SET-02, LIS-11 |
| TST-60 | Feel: with 4× CPU throttling, a tap on a grade / choice / reveal / next updates the DOM within 100 ms on every round type; no layout shift (CLS 0) between question and answer; «التالي» keeps the question in view | Playwright | NFR-FEEL-02, NFR-FEEL-03 |
| TST-26 | Byte budgets (precache, per-page JS/CSS/transfer up to `load`) as gates. Installability: the manifest parses, icons load, the SW controls the page, Chromium fires `beforeinstallprompt`. Lighthouse on `/` and `/exam/` is advisory. | build + Playwright + LHCI | OFF-01/05, NFR-PERF-01…03 |
| TST-27 | Privacy: network log shows only same-origin and analytics requests; analytics absent with GPC/DNT; **0 CSP violations** | Playwright | NFR-PRV-01…04 |
| TST-28 | Storage namespace; storage blocked → warning and the app still usable; 20k-event performance with 4× throttling | Playwright | DATA-50, GEN-05, NFR-PERF-04, DATA-43 |
| TST-30 | Data-only extension: a `baqarah-3` fixture appears on the hub, in the random exam (rub' 5–6) and in history, with no code changes | Playwright | DATA-20, ARCH-02, RND-01…03 |
| TST-31 | Canonical URLs and rewrites; unknown and `soon` exams; `#q=` | Playwright | IA-01…06 |
| TST-32 | Unified history (4 events from 4 tools); per-type merge; retired qid shows «سؤال قديم»; HUB-02 ignores retired qids | Playwright | HIS-01/06/10, HUB-02 |
| TST-35 | `check-audio.mjs` passes on the shipped files and fails on synthetic bad files (3 s silence, wrong duration, wrong offset) | node + ffmpeg | AUD-30, LIC-22 |
| TST-36 | Build with `audio.enabled=false`: no `.mp3` in the artifact, no audio controls, no 404s | build + Playwright | AUD-40/41, LIS-12 |
| TST-40 | Backup: export → import into a clean profile gives identical state; second import adds nothing; pasted-text path; invalid file rejected | Playwright | SET-04, DATA-60/61 |
| TST-50 | Manual on real devices: iPhone (current and previous iOS major; Safari and home-screen app) and Android (Chrome and Samsung Internet). M-01 first tap plays. M-02 silent switch on still plays. M-03 lock-screen controls and artwork. M-04 selection continues with screen locked; listener confirms the gap ≤ 300 ms. M-05 airplane mode: cached bayt plays and seeks. M-06 download all survives a restart. M-07 install steps correct for the current iOS; HUB-08 shown. M-08 speeds 0.5× and 3× keep pitch. M-09 seek drag does not pan. M-10 link opened from WhatsApp. M-11 fonts and marks render correctly on 2:2 and 2:21. | manual | AUD-*, OFF-*, HUB-07/08, NFR-BRW-01, AUD-16 |
| TST-60 | `release-check.mjs`: LIC-11 verified (or the owner accepted «قيد المراجعة»); LIC-20 granted (or audio disabled); Quran notice present; CI green | node | LIC-11/20, DEP-09 |

**Definition of done for v1:** every MUST passes its test; TST-50 is signed off on one iPhone and one Android phone; TST-60 is green; the owner has reviewed the فصحى strings once.

---

## 11. Owner decisions pending
D-1…D-6 in section 0 stand unless the owner overturns them. These questions are real decisions that only the owner can make. Each has a default that applies if there is no answer.

1. **OWNER-1.** If the reciter's permission is still pending at launch, should v1 launch with audio switched off (AUD-40)? Who will ask الشيخ أحمد مهدي, and should the request also cover the store apps? **Default if no answer: launch with audio off; the request covers both the website and the apps.**
2. **OWNER-2.** Which printed edition is used to check abyat 26, 28 and 57, and who checks them? If the check is still pending at launch, may v1 show those abyat with «قيد المراجعة»? **Default: yes, ship them marked «قيد المراجعة».**
3. **OWNER-3.** Should a plain, undiacritized Quran view be added later as an option? Tanzil Simple-Clean would allow it. **Default: no, not planned; revisit after v1.**
4. **OWNER-4.** Move progress from the old pages (section 4.10)? **Default: no; members start fresh and can use backup export/import from now on.**
5. **OWNER-5.** Should `khayrukum` on GitHub be an organization (several maintainers, survives one person leaving) or a personal account? **Default: an organization, with the owner plus one backup maintainer.**
6. **OWNER-6.** Who answers info@khayrukum.app, and which inbox does it forward to? **Default: forwarded to the owner's personal inbox.**
7. **OWNER-7.** Who owns the Cloudflare account, domain renewal and analytics? **Default: the owner's account, with auto-renew and 2FA on Cloudflare and GitHub.**
8. **OWNER-8.** Confirm decisions D-1 to D-6. **Default: they stand.**

---

## Appendix A — Review disposition (REVIEW.md)

| ID | Disposition |
|---|---|
| B1 | **Fixed.** Tuhfa word ranges (4.1); multi-ref, `note`, `label` and `showRef` items (4.2); explicit chains plus a shorthand that allows reversed chains (4.2); Uthmani token indexing with Simple-Clean alignment (DATA-01, DATA-25); testable LIC-05 with an alignment table and porting log (DATA-25/26, TST-16). The DATA-02 lint has an allow-list for non-corpus quotes. |
| B2 | **Fixed.** OFF-02a (sw.js with inlined hash list, `updateViaCache:'none'`, `cache:'reload'` plus `?__v=` cache-busting, hash check, failed install keeps the old SW) and TST-24b. |
| M1 | **Fixed.** Migration is out of v1 (D-6, OWNER-4). Section 4.10 documents 3 origins and clipboard export, to be used only if the owner asks. The paste field and broader `accept` were added to SET-04. |
| M2 | **Fixed.** NFR-A11Y-02 (24 px tested minimum, 44 px goal, named exceptions); NFR-A11Y-06 reflow; PL-03 short day names below 360 px. |
| M3 | **Fixed.** OFF-10 coordinated reload on `controllerchange` with a once-guard and deferral while audio plays; ARCH-07 static imports; TST-24 tests two tabs. |
| M4 | **Fixed.** OFF-20 download is driven by the page with resume; TST-25 covers navigating away. |
| M5 | **Fixed.** AUD-40/41 audio switch (and audio kept out of the public repo until permission); DATA-17 and LIC-11 «قيد المراجعة» fallback; release check accepts "granted or disabled"; OWNER-1/2. |
| M6 | **Fixed.** NFR-BRW Tier A is iOS 17+, tested on the current (26.x) and previous major; HUB-07 iOS steps chosen by version; M-07. |
| M7 | **Fixed.** DATA-23 makes gradability depend on context; HUB-02 total excludes random-number; history groups it under one type. |
| M8 | **Fixed.** DATA-41 spells out every case. **Part of the suggestion rejected:** the new session on «ابدأ من جديد» is kept, because without it a re-grade after reset overwrites the earlier attempt's event. The reason is now stated, and TST-15 covers it. |
| M9 | **Fixed.** Section 0 records decisions D-1…D-6; section 11 lists OWNER-1…8 with defaults; the Q1 premise is corrected (Tanzil Simple-Clean exists, D-1). |
| m1 | **Fixed.** Baseline details added to 2.2, PL-03…11, EX-11/15, RND-04/06/07/08, HIS-05/08, LIS-02…05. |
| m2 | **Fixed.** y = 2 × \|done\| (distinct pairs), one definition in PL-08, referenced from HUB-05. |
| m3 | **Fixed.** Generalized as `outOfRange` (bridge, lookalike, context) in DATA-22; random-range behaviour noted in RND-05. |
| m4 | **Fixed.** Structured `page` field with a generated `ask` (DATA-21), validated by TST-10. |
| m5 | **Fixed.** Download `options` recorded; `notice` in every Quran file; rub'-el-hizb sign excluded from text, «۞» added only by the UI (DATA-10/12, PL-02). |
| m6 | **Fixed.** OFF-11 removes audio entries not in the manifest. |
| m7 | **Fixed.** Styles set only through the CSSOM (NFR-PRV-04); lint in TST-12; 0 CSP violations in TST-27. |
| m8 | **Fixed.** Lighthouse PWA audit replaced by a Playwright installability check (TST-26). |
| m9 | **Fixed.** Screenshot diffs made manual; Lighthouse advisory on 2 pages; NFR-PERF-04 uses 4× CPU throttling. |
| m10 | **Fixed.** NFR-PERF-02 is measured up to `load`, excluding precache. |
| m11 | **Fixed.** NFR-A11Y-01 failure threshold clarified (serious or critical fail; moderate and minor reported). |
| m12 | **Fixed.** Mistakes stored as items with tombstones (PL-07, DATA-44). |
| m13 | **Fixed.** HUB-02 and EX-02 count only current qids; TST-32. |
| m14 | **Fixed.** «فنسختك هي المرجع» restored; bayt prefill defined (GEN-08). |
| m15 | **Fixed.** One credit string `credit.audio` = «بصوت الشيخ أحمد مهدي» (LIC-21). |
| m16 | **Fixed, in deferred form.** Per-exam mapping and best-effort `tool` noted in 4.10 (migration is out of v1). |
| m17 | **Fixed.** Gap measured from `ended` to `playing` (AUD-04, TST-21, M-04). |
| m18 | **Fixed.** AUD-16 day-one spike; a home-screen limitation is documented and does not block release. |
| m19 | **Fixed.** OFF-24 shows the message only when offline or after a failed fetch. |
| m20 | **Fixed.** Tuhfa is kept byte-exact (no NFC), like the Quran text (section 4 intro). |
| n1 | **Fixed.** SET-05 cites OFF-10; OFF-23 merged into HUB-06; HUB-10 merged into 2.2. |
| n2 | **Fixed.** DEP-05 reworded. |
| n3 | **Fixed.** ARCH-01 lists `capacitor://localhost`; share text moved to `strings.ar.js`. |
| n4 | **Fixed.** HUB-01 allows `mailto:`. |
| n5 | **Fixed.** LIS-08 speeds in Arabic digits with «٫». |
| n6 | **Fixed.** GEN-02 exempts static `<title>`/`<h1>`; TST-12 checks they match the strings. |
| n7 | **Fixed.** GEN-07 exempts single-item deletion and clearing the selection. |
| n8 | **Fixed.** `ui:inapp` added (DATA-51). |
| n9 | **Fixed.** AUD-30 #7 measures `chapterOffsets` by cross-correlation instead of cumulative sums. |
| n10 | **Fixed.** DATA-01: a trailing pause mark is not rendered. |
| n11 | **Fixed.** HUB-04 shows the date when the last event is older than 6 days. |
| n12 | **Fixed.** RND-02 offers only covered verses. |
| n13 | **Fixed.** IA-01 notes that the JS-set canonical is accepted. |
| n14 | **Fixed.** Renamed to `rub-openings.json` with a `ref` key (DATA-13). |

Rejected outright: none. One part of M8 was deliberately not adopted; the reason is given in its row.
