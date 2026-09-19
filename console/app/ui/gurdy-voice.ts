type Note = {
  hz: number;
  at: number;
  dur: number;
  /** Glide destination. Omit for a steady pitch. */
  to?: number;
  voice?: OscillatorType;
  peak?: number;
};

type Tune = {
  name: string;
  voice: OscillatorType;
  peak: number;
  cutoff: number;
  notes: Note[];
};

type Step = {
  hz: number;
  beats: number;
  voice?: OscillatorType;
  peak?: number;
};

/** Even notes that release before the next attack, so the pulse stays readable. */
function seq(hzs: number[], start: number, step: number, dur = step * 0.86): Note[] {
  return hzs.map((hz, i) => ({ hz, at: start + i * step, dur }));
}

function phrase(beat: number, steps: Step[], start = 0): Note[] {
  let at = start;
  return steps.map((step) => {
    const note: Note = {
      hz: step.hz,
      at,
      dur: Math.max(0.045, step.beats * beat * 0.86),
    };
    if (step.voice) {
      note.voice = step.voice;
    }
    if (step.peak !== undefined) {
      note.peak = step.peak;
    }
    at += step.beats * beat;
    return note;
  });
}

const TUNES: Tune[] = [
  {
    name: "toccata",
    voice: "sawtooth",
    peak: 0.26,
    cutoff: 2800,
    notes: [
      { hz: 880, at: 0, dur: 0.04 },
      { hz: 784, at: 0.04, dur: 0.04 },
      { hz: 880, at: 0.08, dur: 0.48 },
      { hz: 440, at: 0.08, dur: 0.48, peak: 0.18 },
      ...seq([784, 698, 659, 587, 554], 0.88, 0.05),
      { hz: 587, at: 1.13, dur: 0.62 },
      { hz: 294, at: 1.13, dur: 0.62, peak: 0.18 },
    ],
  },
  {
    name: "zarathustra",
    voice: "sawtooth",
    peak: 0.26,
    cutoff: 2400,
    notes: [
      { hz: 262, at: 0.18, dur: 0.55 },
      { hz: 392, at: 0.86, dur: 0.55 },
      { hz: 523, at: 1.54, dur: 0.88 },
      { hz: 659, at: 1.78, dur: 0.26 },
      { hz: 622, at: 2.12, dur: 0.42 },
    ],
  },
  {
    name: "nachtmusik",
    voice: "triangle",
    peak: 0.32,
    cutoff: 3600,
    notes: phrase(0.22, [
      { hz: 392, beats: 1 },
      { hz: 294, beats: 1 },
      { hz: 392, beats: 2 },
      { hz: 294, beats: 0.5 },
      { hz: 392, beats: 0.5 },
      { hz: 294, beats: 0.5 },
      { hz: 392, beats: 0.5 },
      { hz: 494, beats: 0.5 },
      { hz: 587, beats: 0.5 },
      { hz: 784, beats: 1.5 },
    ]),
  },
  {
    name: "canon",
    voice: "sawtooth",
    peak: 0.24,
    cutoff: 2800,
    notes: seq([740, 659, 587, 554, 494, 440, 494, 554], 0, 0.32),
  },
  {
    name: "habanera",
    voice: "triangle",
    peak: 0.32,
    cutoff: 3000,
    notes: seq([587, 554, 523, 494, 466, 440], 0, 0.36),
  },
  {
    name: "alla turca",
    voice: "triangle",
    peak: 0.32,
    cutoff: 3600,
    notes: phrase(0.09, [
      { hz: 494, beats: 1 },
      { hz: 440, beats: 1 },
      { hz: 415, beats: 1 },
      { hz: 440, beats: 1 },
      { hz: 523, beats: 2 },
      { hz: 587, beats: 1 },
      { hz: 523, beats: 1 },
      { hz: 494, beats: 1 },
      { hz: 523, beats: 1 },
      { hz: 659, beats: 2 },
      { hz: 698, beats: 1 },
      { hz: 659, beats: 1 },
      { hz: 622, beats: 1 },
      { hz: 659, beats: 3 },
    ]),
  },
  {
    name: "blue danube",
    voice: "triangle",
    peak: 0.32,
    cutoff: 3400,
    notes: phrase(0.38, [
      { hz: 294, beats: 1 },
      { hz: 370, beats: 1 },
      { hz: 440, beats: 2 },
    ]),
  },
  {
    name: "swan lake",
    voice: "sawtooth",
    peak: 0.24,
    cutoff: 2800,
    notes: phrase(0.2, [
      { hz: 494, beats: 3 },
      { hz: 659, beats: 1 },
      { hz: 740, beats: 1 },
      { hz: 784, beats: 1 },
      { hz: 880, beats: 1 },
      { hz: 988, beats: 3 },
      { hz: 880, beats: 1 },
      { hz: 784, beats: 1 },
      { hz: 740, beats: 2 },
    ]),
  },
  {
    name: "can-can",
    voice: "triangle",
    peak: 0.32,
    cutoff: 3800,
    notes: seq([659, 523, 440, 392, 392, 294, 330, 349, 330, 294, 262], 0, 0.12),
  },
  {
    name: "funeral march",
    voice: "sawtooth",
    peak: 0.26,
    cutoff: 1800,
    notes: phrase(0.22, [
      { hz: 466, beats: 3 },
      { hz: 466, beats: 1 },
      { hz: 466, beats: 1 },
      { hz: 466, beats: 1 },
      { hz: 554, beats: 3 },
      { hz: 523, beats: 1 },
      { hz: 523, beats: 2 },
      { hz: 466, beats: 2 },
    ]),
  },
  {
    name: "morning mood",
    voice: "triangle",
    peak: 0.32,
    cutoff: 4000,
    notes: phrase(0.22, [
      { hz: 659, beats: 1 },
      { hz: 587, beats: 1 },
      { hz: 494, beats: 1 },
      { hz: 440, beats: 1 },
      { hz: 392, beats: 1 },
      { hz: 440, beats: 1 },
      { hz: 494, beats: 1 },
      { hz: 587, beats: 1 },
      { hz: 659, beats: 3 },
    ]),
  },
  {
    name: "mountain king",
    voice: "sawtooth",
    peak: 0.26,
    cutoff: 2600,
    notes: [
      ...seq([247, 277, 294, 330, 370, 294, 370], 0, 0.2),
      ...seq([247, 277, 294, 330, 370, 294, 370], 1.4, 0.14),
      ...seq([330, 370, 392, 440, 494, 392, 494], 2.38, 0.1),
    ],
  },
  {
    name: "greensleeves",
    voice: "sawtooth",
    peak: 0.24,
    cutoff: 3000,
    notes: phrase(0.2, [
      { hz: 440, beats: 1 },
      { hz: 523, beats: 2 },
      { hz: 587, beats: 1 },
      { hz: 659, beats: 2 },
      { hz: 740, beats: 1 },
      { hz: 659, beats: 1 },
      { hz: 587, beats: 2 },
      { hz: 494, beats: 1 },
      { hz: 392, beats: 3 },
    ]),
  },
  {
    name: "ode to joy",
    voice: "triangle",
    peak: 0.32,
    cutoff: 3400,
    notes: phrase(0.18, [
      { hz: 659, beats: 1 },
      { hz: 659, beats: 1 },
      { hz: 698, beats: 1 },
      { hz: 784, beats: 1 },
      { hz: 784, beats: 1 },
      { hz: 698, beats: 1 },
      { hz: 659, beats: 1 },
      { hz: 587, beats: 1 },
      { hz: 523, beats: 1 },
      { hz: 523, beats: 1 },
      { hz: 587, beats: 1 },
      { hz: 659, beats: 1 },
      { hz: 659, beats: 1.5 },
      { hz: 587, beats: 0.5 },
      { hz: 587, beats: 2 },
    ]),
  },
  {
    name: "happy birthday",
    voice: "triangle",
    peak: 0.32,
    cutoff: 3600,
    notes: phrase(0.2, [
      { hz: 262, beats: 0.75 },
      { hz: 262, beats: 0.25 },
      { hz: 294, beats: 1 },
      { hz: 262, beats: 1 },
      { hz: 349, beats: 1 },
      { hz: 330, beats: 2 },
      { hz: 262, beats: 0.75 },
      { hz: 262, beats: 0.25 },
      { hz: 294, beats: 1 },
      { hz: 262, beats: 1 },
      { hz: 392, beats: 1 },
      { hz: 349, beats: 2 },
      { hz: 262, beats: 0.75 },
      { hz: 262, beats: 0.25 },
      { hz: 523, beats: 1 },
      { hz: 440, beats: 1 },
      { hz: 349, beats: 1 },
      { hz: 330, beats: 1 },
      { hz: 294, beats: 2 },
      { hz: 466, beats: 0.75 },
      { hz: 466, beats: 0.25 },
      { hz: 440, beats: 1 },
      { hz: 349, beats: 1 },
      { hz: 392, beats: 1 },
      { hz: 349, beats: 2 },
    ]),
  },
  {
    name: "fur elise",
    voice: "triangle",
    peak: 0.32,
    cutoff: 3800,
    notes: phrase(0.11, [
      { hz: 659, beats: 1 },
      { hz: 622, beats: 1 },
      { hz: 659, beats: 1 },
      { hz: 622, beats: 1 },
      { hz: 659, beats: 1 },
      { hz: 494, beats: 1 },
      { hz: 587, beats: 1 },
      { hz: 523, beats: 1 },
      { hz: 440, beats: 4 },
    ]),
  },
  {
    name: "fate",
    voice: "sawtooth",
    peak: 0.28,
    cutoff: 2200,
    notes: [
      ...phrase(0.13, [
        { hz: 392, beats: 1 },
        { hz: 392, beats: 1 },
        { hz: 392, beats: 1 },
        { hz: 311, beats: 6 },
      ]),
      { hz: 196, at: 0.39, dur: 0.72, peak: 0.2 },
      ...phrase(
        0.13,
        [
          { hz: 349, beats: 1 },
          { hz: 349, beats: 1 },
          { hz: 349, beats: 1 },
          { hz: 294, beats: 7 },
        ],
        1.35,
      ),
      { hz: 147, at: 1.74, dur: 0.82, peak: 0.2 },
    ],
  },
  {
    name: "item get",
    voice: "square",
    peak: 0.22,
    cutoff: 3600,
    notes: [
      ...phrase(0.1, [
        { hz: 392, beats: 1 },
        { hz: 494, beats: 1 },
        { hz: 587, beats: 1 },
        { hz: 784, beats: 4 },
      ]),
      { hz: 196, at: 0.3, dur: 0.4, voice: "triangle", peak: 0.17 },
    ],
  },
  {
    name: "quest fanfare",
    voice: "square",
    peak: 0.2,
    cutoff: 3200,
    notes: [
      ...seq([392, 523, 659, 784], 0, 0.12),
      { hz: 1047, at: 0.48, dur: 0.5 },
      { hz: 131, at: 0, dur: 0.95, voice: "triangle", peak: 0.15 },
    ],
  },
  {
    name: "secret found",
    voice: "triangle",
    peak: 0.34,
    cutoff: 4200,
    notes: [
      ...seq([392, 494, 587, 784, 988, 1175], 0, 0.09),
      { hz: 1568, at: 0.54, dur: 0.5 },
    ],
  },
  {
    name: "coin",
    voice: "square",
    peak: 0.22,
    cutoff: 4400,
    notes: [
      { hz: 988, at: 0, dur: 0.07 },
      { hz: 1319, at: 0.07, dur: 0.42 },
    ],
  },
  {
    name: "extra life",
    voice: "square",
    peak: 0.19,
    cutoff: 3800,
    notes: seq([523, 659, 784, 1047, 880, 1047], 0, 0.11),
  },
  {
    name: "castle",
    voice: "square",
    peak: 0.18,
    cutoff: 1800,
    notes: [
      ...seq([220, 233, 220, 175, 165, 147], 0, 0.18),
      { hz: 110, at: 0, dur: 1.05, voice: "triangle", peak: 0.14 },
    ],
  },
  {
    name: "overworld hop",
    voice: "square",
    peak: 0.19,
    cutoff: 3600,
    notes: [
      { hz: 659, at: 0, dur: 0.1 },
      { hz: 659, at: 0.16, dur: 0.1 },
      { hz: 659, at: 0.38, dur: 0.1 },
      { hz: 523, at: 0.54, dur: 0.1 },
      { hz: 659, at: 0.66, dur: 0.1 },
      { hz: 784, at: 0.84, dur: 0.34 },
      { hz: 196, at: 0.84, dur: 0.34, voice: "triangle", peak: 0.16 },
    ],
  },
  {
    name: "game over",
    voice: "square",
    peak: 0.2,
    cutoff: 2400,
    notes: [
      ...seq([523, 494, 466, 392], 0, 0.24),
      { hz: 131, at: 0.66, dur: 0.6, voice: "triangle", peak: 0.16 },
    ],
  },
];

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;

