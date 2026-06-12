// audio.js — fully synthesized soundtrack (Tone.js from CDN, no files).
// One scale everywhere: E minor pentatonic. Built only after a user gesture.

const SCALE = ['E3', 'G3', 'A3', 'B3', 'D4', 'E4', 'G4', 'A4', 'B4', 'D5', 'E5', 'G5'];
const PAD_CHORDS = [
  ['E2', 'B2', 'E3', 'G3'],
  ['G2', 'D3', 'G3', 'B3'],
  ['A2', 'E3', 'A3', 'C4'],
  ['E2', 'B2', 'E3', 'A3'],
];

export function createAudio() {
  let ready = false;
  let muted = false;
  let scaleIdx = 0;
  let speed01 = 0;
  let pad, padFilter, arpSynth, arpFilter, pluck, thud, thudFilter, arpLoop, padLoop;
  let chordI = 0;

  async function start() {
    if (ready || typeof Tone === 'undefined') return;
    await Tone.start();

    const master = new Tone.Gain(0.8).toDestination();
    const reverb = new Tone.Reverb({ decay: 6, wet: 0.4 }).connect(master);

    padFilter = new Tone.Filter(700, 'lowpass').connect(reverb);
    pad = new Tone.PolySynth(Tone.AMSynth, {
      volume: -16,
      envelope: { attack: 2.5, decay: 1, sustain: 0.8, release: 4 },
    }).connect(padFilter);

    arpFilter = new Tone.Filter(500, 'lowpass', -24).connect(reverb);
    arpSynth = new Tone.MonoSynth({
      volume: -14,
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.005, decay: 0.18, sustain: 0.0, release: 0.1 },
      filterEnvelope: { attack: 0.005, decay: 0.12, sustain: 0.2, release: 0.1, baseFrequency: 300, octaves: 2.5 },
    }).connect(arpFilter);

    pluck = new Tone.Synth({
      volume: -8,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.2 },
    }).connect(reverb);

    thudFilter = new Tone.Filter(180, 'lowpass').connect(master);
    thud = new Tone.MembraneSynth({
      volume: -2,
      pitchDecay: 0.08,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.4 },
    }).connect(thudFilter);

    padLoop = new Tone.Loop((time) => {
      pad.triggerAttackRelease(PAD_CHORDS[chordI % PAD_CHORDS.length], '7s', time);
      chordI++;
    }, '8s');
    padLoop.start(0);

    // arpeggio: density (probability of a 16th firing) and cutoff track speed
    arpLoop = new Tone.Loop((time) => {
      const density = 0.18 + 0.72 * speed01;
      if (Math.random() > density) return;
      const span = 5 + Math.floor(speed01 * (SCALE.length - 5));
      const note = SCALE[Math.floor(Math.random() * span)];
      arpSynth.triggerAttackRelease(note, '16n', time);
    }, '16n');
    arpLoop.start(0);

    Tone.Transport.bpm.value = 96;
    Tone.Transport.start();
    Tone.Destination.mute = muted;
    ready = true;
  }

  function setSpeed(s) {
    speed01 = Math.max(0, Math.min(1, s));
    if (!ready) return;
    Tone.Transport.bpm.rampTo(96 + speed01 * 72, 0.5);
    arpFilter.frequency.rampTo(300 + 4800 * Math.pow(speed01, 1.4), 0.3);
    padFilter.frequency.rampTo(500 + 1800 * speed01, 1.0);
  }

  // each near-miss steps the next note up the scale
  function nearMiss() {
    if (!ready) return;
    const note = SCALE[Math.min(scaleIdx, SCALE.length - 1)];
    pluck.triggerAttackRelease(note, '8n');
    scaleIdx++;
  }

  function resetLadder() { scaleIdx = 0; }

  function death() {
    if (!ready) return;
    // low filtered thud, then a beat of silence
    thud.triggerAttackRelease('A0', '2n');
    pad.releaseAll();
    arpLoop.mute = true;
    padLoop.mute = true;
    setTimeout(() => { arpLoop.mute = false; padLoop.mute = false; }, 1100);
    scaleIdx = 0;
  }

  function setMuted(m) {
    muted = m;
    if (ready) Tone.Destination.mute = m;
  }

  return { start, setSpeed, nearMiss, resetLadder, death, setMuted, isMuted: () => muted, isReady: () => ready };
}
