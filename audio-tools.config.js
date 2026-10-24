/*
 * audio-tools.config.js - typed registry for the Bench Audio Toolkit.
 *
 * UMD module: browser (window.AudioToolConfig) and Node.js (require).
 * The build script generates /audio/<slug>/ pages from this list; app.js and
 * audio-toolkit.js consume the same objects at runtime.
 *
 * A tool is never listed as "implemented" unless audio-toolkit.js exports a
 * processor with the same handler id. The processing engine is a combination
 * of the Web Audio API (decode, analysis, recording, simple DSP) and a
 * lazily-loaded FFmpeg.wasm core (codec conversion, complex filters).
 *
 * Status vocabulary:
 *   implemented  - real handler + tests, produces a real file
 *   experimental - real handler, limited validation / quality caveats
 *   deferred     - planned, no handler shipped (no page generated)
 *   unavailable  - cannot be offered honestly in this architecture
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AudioToolConfig = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SITE_URL = "https://bench.progeni.live";
  const SITE_NAME = "Progeni Bench";

  const LIMITS = {
    // Per-file byte ceiling. Audio files are usually far smaller than this;
    // the cap protects the tab from a runaway decode.
    maxFileBytes: 100 * 1024 * 1024,
    // Decoded-PCM ceiling in samples (per channel). 10 minutes of 48 kHz
    // stereo is ~28.8M frames; 90M frames is ~31 minutes of 48 kHz.
    maxDecodedFrames: 90 * 1000 * 1000,
    maxDurationSec: 1800,
    maxFiles: 20,
    concurrency: 1,
    // FFmpeg.wasm core is ~31 MB; downloaded once and cached by the browser.
    ffmpegCoreBytes: 31 * 1024 * 1024,
    recorderMaxSec: 1800
  };

  const CATEGORIES = [
    { id: "convert", name: "Convert & Compress", blurb: "Change format, bitrate and size between MP3, WAV, FLAC, AAC, OGG, Opus, M4A and AIFF." },
    { id: "edit", name: "Cut, Join & Edit", blurb: "Trim, split, merge, fade, reverse, change speed and loudness." },
    { id: "clean", name: "Clean & Enhance", blurb: "Reduce noise and hum, normalise loudness, EQ, limit and detect clipping." },
    { id: "record", name: "Record & Microphone", blurb: "Record from your microphone locally, meter input and test channels." },
    { id: "music", name: "Music & Sound", blurb: "Generate tones and noise, analyse tempo and spectrum, visualise waveforms." },
    { id: "metadata", name: "Metadata & Diagnostics", blurb: "Inspect and edit tags, measure loudness, peaks, bitrate and integrity." },
    { id: "developer", name: "Developer Utilities", blurb: "Base64, data URIs, waveform images, player snippets and batch export." }
  ];

  /* Base64 note reused by the developer tools. */
  const BASE64_NOTE =
    "Base64 grows the payload by about 33%. Use it for small assets embedded in " +
    "CSS, HTML or JSON, not for streaming media.";

  function bytesLabel(n) {
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(0) + " MB";
    return (n / 1024).toFixed(0) + " KB";
  }

  const CLIENT_PRIVACY =
    "Decoding, editing and encoding run inside your browser. Files are read from " +
    "local memory into temporary object URLs and are never uploaded, logged or " +
    "stored by Bench. The FFmpeg.wasm engine is downloaded once from this site " +
    "(same origin) and runs entirely on your device.";

  const MIC_PRIVACY =
    "Recording uses the browser MediaRecorder API. Your audio is captured from the " +
    "microphone into local memory, is never uploaded and is discarded when you leave " +
    "the page or clear it. Bench does not retain recordings.";

  /* ------------------------------------------------ shared option builders */

  const FORMAT_OPTIONS = [
    { value: "mp3", label: "MP3 (.mp3)" },
    { value: "wav", label: "WAV (.wav)" },
    { value: "m4a", label: "M4A / AAC (.m4a)" },
    { value: "ogg", label: "OGG Vorbis (.ogg)" },
    { value: "opus", label: "Opus (.opus)" },
    { value: "flac", label: "FLAC (.flac)" },
    { value: "aiff", label: "AIFF (.aiff)" }
  ];

  function formatOption() {
    return {
      key: "format", label: "Output format", type: "select", value: "mp3",
      options: FORMAT_OPTIONS,
      help: "MP3, M4A, OGG and Opus are lossy. WAV, FLAC and AIFF are lossless and much larger."
    };
  }

  function bitrateOption() {
    return {
      key: "bitrate", label: "Bitrate (kbps)", type: "select", value: "192",
      options: [
        { value: "96", label: "96 — small files" },
        { value: "128", label: "128 — standard" },
        { value: "160", label: "160" },
        { value: "192", label: "192 — good" },
        { value: "256", label: "256 — high" },
        { value: "320", label: "320 — maximum MP3" }
      ],
      help: "Applies to lossy formats only. Ignored for WAV, FLAC and AIFF.",
      showIf: { key: "format", value: ["mp3", "m4a", "ogg", "opus"] }
    };
  }

  function channelsOption() {
    return {
      key: "channels", label: "Channels", type: "select", value: "keep",
      options: [
        { value: "keep", label: "Keep original" },
        { value: "mono", label: "Mono (1 channel)" },
        { value: "stereo", label: "Stereo (2 channels)" }
      ],
      help: "Mono halves the data for spoken audio. Converting stereo to mono mixes the channels."
    };
  }

  function sampleRateOption() {
    return {
      key: "sampleRate", label: "Sample rate", type: "select", value: "keep",
      options: [
        { value: "keep", label: "Keep original" },
        { value: "22050", label: "22,050 Hz" },
        { value: "44100", label: "44,100 Hz (CD)" },
        { value: "48000", label: "48,000 Hz (video)" }
      ],
      help: "Lowering the sample rate reduces size but discards high frequencies."
    };
  }

  /* -------------------------------------------------------------- registry */

  const TOOLS = [];
  /* __TOOL_DEFS__ */

  function makeTool(def) {
    const tool = Object.assign({
      slug: def.id,
      status: "implemented",
      execution: "client",
      requiresFile: true,
      maxFiles: 1,
      inputs: ["MP3", "WAV", "FLAC", "AAC/M4A", "OGG", "Opus", "AIFF", "AMR", "WMA"],
      outputs: ["audio"],
      privacy: CLIENT_PRIVACY,
          seoDescription:
      "Decodes your file and re-encodes it in the format you choose using the FFmpeg.wasm engine that runs on your device. Lossy formats expose a bitrate control",
    keywords: [],
      engine: "web-audio"
    }, def);
    if (!tool.seoTitle) tool.seoTitle = tool.name + " | Bench Audio Toolkit";
    if (!tool.seoDescription) tool.seoDescription = tool.summary;
    if (!tool.faq || !tool.faq.length) {
      tool.faq = [{
        q: "Is my file uploaded?",
        a: "No. Processing happens in your browser and the file is never sent to Bench or a third party."
      }];
    }
    if (!tool.howTo || !tool.howTo.length) {
      tool.howTo = ["Add a supported audio file.", "Adjust the settings.", "Run the tool and download the result."];
    }
    return tool;
  }

  const T = makeTool;

  /* ------------------------------------------------ A: convert and compress */

  TOOLS.push(T({
    id: "convert",
    name: "Audio Converter",
    category: "convert",
    handler: "convert",
    engine: "ffmpeg",
    summary: "Convert between MP3, WAV, FLAC, AAC/M4A, OGG, Opus and AIFF with a real encoder and an exact output size.",
    description:
      "Decodes your file and re-encodes it in the format you choose using the " +
      "FFmpeg.wasm engine that runs on your device. Lossy formats expose a bitrate " +
      "control; lossless formats keep every sample. The result is validated, played " +
      "back for comparison and offered as a download with its true byte size.",
    keywords: ["audio converter", "mp3 to wav", "wav to mp3", "flac to mp3", "m4a to mp3", "ogg to mp3", "convert audio online"],
    options: [formatOption(), bitrateOption(), channelsOption(), sampleRateOption()],
    outputs: ["audio"],
    maxFiles: 1,
    howTo: [
      "Add an MP3, WAV, FLAC, M4A, OGG, Opus, AIFF, AMR or WMA file. Bench decodes it and shows duration, sample rate and channels.",
      "Pick the output format. Choose a bitrate for lossy formats or a lower sample rate to save space.",
      "Run the converter. The engine is downloaded the first time and cached afterwards.",
      "Preview the result and download it. If the requested format is unavailable, Bench says so instead of faking the output."
    ],
    limitations:
      "MP3 output uses libmp3lame and AAC uses FFmpeg's encoder; both are lossy and re-encoding lossy audio again can add artefacts. Very long files are bounded by the 30-minute / 100 MB limits. The first conversion downloads the ~31 MB engine.",
    useCases: ["Turn a WAV recording into a small MP3.", "Convert an M4A voice memo to WAV for editing.", "Produce a FLAC master from a lossless source."],
    faq: [
      { q: "Which formats can I convert between?", a: "MP3, WAV, FLAC, AAC/M4A, OGG Vorbis, Opus and AIFF in any direction the encoder supports, plus decoding of AMR, WMA, Speex and more." },
      { q: "Why is the first conversion slow?", a: "The FFmpeg.wasm engine (~31 MB) is downloaded once and cached by your browser. Later conversions start instantly." },
      { q: "Does converting lose quality?", a: "Converting to WAV, FLAC or AIFF is lossless. Converting to MP3, AAC, OGG or Opus is lossy; converting lossy to lossy can add artefacts, so start from the best source you have." }
    ]
  }));

  TOOLS.push(T({
    id: "compress",
    name: "Audio Compressor",
    category: "convert",
    handler: "compressAudio",
    engine: "ffmpeg",
    summary: "Reduce an audio file's size by lowering bitrate, downmixing to mono and trimming the sample rate.",
    description:
      "Re-encodes audio at a lower bitrate, optionally mono, to cut file size while keeping the content. " +
      "It reports the exact before and after size and the byte saving so you can judge the trade-off.",
        seoDescription:
      "Re-encodes audio at a lower bitrate, optionally mono, to cut file size while keeping the content. It reports the exact before and after size and the byte",
    keywords: ["compress audio", "reduce audio size", "lower bitrate mp3", "make audio smaller", "audio file size"],
    options: [bitrateOption(), channelsOption(), sampleRateOption()],
    outputs: ["audio"],
    howTo: [
      "Add a file. Bench reports its current size, duration and bitrate.",
      "Choose a lower bitrate. 128 kbps is fine for speech; 192-256 kbps suits music.",
      "Run the compressor and compare the before/after sizes.",
      "Preview, then download. If the file is already small, Bench tells you instead of inflating it."
    ],
    limitations:
      "Lossy re-encoding is irreversible: the discarded detail cannot be recovered. Compressing an already-compressed file twice adds artefacts. Lossless inputs (WAV/FLAC) compress best.",
    useCases: ["Fit a podcast under a size limit.", "Shrink voice notes before emailing.", "Prepare spoken audio for a phone system."]
  }));

  TOOLS.push(T({
    id: "to-wav",
    name: "Audio to WAV",
    category: "convert",
    handler: "toWav",
    engine: "web-audio",
    summary: "Decode any supported audio file and export a universally compatible, uncompressed WAV file.",
    description:
      "Uses the browser's own decoder to turn your audio into uncompressed PCM WAV. " +
      "WAV plays everywhere and is the safest format for editing, at the cost of a large file.",
        seoDescription:
      "Decode any supported audio file and export a universally compatible, uncompressed PCM WAV. WAV plays everywhere and is the safest format for editing.",
    keywords: ["audio to wav", "convert to wav", "mp3 to wav", "uncompressed audio"],
    options: [channelsOption(), sampleRateOption()],
    outputs: ["audio"],
    howTo: [
      "Add any audio file your browser can decode.",
      "Choose channels and sample rate, or keep the originals.",
      "Bench writes a standard 16-bit PCM WAV and offers it for download."
    ],
    limitations: "WAV is uncompressed, so files are large (roughly 10 MB per minute of stereo 44.1 kHz). Sample rates above the source offer no real gain.",
    useCases: ["Prepare audio for a video editor.", "Convert a compressed file for a CD or hardware device."]
  }));

  TOOLS.push(T({
    id: "to-mp3",
    name: "Audio to MP3",
    category: "convert",
    handler: "toMp3",
    engine: "ffmpeg",
    summary: "Encode any audio file to MP3 with libmp3lame at a bitrate you choose.",
    description:
      "Encodes to MP3 with the LAME encoder at 96-320 kbps. MP3 plays on virtually every device, " +
      "so it is the safe choice for sharing and playback.",
        seoDescription:
      "Encodes to MP3 with the LAME encoder at 96-320 kbps. MP3 plays on virtually every device, so it is the safe choice for sharing and playback.",
    keywords: ["audio to mp3", "convert to mp3", "wav to mp3", "make mp3"],
    options: [bitrateOption(), channelsOption()],
    outputs: ["audio"],
    howTo: [
      "Add an audio file.",
      "Choose a bitrate: 128 kbps for speech, 192-320 kbps for music.",
      "Run the encoder and download the MP3."
    ],
    limitations: "MP3 is lossy and cannot store more channels than its container allows. Re-encoding an existing MP3 will not improve quality.",
    useCases: ["Make a shareable MP3 from a WAV.", "Produce a small file for a voice menu."]
  }));

  TOOLS.push(T({
    id: "to-flac",
    name: "Audio to FLAC",
    category: "convert",
    handler: "toFlac",
    engine: "ffmpeg",
    summary: "Encode audio to lossless, compressed FLAC - smaller than WAV with no quality loss.",
    description:
      "FLAC stores every sample of the original with lossless compression, so it is typically " +
      "40-60% smaller than WAV while remaining a perfect copy of the source audio.",
        seoDescription:
      "FLAC stores every sample of the original with lossless compression, so it is typically 40-60% smaller than WAV while remaining a perfect copy of the source",
    keywords: ["audio to flac", "convert to flac", "lossless audio", "wav to flac"],
    options: [channelsOption(), sampleRateOption()],
    outputs: ["audio"],
    howTo: [
      "Add a lossless source such as WAV or AIFF for a true lossless result.",
      "Keep channels and sample rate, or adjust them.",
      "Run the encoder and download the FLAC file."
    ],
    limitations: "Encoding a lossy source to FLAC keeps the lossy artefacts - FLAC preserves what you give it, it cannot restore detail. FLAC is not supported by every legacy device.",
    useCases: ["Archive recordings losslessly.", "Halve a WAV's size without losing quality."]
  }));

  TOOLS.push(T({
    id: "to-m4a",
    name: "Audio to M4A (AAC)",
    category: "convert",
    handler: "toM4a",
    engine: "ffmpeg",
    summary: "Encode audio to AAC in an M4A container - small files with good quality on Apple devices.",
    description:
      "AAC generally sounds better than MP3 at the same bitrate, and M4A is natively supported " +
      "by iOS, macOS, Android and modern browsers.",
        seoDescription:
      "AAC generally sounds better than MP3 at the same bitrate, and M4A is natively supported by iOS, macOS, Android and modern browsers.",
    keywords: ["audio to m4a", "convert to aac", "convert to m4a", "aac encoder"],
    options: [bitrateOption(), channelsOption()],
    outputs: ["audio"],
    howTo: ["Add an audio file.", "Choose a bitrate (128-256 kbps is typical).", "Run the encoder and download the M4A."],
    limitations: "AAC is lossy. Some very old players do not read the M4A container, though most modern devices do.",
    useCases: ["Prepare audio for an iPhone ringtone or app.", "Smaller, higher-quality alternative to MP3."]
  }));

  TOOLS.push(T({
    id: "to-ogg",
    name: "Audio to OGG / Opus",
    category: "convert",
    handler: "toOgg",
    engine: "ffmpeg",
    summary: "Encode audio to open OGG Vorbis or Opus, ideal for the web and games.",
    description:
      "Ogg Vorbis and Opus are royalty-free formats widely used on the web, in games and in " +
      "open-source software. Opus gives excellent quality at low bitrates.",
        seoDescription:
      "Ogg Vorbis and Opus are royalty-free formats widely used on the web, in games and in open-source software. Opus gives excellent quality at low bitrates.",
    keywords: ["audio to ogg", "convert to opus", "vorbis encoder", "ogg converter"],
    options: [
      { key: "codec", label: "Codec", type: "select", value: "vorbis", options: [ { value: "vorbis", label: "Vorbis (.ogg)" }, { value: "opus", label: "Opus (.opus)" } ] },
      bitrateOption(), channelsOption()
    ],
    outputs: ["audio"],
    howTo: ["Add a file.", "Choose Vorbis or Opus and a bitrate.", "Run the encoder and download the result."],
    limitations: "Ogg/Opus is less supported by legacy hardware than MP3 or AAC. Opus is optimised for speech and streaming.",
    useCases: ["Prepare audio for an HTML5 game.", "Use a royalty-free format for a web app."]
  }));

  TOOLS.push(T({
    id: "to-aiff",
    name: "Audio to AIFF",
    category: "convert",
    handler: "toAiff",
    engine: "ffmpeg",
    summary: "Convert audio to uncompressed AIFF, the classic Apple lossless audio format.",
    description: "AIFF is Apple's uncompressed format. It is a good fit for macOS audio tools and some hardware samplers.",
        seoDescription:
      "Convert audio to uncompressed AIFF, the classic Apple lossless format. Ideal for macOS tools, Logic Pro and hardware samplers that expect native AIFF.",
    keywords: ["audio to aiff", "convert to aiff", "apple audio format"],
    options: [channelsOption(), sampleRateOption()],
    outputs: ["audio"],
    howTo: ["Add a file.", "Choose channels and sample rate.", "Run the encoder and download the AIFF."],
    limitations: "AIFF is uncompressed and therefore large. It is mainly useful for Apple workflows.",
    useCases: ["Prepare audio for a Mac-only app.", "Deliver uncompressed audio to a sampler."]
  }));

  TOOLS.push(T({
    id: "audio-to-base64",
    name: "Audio to Base64",
    category: "developer",
    handler: "audioToBase64",
    engine: "web-audio",
    summary: "Encode an audio file as a Base64 string or a data URI for embedding in code.",
    description:
      "Reads the file and produces a Base64 string plus a ready-to-paste data URI. " + BASE64_NOTE,
        seoDescription:
      "Reads the file and produces a Base64 string plus a ready-to-paste data URI. Base64 grows the payload by about 33%. Use it for small assets embedded in CSS",
    keywords: ["audio to base64", "audio data uri", "embed audio base64"],
    options: [
      { key: "wrap", label: "Data URI prefix", type: "checkbox", value: true, help: "Include the data:audio/...;base64, prefix." }
    ],
    outputs: ["text"],
    howTo: ["Add an audio file.", "Choose whether to include the data URI prefix.", "Copy the Base64 string or the data URI."],
    limitations: "Large files become very large strings. Browsers may struggle to embed multi-megabyte data URIs.",
    useCases: ["Embed a short sound in a HTML/CSS demo.", "Paste a tiny clip into a JSON fixture."]
  }));

  TOOLS.push(T({
    id: "base64-to-audio",
    name: "Base64 to Audio",
    category: "developer",
    handler: "base64ToAudio",
    engine: "web-audio",
    requiresFile: false,
    summary: "Decode a Base64 string or data URI back into a playable, downloadable audio file.",
    description: "Paste a Base64 string or a full data URI and Bench reconstructs the original audio bytes for playback and download.",
        seoDescription:
      "Decode a Base64 string or a full data URI back into a playable, downloadable audio file. Bench reconstructs the original bytes and detects the format.",
    keywords: ["base64 to audio", "decode base64 audio", "data uri to audio"],
    options: [
      { key: "data", label: "Base64 or data URI", type: "textarea", value: "", rows: 6, help: "Paste the string. A data: URI or a bare Base64 payload both work." },
      { key: "filename", label: "Output filename", type: "text", value: "decoded-audio" }
    ],
    outputs: ["audio"],
    howTo: ["Paste a Base64 string or data URI.", "Run the tool. Bench detects the audio type from the data URI or the file signature.", "Play or download the reconstructed file."],
    limitations: "A bare Base64 payload without a data URI may not carry a MIME type; Bench then guesses from the decoded bytes.",
    useCases: ["Recover an audio file pasted from an API response.", "Test a data URI."]
  }));

  TOOLS.push(T({
    id: "ringtone-maker",
    name: "Ringtone Maker",
    category: "convert",
    handler: "ringtone",
    engine: "ffmpeg",
    summary: "Crop a song to a 30-second ringtone, add a fade and export as MP3 or M4A.",
    description: "Select a section of a track, apply a short fade in/out and export a phone-ready ringtone.",
        seoDescription:
      "Crop any song to a phone-ready ringtone clip of up to 30 seconds, add a smooth fade in and out, and export it as MP3 or M4A for your device.",
    keywords: ["ringtone maker", "make ringtone", "mp3 ringtone", "30 second ringtone"],
    options: [
      { key: "start", label: "Start (mm:ss)", type: "text", value: "0:00" },
      { key: "duration", label: "Length (seconds)", type: "number", value: 30, min: 1, max: 40 },
      { key: "fade", label: "Fade (seconds)", type: "number", value: 1, min: 0, max: 10, step: 0.5 },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio"],
    howTo: ["Add a song.", "Set the start time and length (30 s is the iOS limit).", "Choose MP3 or M4A and add a fade.", "Export and transfer the ringtone to your phone."],
    limitations: "This tool edits audio only; installing a ringtone on iOS still requires iTunes/Finder or a ringtone app. Respect copyright when using commercial music.",
    useCases: ["Turn your favourite section of a song into a ringtone.", "Make a custom alert tone."]
  }));

  TOOLS.push(T({
    id: "batch-rename",
    name: "Audio Batch Rename",
    category: "developer",
    handler: "batchRename",
    engine: "web-audio",
    summary: "Rename and export several audio files at once with a prefix, sequence numbers and a chosen format.",
    description: "Applies a consistent naming scheme to a batch and, optionally, converts every file to one format.",
        seoDescription:
      "Rename and export several audio files at once with a shared prefix, sequence numbers and an output format, then download them or a single ZIP.",
    keywords: ["audio batch rename", "rename audio files", "bulk rename mp3"],
    options: [
      { key: "prefix", label: "Prefix", type: "text", value: "audio" },
      { key: "start", label: "Start number", type: "number", value: 1, min: 0 },
      { key: "digits", label: "Number width", type: "number", value: 2, min: 1, max: 5 },
      formatOption()
    ],
    outputs: ["audio", "zip"],
    maxFiles: LIMITS.maxFiles,
    howTo: ["Add several audio files.", "Set a prefix and numbering.", "Choose the output format.", "Export each file or a single ZIP."],
    limitations: "Renaming is produced on export; the originals on your disk are untouched. Files that fail to decode are listed separately.",
    useCases: ["Standardise a folder of voice notes.", "Number a set of audio assets for a project."]
  }));

  TOOLS.push(T({
    id: "audio-zip",
    name: "Audio to ZIP",
    category: "developer",
    handler: "audioZip",
    engine: "web-audio",
    summary: "Bundle several audio files into a single ZIP archive for one-click download.",
    description: "Validates each file and packs the originals into a standard ZIP archive, reporting the total size.",
        seoDescription:
      "Bundle several audio files into a single standard ZIP archive for one-click download. Each file is validated as it is read and the total size is reported.",
    keywords: ["audio to zip", "zip audio files", "bundle audio"],
    options: [],
    outputs: ["zip"],
    maxFiles: LIMITS.maxFiles,
    howTo: ["Add audio files.", "Run the tool to validate and pack them.", "Download the ZIP archive."],
    limitations: "The archive stores the files as-is; it does not convert or compress the audio. Total size is limited by browser memory.",
    useCases: ["Deliver a batch of audio in one download.", "Back up several recordings at once."]
  }));

  /* --------------------------------------------------------- B: edit tools */

  TOOLS.push(T({
    id: "trimmer",
    name: "Audio Trimmer",
    category: "edit",
    handler: "trim",
    engine: "web-audio",
    summary: "Cut a section out of an audio file with an interactive waveform and export the exact range.",
    description:
      "Decodes the file, draws its waveform and lets you drag precise start and end points. " +
      "Export the selected range losslessly to WAV or re-encode to MP3.",
        seoDescription:
      "Decodes the file, draws its waveform and lets you drag precise start and end points. Export the selected range losslessly to WAV or re-encode to MP3.",
    keywords: ["audio trimmer", "cut audio", "trim mp3", "mp3 cutter", "crop audio"],
    options: [
      { key: "start", label: "Start (seconds)", type: "number", value: 0, min: 0, step: 0.01 },
      { key: "end", label: "End (seconds)", type: "number", value: 0, min: 0, step: 0.01 },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio"],
    howTo: [
      "Add an audio file. The waveform and duration appear.",
      "Drag the handles or type the start and end times.",
      "Play the selection to check it.",
      "Export the trimmed audio."
    ],
    limitations: "Trimming is sample-accurate to about one millisecond. MP3 has a small encoder delay/padding that can shift the very start by a few milliseconds.",
    useCases: ["Remove silence from the start of a recording.", "Cut a clip out of a longer track.", "Extract a radio segment."]
  }));

  TOOLS.push(T({
    id: "silence-remover",
    name: "Silence Remover",
    category: "clean",
    handler: "silenceRemove",
    engine: "ffmpeg",
    summary: "Detect silent gaps and remove them, or keep the gaps but trim the leading and trailing silence.",
    description:
      "Scans for silence below a threshold you set and either strips it out or reports it as a map. " +
      "Useful for tightening voice recordings and podcasts.",
        seoDescription:
      "Scans for silence below a threshold you set and either strips it out or reports it as a map. Useful for tightening voice recordings and podcasts.",
    keywords: ["remove silence", "silence remover", "trim silence", "delete silent parts"],
    options: [
      { key: "threshold", label: "Silence threshold (dBFS)", type: "range", value: -35, min: -80, max: -10, step: 1, help: "Sounds quieter than this are treated as silence." },
      { key: "mode", label: "Mode", type: "select", value: "strip", options: [
        { value: "strip", label: "Remove all silence" },
        { value: "edges", label: "Trim leading/trailing only" },
        { value: "map", label: "Report gaps (no change)" }
      ] },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio", "text"],
    howTo: ["Add a recording.", "Pick a threshold, or lower it if quiet speech is being cut.", "Choose to strip silence or just map it.", "Export the result or copy the gap map."],
    limitations: "Aggressive thresholds can clip quiet speech. Removing silence changes timing, so do not use it on music.",
    useCases: ["Tighten a voice-over.", "Cut dead air from interviews.", "Find where the talking starts."]
  }));

  TOOLS.push(T({
    id: "joiner",
    name: "Audio Joiner",
    category: "edit",
    handler: "join",
    engine: "ffmpeg",
    summary: "Merge two or more audio files into one track, in the order you choose, with optional crossfade.",
    description:
      "Combines files end to end, resampling and re-encoding to a single consistent output. " +
      "Add a crossfade to blend tracks smoothly.",
        seoDescription:
      "Combines files end to end, resampling and re-encoding to a single consistent output. Add a crossfade to blend tracks smoothly.",
    keywords: ["audio joiner", "merge audio", "combine mp3", "audio merger", "concatenate audio"],
    options: [
      { key: "crossfade", label: "Crossfade (seconds)", type: "number", value: 0, min: 0, max: 10, step: 0.5 },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio"],
    maxFiles: LIMITS.maxFiles,
    howTo: ["Add two or more files in the order you want.", "Set a crossfade if you want tracks to blend.", "Choose the output format.", "Run the joiner and download the merged track."],
    limitations: "Files with different sample rates or channel counts are resampled to match the first file. Joining very many or very long files increases memory use.",
    useCases: ["Stitch audiobook chapters together.", "Combine several voice memos.", "Build a continuous DJ-style mix."]
  }));

  TOOLS.push(T({
    id: "splitter",
    name: "Audio Splitter",
    category: "edit",
    handler: "split",
    engine: "ffmpeg",
    summary: "Split one file into several parts by time or into equal-length chunks, exported together.",
    description:
      "Cuts a single file into multiple pieces either at times you set or into equally sized chunks, " +
      "then offers them as individual files or a ZIP.",
        seoDescription:
      "Cuts a single file into multiple pieces either at times you set or into equally sized chunks, then offers them as individual files or a ZIP.",
    keywords: ["audio splitter", "split audio", "cut mp3 into parts", "chunk audio"],
    options: [
      { key: "mode", label: "Mode", type: "select", value: "equal", options: [
        { value: "equal", label: "Equal-length chunks" },
        { value: "points", label: "Split at times (comma separated)" }
      ] },
      { key: "chunk", label: "Chunk length (seconds)", type: "number", value: 300, min: 1 },
      { key: "points", label: "Split points (mm:ss, comma)", type: "text", value: "5:00,10:00", showIf: { key: "mode", value: ["points"] } },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio", "zip"],
    howTo: ["Add one file.", "Choose equal chunks or exact split points.", "Run the splitter.", "Download the parts individually or as a ZIP."],
    limitations: "Splitting re-encodes lossy formats, so each part is generated independently; very large files produce many outputs.",
    useCases: ["Split a long lecture into 10-minute parts.", "Cut an album into individual tracks."]
  }));

  TOOLS.push(T({
    id: "fade",
    name: "Fade In / Out",
    category: "edit",
    handler: "fade",
    engine: "ffmpeg",
    summary: "Add a fade-in, a fade-out or both to smooth the start and end of a track.",
    description: "Applies a smooth gain curve at the beginning and/or end of the audio so it does not start or stop abruptly.",
        seoDescription:
      "Add a smooth fade-in, a fade-out or both so a track never starts or stops abruptly. Fade lengths are independent and clamped to the file length.",
    keywords: ["audio fade", "fade in fade out", "fade out mp3"],
    options: [
      { key: "fadeIn", label: "Fade-in (seconds)", type: "number", value: 2, min: 0, max: 60, step: 0.5 },
      { key: "fadeOut", label: "Fade-out (seconds)", type: "number", value: 3, min: 0, max: 60, step: 0.5 },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio"],
    howTo: ["Add a file.", "Set the fade lengths.", "Run the tool and download the result."],
    limitations: "Fades longer than the file are clamped to its length. This does not change the audio's loudness otherwise.",
    useCases: ["Smooth the end of a song for a video.", "Add a gentle intro to a recording."]
  }));

  TOOLS.push(T({
    id: "reverse",
    name: "Reverse Audio",
    category: "edit",
    handler: "reverse",
    engine: "web-audio",
    summary: "Play an audio file backwards - useful for effects, hidden messages and creative edits.",
    description: "Reverses the sample order so the audio plays from end to start. Works losslessly with WAV output.",
        seoDescription:
      "Play an audio file backwards for sound design, hidden-message checks and creative edits. Reversing is exact and can be exported losslessly as WAV.",
    keywords: ["reverse audio", "play audio backwards", "backwards audio"],
    options: [formatOption(), bitrateOption()],
    outputs: ["audio"],
    howTo: ["Add a file.", "Choose an output format.", "Run the tool and download the reversed audio."],
    limitations: "Reversing is exact but sounds unusual if the source is speech. Lossy output re-encodes the reversed audio.",
    useCases: ["Find hidden backmasked messages.", "Create a reversed cymbal effect."]
  }));

  TOOLS.push(T({
    id: "speed",
    name: "Change Speed",
    category: "edit",
    handler: "speed",
    engine: "ffmpeg",
    summary: "Speed up or slow down audio while keeping the pitch the same (time-stretch).",
    description:
      "Stretches or compresses time using FFmpeg's atempo filter so speech stays intelligible at 0.5x-3x speed " +
      "without the chipmunk effect.",
        seoDescription:
      "Speed up or slow down audio from 0.5x to 3x while keeping the pitch steady, using pitch-preserving time-stretch so speech stays clear and intelligible.",
    keywords: ["change audio speed", "speed up audio", "slow down audio", "time stretch audio"],
    options: [
      { key: "factor", label: "Speed factor", type: "range", value: 1.25, min: 0.5, max: 3, step: 0.05, help: "1.0 is unchanged. 1.5 is 50% faster, 0.75 is 25% slower." },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio"],
    howTo: ["Add a file.", "Move the speed slider.", "Export the sped-up or slowed-down audio."],
    limitations: "This is pitch-preserving time-stretch: at extremes the result can sound slightly metallic. For a tape-style pitch change, use the Pitch Shifter instead.",
    useCases: ["Speed up a slow lecture.", "Slow down a fast passage to transcribe it."]
  }));

  TOOLS.push(T({
    id: "pitch",
    name: "Pitch Shifter",
    category: "edit",
    handler: "pitch",
    engine: "ffmpeg",
    status: "experimental",
    summary: "Shift the pitch up or down. Speakers' pitch can be raised or lowered for anonymity or effects.",
    description:
      "Shifts pitch by resampling and compensating with time-stretch so the duration stays similar. " +
      "The result is an estimate and can introduce artefacts at large shifts.",
        seoDescription:
      "Shifts pitch by resampling and compensating with time-stretch so the duration stays similar. The result is an estimate and can introduce artefacts at large",
    keywords: ["pitch shifter", "change pitch", "raise pitch", "lower pitch", "voice changer"],
    options: [
      { key: "semitones", label: "Semitones", type: "range", value: 2, min: -12, max: 12, step: 1, help: "12 semitones is one octave." },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio"],
    howTo: ["Add a file.", "Choose how many semitones to shift.", "Export the shifted audio."],
    limitations: "This build has no formant-preserving pitch shifter, so large shifts also change the perceived voice character and can sound artefacted. Small shifts (±2 semitones) are cleanest.",
    useCases: ["Raise a voice for anonymity.", "Tune a recording slightly.", "Create a character voice."],
    reason: "No rubberband/formant filter is available in the shipped engine; pitch is achieved by resample + tempo compensation."
  }));

  TOOLS.push(T({
    id: "volume-adjust",
    name: "Volume & Normalise",
    category: "clean",
    handler: "volumeNormalize",
    engine: "ffmpeg",
    summary: "Change the loudness by a fixed amount or normalise to a target peak, with clipping protection.",
    description:
      "Either applies a gain offset you set or normalises the whole file to a target peak level. " +
      "A safety limiter prevents clipping when you boost.",
        seoDescription:
      "Either applies a gain offset you set or normalises the whole file to a target peak level. A safety limiter prevents clipping when you boost.",
    keywords: ["volume booster", "increase volume", "normalize audio", "make audio louder"],
    options: [
      { key: "mode", label: "Mode", type: "select", value: "gain", options: [
        { value: "gain", label: "Fixed gain (dB)" },
        { value: "peak", label: "Normalise to peak (dBFS)" }
      ] },
      { key: "gain", label: "Gain (dB)", type: "range", value: 6, min: -24, max: 24, step: 0.5, showIf: { key: "mode", value: ["gain"] } },
      { key: "peak", label: "Target peak (dBFS)", type: "range", value: -1, min: -12, max: 0, step: 0.5, showIf: { key: "mode", value: ["peak"] } },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio"],
    howTo: ["Add a file.", "Choose fixed gain or normalise-to-peak.", "Set the amount.", "Export the adjusted audio."],
    limitations: "Normalising to peak does not make quiet passages loud; it only scales so the loudest point hits the target. Boosting heavily raises the noise floor.",
    useCases: ["Make a quiet recording audible.", "Match two clips to a similar level.", "Reduce a too-loud track."]
  }));

  TOOLS.push(T({
    id: "loop-maker",
    name: "Loop Maker",
    category: "edit",
    handler: "loop",
    engine: "ffmpeg",
    summary: "Repeat a section of audio a chosen number of times to build a smooth loop.",
    description: "Takes a selection and repeats it N times with optional crossfades between repeats for a seamless loop.",
        seoDescription:
      "Repeat a chosen section of audio a set number of times to build a seamless loop, with an optional crossfade between repeats to avoid clicks at the joins.",
    keywords: ["loop maker", "repeat audio", "create loop", "audio loop"],
    options: [
      { key: "start", label: "Start (seconds)", type: "number", value: 0, min: 0, step: 0.01 },
      { key: "end", label: "End (seconds)", type: "number", value: 10, min: 0, step: 0.01 },
      { key: "times", label: "Repeats", type: "number", value: 4, min: 2, max: 50 },
      { key: "crossfade", label: "Crossfade (seconds)", type: "number", value: 0, min: 0, max: 5, step: 0.1 },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio"],
    howTo: ["Add a file.", "Set the section to loop and how many repeats.", "Export the looped audio."],
    limitations: "Without a crossfade, joins may click. Loops work best on steady material.",
    useCases: ["Turn a few bars into a backing track.", "Extend a short ambience."]
  }));

  TOOLS.push(T({
    id: "crossfade",
    name: "Crossfade Editor",
    category: "edit",
    handler: "crossfade",
    engine: "ffmpeg",
    summary: "Blend two tracks together with a real crossfade at a duration you choose.",
    description: "Overlaps the end of the first track with the start of the second using an equal-power crossfade.",
        seoDescription:
      "Blend two tracks together with a real equal-power crossfade at a duration you choose. Both files must be long enough to overlap for the selected length.",
    keywords: ["crossfade audio", "blend tracks", "dj crossfade"],
    options: [
      { key: "duration", label: "Crossfade (seconds)", type: "number", value: 3, min: 0.5, max: 30, step: 0.5 },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio"],
    maxFiles: 2,
    howTo: ["Add exactly two files.", "Set the crossfade length.", "Export the blended track."],
    limitations: "Both files must be long enough to overlap for the chosen duration. The first file's format drives the output.",
    useCases: ["Smoothly join two songs.", "Blend an intro into a main track."]
  }));

  TOOLS.push(T({
    id: "channel-tools",
    name: "Stereo & Channel Tools",
    category: "edit",
    handler: "channels",
    engine: "ffmpeg",
    summary: "Swap or merge channels, isolate left or right, downmix to mono or make a dual-mono track.",
    description: "Handles stereo routing: swap L/R, keep only one side, downmix to mono or duplicate a channel.",
        seoDescription:
      "Reshape stereo audio: swap left and right, keep one channel only, downmix to mono or duplicate one channel to both sides. Fixes reversed recordings.",
    keywords: ["swap stereo", "left right audio", "mono audio", "channel mixer"],
    options: [
      { key: "mode", label: "Operation", type: "select", value: "swap", options: [
        { value: "swap", label: "Swap left and right" },
        { value: "left", label: "Keep left only" },
        { value: "right", label: "Keep right only" },
        { value: "mono", label: "Downmix to mono" },
        { value: "dual", label: "Duplicate one channel to both" }
      ] },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio"],
    howTo: ["Add a stereo file.", "Pick the channel operation.", "Export the result."],
    limitations: "Channel operations on a mono source are reported as unnecessary. Downmixing can cause phase cancellation between out-of-phase channels.",
    useCases: ["Fix a reversed stereo recording.", "Extract a vocal from a hard-panned track.", "Prepare mono audio for a phone system."]
  }));

  /* ------------------------------------------------ C: cleaning / enhance */

  TOOLS.push(T({
    id: "noise-reducer",
    name: "Noise Reducer",
    category: "clean",
    handler: "denoise",
    engine: "ffmpeg",
    status: "experimental",
    summary: "Reduce steady background noise (hiss, hum, air conditioning) with a real FFT denoiser.",
    description:
      "Runs a genuine spectral-subtraction denoiser (FFmpeg's afftdn) with an adjustable noise floor. " +
      "It reduces constant broadband noise rather than transient sounds.",
        seoDescription:
      "Reduce steady background noise such as hiss, hum and air conditioning with a genuine FFT spectral denoiser and an adjustable noise floor.",
    keywords: ["noise reduction", "remove background noise", "audio denoise", "hiss removal", "fft denoise"],
    options: [
      { key: "strength", label: "Reduction (dB)", type: "range", value: 12, min: 1, max: 30, step: 1, help: "Higher values remove more noise but can dull the audio." },
      { key: "noiseFloor", label: "Noise floor (dB)", type: "range", value: -50, min: -80, max: -20, step: 1, help: "Set just above the quietest background noise level." },
      { key: "track", label: "Track noise floor automatically", type: "checkbox", value: false },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio"],
    howTo: ["Add a recording with steady background noise.", "Set the noise floor to just above the hiss.", "Choose how much to reduce.", "Export and compare."],
    limitations: "This is spectral subtraction, not an AI model: heavy reduction can introduce a watery 'musical noise' artefact. It targets constant noise, not speech or music.",
    useCases: ["Clean a noisy interview recording.", "Reduce air-conditioner hum in a podcast.", "Improve a phone recording."],
    reason: "Not an AI model; it is FFmpeg afftdn spectral denoising. Results vary with source material."
  }));

  TOOLS.push(T({
    id: "voice-enhancer",
    name: "Voice Enhancer",
    category: "clean",
    handler: "voiceEnhance",
    engine: "ffmpeg",
    status: "experimental",
    summary: "Brighten and control speech with a high-pass, EQ and gentle compression chain.",
    description:
      "Applies a speech-tuned chain: high-pass to remove rumble, a presence boost, gentle dynamic compression " +
      "and a limiter. It improves intelligibility on dry speech.",
        seoDescription:
      "Applies a speech-tuned chain: high-pass to remove rumble, a presence boost, gentle dynamic compression and a limiter. It improves intelligibility on dry",
    keywords: ["voice enhancer", "improve voice audio", "podcast voice", "speech enhancement", "de-hum voice"],
    options: [
      { key: "presence", label: "Presence boost (dB)", type: "range", value: 3, min: 0, max: 9, step: 0.5, help: "Lifts the 3 kHz range where consonants live." },
      { key: "highpass", label: "Rumble cut (Hz)", type: "range", value: 80, min: 0, max: 200, step: 10 },
      { key: "compress", label: "Compression", type: "select", value: "medium", options: [ { value: "off", label: "Off" }, { value: "light", label: "Light" }, { value: "medium", label: "Medium" }, { value: "strong", label: "Strong" } ] },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio"],
    howTo: ["Add a speech recording.", "Adjust the presence and rumble cut.", "Choose a compression amount.", "Export and compare."],
    limitations: "This is deterministic signal processing, not AI restoration. It cannot remove reverb or add missing detail, and heavy compression reduces dynamics.",
    useCases: ["Make a podcast host sound clearer.", "Improve a webcam microphone recording."],
    reason: "Deterministic DSP chain (high-pass + EQ + compressor + limiter), not a learned model."
  }));

  TOOLS.push(T({
    id: "equalizer",
    name: "Bass, Treble & EQ",
    category: "clean",
    handler: "equalizer",
    engine: "ffmpeg",
    summary: "Boost or cut bass, treble and a selectable mid band with real peaking filters.",
    description: "Adjusts three bands with proper biquad filters: a low shelf, a parametric mid and a high shelf.",
        seoDescription:
      "Boost or cut bass, treble and a selectable mid band with real biquad peaking and shelf filters. A limiter protects the output from clipping after boosts.",
    keywords: ["audio equalizer", "bass boost", "treble boost", "eq audio", "adjust bass"],
    options: [
      { key: "bass", label: "Bass (dB)", type: "range", value: 0, min: -15, max: 15, step: 1 },
      { key: "mid", label: "Mid (dB)", type: "range", value: 0, min: -15, max: 15, step: 1 },
      { key: "midFreq", label: "Mid frequency (Hz)", type: "number", value: 1000, min: 200, max: 8000, step: 100 },
      { key: "treble", label: "Treble (dB)", type: "range", value: 0, min: -15, max: 15, step: 1 },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio"],
    howTo: ["Add a file.", "Move the bass, mid and treble sliders.", "Export the equalised audio."],
    limitations: "Large boosts can clip; export includes a limiter but the tone is changed permanently. 0 dB everywhere leaves the audio essentially unchanged.",
    useCases: ["Add warmth to a thin recording.", "Tame harsh treble.", "Reduce boxy mids on a voiceover."]
  }));

  TOOLS.push(T({
    id: "loudness-normalizer",
    name: "Loudness Normaliser (LUFS)",
    category: "clean",
    handler: "loudnorm",
    engine: "ffmpeg",
    summary: "Normalise to a broadcast loudness target in LUFS with true-peak limiting.",
    description:
      "Measures integrated loudness with the ITU-R BS.1770/EBU R128 loudnorm filter and normalises to your target, " +
      "with a true-peak ceiling so it never clips.",
        seoDescription:
      "Measures integrated loudness with the ITU-R BS.1770/EBU R128 loudnorm filter and normalises to your target, with a true-peak ceiling so it never clips.",
    keywords: ["loudness normaliser", "lufs normalise", "ebu r128", "podcast loudness", "-14 lufs", "-16 lufs"],
    options: [
      { key: "target", label: "Target loudness (LUFS)", type: "select", value: "-16", options: [
        { value: "-14", label: "-14 LUFS (streaming)" },
        { value: "-16", label: "-16 LUFS (podcast)" },
        { value: "-19", label: "-19 LUFS (spoken word)" },
        { value: "-23", label: "-23 LUFS (broadcast EBU R128)" }
      ] },
      { key: "peak", label: "True peak ceiling (dBTP)", type: "range", value: -1, min: -3, max: 0, step: 0.5 },
      formatOption(), bitrateOption()
    ],
    outputs: ["audio", "text"],
    howTo: ["Add a file.", "Choose a loudness target for your platform.", "Export the normalised audio and read the measured before/after values."],
    limitations: "Two-pass normalisation is used, so the file is analysed first. Extremely dynamic material may be limited more than expected.",
    useCases: ["Bring a podcast to -16 LUFS.", "Match a video upload to -14 LUFS.", "Prepare audio for broadcast at -23 LUFS."]
  }));

  TOOLS.push(T({
    id: "clipping-detector",
    name: "Clipping Detector",
    category: "metadata",
    handler: "clipping",
    engine: "web-audio",
    summary: "Scan a file for clipped samples and report where and how often it distorts.",
    description:
      "Inspects the decoded samples for runs at or near full scale and reports the count, the peak and the times involved.",
        seoDescription:
      "Scan a file for clipped samples and report how often, where and how loudly it distorts, so you can catch problems before release or diagnose a recording.",
    keywords: ["clipping detector", "detect distortion", "audio clipping", "check for clipping"],
    options: [
      { key: "threshold", label: "Clip threshold (dBFS)", type: "range", value: -0.1, min: -3, max: 0, step: 0.1 }
    ],
    outputs: ["text"],
    howTo: ["Add a file.", "Set the threshold.", "Read the clipping report."],
    limitations: "Detects samples at or above the threshold; it cannot tell intentional saturation from accidental clipping.",
    useCases: ["Check a mix before release.", "Diagnose distortion in a recording."]
  }));

  TOOLS.push(T({
    id: "silence-detector",
    name: "Silence Detector",
    category: "metadata",
    handler: "silenceDetect",
    engine: "web-audio",
    summary: "Map every silent gap in a file with start time, end time and duration.",
    description: "Scans the waveform for gaps below a threshold and lists each one, clickable for reference.",
        seoDescription:
      "Map every silent gap in a file with its start time, end time and duration. Set a threshold and minimum gap length, then read the full table of gaps.",
    keywords: ["silence detector", "find silence", "detect gaps", "silence map"],
    options: [
      { key: "threshold", label: "Threshold (dBFS)", type: "range", value: -40, min: -80, max: -10, step: 1 },
      { key: "minDuration", label: "Minimum gap (seconds)", type: "number", value: 0.3, min: 0.05, max: 10, step: 0.05 }
    ],
    outputs: ["text"],
    howTo: ["Add a file.", "Adjust the threshold until gaps are detected correctly.", "Read the gap table."],
    limitations: "Threshold-based detection can confuse quiet passages with true silence. Music with sustained quiet sections may be over-detected.",
    useCases: ["Find the talking points in a recording.", "Locate gaps for editing."]
  }));

  /* ------------------------------------------------------------- D: record */

  TOOLS.push(T({
    id: "recorder",
    name: "Voice Recorder",
    category: "record",
    handler: "record",
    engine: "media-recorder",
    requiresFile: false,
    summary: "Record from your microphone in the browser, preview it and download a WAV or WebM/Opus file.",
    description:
      "Requests microphone access only when you click record, shows a live level meter and a timer, " +
      "and lets you trim and export the take. Nothing is uploaded.",
        seoDescription:
      "Requests microphone access only when you click record, shows a live level meter and a timer, and lets you trim and export the take. Nothing is uploaded.",
    keywords: ["voice recorder", "online recorder", "record audio", "microphone recorder", "voice memo"],
    options: [
      { key: "format", label: "Export format", type: "select", value: "wav", options: [ { value: "wav", label: "WAV (.wav)" }, { value: "webm", label: "WebM/Opus (.webm)" }, { value: "mp3", label: "MP3 (.mp3)" } ] }
    ],
    outputs: ["audio"],
    privacy: MIC_PRIVACY,
    howTo: [
      "Click Start and allow microphone access when your browser asks.",
      "Watch the level meter and record your take.",
      "Stop, preview the recording and trim if needed.",
      "Download the file. It is created locally; nothing is uploaded."
    ],
    limitations: "Microphone access must be allowed by the browser and the site's permissions policy. WAV export is lossless and large; WebM/Opus is smaller. Recording stops if you close the tab or revoke the microphone.",
    useCases: ["Record a voice memo.", "Capture a quick podcast segment.", "Practise a presentation."]
  }));

  TOOLS.push(T({
    id: "mic-check",
    name: "Microphone Check",
    category: "record",
    handler: "micCheck",
    engine: "media-recorder",
    requiresFile: false,
    summary: "Test whether your microphone works, see a live input-level meter and confirm permission status.",
    description:
      "Lists your audio input devices, shows a real-time input level meter and a peak-hold readout so you can " +
      "confirm the microphone and gain before recording.",
        seoDescription:
      "Lists your audio input devices, shows a real-time input level meter and a peak-hold readout so you can confirm the microphone and gain before recording.",
    keywords: ["microphone test", "mic check", "test my mic", "input level meter"],
    options: [],
    outputs: ["text"],
    privacy: MIC_PRIVACY,
    howTo: ["Click Start test and allow microphone access.", "Speak and watch the level meter and peak hold.", "Read the device and permission status."],
    limitations: "Some browsers hide device labels until permission is granted. The meter reads the raw input, not post-processing.",
    useCases: ["Check a headset before a call.", "Set the right input gain."]
  }));

  TOOLS.push(T({
    id: "stereo-test",
    name: "Stereo Channel Test",
    category: "record",
    handler: "stereoTest",
    engine: "web-audio",
    requiresFile: false,
    summary: "Play a signal through each channel to confirm left/right speakers and headphones are wired correctly.",
    description:
      "Generates a spoken-style tone in the left, right or both channels so you can verify your output routing.",
        seoDescription:
      "Play a generated tone through the left, right or both channels, or alternate between them, to confirm your speakers and headphones are wired correctly.",
    keywords: ["stereo test", "left right speaker test", "channel test", "check headphones"],
    options: [
      { key: "channel", label: "Channel", type: "select", value: "left", options: [ { value: "left", label: "Left only" }, { value: "right", label: "Right only" }, { value: "both", label: "Both" }, { value: "sweep", label: "Alternating L/R" } ] },
      { key: "tone", label: "Frequency (Hz)", type: "number", value: 440, min: 100, max: 4000 }
    ],
    outputs: ["audio"],
    howTo: ["Choose a channel and frequency.", "Press play and listen.", "Confirm each speaker is on the correct side."],
    limitations: "This plays a generated tone; it does not measure your speakers. Volume is controlled by your system.",
    useCases: ["Check new headphones.", "Verify a mixing setup."]
  }));

  /* -------------------------------------------------------- E: music/sound */

  TOOLS.push(T({
    id: "tone-generator",
    name: "Tone Generator",
    category: "music",
    handler: "tone",
    engine: "web-audio",
    requiresFile: false,
    summary: "Generate a pure sine tone or a musical note at a chosen frequency and length, then download it.",
    description: "Creates a precise sine wave you can play and download as WAV for testing speakers, hearing or equipment.",
        seoDescription:
      "Generate a precise sine tone or a musical note at any frequency from 20 Hz to 20 kHz, preview it and download it as a WAV for testing speakers or hearing.",
    keywords: ["tone generator", "sine wave generator", "audio test tone", "frequency generator"],
    options: [
      { key: "frequency", label: "Frequency (Hz)", type: "number", value: 440, min: 20, max: 20000 },
      { key: "duration", label: "Duration (seconds)", type: "number", value: 5, min: 1, max: 600 },
      { key: "amplitude", label: "Level (%)", type: "range", value: 50, min: 1, max: 100 },
      { key: "wave", label: "Waveform", type: "select", value: "sine", options: [ { value: "sine", label: "Sine" }, { value: "square", label: "Square" }, { value: "triangle", label: "Triangle" }, { value: "sawtooth", label: "Sawtooth" } ] }
    ],
    outputs: ["audio"],
    howTo: ["Set the frequency, duration and level.", "Play it to preview.", "Download the WAV."],
    limitations: "Square, sawtooth and triangle waves contain harmonics and can sound harsh. Protect your hearing at high volumes.",
    useCases: ["Test a speaker or subwoofer.", "Generate a reference tone.", "Tune an instrument to a note."]
  }));

  TOOLS.push(T({
    id: "noise-generator",
    name: "Noise Generator",
    category: "music",
    handler: "noise",
    engine: "web-audio",
    requiresFile: false,
    summary: "Generate white, pink or brown noise for masking, sleep or testing.",
    description: "Produces coloured noise with the correct spectral shape, playable and downloadable as WAV.",
        seoDescription:
      "Generate white, pink or brown noise with the correct spectral shape, play it to preview and download it as a WAV for masking, sleep, focus or room testing.",
    keywords: ["white noise", "pink noise", "brown noise", "noise generator", "sleep sound"],
    options: [
      { key: "colour", label: "Colour", type: "select", value: "white", options: [ { value: "white", label: "White (flat)" }, { value: "pink", label: "Pink (-3 dB/oct)" }, { value: "brown", label: "Brown (-6 dB/oct)" } ] },
      { key: "duration", label: "Duration (seconds)", type: "number", value: 60, min: 1, max: 1800 },
      { key: "amplitude", label: "Level (%)", type: "range", value: 40, min: 1, max: 100 }
    ],
    outputs: ["audio"],
    howTo: ["Choose a colour and duration.", "Play to preview.", "Download the WAV."],
    limitations: "Long durations create large WAV files. Noise is randomised, so each export differs.",
    useCases: ["Create a sleep or focus sound.", "Mask office noise.", "Test a room's response."]
  }));

  TOOLS.push(T({
    id: "metronome",
    name: "Metronome",
    category: "music",
    handler: "metronome",
    engine: "web-audio",
    requiresFile: false,
    summary: "A click track with adjustable tempo, time signature and accent for practice.",
    description: "Plays accurate clicks at your chosen BPM with a louder accent on the downbeat.",
        seoDescription:
      "Play an accurate click track at any tempo from 30 to 300 BPM with a configurable time signature and a louder accent on the downbeat for practice sessions.",
    keywords: ["metronome", "click track", "bpm clicks", "practice tempo"],
    options: [
      { key: "bpm", label: "Tempo (BPM)", type: "number", value: 120, min: 30, max: 300 },
      { key: "beats", label: "Beats per bar", type: "number", value: 4, min: 1, max: 12 }
    ],
    outputs: ["audio"],
    howTo: ["Set the tempo and beats per bar.", "Press start and play along.", "Stop when finished."],
    limitations: "Timing uses the Web Audio clock, which is accurate but not sample-perfect on all devices under heavy load. This build does not export the click track.",
    useCases: ["Practise an instrument.", "Keep time while recording."]
  }));

  TOOLS.push(T({
    id: "bpm-detector",
    name: "BPM & Key Detector",
    category: "music",
    handler: "bpm",
    engine: "web-audio",
    status: "experimental",
    summary: "Estimate the tempo (BPM) of a track and suggest a likely musical key from its spectrum.",
    description:
      "Estimates tempo from onset energy and suggests a key from chroma-like spectral energy. " +
      "Both are estimates and can be wrong on complex or non-percussive material.",
        seoDescription:
      "Estimates tempo from onset energy and suggests a key from chroma-like spectral energy. Both are estimates and can be wrong on complex or non-percussive",
    keywords: ["bpm detector", "find bpm", "tempo detection", "key detection", "song key"],
    options: [
      { key: "bpm", label: "Minimum BPM", type: "number", value: 60, min: 40, max: 120 }
    ],
    outputs: ["text"],
    howTo: ["Add a track with a clear beat.", "Run the analysis.", "Read the estimated BPM and key."],
    limitations: "Tempo detection needs a steady beat; it struggles with free-tempo and heavily syncopated music. Key detection is a coarse spectral estimate and should be treated as a hint only.",
    useCases: ["Find the BPM for a mashup.", "Get a starting key for a cover."],
    reason: "Estimates from onset energy and spectral chroma; not a trained model."
  }));

  TOOLS.push(T({
    id: "spectrogram",
    name: "Spectrogram / Spectrum Analyser",
    category: "music",
    handler: "spectrogram",
    engine: "web-audio",
    summary: "Render a spectrogram or real-time spectrum of a file to see its frequencies over time.",
    description: "Computes a magnitude spectrogram with the Web Audio AnalyserNode and renders it to a downloadable image.",
        seoDescription:
      "Render a spectrogram of any audio file so you can see its frequencies over time, using a Web Audio FFT and a downloadable PNG image as the result.",
    keywords: ["spectrogram", "spectrum analyser", "frequency analysis", "audio visualizer"],
    options: [
      { key: "fft", label: "FFT size", type: "select", value: "2048", options: [ { value: "1024", label: "1024" }, { value: "2048", label: "2048" }, { value: "4096", label: "4096" }, { value: "8192", label: "8192" } ] },
      { key: "scale", label: "Frequency scale", type: "select", value: "log", options: [ { value: "log", label: "Logarithmic" }, { value: "linear", label: "Linear" } ] }
    ],
    outputs: ["image"],
    howTo: ["Add a file.", "Choose the FFT size and scale.", "View the spectrogram and download the image."],
    limitations: "Spectrogram resolution trades time against frequency. Very long files are analysed in a subset of frames to keep memory bounded.",
    useCases: ["Visualise where noise sits in the spectrum.", "See the frequency range of a recording.", "Check for a low-frequency rumble."]
  }));

  TOOLS.push(T({
    id: "waveform-image",
    name: "Waveform Image",
    category: "developer",
    handler: "waveformImage",
    engine: "web-audio",
    summary: "Generate a clean waveform image (PNG) from any audio file for video, print or the web.",
    description: "Renders the peak envelope to a canvas at a size and colour you choose and exports it as a PNG.",
        seoDescription:
      "Generate a clean waveform PNG from any audio file for podcast art, video overlays or the web. Choose the size, colours, background and bar or wave style.",
    keywords: ["waveform image", "waveform png", "audio waveform generator", "sound wave image"],
    options: [
      { key: "width", label: "Width (px)", type: "number", value: 1600, min: 200, max: 4000 },
      { key: "height", label: "Height (px)", type: "number", value: 400, min: 80, max: 1200 },
      { key: "bar", label: "Colour", type: "color", value: "#1d4ed8" },
      { key: "background", label: "Background", type: "color", value: "#ffffff" },
      { key: "style", label: "Style", type: "select", value: "bars", options: [ { value: "bars", label: "Bars" }, { value: "wave", label: "Filled wave" } ] }
    ],
    outputs: ["image"],
    howTo: ["Add an audio file.", "Set the size and colours.", "Download the PNG."],
    limitations: "The waveform is a peak envelope, not a true sample plot; it is designed for visual, not analytical, use.",
    useCases: ["Make a visual for a podcast episode.", "Create a soundcloud-style preview image."]
  }));

  /* ------------------------------------------------------ F: metadata/diag */

  TOOLS.push(T({
    id: "metadata-viewer",
    name: "Audio Metadata Viewer",
    category: "metadata",
    handler: "metadata",
    engine: "web-audio",
    summary: "Inspect ID3/tags, duration, bitrate, sample rate, channels and codec of an audio file.",
    description:
      "Reads embedded tags and the audio properties your browser can decode, and shows them clearly. " +
      "It also reads raw ID3v1/ID3v2 tags directly from the bytes for files the browser cannot tag-decode.",
        seoDescription:
      "Reads embedded tags and the audio properties your browser can decode, and shows them clearly. It also reads raw ID3v1/ID3v2 tags directly from the bytes",
    keywords: ["audio metadata", "id3 viewer", "mp3 tags", "audio properties", "bitrate inspector"],
    options: [],
    outputs: ["text"],
    howTo: ["Add a file.", "Read the properties and tags.", "Copy the report as JSON if you need it."],
    limitations: "The browser decoder exposes duration, sample rate and channel count but not the exact encoder bitrate for every format. ID3 parsing covers ID3v1 and ID3v2 text frames.",
    useCases: ["Check what tags a file has.", "Verify the sample rate before editing."]
  }));

  TOOLS.push(T({
    id: "id3-editor",
    name: "ID3 Tag Editor",
    category: "metadata",
    handler: "id3Edit",
    engine: "ffmpeg",
    status: "experimental",
    summary: "View and rewrite common ID3/tag fields (title, artist, album, genre) and export a new copy.",
    description:
      "Copies the audio stream and writes updated metadata using FFmpeg, so the audio content is preserved. " +
      "The output is a new file; the original is never modified.",
        seoDescription:
      "Copies the audio stream and writes updated metadata using FFmpeg, so the audio content is preserved. The output is a new file; the original is never",
    keywords: ["id3 editor", "edit mp3 tags", "change song metadata", "tag editor"],
    options: [
      { key: "title", label: "Title", type: "text", value: "" },
      { key: "artist", label: "Artist", type: "text", value: "" },
      { key: "album", label: "Album", type: "text", value: "" },
      { key: "genre", label: "Genre", type: "text", value: "" },
      { key: "track", label: "Track number", type: "text", value: "" },
      { key: "comment", label: "Comment", type: "textarea", value: "", rows: 2 }
    ],
    outputs: ["audio"],
    howTo: ["Add an MP3/M4A/FLAC file.", "Fill in the tags you want (empty fields are left as-is or cleared, as shown).", "Export the re-tagged copy and verify it in the metadata viewer."],
    limitations: "Stream copy preserves the audio bytes but may re-wrap the container. Some players cache tags aggressively. Not all tag frames are editable in this build.",
    useCases: ["Fix a mislabelled track.", "Add artist and album to a rip."],
    reason: "Writes a metadata-only remux via FFmpeg; does not re-encode audio, but tag-frame coverage is limited."
  }));

  TOOLS.push(T({
    id: "loudness-analyzer",
    name: "Loudness & Peak Analyser",
    category: "metadata",
    handler: "loudnessAnalyze",
    engine: "ffmpeg",
    summary: "Measure integrated LUFS, true peak, RMS and dynamic range for broadcast or streaming checks.",
    description:
      "Runs real loudness measurement (EBU R128 via FFmpeg loudnorm/ebur128) and basic RMS/peak analysis, " +
      "then reports whether the file meets a chosen platform target.",
        seoDescription:
      "Runs real loudness measurement (EBU R128 via FFmpeg loudnorm/ebur128) and basic RMS/peak analysis, then reports whether the file meets a chosen platform",
    keywords: ["lufs analyzer", "loudness meter", "true peak meter", "rms meter", "ebur128"],
    options: [
      { key: "target", label: "Compare to", type: "select", value: "-16", options: [ { value: "-14", label: "Streaming -14 LUFS" }, { value: "-16", label: "Podcast -16 LUFS" }, { value: "-23", label: "Broadcast -23 LUFS" } ] }
    ],
    outputs: ["text"],
    howTo: ["Add a file.", "Run the analysis.", "Read integrated LUFS, true peak and the compliance verdict."],
    limitations: "Measurement is accurate to the FFmpeg implementation. Very quiet or very short files may give unstable readings.",
    useCases: ["Check a master before upload.", "Verify a podcast meets -16 LUFS."]
  }));

  TOOLS.push(T({
    id: "integrity-check",
    name: "Audio Integrity Check",
    category: "metadata",
    handler: "integrity",
    engine: "web-audio",
    summary: "Verify a file decodes cleanly and report header, signature and structure problems.",
    description:
      "Checks the file signature against its extension, attempts a full decode and reports truncated or corrupt files " +
      "instead of silently failing.",
        seoDescription:
      "Checks the file signature against its extension, attempts a full decode and reports truncated or corrupt files instead of silently failing.",
    keywords: ["audio integrity", "check audio file", "corrupt audio", "validate mp3"],
    options: [],
    outputs: ["text"],
    howTo: ["Add a file.", "Run the check.", "Read the signature, decodability and any warnings."],
    limitations: "A clean decode does not guarantee a bit-perfect file; it confirms the file is playable and structurally sound.",
    useCases: ["Diagnose a file that will not play.", "Confirm a download is intact."]
  }));

  TOOLS.push(T({
    id: "duplicate-finder",
    name: "Duplicate Audio Finder",
    category: "metadata",
    handler: "audioDedupe",
    engine: "web-audio",
    summary: "Compare several audio files and find exact duplicates using a content hash.",
    description:
      "Computes a hash of the decoded audio (not just the bytes) so the same audio saved in two containers is detected. " +
      "Similar-sounding but different files are reported as distinct.",
        seoDescription:
      "Computes a hash of the decoded audio (not just the bytes) so the same audio saved in two containers is detected. Similar-sounding but different files are",
    keywords: ["duplicate audio finder", "find duplicate songs", "audio hash", "dedupe audio"],
    options: [],
    outputs: ["text"],
    maxFiles: LIMITS.maxFiles,
    howTo: ["Add two or more files.", "Run the comparison.", "Read which files are exact duplicates."],
    limitations: "Matching is exact on decoded samples at the original sample rate. Different bitrates of the same song are NOT flagged as duplicates - that would be approximate similarity, which this build does not claim to do.",
    useCases: ["Clean a music library.", "Check for repeated voice memos."]
  }));

  TOOLS.push(T({
    id: "mime-checker",
    name: "Audio MIME & Signature Checker",
    category: "developer",
    handler: "mimeCheck",
    engine: "web-audio",
    summary: "See the real file type from its magic bytes and compare it with the extension and reported MIME type.",
    description: "Reads the leading bytes to identify the true format, flags a mismatched extension and shows the MIME type a server would send.",
        seoDescription:
      "Reads the leading bytes to identify the true format, flags a mismatched extension and shows the MIME type a server would send.",
    keywords: ["audio mime type", "file signature", "magic bytes audio", "check file type"],
    options: [],
    outputs: ["text"],
    howTo: ["Add a file.", "Read the detected format, the extension and the declared MIME type."],
    limitations: "Signature detection covers common audio formats; unusual or container-wrapped files may be reported as their container.",
    useCases: ["Check a file with a wrong extension.", "Set the right MIME type on a server."]
  }));

  TOOLS.push(T({
    id: "player-generator",
    name: "HTML Audio Player Generator",
    category: "developer",
    handler: "playerSnippet",
    engine: "web-audio",
    summary: "Generate a safe, accessible HTML <audio> player snippet for your file.",
    description: "Produces ready-to-paste HTML for an audio player with a proper <source>, controls and fallback text. Values are HTML-escaped.",
        seoDescription:
      "Produces ready-to-paste HTML for an audio player with a proper <source>, controls and fallback text. Values are HTML-escaped.",
    keywords: ["html audio player", "audio embed code", "audio html snippet"],
    options: [
      { key: "src", label: "Audio URL", type: "text", value: "audio.mp3" },
      { key: "mime", label: "MIME type", type: "text", value: "audio/mpeg" },
      { key: "preload", label: "Preload", type: "select", value: "metadata", options: [ { value: "none", label: "none" }, { value: "metadata", label: "metadata" }, { value: "auto", label: "auto" } ] },
      { key: "loop", label: "Loop", type: "checkbox", value: false },
      { key: "controls", label: "Show controls", type: "checkbox", value: true }
    ],
    outputs: ["text"],
    howTo: ["Enter the audio URL or generate it from an uploaded file.", "Choose the options.", "Copy the escaped HTML snippet."],
    limitations: "The snippet references a URL; Bench does not host your audio. All values are escaped to prevent injection.",
    useCases: ["Embed audio in a blog.", "Add a player to a landing page."]
  }));

  TOOLS.push(T({
    id: "rss-validator",
    name: "Podcast RSS Enclosure Validator",
    category: "developer",
    handler: "rssValidate",
    engine: "web-audio",
    requiresFile: false,
    summary: "Check a podcast RSS feed's <enclosure> tags for missing or invalid audio URLs and types.",
    description:
      "Parses the RSS XML you paste, checks each item's enclosure for a URL, a length and a valid audio MIME type, " +
      "and reports the problems that break podcast apps.",
        seoDescription:
      "Check a podcast RSS feed for missing or invalid enclosure tags: an audio URL, a length value and a valid audio MIME type, with a clear issue report.",
    keywords: ["podcast rss validator", "enclosure tag", "podcast feed checker"],
    options: [
      { key: "feed", label: "RSS XML", type: "textarea", value: "", rows: 8, help: "Paste the full RSS feed XML." }
    ],
    outputs: ["text"],
    howTo: ["Paste your RSS XML.", "Run the validator.", "Fix the enclosure issues it reports."],
    limitations: "Validates structure, not reachability; it does not download the audio URLs. Only well-formed XML is parsed.",
    useCases: ["Debug a podcast feed rejected by Spotify.", "Check enclosures before publishing."]
  }));

  /* -------------------------------------------- deferred / unavailable list */

  TOOLS.push(T({
    id: "transcription",
    name: "Audio Transcription",
    category: "metadata",
    handler: "transcribe",
    status: "deferred",
    summary: "Speech-to-text with timestamps, SRT/VTT export and multilingual support.",
    reason: "Requires a speech-recognition model (e.g. Whisper). Running it in-browser needs a large model download and the site's CSP blocks external APIs (connect-src 'self'). Ship a verified adapter before publishing a page."
  }));

  TOOLS.push(T({
    id: "text-to-speech",
    name: "Text to Speech",
    category: "music",
    handler: "tts",
    status: "unavailable",
    summary: "Convert text into downloadable speech with a choice of voices and languages.",
    reason: "The browser SpeechSynthesis API can speak text but cannot reliably capture the output to a file, so a real downloadable MP3/WAV is not possible without a TTS engine or provider. Not offered rather than faked."
  }));

  TOOLS.push(T({
    id: "vocal-remover",
    name: "Vocal Remover / Stem Separation",
    category: "music",
    handler: "stems",
    status: "deferred",
    summary: "Separate vocals from instrumental, or split a track into stems.",
    reason: "Requires a real source-separation model (e.g. Demucs/Spleeter). A centre-channel cancellation is not genuine separation, so this is deferred until a licensed model can be shipped."
  }));

  TOOLS.push(T({
    id: "ai-denoise",
    name: "AI Noise Reduction",
    category: "clean",
    handler: "aiDenoise",
    status: "deferred",
    summary: "Model-based speech enhancement and noise removal.",
    reason: "Requires a licensed neural model. The shipped afftdn denoiser is real spectral processing, not AI, and is offered honestly as the Noise Reducer instead."
  }));

  TOOLS.push(T({
    id: "audio-restoration",
    name: "Audio Restoration",
    category: "clean",
    handler: "restore",
    status: "deferred",
    summary: "Repair damaged, clipped or heavily degraded recordings.",
    reason: "Needs a restoration model. Deterministic filters (declick, declip) exist in the engine and could ship as an experimental tool; full restoration is deferred."
  }));

  TOOLS.push(T({
    id: "speaker-diarization",
    name: "Speaker Diarization",
    category: "metadata",
    handler: "diarize",
    status: "unavailable",
    summary: "Label who spoke when in a recording.",
    reason: "Depends on a speaker-recognition model and, typically, a transcript. No local model is shipped, so labels cannot be produced from real results."
  }));

  TOOLS.push(T({
    id: "audio-translate",
    name: "Speech Translation",
    category: "metadata",
    handler: "translate",
    status: "deferred",
    summary: "Translate recognised speech into another language.",
    reason: "Depends on transcription plus a translation service. External APIs are blocked by the site's CSP, so this is deferred with transcription."
  }));

  TOOLS.push(T({
    id: "system-audio-record",
    name: "System / Tab Audio Capture",
    category: "record",
    handler: "systemAudio",
    status: "deferred",
    summary: "Record the audio playing in a browser tab or the whole system.",
    reason: "getDisplayMedia with audio capture is not supported consistently across browsers and platforms. Deferred rather than shipped with silent failures."
  }));

  /* --------------------------------------------------------------- exports */

  const byId = {};
  TOOLS.forEach(function (t) { byId[t.id] = t; });

  function getTool(id) {
    return byId[id] || null;
  }

  function isPublicTool(tool) {
    return tool && (tool.status === "implemented" || tool.status === "experimental");
  }

  return {
    SITE_URL: SITE_URL,
    SITE_NAME: SITE_NAME,
    LIMITS: LIMITS,
    CATEGORIES: CATEGORIES,
    TOOLS: TOOLS,
    FORMAT_OPTIONS: FORMAT_OPTIONS,
    BASE64_NOTE: BASE64_NOTE,
    bytesLabel: bytesLabel,
    getTool: getTool,
    isPublicTool: isPublicTool,
    publicTools: function () { return TOOLS.filter(isPublicTool); },
    categoriesWithTools: function () {
      return CATEGORIES.filter(function (c) {
        return TOOLS.some(function (t) { return t.category === c.id && isPublicTool(t); });
      });
    }
  };
});