function audio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
  }
  return ctx;
}

/** One limiter, connected once. Reconnecting it on every poke clicks. */
function output(ac: AudioContext): GainNode {
  if (!bus) {
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 2;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    bus = ac.createGain();
    bus.gain.value = 0.88;
    bus.connect(limiter);
    limiter.connect(ac.destination);
  }
  return bus;
}

function tone(
  ac: AudioContext,
  dest: AudioNode,
  type: OscillatorType,
  note: Note,
  start: number,
  peak: number,
  cutoff: number,
) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(note.hz, start);
  if (note.to) {
    o.frequency.exponentialRampToValueAtTime(note.to, start + note.dur);
  }
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(cutoff, start);
  const g = ac.createGain();
  g.gain.value = 0.0001;
  const attack = Math.min(0.018, Math.max(0.005, note.dur * 0.14));
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + note.dur);
  o.connect(filter);
  filter.connect(g);
  g.connect(dest);
  o.start(start);
  o.stop(start + note.dur + 0.02);
}

function render(ac: AudioContext, dest: AudioNode, now: number, tune: Tune) {
  tune.notes.forEach((n) => {
    tone(
      ac,
      dest,
      n.voice ?? tune.voice,
      n,
      now + n.at,
      n.peak ?? tune.peak,
      tune.cutoff,
    );
  });
}

export async function playTune(): Promise<void> {
  const ac = audio();
  await ac.resume();
  const tune = TUNES[Math.floor(Math.random() * TUNES.length)] ?? TUNES[0];
  render(ac, output(ac), ac.currentTime + 0.02, tune);
}

export function typingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) {
    return false;
  }
  if (el.isContentEditable) {
    return true;
  }
  return Boolean(
    el.closest("input, textarea, select, button, [role='button'], a"),
  );
}
