# Sync queue: Claude pages → website

The group uses the Claude pages every day («خيركم من تعلّمه», artifact `GUyktQgr4bAu91SCZ2dvhb`), and the owner
tries new ideas there first. Owner decision (2026-11-24): changes made on the Claude pages are **collected here
and ported to the site in one batch every two days** (one push, one trial deploy: see CLAUDE.md rule 7).

How a batch is done: port every item under *Pending*, give it requirement IDs in `REQUIREMENTS.md`, add or update
tests, run `npm test`, look at the pages at phone width, push once, redeploy the trial site once, then move the
items to *Done* with the commit hash.

## Pending

1. **One listening page**: on the Claude pages «المادة» = القرآن الكريم | تحفة الأطفال share one player (Tuhfa by
   chapter or by bayt). The site still has `/listen/` and `/range/` as two pages that share «وضع العرض».
   Owner decision needed: merge them on the site or keep two pages.
2. **Reviewed text of «دعاء ختم القرآن»** for the reading view (RNG-17 shows the title only).

3. **التفسير الميسر under the verse** (2026-11-27, on the Claude pages): small type under the verse in the reading
   view, a «التفسير» toggle (remembered), scrolls inside its own box (max about a third of the screen), verse fitted
   in the space left; hidden for the basmala, Tuhfa and the dua. Text: King Fahd Complex «التفسير الميسر», taken
   from `spa5k/tafsir_api` (`tafsir/ar-tafsir-muyassar/`, source quran.com); the sura introduction before
   «[التفسير]» in each first verse is dropped. **Owner decision needed before porting:** the licence note, and 7
   entries quote Quran words inside ﴿ ﴾ that are not from Tanzil (standing rule 4).
4. **«ابدأ بآخر مدى عند الفتح»** (2026-11-27, on the Claude pages; for opening from a phone automation when the
   car connects): the hub goes straight to the reading view on the last range with one large ▶. On the site this
   should be a link (`/range/?resume=1`); it waits for the recitation audio to be published (OWNER-9), without
   which there is nothing to resume.
5. **Audio format** (2026-11-27): the Claude pages now carry the recitation parts as MP3 (48 kb/s mono, 24 kHz);
   audio-only MP4 files could not pass claude.ai's review for public sharing and the public link stopped opening.
   Nothing to port (the site publishes no audio yet); remember it when OWNER-9 is decided.

## Done

| Date | Item | Commit |
|---|---|---|
| 2026-11-24 | Parts 60 and 61 of the recitation (An-Nazi'at … An-Nas): timings, cues, sura files 79–114 | 7ce34c4 |
| 2026-11-24 | Alignment tools kept in the repo (`tools/audio/align/`) | 7ce34c4 |
| 2026-11-24 | `meta.json` no longer carries the sentinel 115th sura row | 7ce34c4 |
| 2026-11-25 | Phrase cues start at the real first word of each chunk (175 of 1981 moved; reported on Al-Anbiya 18) | 3a94a7e |
| 2026-11-26 | Unit «بالسورة» (RNG-15) | a55386d |
| 2026-11-26 | Closed loop «من» after «إلى» (RNG-16) | a55386d |
| 2026-11-26 | «دعاء ختم القرآن» as an item of its own (RNG-17, AUD-37) | a55386d |
| 2026-11-26 | «آخر ما استمعت إليه», «المدى السابق / التالي» (RNG-18/19); the last selection was already restored (RNG-10) | a55386d |
| 2026-11-26 | Reading view: largest type that fits, floating controls (STG-23/24) | a55386d |
| 2026-11-26 | Checked, no change needed on the site: title during a basmala (already the sura it opens); «التالي» while paused (the site seeks 0.1 s before the verse and shows it); the player follows the element's own play / pause events (`core/audio.js`) | — |
| 2026-11-26 | Claude pages only (nothing to port): Uthmani text in the exams, Tuhfa exam inside the hub | — |
| 2026-11-28 | Reading view: a tap hides the controls at once, also when paused (STG-25); the smaller floating controls were already STG-24 | f43c4b2 |
| 2026-11-28 | Reading view: sideways swipe to the next / previous verse or bayt (STG-26) | f43c4b2 |
| 2026-11-28 | Reading view: long verses scroll and follow the recited phrase instead of paging (STG-27, replaces STG-05) | f43c4b2 |
| 2026-11-28 | Reading view: «تسميع» blur (STG-28) | f43c4b2 |
| 2026-11-28 | Reading view: a pause mark stays with its word (STG-29; reported on Al-Anbiya 24) | f43c4b2 |
| 2026-11-28 | The player comes into view after «إلى» or a recent range (RNG-20) | f43c4b2 |
