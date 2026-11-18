// City Hall projects: the content (src/content/projects.ts) and the rules (src/game/project-rules.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROJECTS, RESIDENTS } from '../src/content/index.ts';
import { addStep, currentProject, freshProgress, projectStarter, projectStatus, solutionThrough, stepStub, stepsToCheck } from '../src/game/project-rules.ts';
import type { ProjectProgress } from '../src/game/project-rules.ts';
import { BrowserRunner } from '../src/runner/browser.ts';

const runner = new BrowserRunner();
const passes = async (step: Parameters<BrowserRunner['check']>[0], code: string): Promise<boolean> => {
  const r = await runner.check(step, code);
  return r.status === 'tested' && r.passed;
};

test('projects have unique ids, real residents, hints and solutions for every step', () => {
  assert.equal(new Set(PROJECTS.map(p => p.id)).size, PROJECTS.length);
  for (const p of PROJECTS) {
    assert.ok(RESIDENTS[p.resident], `${p.id}: unknown resident ${p.resident}`);
    assert.ok(p.steps.length >= 4, `${p.id}: a project is several steps`);
    assert.ok(p.ideas.length && p.wrapUp && p.reward, `${p.id}: ideas, wrap-up and reward`);
    assert.equal(p.steps.at(-1)!.fn, 'main', `${p.id}: ends with a program you can talk to`);
    for (const s of p.steps) {
      assert.equal(s.hints.length, 3, `${p.id}/${s.title}: three hints`);
      assert.ok(s.tests.length && s.solution.trim() && s.explanation && s.stub.trim(), `${p.id}/${s.title}: tests, solution, explanation, stub`);
      assert.ok(s.examples?.length || s.ioExamples?.length, `${p.id}/${s.title}: examples`);
      if (s.fn) assert.ok(s.sig?.startsWith(s.fn + ' ::'), `${p.id}/${s.title}: sig should start with "${s.fn} ::"`);
    }
  }
});

test('every step\'s model answer, on top of the ones before, passes that step and every earlier one', async () => {
  for (const p of PROJECTS) {
    for (let k = 1; k <= p.steps.length; k++) {
      const code = solutionThrough(p, k);
      for (const s of stepsToCheck(p, k - 1)) assert.ok(await passes(s, code), `${p.id}: with steps 1–${k} written, "${s.title}" should pass`);
    }
  }
});

test('a step\'s stub (and Independent mode\'s bare heading) compiles but does not pass yet', async () => {
  for (const p of PROJECTS) {
    for (let k = 0; k < p.steps.length; k++) {
      for (const mode of ['balanced', 'independent'] as const) {
        const code = k ? addStep(solutionThrough(p, k), p, k, mode) : projectStarter(p, mode);
        const r = await runner.check(p.steps[k], code);
        assert.notEqual(r.status, 'compile-error', `${p.id} step ${k + 1} (${mode}): ${JSON.stringify(r).slice(0, 300)}`);
        assert.ok(!(r.status === 'tested' && r.passed), `${p.id} step ${k + 1} (${mode}) should not pass from its stub`);
        // and the steps already done still pass with the stub added
        if (mode === 'balanced') for (const s of p.steps.slice(0, k)) assert.ok(await passes(s, code), `${p.id}: "${s.title}" still passes with step ${k + 1}'s stub added`);
      }
    }
  }
});

test('breaking an earlier function is caught when a later step is checked', async () => {
  const p = PROJECTS.find(x => x.id === 'vote')!;
  const code = solutionThrough(p, 3).replace('length (filter (== option) votes)', 'length votes');
  const results = await Promise.all(stepsToCheck(p, 2).map(s => passes(s, code)));
  assert.deepEqual(results, [false, true, false]); // votesFor itself, and tally that uses it
});

test('projects open one at a time, in order, once the village is built', () => {
  const progress: Record<string, ProjectProgress> = {};
  assert.equal(projectStatus(PROJECTS, 0, progress, false), 'locked');
  assert.equal(currentProject(PROJECTS, progress, false), null);
  assert.equal(projectStatus(PROJECTS, 0, progress, true), 'open');
  assert.equal(projectStatus(PROJECTS, 1, progress, true), 'locked');
  assert.equal(currentProject(PROJECTS, progress, true)?.id, PROJECTS[0].id);
  progress[PROJECTS[0].id] = { ...freshProgress(), passed: PROJECTS[0].steps.length, done: 10 };
  assert.equal(projectStatus(PROJECTS, 0, progress, true), 'done');
  assert.equal(projectStatus(PROJECTS, 1, progress, true), 'open');
  assert.equal(currentProject(PROJECTS, progress, true)?.id, PROJECTS[1].id);
  for (const p of PROJECTS) progress[p.id] = { ...freshProgress(), done: 12 };
  assert.equal(currentProject(PROJECTS, progress, true), null);
});

test('stubs: a heading for each step, the stub only in Guided and Balanced; the file grows at the bottom', () => {
  const p = PROJECTS[0], s = p.steps[1];
  assert.equal(stepStub(s, 1, 'independent'), `-- Step 2: ${s.title}\n`);
  assert.equal(stepStub(s, 1, 'guided'), `-- Step 2: ${s.title}\n${s.stub}`);
  assert.equal(addStep('votesFor = 1\n\n\n', p, 1, 'balanced'), `votesFor = 1\n\n-- Step 2: ${s.title}\n${s.stub}`);
  assert.ok(projectStarter(p, 'balanced').startsWith(p.starter));
});

test('a run checks the steps passed so far and the current one; all of them once finished', () => {
  const p = PROJECTS[1];
  assert.equal(stepsToCheck(p, 0).length, 1);
  assert.equal(stepsToCheck(p, 2).length, 3);
  assert.equal(stepsToCheck(p, p.steps.length).length, p.steps.length);
});
