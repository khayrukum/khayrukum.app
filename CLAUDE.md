# خيركم من تعلّمه — standing rules for anyone working on this repo

Read `docs/REQUIREMENTS.md` (the requirements) and `docs/LEARNING-PLAN.md` (the roadmap) first.

Standing requirements from the owner — they apply to every change:

1. **Interactive, fast, smooth, seamless** (NFR-FEEL, §7.0). Update the UI first and save after; no layout
   jumps; the next question comes into view; no dead ends; nothing the reader did is ever lost. Check every
   feature against §7.0 at phone width before it ships.
2. **Everything works offline.**
3. **All user-facing text is Modern Standard Arabic (فصحى)**, never dialect.
4. **Quran text only from Tanzil** (`data/source/`), referenced by `[[q:sura:aya:words]]`, never typed by hand.
   Content written by us (titles, tips, summaries) is marked as ours until reviewed.
5. **No audio is committed or published** before the reciter's written permission (الشيخ أحمد مهدي).
6. Mutashabihat and topic drills wait for a verified source (owner decision, 2026-11-11).
7. The GitHub account has been suspended by spam detection three times: batch changes and push / deploy once
   per piece of work, not after every edit.
