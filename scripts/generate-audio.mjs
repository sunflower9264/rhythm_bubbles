import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'public/audio');
const SAMPLE_RATE = 44_100;

mkdirSync(OUT_DIR, { recursive: true });

function envelope(time, duration, attack = 0.01, release = 0.12) {
  const attackGain = Math.min(1, time / attack);
  const releaseGain = Math.min(1, Math.max(0, (duration - time) / release));
  return Math.min(attackGain, releaseGain);
}

function osc(type, phase) {
  if (type === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(phase));
  if (type === 'square') return Math.sin(phase) >= 0 ? 1 : -1;
  return Math.sin(phase);
}

function addTone(buffer, start, duration, frequency, gain, type = 'sine', glide = 0) {
  const startSample = Math.floor(start * SAMPLE_RATE);
  const endSample = Math.min(buffer.length, Math.ceil((start + duration) * SAMPLE_RATE));
  let phase = 0;
  for (let sample = startSample; sample < endSample; sample += 1) {
    const time = (sample - startSample) / SAMPLE_RATE;
    const currentFrequency = frequency * (1 + glide * (time / duration));
    phase += (Math.PI * 2 * currentFrequency) / SAMPLE_RATE;
    buffer[sample] += osc(type, phase) * gain * envelope(time, duration);
  }
}

function addNoise(buffer, start, duration, gain) {
  const startSample = Math.floor(start * SAMPLE_RATE);
  const endSample = Math.min(buffer.length, Math.ceil((start + duration) * SAMPLE_RATE));
  let seed = 0x51f15e;
  for (let sample = startSample; sample < endSample; sample += 1) {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    const noise = (seed / 0xffffffff) * 2 - 1;
    const time = (sample - startSample) / SAMPLE_RATE;
    buffer[sample] += noise * gain * envelope(time, duration, 0.002, duration * 0.85);
  }
}

function addGlideTone(
  buffer,
  start,
  duration,
  startFrequency,
  endFrequency,
  gain,
  type = 'sine',
  decay = 12,
) {
  const startSample = Math.floor(start * SAMPLE_RATE);
  const endSample = Math.min(buffer.length, Math.ceil((start + duration) * SAMPLE_RATE));
  let phase = 0;
  for (let sample = startSample; sample < endSample; sample += 1) {
    const time = (sample - startSample) / SAMPLE_RATE;
    const progress = Math.min(1, time / duration);
    const frequency = startFrequency * Math.pow(endFrequency / startFrequency, progress);
    phase += (Math.PI * 2 * frequency) / SAMPLE_RATE;
    const attack = Math.min(1, time / 0.0025);
    const release = Math.min(1, Math.max(0, (duration - time) / 0.025));
    buffer[sample] += osc(type, phase) * gain * attack * release * Math.exp(-time * decay);
  }
}

function addFilteredNoise(buffer, start, duration, gain, seedOffset, mode, smoothing, decay) {
  const startSample = Math.floor(start * SAMPLE_RATE);
  const endSample = Math.min(buffer.length, Math.ceil((start + duration) * SAMPLE_RATE));
  let seed = (0x68bc21eb + seedOffset) >>> 0;
  let lowPassed = 0;
  for (let sample = startSample; sample < endSample; sample += 1) {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    const noise = (seed / 0xffffffff) * 2 - 1;
    lowPassed += (noise - lowPassed) * smoothing;
    const filtered = mode === 'low' ? lowPassed : noise - lowPassed;
    const time = (sample - startSample) / SAMPLE_RATE;
    const attack = Math.min(1, time / 0.002);
    const release = Math.min(1, Math.max(0, (duration - time) / 0.035));
    buffer[sample] += filtered * gain * attack * release * Math.exp(-time * decay);
  }
}

