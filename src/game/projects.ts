// City Hall projects (learning stage 5): once the village is built, Mayor Fern hands out bigger jobs,
// whole programs built a step at a time in one file. The rules are in project-rules.ts, the content in
// src/content/projects.ts, and the notebook (notebook.ts) runs them.
import { PROJECTS, RESIDENTS } from '../content/index.ts';
import { save, state } from './state.ts';
import { today, villageBuilt } from './errands.ts';
import { portrait } from './town.ts';
import { addStep, currentProject, freshProgress, projectStatus } from './project-rules.ts';
import type { Project } from '../content/index.ts';
import type { ProjectProgress, ProjectStatus } from './project-rules.ts';

export const projectById = (id: string): Project | undefined => PROJECTS.find(p => p.id === id);
/** The key for a project's file in state.code. */
export const projectKey = (p: Project): string => 'project:' + p.id;
/** A project's progress, made (unsaved) the first time it's asked for. */
export const progressOf = (p: Project): ProjectProgress => ((state.projects ||= {})[p.id] ||= freshProgress());
export const projectState = (p: Project): ProjectStatus => projectStatus(PROJECTS, PROJECTS.indexOf(p), state.projects ?? {}, villageBuilt());
/** The project Mayor Fern has pinned up at City Hall now, if any. */
export const pinnedProject = (): Project | null => currentProject(PROJECTS, state.projects ?? {}, villageBuilt());
export const finishedProjects = (): Project[] => PROJECTS.filter(p => state.projects?.[p.id]?.done != null);

/** The current step of a project passed with this code. Moves on to the next step (adding its stub to the file,
 *  which becomes the checkpoint Reset goes back to), or finishes the project. Returns the file to show next. */
export function passStep(p: Project, code: string): { code: string; finished: boolean } {
  const pr = progressOf(p);
  pr.passed = Math.min(pr.passed + 1, p.steps.length);
  const finished = pr.passed === p.steps.length;
  if (finished) { pr.done = today(); pr.code = code; }
  const next = finished ? code : addStep(code, p, pr.passed, state.mode);
  pr.checkpoint = next;
  state.code[projectKey(p)] = next;
  save();
  return { code: next, finished };
}

/** The projects in the Requests list, after the village's requests. `go` walks to City Hall and opens one. */
export function renderProjectList(list: HTMLElement, go: (p: Project) => void): void {
  const h = document.createElement('div'); h.className = 'stage-h'; h.textContent = 'Stage 5 · City Hall projects'; list.appendChild(h);
  PROJECTS.forEach((p, i) => {
    const s = projectState(p), pr = state.projects?.[p.id], r = RESIDENTS[p.resident];
    const chip = s === 'done' ? 'Finished ✓' : s === 'locked' ? 'Locked' : pr?.passed ? `Step ${pr.passed + 1} of ${p.steps.length}` : 'New project';
    const meta = s === 'locked' ? (villageBuilt() ? `After “${PROJECTS[i - 1].title}”` : 'Opens once the whole village is built') : `For ${r.name} · <span class="concept">${p.concepts}</span>`;
    const b = document.createElement('button'); b.className = `req req-${s}`; b.disabled = s === 'locked';
    b.innerHTML = `<div class="req-body"><div class="req-top"><span class="req-num">${p.steps.length} steps</span><span class="chip chip-${s}">${chip}</span></div><div class="req-title">${p.title}</div><div class="req-meta">${meta}</div></div>`;
    b.prepend(portrait(p.resident, 38));
    b.onclick = () => go(p);
    list.appendChild(b);
  });
}
