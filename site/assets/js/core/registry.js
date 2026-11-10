// Question type registry (ARCH-02). Exams, the random exam and history reach types only through here.
// Adding a type = one module in ../types/ plus one line below; no page code changes.
import summary from '../types/summary.js';
import pages from '../types/pages.js';
import next from '../types/next.js';
import topicEnd from '../types/topic-end.js';
import repeatedWord from '../types/repeated-word.js';
import lookalikes from '../types/lookalikes.js';
import midVerse from '../types/mid-verse.js';
import chain from '../types/chain.js';
import randomNumber from '../types/random-number.js';
import whichNumber from '../types/which-number.js';
import chapters from '../types/chapters.js';
import completeHemistich from '../types/complete-hemistich.js';
import nextBayt from '../types/next-bayt.js';
import baytTopic from '../types/bayt-topic.js';
import codes from '../types/codes.js';
import quranToTuhfa from '../types/quran-to-tuhfa.js';

const TYPES = new Map([summary, pages, next, topicEnd, repeatedWord, lookalikes, midVerse, chain, randomNumber, whichNumber,
  chapters, completeHemistich, nextBayt, baytTopic, codes, quranToTuhfa].map(t => [t.id, t]));

export const getType = id => TYPES.get(id);
export const hasType = id => TYPES.has(id);
export const typeIds = () => [...TYPES.keys()];
/** context: 'exam' | 'random' */
export const isGradable = (id, context) => !!TYPES.get(id)?.gradable?.[context];