function addBubbleBurst(buffer, start, bodyFrequency, gain, seedOffset) {
  // A soft pressure drop gives the pop its round body; the filtered snap reads
  // as a thin membrane breaking, while the rising droplet keeps it aquatic.
  addGlideTone(buffer, start, 0.12, bodyFrequency, bodyFrequency * 0.3, gain, 'sine', 21);
  addGlideTone(buffer, start + 0.004, 0.075, bodyFrequency * 1.8, bodyFrequency * 0.7, gain * 0.2, 'triangle', 31);
  addFilteredNoise(buffer, start, 0.032, gain * 0.32, seedOffset, 'high', 0.16, 76);
  addGlideTone(buffer, start + 0.022, 0.105, 1180, 1620, gain * 0.13, 'sine', 19);
}

function addKick(buffer, start, gain = 0.52) {
  const duration = 0.2;
  const startSample = Math.floor(start * SAMPLE_RATE);
  const endSample = Math.min(buffer.length, Math.ceil((start + duration) * SAMPLE_RATE));
  let phase = 0;
  for (let sample = startSample; sample < endSample; sample += 1) {
    const time = (sample - startSample) / SAMPLE_RATE;
    const frequency = 148 * Math.pow(44 / 148, time / duration);
    phase += (Math.PI * 2 * frequency) / SAMPLE_RATE;
    const attack = Math.min(1, time / 0.003);
    buffer[sample] += Math.sin(phase) * gain * attack * Math.exp(-time * 22);
  }
}

function addPercussionNoise(buffer, start, duration, gain, seedOffset, decay) {
  const startSample = Math.floor(start * SAMPLE_RATE);
  const endSample = Math.min(buffer.length, Math.ceil((start + duration) * SAMPLE_RATE));
  let seed = (0x7f4a7c15 + seedOffset) >>> 0;
  let previous = 0;
  for (let sample = startSample; sample < endSample; sample += 1) {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    const noise = (seed / 0xffffffff) * 2 - 1;
    const highPassed = noise - previous * 0.82;
    previous = noise;
    const time = (sample - startSample) / SAMPLE_RATE;
    const attack = Math.min(1, time / 0.002);
    buffer[sample] += highPassed * gain * attack * Math.exp(-time * decay);
  }
}

function addPluck(buffer, start, duration, frequency, gain) {
  const startSample = Math.floor(start * SAMPLE_RATE);
  const endSample = Math.min(buffer.length, Math.ceil((start + duration) * SAMPLE_RATE));
  let phase = 0;
  for (let sample = startSample; sample < endSample; sample += 1) {
    const time = (sample - startSample) / SAMPLE_RATE;
    phase += (Math.PI * 2 * frequency) / SAMPLE_RATE;
    const attack = Math.min(1, time / 0.006);
    const release = Math.min(1, Math.max(0, (duration - time) / 0.045));
    const body = Math.sin(phase) * 0.72 + osc('triangle', phase * 2) * 0.28;
    buffer[sample] += body * gain * attack * release * Math.exp(-time * 5.5);
  }
}

function normalize(buffer, peak = 0.9) {
  let max = 0;
  for (const value of buffer) max = Math.max(max, Math.abs(value));
  if (max === 0) return buffer;
  const scale = peak / max;
  for (let index = 0; index < buffer.length; index += 1) buffer[index] *= scale;
  return buffer;
}

function writeWav(name, buffer) {
  normalize(buffer);
  const bytesPerSample = 2;
  const dataSize = buffer.length * bytesPerSample;
  const output = Buffer.alloc(44 + dataSize);
  output.write('RIFF', 0);
  output.writeUInt32LE(36 + dataSize, 4);
  output.write('WAVE', 8);
  output.write('fmt ', 12);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(SAMPLE_RATE, 24);
  output.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28);
  output.writeUInt16LE(bytesPerSample, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36);
  output.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < buffer.length; index += 1) {
    const value = Math.max(-1, Math.min(1, buffer[index]));
    output.writeInt16LE(Math.round(value * 32767), 44 + index * bytesPerSample);
  }
  writeFileSync(resolve(OUT_DIR, name), output);
}

function makeSfx(name, duration, compose) {
  const buffer = new Float64Array(Math.ceil(duration * SAMPLE_RATE));
  compose(buffer);
  writeWav(name, buffer);
}

