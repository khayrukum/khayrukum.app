# خيركم من تعلّمه · khayrukum.app

## بالعربية

موقع لمجموعة صغيرة تحفظ سورة البقرة ربعين في الأسبوع، وتراجع منظومة «تحفة الأطفال». فيه اختبارات تقيّم فيها نفسك،
وخطة أسبوعية للتثبيت، وسجل واحد لكل الإجابات، واستماع مع التكرار، ويعمل دون اتصال بعد الزيارة الأولى.
كل التقدّم يُحفَظ على جهاز المستخدم فقط.

- نص القرآن الكريم من مشروع تنزيل (tanzil.net) برسم المصحف العثماني، منقول كما هو.
- نص التحفة من `tuhfa-tashkeel.json` كما هو، والأبيات ٢٦ و٢٨ و٥٧ «قيد المراجعة».
- التلاوة بصوت الشيخ أحمد مهدي، وهي معطّلة حتى يُسجَّل إذن النشر.

ما ينبغي لصاحب الموقع توفيره مذكور في `CONTENT-TODO.md`.

## English

Static PWA (no framework, no server) for Quran memorization (Al-Baqarah) and Tuhfat al-Atfal review.
Requirements: `docs/REQUIREMENTS.md`; coverage: `TRACEABILITY.md`; standing rules: `CLAUDE.md`.

### Layout
```
site/        the site, runs as-is (node tools/serve.mjs site 8080) — no service worker precache in dev
  assets/js/core/   refs, store (IndexedDB), grading, stats, registry, render, audio, platform, ui …
  assets/js/types/  one module per question type (ARCH-02)
  assets/js/pages/  one entry module per page
  data/             quran/ (generated), tuhfa/, exams/, plan/, audio/, round-types.json
schemas/     JSON Schemas for every data file
tools/       build, validate-data, content-lint, check-audio, import-tanzil, import-tuhfa, release-check, port/
tests/       unit/ (node:test), e2e/ (Playwright)
data/source/ verbatim inputs: Tanzil Uthmani + Simple-Clean + metadata, tuhfa-tashkeel.json
```

### Commands
```
npm install                      # playwright + axe-core (dev only)
npm run validate                 # TST-10/11: schemas, refs, word bounds, page fields, Quran byte check
npm run lint                     # TST-12
npm run test:unit                # TST-15/16
npm run build                    # dist/ with sw.js (hash-verified precache), audio OFF by default
npm run test:e2e                 # Playwright (needs dist/; audio tests need dist-audio/)
node tools/release-check.mjs     # TST-60 release gate
```

### Adding an exam (data only, DATA-20)
1. Write `site/data/exams/<id>.json` (schema `schemas/exam.schema.json`). Quran text is never typed: prompts and
   answers are references such as `{"ref":"2:75:1-4"}`, `{"refs":["2:54:6-8","2:54:14-15"],"join":"dots"}`,
   `{"ref":"t:16:2:3-4"}`; quotes inside asks/tips are inline tokens `«[[q:2:171:-6]]»`.
   Question ids are `<id>/<type>/<nn>` and are never reused (removed ids go to `retired`).
2. Add the entry to `site/data/exams/index.json` with `status: "published"`.
3. `npm run validate && npm run lint`. The hub, random exam and history pick it up with no code change.

### Releasing
1. Fill the items in `CONTENT-TODO.md` (fonts, Tuhfa review decision, analytics token; audio only with permission).
2. `node tools/release-check.mjs` must pass; sign off TST-50 on real devices in the release PR.
3. Tag `vX.Y.Z` and push the tag: `.github/workflows/deploy.yml` builds (`--strict`), tests and deploys to Pages.

### Known limitation
Background audio with the screen locked in an iOS home-screen web app was not verified (AUD-16 needs a real iPhone);
«عن التطبيق» says to use Safari if playback stops.

### Licenses
Code: MIT (`LICENSE`). Quran text (`data/source/quran-*`, `site/data/quran/`): Tanzil terms — verbatim copies only,
attribution with a link to tanzil.net, notice kept (it is in every Quran data file and on «عن التطبيق»).
Recitation: all rights reserved to the reciter, used with permission (not in this repository).
Fonts: SIL OFL. Other content: © the project, all rights reserved.
