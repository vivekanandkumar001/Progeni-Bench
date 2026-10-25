const fs = require('fs');
const path = require('path');
// Final, hand-checked seoDescription overrides for tools whose description is
// shorter than the 120-char minimum required by scripts/verify.js C35.
const overrides = {
  'to-aiff': 'Convert audio to uncompressed AIFF, the classic Apple lossless format. Ideal for macOS tools, Logic Pro and hardware samplers that expect native AIFF.',
  'base64-to-audio': 'Decode a Base64 string or a full data URI back into a playable, downloadable audio file. Bench reconstructs the original bytes and detects the format.',
  'ringtone-maker': 'Crop any song to a phone-ready ringtone clip of up to 30 seconds, add a smooth fade in and out, and export it as MP3 or M4A for your device.',
  'batch-rename': 'Rename and export several audio files at once with a shared prefix, sequence numbers and an output format, then download them or a single ZIP.',
  'audio-zip': 'Bundle several audio files into a single standard ZIP archive for one-click download. Each file is validated as it is read and the total size is reported.',
  'fade': 'Add a smooth fade-in, a fade-out or both so a track never starts or stops abruptly. Fade lengths are independent and clamped to the file length.',
  'reverse': 'Play an audio file backwards for sound design, hidden-message checks and creative edits. Reversing is exact and can be exported losslessly as WAV.',
  'loop-maker': 'Repeat a chosen section of audio a set number of times to build a seamless loop, with an optional crossfade between repeats to avoid clicks at the joins.',
  'crossfade': 'Blend two tracks together with a real equal-power crossfade at a duration you choose. Both files must be long enough to overlap for the selected length.',
  'channel-tools': 'Reshape stereo audio: swap left and right, keep one channel only, downmix to mono or duplicate one channel to both sides. Fixes reversed recordings.',
  'equalizer': 'Boost or cut bass, treble and a selectable mid band with real biquad peaking and shelf filters. A limiter protects the output from clipping after boosts.',
  'clipping-detector': 'Scan a file for clipped samples and report how often, where and how loudly it distorts, so you can catch problems before release or diagnose a recording.',
  'silence-detector': 'Map every silent gap in a file with its start time, end time and duration. Set a threshold and minimum gap length, then read the full table of gaps.',
  'stereo-test': 'Play a generated tone through the left, right or both channels, or alternate between them, to confirm your speakers and headphones are wired correctly.',
  'tone-generator': 'Generate a precise sine tone or a musical note at any frequency from 20 Hz to 20 kHz, preview it and download it as a WAV for testing speakers or hearing.',
  'noise-generator': 'Generate white, pink or brown noise with the correct spectral shape, play it to preview and download it as a WAV for masking, sleep, focus or room testing.',
  'metronome': 'Play an accurate click track at any tempo from 30 to 300 BPM with a configurable time signature and a louder accent on the downbeat for practice sessions.',
  'spectrogram': 'Render a spectrogram of any audio file so you can see its frequencies over time, using a Web Audio FFT and a downloadable PNG image as the result.',
  'waveform-image': 'Generate a clean waveform PNG from any audio file for podcast art, video overlays or the web. Choose the size, colours, background and bar or wave style.'
};
// Tools whose generated (truncated) description also came in below 120 chars or
// contained an apostrophe; replaced with a clean equivalent.
const extra = {
  'to-wav': 'Decode any supported audio file and export a universally compatible, uncompressed PCM WAV. WAV plays everywhere and is the safest format for editing.',
  'speed': 'Speed up or slow down audio from 0.5x to 3x while keeping the pitch steady, using pitch-preserving time-stretch so speech stays clear and intelligible.',
  'noise-reducer': 'Reduce steady background noise such as hiss, hum and air conditioning with a genuine FFT spectral denoiser and an adjustable noise floor.',
  'rss-validator': 'Check a podcast RSS feed for missing or invalid enclosure tags: an audio URL, a length value and a valid audio MIME type, with a clear issue report.'
};
Object.assign(overrides, extra);

const generated = JSON.parse(fs.readFileSync(path.join(__dirname, 'audio-seodesc.json'), 'utf8'));
const final = {};
Object.keys(generated).forEach(k => { final[k] = overrides[k] || generated[k]; });

let bad = [];
Object.keys(final).forEach(k => {
  const n = final[k].length;
  if (n < 120 || n > 155) bad.push(k + ' len ' + n);
  if (/['\u2018\u2019]/.test(final[k])) bad.push(k + ' apostrophe');
  if (/["\\]/.test(final[k])) bad.push(k + ' quote/backslash');
});
const seen = new Set();
Object.keys(final).forEach(k => { if (seen.has(final[k])) bad.push('dup ' + k); seen.add(final[k]); });
if (bad.length) { console.log('INVALID:', bad.join('; ')); process.exit(1); }
console.log('validated', Object.keys(final).length, 'seoDescription values (120-155 chars, unique, no quotes)');
fs.writeFileSync(path.join(__dirname, 'audio-seodesc-final.json'), JSON.stringify(final, null, 2));