makeSfx('tap.wav', 0.18, (buffer) => {
  addBubbleBurst(buffer, 0, 610, 0.52, 11);
});

const correctPopNotes = [
  [659.25, 987.77],
  [698.46, 1046.5],
  [783.99, 1174.66],
];

correctPopNotes.forEach((notes, variantIndex) => {
  makeSfx(`correct-pop-${variantIndex + 1}.wav`, 0.34, (buffer) => {
    // The input pop already owns the transient. Success answers with a clean,
    // two-step water-glass rise so rapid correct taps stay readable, not noisy.
    addGlideTone(buffer, 0.012, 0.15, notes[0] * 0.9, notes[0], 0.22, 'sine', 9);
    addGlideTone(buffer, 0.072, 0.22, notes[1] * 0.92, notes[1] * 1.035, 0.28, 'sine', 7);
    addGlideTone(buffer, 0.084, 0.2, notes[1] * 1.96, notes[1] * 2.04, 0.055, 'sine', 9);
    addFilteredNoise(buffer, 0.068, 0.026, 0.018, 40 + variantIndex, 'high', 0.12, 82);
  });
});

makeSfx('wrong-wobble.wav', 0.58, (buffer) => {
  addTone(buffer, 0, 0.18, 196, 0.26, 'triangle', -0.2);
  addTone(buffer, 0.055, 0.34, 155.56, 0.21, 'sine', -0.34);
  addTone(buffer, 0.12, 0.3, 130.81, 0.18, 'triangle', 0.22);
  addTone(buffer, 0.2, 0.24, 174.61, 0.12, 'sine', -0.18);
  addNoise(buffer, 0.02, 0.08, 0.045);
});

makeSfx('level-up.wav', 0.9, (buffer) => {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((frequency, index) => {
    addTone(buffer, index * 0.14, 0.34, frequency, 0.28, index % 2 ? 'triangle' : 'sine');
    addTone(buffer, index * 0.14 + 0.02, 0.45, frequency * 2, 0.055, 'sine');
  });
});

makeSfx('countdown.wav', 0.18, (buffer) => {
  addTone(buffer, 0, 0.16, 880, 0.3, 'sine');
  addTone(buffer, 0.015, 0.12, 1320, 0.08, 'triangle');
});

makeSfx('enemy-hit.wav', 0.42, (buffer) => {
  addTone(buffer, 0, 0.12, 246.94, 0.34, 'triangle', -0.42);
  addTone(buffer, 0.035, 0.2, 493.88, 0.2, 'sine', -0.18);
  addNoise(buffer, 0.01, 0.055, 0.08);
});

makeSfx('enemy-attack.wav', 0.92, (buffer) => {
  // A submerged creature collision: immediate water-pressure thump, rubbery
  // body weight and a foamy wash. It stays rounded rather than explosive so it
  // fits the game's soft ocean art while remaining much heavier than a tap.
  addGlideTone(buffer, 0, 0.5, 112, 38, 0.42, 'sine', 5.8);
  addGlideTone(buffer, 0.006, 0.28, 224, 78, 0.28, 'triangle', 9.5);
  addGlideTone(buffer, 0.004, 0.22, 460, 130, 0.32, 'triangle', 12);
  addFilteredNoise(buffer, 0, 0.13, 0.3, 301, 'high', 0.09, 30);
  addFilteredNoise(buffer, 0.018, 0.68, 0.25, 707, 'low', 0.035, 3.1);
  addGlideTone(buffer, 0.12, 0.56, 68, 44, 0.2, 'triangle', 3.4);
  [0.07, 0.12, 0.19, 0.27].forEach((start, index) => {
    addBubbleBurst(buffer, start, 420 + index * 95, 0.065 - index * 0.007, 800 + index);
  });
});

