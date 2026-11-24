# Verse timing of a recitation (how `data/source/recitation/minshawi-timings.json` was made)

These are the working scripts, kept here so the work is not lost. They still carry the absolute paths of the
session they were written in (`T=` / `S=` at the top of each file): set them before running.

Needs: `ffmpeg`, Python 3, and whisper.cpp with the multilingual `ggml-tiny.bin` model
(whisper.cpp: `github.com/ggml-org/whisper.cpp`, built with CMake; the model file was taken from
`github.com/Macoron/whisper.unity`, `Assets/StreamingAssets/Whisper/ggml-tiny.bin`).

For each part file `pNN.mp3`:

1. Pauses: `ffmpeg -i pNN.mp3 -af silencedetect=noise=-35dB:d=0.5 -f null -` → `s_pNN.txt`
   (−40 dB for the older parts; the threshold is per part, see `parts.json`).
2. `chunkasr.sh NN s_pNN.txt`: cuts the audio at the pauses and transcribes every speech chunk on its own, so each
   recognised word is known to lie inside one chunk (word time stamps of the recogniser are not used).
3. `chunkalign.py chNN '[[sura,aya],[sura,aya]]' caNN.json`: aligns the recognised words with the Tanzil text of
   the verse range, puts every verse start on the pause before the chunk that holds its first word, places verses
   with no recognised word on the chunks between their neighbours, and writes phrase cues.
4. Manual corrections (short suras, where the recogniser is weakest). Chunk numbers are those of `chunks.json`:
   - part 60: 81:10 → chunk 102, 81:11 → chunk 103
   - part 61: 88:3 → 4, 88:4 → 5, 93:1 → 122, 93:2 → 123, 96:13 → 164, 107:5 → 267, 114:2 → 305,
     114:3 inside chunk 305 (no pause, 1819.2 s), 114:4 → 306, 114:5 → 307, 114:6 → 308, end of recitation 1838.5 s
     (the closing supplication follows)
   - part 08: 3:93 starts at 403.1 s (boundary 402.3)
   - parts 05 and 06: end of recitation taken from the pause after the last word (1735.77 s, 1800.07 s)
5. `fixcues.py`: keeps the cues inside their verses and gives every verse a cue at its start.
6. Check: time per letter of every verse against the median of its part (outliers below 0.45× or above 2.2×).
   Only «الم» of Al-Baqarah and Al Imran are outliers (long madd).

The owner checked 15 verse starts of parts 06 and 35 by ear; 14 agreed within a second and one was his slip.
