# CONTENT-TODO — what the owner must provide

Status on 2026-11-07, branch `v1`. Items are ordered by what blocks the first release.

## Done (no action needed)

- **Quran text (LIC-01, DATA-10…14).** `data/source/quran-uthmani.txt`, `quran-simple-clean.txt` and `quran-data.js`
  were downloaded from tanzil.net on 2026-11-07 and imported with `node tools/import-tanzil.mjs`.
  The Baqarah exams 1 and 2 are ported (`node tools/port/align.mjs`): 0 mismatches, 6 human overrides with reasons
  (`tools/port/align-overrides.json`, `tools/port/porting-log.md`).
  - Note: that download has **sajdah signs, rub'-el-hizb signs and superscript-alef tatweel ON**; the requirements'
    default (DATA-10/12) is OFF for the first two. The text is kept byte-exact and the actual options are recorded in
    `site/data/quran/source.json`. The signs are mark-only tokens, so they are never counted as words and never appear
    in labels (the plan's «۞» comes from the UI). Optional: download again with *rub-el-hizb* and *sajdah* OFF
    (Tanzil → Download → Uthmani, "Text with aya numbers"), replace the file, run
    `npm run import:tanzil && node tools/port/align.mjs --check`: the references stay valid.
- **Tuhfa text (LIC-10).** From `tuhfa-tashkeel.json`, with the owner's corrections to abyat 26 and 57 (see §2).

## 1. Fonts (NFR-TYP-01, NFR-PERF-05, LIC-30) — done

The fonts are in `site/assets/fonts/` with their OFL texts in `LICENSES/`. They were taken unmodified from
github.com/google/fonts (`ofl/ibmplexsansarabic`, `ofl/amiri`, `ofl/amiriquran`) and only re-wrapped
as WOFF2 (same glyphs, same names). Headings use IBM Plex Sans Arabic (Reem Kufi was dropped: hard to read at small sizes).

## 2. Tuhfa verification (LIC-11, OWNER-2) — done

The owner reviewed abyat 26, 28 and 57 on 2026-11-10: 26 reads «وَرَمْزَهَا», 57 reads «قَطَعْكَ», 28 was correct.
All three are recorded as `verified` in `site/data/tuhfa/abyat.json`.

## 3. Audio (LIC-20, AUD-33, AUD-40/41, OWNER-1)

Audio is **off** in v1 and no audio file is in Git. To switch it on:
1. Obtain written permission from الشيخ أحمد مهدي covering the website (and, separately, the store apps). Keep the
   document outside the repository.
2. Record it in `site/data/audio/permission.json` (`status:"granted"`, `granted:true`, `date`, `scope`,
   `ref`) and set `permission.granted:true` for the collection in `site/data/audio/index.json`.
3. Provide the files to CI from private storage (not Git) at `site/audio/tuhfa/bayt/01–61.mp3`,
   `site/audio/tuhfa/chapter/01–10.mp3`, `site/audio/tuhfa/full.mp3`.
4. `node tools/check-audio.mjs --dir site/audio --write` (already run once on the provided files; the manifest
   `site/data/audio/tuhfa.json` has their bytes, durations, sha256 and measured chapter offsets).
5. Set `"audio": {"enabled": true}` in `site/config.json`. Only then may `.gitignore` drop the `*.mp3` rule.

Local testing with audio: copy the files to `local-audio/tuhfa/…` (git-ignored) and run
`node tools/build.mjs --out dist-audio --audio on --audio-dir local-audio`.

## 4. Analytics token (DEP-07, NFR-PRV-03)

Create a Cloudflare Web Analytics *manual* site for khayrukum.app and put its token in
`site/config.json` → `analytics.cloudflareToken`. Empty = analytics off.

## 5. Hosting and accounts (DEP-01…08, OWNER-5…7) — owner actions, not code

- Enable GitHub Pages with source "GitHub Actions"; set the custom domain `khayrukum.app`; verify the domain
  (TXT `_github-pages-challenge-khayrukum`); turn on "Enforce HTTPS" once the certificate is issued.
- Cloudflare DNS (DNS only): apex A 185.199.108–111.153, AAAA 2606:50c0:8000–8003::153, `www` CNAME
  `khayrukum.github.io`, CAA `0 issue "letsencrypt.org"` if any CAA exists.
- Email routing for info@khayrukum.app (MX, SPF) and DMARC `p=none`.
- Deploy by pushing a tag `v1.0.0` (workflow `deploy.yml`).

## 6. Real-device tests (TST-50, AUD-16, NFR-BRW-01)

Run M-01…M-11 on one iPhone (Safari and home-screen app) and one Android phone before the first release that
ships audio. If background audio fails in the iOS home-screen app, the limitation note is already on «عن التطبيق».

## 7. Later

Exam 3 (rub' 5–6, 2:75–105) is listed as «soon» in `site/data/exams/index.json`. Adding it is data only: write
`site/data/exams/baqarah-3.json` (refs, see README) and set `status: "published"`.