makeSfx('shield-break.wav', 0.76, (buffer) => {
  addTone(buffer, 0, 0.24, 148, 0.32, 'sine', -0.58);
  addTone(buffer, 0.012, 0.3, 296, 0.18, 'triangle', -0.42);
  addNoise(buffer, 0.018, 0.19, 0.13);
  [1760, 2240, 2816, 3360, 4192, 4864].forEach((frequency, index) => {
    const start = 0.055 + index * 0.043;
    addTone(buffer, start, 0.22 + (index % 2) * 0.05, frequency, 0.12 - index * 0.009, 'sine', -0.38);
    addPercussionNoise(buffer, start, 0.12, 0.045, 900 + index * 37, 31 + index * 2);
  });
  addTone(buffer, 0.3, 0.34, 988, 0.08, 'triangle', -0.5);
});

makeSfx('victory.wav', 1.55, (buffer) => {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
  notes.forEach((frequency, index) => {
    addTone(buffer, index * 0.17, 0.5, frequency, 0.27, index % 2 ? 'triangle' : 'sine');
    addTone(buffer, index * 0.17 + 0.025, 0.58, frequency * 2, 0.05, 'sine');
  });
  addTone(buffer, 0.86, 0.62, 523.25, 0.1, 'triangle');
  addTone(buffer, 0.86, 0.62, 659.25, 0.1, 'triangle');
  addTone(buffer, 0.86, 0.62, 783.99, 0.1, 'triangle');
});

const bpm = 120;
const beat = 60 / bpm;
const bars = 8;
const bgm = new Float64Array(bars * beat * 4 * SAMPLE_RATE);
const chords = [
  [261.63, 329.63, 392.0, 493.88],
  [220.0, 261.63, 329.63, 392.0],
  [174.61, 220.0, 261.63, 329.63],
  [196.0, 246.94, 293.66, 440.0],
];
const bassPattern = [0, 2, 0, 3, 0, 2, 1, 3];
const hookPattern = [4, 7, 9, 7, 4, 2, 0, 2];
const cMajorPentatonic = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

for (let bar = 0; bar < bars; bar += 1) {
  const chord = chords[bar % chords.length];
  const barStart = bar * beat * 4;

  addTone(bgm, barStart, beat * 3.86, chord[0] / 2, 0.045, 'sine');

  for (let pulse = 0; pulse < 4; pulse += 1) {
    const start = barStart + pulse * beat;
    addKick(bgm, start, pulse === 0 ? 0.58 : 0.48);
    if (pulse % 2 === 1) {
      addPercussionNoise(bgm, start, 0.13, 0.075, bar * 31 + pulse, 24);
      addPercussionNoise(bgm, start + 0.018, 0.1, 0.045, bar * 43 + pulse, 29);
    }
  }

  for (let step = 0; step < 8; step += 1) {
    const start = barStart + step * (beat / 2);
    const note = chord[(step + bar) % chord.length] * (step % 4 === 3 ? 2 : 1);
    addPluck(bgm, start, beat * 0.42, note, step % 2 === 1 ? 0.115 : 0.09);
    addPercussionNoise(bgm, start, step % 2 === 1 ? 0.07 : 0.045, step % 2 === 1 ? 0.038 : 0.022, bar * 101 + step, 48);

    const bassNote = chord[bassPattern[step] % chord.length] / 2;
    addTone(bgm, start, beat * 0.34, bassNote, step % 2 === 0 ? 0.14 : 0.095, 'triangle');
  }

  if (bar % 2 === 1) {
    for (let fill = 0; fill < 4; fill += 1) {
      addPercussionNoise(bgm, barStart + beat * (3.25 + fill * 0.1875), 0.04, 0.026 + fill * 0.006, bar * 211 + fill, 55);
    }
  }

  for (let hook = 0; hook < 4; hook += 1) {
    const patternIndex = (bar * 2 + hook) % hookPattern.length;
    const note = cMajorPentatonic[hookPattern[patternIndex]];
    addPluck(bgm, barStart + beat * (0.5 + hook), beat * 0.42, note, hook === 0 ? 0.1 : 0.075);
  }
}

writeWav('bubble-garden-groove-v2.wav', bgm);
console.log(`Generated original audio in ${OUT_DIR}`);
