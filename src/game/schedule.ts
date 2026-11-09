// When errands come back: spaced retrieval practice, as pure functions (tests/schedule.test.ts).
//
// Based on Carpenter, Pan & Butler (2022), "The science of effective learning with spacing and
// retrieval practice", Nature Reviews Psychology 1, 496–511:
// - Retrieval practice: each errand is solved from memory, and feedback (the model answer and
//   an explanation) comes after the attempt, not before.
// - Spacing: a topic comes back after a gap that grows each time it is recalled well
//   (1, 3, 7, 14, 30 days). Only a few errands are pinned up each day, so they can't be crammed.
// - Successive relearning: within a day, a topic is practised until it is solved once from
//   memory. Seeing the answer puts a fresh errand on the same topic back at the end of the day's list.
// - Interleaving: the day's errands are on different topics, in mixed order.
// - Varied problems: reviews take turns through a topic's errands, so the player practises
//   using an idea on a new problem rather than retyping a remembered answer.

/** Days until the next review, by box. A topic moves up a box each time it is recalled first time. */
export const INTERVALS = [0, 1, 3, 7, 14, 30];
export const MAX_BOX = INTERVALS.length - 1;
/** How many errands are pinned up per day. */
export const DAILY_LIMIT = 4;

export type Confidence = 'unsure' | 'fairly' | 'sure';
/**
 * recalled:  solved on the first run without peeking — the gap grows.
 * effortful: solved after a wrong run or a peek at the Library — the gap stays the same.
 * relearned: solved after seeing the answer earlier in the day — back to tomorrow.
 */
export type Outcome = 'recalled' | 'effortful' | 'relearned';

export interface TopicProgress {
  box: number;
  /** Day number when it is next due. */
  due: number;
  reviews: number;
  lapses: number;
}

export interface DayItem {
  topic: string;
  errand: string;
  /** A fresh errand on a topic whose answer was seen earlier today. */
  retry: boolean;
  runs: number;
  /** Peeked at the topic's Library cards. */
  cue: boolean;
  /** Asked to see the answer. The item is then closed and a retry is added. */
  sawAnswer: boolean;
  confidence: Confidence | null;
  outcome: Outcome | null;
}

export interface Day {
  date: number;
  items: DayItem[];
}

export interface LogEntry {
  date: number;
  topic: string;
  errand: string;
  outcome: Outcome;
  confidence: Confidence | null;
  /** Passed on the very first run, without a peek. */
  firstTry: boolean;
}

export interface ReviewState {
  /** The day the village was finished and the Notice Board opened. */
  started: number;
  topics: Record<string, TopicProgress>;
  day: Day | null;
  log: LogEntry[];
}

/** A local calendar day as a whole number, so "tomorrow" means after midnight, not after 24 hours. */
export function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/** Every topic starts due today. The daily limit spreads the first round over a few days. */
export function startReviews(topicIds: string[], today: number): ReviewState {
  const topics: Record<string, TopicProgress> = {};
  for (const id of topicIds) topics[id] = { box: 0, due: today, reviews: 0, lapses: 0 };
  return { started: today, topics, day: null, log: [] };
}

const newItem = (topic: string, errand: string, retry = false): DayItem =>
  ({ topic, errand, retry, runs: 0, cue: false, sawAnswer: false, confidence: null, outcome: null });

/** Which of a topic's errands comes next: they take turns. */
export function errandFor(errandIds: string[], progress: TopicProgress, offset = 0): string {
  return errandIds[(progress.reviews + offset) % errandIds.length];
}

/**
 * Plan a day: the topics that are due, most overdue first (then the weakest), up to the daily limit,
 * shuffled so that topics are interleaved rather than met in the order they were taught.
 * `errandsByTopic` lists each topic's errand ids in order. `rand` returns a number in [0, 1).
 */
export function planDay(rs: ReviewState, errandsByTopic: Record<string, string[]>, today: number, rand: () => number = Math.random): Day {
  const due = Object.entries(rs.topics)
    .filter(([id, p]) => p.due <= today && errandsByTopic[id]?.length)
    .sort(([a, p], [b, q]) => p.due - q.due || p.box - q.box || a.localeCompare(b))
    .slice(0, DAILY_LIMIT);
  const items = due.map(([id, p]) => newItem(id, errandFor(errandsByTopic[id], p)));
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return { date: today, items };
}

