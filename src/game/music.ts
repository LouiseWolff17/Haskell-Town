// Market music: a soft music-box tune, made on the fly with the Web Audio API (no sound files).
// It's off until the player turns it on (browsers only allow sound after a click anyway),
// and it only exists once Marigold's market is built.
//
// The tune is a gentle pentatonic melody over a slow bass, so any notes sound fine together.
// Each 8-bar round varies a little, picking from the same small set of phrases.

const BPM = 84, STEP = 60 / BPM / 2; // eighth notes
// C major pentatonic, two octaves (MIDI note numbers)
const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
// phrases as scale indexes; -1 is a rest
const PHRASES = [
  [4, -1, 5, 4, 3, -1, 2, -1],
  [2, 3, 4, -1, 5, -1, 4, -1],
  [7, -1, 6, 5, 4, -1, -1, -1],
  [5, 4, 3, 2, 3, -1, -1, -1],
  [0, 2, 4, 5, 7, -1, 5, -1],
  [6, -1, 7, 6, 5, 4, 3, -1],
];
const BASS = [48, 45, 41, 43]; // C, A, F, G — one per bar, round and round

let ctx: AudioContext | null = null, master: GainNode | null = null, timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0, step = 0, round: number[] = [];
const freq = (m: number): number => 440 * 2 ** ((m - 69) / 12);

function note(midi: number, at: number, len: number, vol: number, type: OscillatorType): void {
  if (!ctx || !master) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq(midi);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(master); o.start(at); o.stop(at + len + 0.05);
}
function newRound(): void {
  // 8 bars: a pair of phrases, then a variation, then home
  const pick = () => PHRASES[Math.floor(Math.random() * PHRASES.length)];
  const a = pick(), b = pick();
  round = [a, b, a, pick(), b, pick(), a, PHRASES[3]].flat();
}
function schedule(): void {
  if (!ctx) return;
  while (nextTime < ctx.currentTime + 0.25) {
    if (!round.length || step % round.length === 0) newRound(); // the first round, then a new one each time round
    const i = step % round.length, s = round[i];
    if (s >= 0) { note(SCALE[s] + 12, nextTime, 1.4, 0.18, 'triangle'); note(SCALE[s] + 24, nextTime, 0.5, 0.03, 'sine'); }
    if (i % 8 === 0) note(BASS[(i / 8) % 4] + 12, nextTime, STEP * 7, 0.08, 'triangle');
    nextTime += STEP; step++;
  }
}

export const musicPlaying = (): boolean => !!timer;
export function startMusic(): void {
  if (timer) return;
  const AC = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AC) return;
  ctx ||= new AC();
  if (!master) { master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination); }
  ctx.resume?.();
  master.gain.setTargetAtTime(0.7, ctx.currentTime, 0.3);
  nextTime = ctx.currentTime + 0.1; step = 0; round = [];
  timer = setInterval(schedule, 100); schedule();
}
export function stopMusic(): void {
  if (!timer || !ctx || !master) return;
  clearInterval(timer); timer = null;
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
}
