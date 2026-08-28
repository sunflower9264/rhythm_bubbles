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

makeSfx('tap.wav', 0.16, (buffer) => {
  addTone(buffer, 0, 0.11, 420, 0.45, 'sine', 0.35);
  addTone(buffer, 0.012, 0.12, 840, 0.16, 'triangle', -0.2);
  addNoise(buffer, 0, 0.035, 0.06);
});

const correctPopNotes = [
  [523.25, 659.25, 783.99],
  [587.33, 739.99, 880.0],
  [493.88, 622.25, 739.99],
];

correctPopNotes.forEach((notes, variantIndex) => {
  makeSfx(`correct-pop-${variantIndex + 1}.wav`, 0.46, (buffer) => {
    addTone(buffer, 0, 0.09, notes[0] / 2, 0.22, 'sine', 0.08);
    addTone(buffer, 0.015, 0.16, notes[0], 0.24, 'triangle', 0.06);
    addTone(buffer, 0.055, 0.18, notes[1], 0.27, 'sine', 0.04);
    addTone(buffer, 0.1, 0.24, notes[2], 0.25, 'triangle');
    addTone(buffer, 0.03, 0.36, notes[2] * 2, 0.055, 'sine', 0.12);
    addNoise(buffer, 0.08, 0.045, 0.025 + variantIndex * 0.004);
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