/** Make sure `rs.day` is today's plan. Returns true if a new day was planned. */
export function ensureDay(rs: ReviewState, errandsByTopic: Record<string, string[]>, today: number, rand?: () => number): boolean {
  if (rs.day && rs.day.date === today) return false;
  rs.day = planDay(rs, errandsByTopic, today, rand);
  return true;
}

export const isOpen = (item: DayItem) => !item.outcome && !item.sawAnswer;

export function outcomeOf(item: DayItem): Outcome {
  if (item.retry) return 'relearned';
  return item.runs === 1 && !item.cue ? 'recalled' : 'effortful';
}

/** Move a topic to its next box and due day after an outcome. */
export function nextProgress(p: TopicProgress, outcome: Outcome, today: number): TopicProgress {
  const box = outcome === 'recalled' ? Math.min(p.box + 1, MAX_BOX) : outcome === 'effortful' ? Math.max(p.box, 1) : 1;
  return { box, due: today + INTERVALS[box], reviews: p.reviews + 1, lapses: p.lapses + (outcome === 'relearned' ? 1 : 0) };
}

/** The player's code passed: record the outcome and reschedule the topic. Returns the outcome. */
export function completeItem(rs: ReviewState, item: DayItem, today: number): Outcome {
  if (item.outcome) return item.outcome;
  const outcome = outcomeOf(item);
  item.outcome = outcome;
  rs.topics[item.topic] = nextProgress(rs.topics[item.topic], outcome, today);
  rs.log.push({ date: today, topic: item.topic, errand: item.errand, outcome, confidence: item.confidence, firstTry: outcome === 'recalled' });
  return outcome;
}

/**
 * The player asked to see the answer. That's feedback, not failure: they study it now,
 * and a different errand on the same topic goes to the end of today's list, to be done from memory.
 */
export function showAnswer(rs: ReviewState, item: DayItem, errandIds: string[]): DayItem | null {
  if (!rs.day || !isOpen(item)) return null;
  item.sawAnswer = true;
  const tries = rs.day.items.filter(x => x.topic === item.topic).length;
  const retry = newItem(item.topic, errandFor(errandIds, rs.topics[item.topic], tries), true);
  rs.day.items.push(retry);
  return retry;
}

/** The first day after today with errands to pin up. (Topics still due today, beyond the daily limit, wait until tomorrow.) */
export function nextDueDay(rs: ReviewState, today: number): number {
  return Math.min(...Object.values(rs.topics).map(p => Math.max(p.due, today + 1)));
}

/** How often each confidence level turned out right first time — for noticing over- or under-confidence. */
export function calibration(log: LogEntry[]): Record<Confidence, { total: number; firstTry: number }> {
  const out = { unsure: { total: 0, firstTry: 0 }, fairly: { total: 0, firstTry: 0 }, sure: { total: 0, firstTry: 0 } };
  for (const e of log) {
    if (!e.confidence || e.outcome === 'relearned') continue;
    out[e.confidence].total++;
    if (e.firstTry) out[e.confidence].firstTry++;
  }
  return out;
}

/**
 * Bring an older save up to date with the current topics. Topics that were split (`legacy`, old id →
 * new ids) pass their progress on to each new topic; brand-new topics start due today; topics that no
 * longer exist are dropped. Today's items on an old topic move to their errand's new topic.
 * Returns true if anything changed.
 */
export function syncTopics(rs: ReviewState, topicIds: string[], today: number, legacy: Record<string, string[]>, topicOfErrand: (errandId: string) => string | undefined): boolean {
  let changed = false;
  for (const id of topicIds) {
    if (rs.topics[id]) continue;
    const from = Object.entries(legacy).find(([old, news]) => news.includes(id) && rs.topics[old]);
    rs.topics[id] = from ? { ...rs.topics[from[0]], reviews: 0 } : { box: 0, due: today, reviews: 0, lapses: 0 };
    changed = true;
  }
  for (const item of rs.day?.items || []) {
    if (topicIds.includes(item.topic)) continue;
    const t = topicOfErrand(item.errand);
    if (t) { item.topic = t; changed = true; }
  }
  for (const id of Object.keys(rs.topics)) if (!topicIds.includes(id)) { delete rs.topics[id]; changed = true; }
  return changed;
}
