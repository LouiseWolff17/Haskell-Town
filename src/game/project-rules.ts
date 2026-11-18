// The rules for City Hall projects, as pure functions (tested in tests/projects.test.ts).
// A project is one file that grows a step at a time. A run checks every step up to the current one,
// in order, so the earlier steps' tests keep guarding what is already written.
import type { AssistMode, Project, ProjectStep } from '../content/types.ts';

/** How far the player has got with one project. Saved in state.projects. */
export interface ProjectProgress {
  /** Steps passed so far. The step being worked on is steps[passed] (none once the project is finished). */
  passed: number;
  /** Hints shown, per step: 0–3 hints, then 4 for the step's own code. */
  hints: number[];
  /** Runs, all steps together. */
  runs: number;
  /** The file as it was when the last step passed (with the next step's stub added): what Reset goes back to. */
  checkpoint?: string;
  /** The day the last step passed, and the code that passed it, for the Journal. */
  done?: number;
  code?: string;
}

export type ProjectStatus = 'locked' | 'open' | 'done';

export const freshProgress = (): ProjectProgress => ({ passed: 0, hints: [], runs: 0 });

/** Projects open one at a time, in order, once the village is built. */
export function projectStatus(projects: Project[], i: number, progress: Record<string, ProjectProgress | undefined>, villageBuilt: boolean): ProjectStatus {
  const p = projects[i], mine = progress[p.id];
  if (mine?.done != null) return 'done';
  if (!villageBuilt) return 'locked';
  return projects.slice(0, i).every(q => progress[q.id]?.done != null) ? 'open' : 'locked';
}

/** The project to work on now: the first one that is open, if any. */
export function currentProject(projects: Project[], progress: Record<string, ProjectProgress | undefined>, villageBuilt: boolean): Project | null {
  return projects.find((_, i) => projectStatus(projects, i, progress, villageBuilt) === 'open') ?? null;
}

/** What a step adds to the bottom of the file: a heading comment, then the stub (or just the heading in Independent mode). */
export function stepStub(step: ProjectStep, n: number, mode: AssistMode): string {
  const head = `-- Step ${n + 1}: ${step.title}\n`;
  return mode === 'independent' ? head : head + step.stub;
}

/** A fresh file for a project, ready for its first step. */
export const projectStarter = (p: Project, mode: AssistMode): string => p.starter + '\n' + stepStub(p.steps[0], 0, mode);

/** The file once step `n` starts: the code so far, a blank line, and the step's stub. */
export const addStep = (code: string, p: Project, n: number, mode: AssistMode): string => code.replace(/\s*$/, '\n\n') + stepStub(p.steps[n], n, mode);

/** The steps a run checks, in order: every passed step, and the current one. All of them once it's finished. */
export const stepsToCheck = (p: Project, passed: number): ProjectStep[] => p.steps.slice(0, Math.min(passed + 1, p.steps.length));

/** The whole program from the steps' own solutions (for tests and the DEV panel). */
export const solutionThrough = (p: Project, n: number): string => p.starter + '\n' + p.steps.slice(0, n).map((s, i) => `-- Step ${i + 1}: ${s.title}\n${s.solution}`).join('\n');
