// The Notice Board's scheduling rules (src/game/schedule.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_LIMIT, INTERVALS, MAX_BOX, calibration, completeItem, dayNumber, ensureDay, nextDueDay,
  nextProgress, planDay, showAnswer, startReviews,
} from '../src/game/schedule.ts';
import { ERRANDS, REVIEW_TOPICS } from '../src/content/index.ts';

const BY_TOPIC = Object.fromEntries(REVIEW_TOPICS.map(t => [t.id, ERRANDS.filter(e => e.topic === t.id).map(e => e.id)]));
const TOPICS = REVIEW_TOPICS.map(t => t.id);
const fixed = () => 0.5;

test('day numbers change at local midnight', () => {
  assert.equal(dayNumber(new Date(2026, 0, 1, 23, 59)) + 1, dayNumber(new Date(2026, 0, 2, 0, 1)));
  assert.equal(dayNumber(new Date(2026, 0, 1, 0, 1)), dayNumber(new Date(2026, 0, 1, 23, 59)));
});

test('a day has at most DAILY_LIMIT errands, each on a different topic', () => {
  const rs = startReviews(TOPICS, 100);
  const day = planDay(rs, BY_TOPIC, 100, fixed);
  assert.equal(day.items.length, DAILY_LIMIT);
  assert.equal(new Set(day.items.map(i => i.topic)).size, DAILY_LIMIT);
});

test('recalling first time moves a topic up a box; the gaps grow', () => {
  let p = { box: 0, due: 0, reviews: 0, lapses: 0 };
  const gaps: number[] = [];
  for (let i = 0; i < MAX_BOX + 1; i++) { const before = p.due; p = nextProgress(p, 'recalled', before); gaps.push(p.due - before); }
  assert.deepEqual(gaps, [...INTERVALS.slice(1), INTERVALS[MAX_BOX]]);
});

test('effort keeps the box, relearning goes back to tomorrow', () => {
  const p = { box: 3, due: 10, reviews: 4, lapses: 0 };
  assert.deepEqual(nextProgress(p, 'effortful', 10), { box: 3, due: 10 + INTERVALS[3], reviews: 5, lapses: 0 });
  assert.deepEqual(nextProgress(p, 'relearned', 10), { box: 1, due: 11, reviews: 5, lapses: 1 });
  assert.equal(nextProgress({ box: 0, due: 0, reviews: 0, lapses: 0 }, 'effortful', 0).due, 1, 'never due again the same day');
});

test('completing items: first run without a peek is recalled, otherwise effortful', () => {
  const rs = startReviews(TOPICS, 100); ensureDay(rs, BY_TOPIC, 100, fixed);
  const [a, b, c] = rs.day!.items;
  a.runs = 1; assert.equal(completeItem(rs, a, 100), 'recalled');
  b.runs = 3; assert.equal(completeItem(rs, b, 100), 'effortful');
  c.runs = 1; c.cue = true; assert.equal(completeItem(rs, c, 100), 'effortful');
  assert.equal(rs.topics[a.topic].due, 100 + INTERVALS[1]);
  assert.equal(rs.log.length, 3);
  assert.equal(completeItem(rs, a, 100), 'recalled', 'completing twice changes nothing');
  assert.equal(rs.log.length, 3);
});

test('seeing the answer adds a different errand on the same topic, to finish as relearned', () => {
  const rs = startReviews(TOPICS, 100); ensureDay(rs, BY_TOPIC, 100, fixed);
  const item = rs.day!.items[0];
  const retry = showAnswer(rs, item, BY_TOPIC[item.topic])!;
  assert.ok(retry && retry.retry && retry.topic === item.topic && retry.errand !== item.errand);
  assert.equal(rs.day!.items.at(-1), retry, 'the retry goes to the end of the day');
  assert.equal(showAnswer(rs, item, BY_TOPIC[item.topic]), null, 'only once per item');
  retry.runs = 1;
  assert.equal(completeItem(rs, retry, 100), 'relearned');
  assert.equal(rs.topics[item.topic].due, 101);
});

test('reviews take turns through a topic\'s errands', () => {
  const rs = startReviews(TOPICS, 100);
  ensureDay(rs, BY_TOPIC, 100, fixed);
  const item = rs.day!.items[0], first = item.errand;
  item.runs = 1; completeItem(rs, item, 100);
  const later = rs.topics[item.topic].due;
  for (const t of TOPICS) if (t !== item.topic) rs.topics[t].due = later + 10; // only this topic is due
  ensureDay(rs, BY_TOPIC, later, fixed);
  const again = rs.day!.items.find(i => i.topic === item.topic)!;
  assert.notEqual(again.errand, first);
});

test('every topic gets reviewed within a few days, and the plan stays put within a day', () => {
  const rs = startReviews(TOPICS, 100);
  const seen = new Set<string>();
  for (let d = 100; d < 100 + Math.ceil(TOPICS.length / DAILY_LIMIT); d++) {
    assert.ok(ensureDay(rs, BY_TOPIC, d, fixed));
    assert.ok(!ensureDay(rs, BY_TOPIC, d, fixed), 'same day: same plan');
    for (const i of rs.day!.items) { seen.add(i.topic); i.runs = 1; completeItem(rs, i, d); }
  }
  assert.equal(seen.size, TOPICS.length);
});

test('nextDueDay is never today, and skipped topics come back tomorrow', () => {
  const rs = startReviews(TOPICS, 100); ensureDay(rs, BY_TOPIC, 100, fixed);
  assert.equal(nextDueDay(rs, 100), 101);
  for (const t of TOPICS) rs.topics[t] = { box: 2, due: 105, reviews: 2, lapses: 0 };
  assert.equal(nextDueDay(rs, 100), 105);
});

test('calibration counts first-time results per confidence level', () => {
  const cal = calibration([
    { date: 1, topic: 'a', errand: 'x', outcome: 'recalled', confidence: 'sure', firstTry: true },
    { date: 1, topic: 'b', errand: 'y', outcome: 'effortful', confidence: 'sure', firstTry: false },
    { date: 1, topic: 'c', errand: 'z', outcome: 'recalled', confidence: null, firstTry: true },
    { date: 1, topic: 'd', errand: 'w', outcome: 'relearned', confidence: 'unsure', firstTry: false },
  ]);
  assert.deepEqual(cal.sure, { total: 2, firstTry: 1 });
  assert.deepEqual(cal.unsure, { total: 0, firstTry: 0 });
});
