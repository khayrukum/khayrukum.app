# Sync queue: Claude pages → website

The group uses the Claude pages every day («خيركم من تعلّمه», artifact `GUyktQgr4bAu91SCZ2dvhb`), and the owner
tries new ideas there first. Owner decision (2026-11-24): changes made on the Claude pages are **collected here
and ported to the site in one batch every two days** (one push, one trial deploy: see CLAUDE.md rule 7).

How a batch is done: port every item under *Pending*, give it requirement IDs in `REQUIREMENTS.md`, add or update
tests, run `npm test`, look at the pages at phone width, push once, redeploy the trial site once, then move the
items to *Done* with the commit hash.

## Pending

Listening page («الاستماع والتكرار» on the Claude pages = `/range/` + `/listen/` + «وضع العرض» on the site):

1. **Unit «بالسورة»**: from sura to sura; only suras covered completely are offered; each starts with its basmala.
2. **Closed loop**: «من» may come after «إلى»; the range then runs to the end of the list and round from its
   beginning (e.g. الناس → الفاتحة). Changing «من» past «إلى» still moves «إلى»; choosing «إلى» before «من»
   makes the loop. The summary says «↻ يدور من آخر القائمة إلى أولها». This changes RNG-04 (one unbroken run).
3. **دعاء ختم القرآن** as an item of its own: part `m61`, 1843.5 s to 2018.6 s. Offered after page 604 and at the
   end of the sura list. Its text is not Quran text from Tanzil, so the reading view shows the title only until a
   reviewed text is provided.
4. **One listening page**: «المادة» = القرآن الكريم | تحفة الأطفال with the same player (Tuhfa by chapter or by
   bayt) instead of two separate pages. Decide on the site whether `/listen/` and `/range/` merge.
5. **Reading view type size**: the largest size that fits the screen (binary search, no fixed cap); a verse that
   would need less than a comfortable size is paged at that size; one size for all screens of a verse.
6. **Reading view controls float over the text** (shown on tap, hidden after 3 s) so the text gets the whole
   screen; the close button sits in the corner without a bar of its own.
7. **Reading view title during a basmala** is the sura that the basmala opens, not the previous one.
8. **Exams on the Claude pages now show the Uthmani text** generated from the site's data (no site change needed;
   listed so the two stay equal).
9. **Tuhfa exam moved inside the hub** on the Claude pages (no site change needed).

## Done

| Date | Item | Commit |
|---|---|---|
| 2026-11-24 | Parts 60 and 61 of the recitation (An-Nazi'at … An-Nas): timings, cues, sura files 79–114 | 7ce34c4 |
| 2026-11-24 | Alignment tools kept in the repo (`tools/audio/align/`) | 7ce34c4 |
| 2026-11-24 | `meta.json` no longer carries the sentinel 115th sura row | 7ce34c4 |
