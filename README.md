# Prism

*One story. Infinite ways to experience it.*

An AI-powered storytelling reconstruction engine for the **AI Builders Challenge** —
July 2026, *Reimagine Creative Industries with AI*. Every story deserves every
audience.

## Problem

Existing accessibility tools for visual storytelling — alt text, flat image
captions — communicate facts about a scene without preserving its atmosphere,
pacing, tension, or artistic intent. The story gets flattened into
information. Separately, creative tools like musical instruments assume
sighted access to a visual interface (a keyboard, a DAW, sheet music),
excluding blind and low-vision musicians from an entire mode of creative
expression.

## Solution

Prism is a suite of standalone, selectable accessibility-first
creative experiences — not one compiled pipeline, but several independent
modes a user picks from:

- **Gesture Vision** *(available now)* — play music with hand gestures
  alone, no visual interface required.
- **See Through Sound** *(available now)* — comics and manga become immersive
  audio stories: narration, distinct character voices, sound effects, and
  ambience, grounded in the actual page rather than a generic caption.
- **Emotion Lens** *(available now)* — a narrative-understanding layer,
  exposed through Q&A, for emotional subtext, motives, and relationships a
  story never states outright.
- **Synesthesia Studio** *(available now)* — translates one sense into
  another: a comic panel into a new illustration, an image into a
  generative ambient soundscape, or a written mood into one.

## Gesture Vision — how it works

Left hand: number of fingers extended selects a scale degree (I-V); the
index+pinky and index+pinky+thumb shapes give VI and VII. Tilting the left
wrist left/right switches major/minor — a dead zone keeps a centered hand
neutral, so there's a stable "home" position to return to by feel.

Right hand: finger count (0-4) selects chord quality/inversion, thumb
extended drops an octave, hand height controls volume, and hand tilt sweeps
a tone filter.

Chord and quality changes are spoken aloud automatically — that's the one
thing a blind player can't infer from the sound alone. Volume and filter
brightness are *not* announced: they're continuous, and the sound itself
already carries that information, the same way a sighted player reads them
by ear rather than by watching a meter.

### Attribution

The gesture-to-chord mechanic (finger-extension classification, the
dead-zone tilt calculation for major/minor, the chord-state debouncer, and
the oscillator/filter synth engine) is adapted from
[**Gesture Synth** by Eric Wei](https://github.com/ericwei97-cloud/gesture-synth),
used under its personal/educational/non-commercial license. What's original
here: the spoken-confirmation accessibility layer (the source project's
feedback is entirely visual — an on-screen chord label and animated
waveform, with no non-visual confirmation of state), the accessible
HTML/ARIA structure, and adapting the code from its original Vite/npm build
into this project's zero-build-step module structure.

## See Through Sound — how it works

Upload a single comic/manga page image. A vision-LLM call (IBM watsonx
Granite Vision, mockable) detects each panel's bounding box, suggests a
reading order, transcribes captions and dialogue, tags a mood per panel,
and tags up to two sound cues from a fixed vocabulary. The reader reviews
the suggested order on an overlay of numbered boxes and can fix it with
keyboard-operable Move up/down controls (no drag-and-drop dependency) before
continuing — panel detection on real, varied page layouts won't always get
reading order right, so this is a required step, not an afterthought.

Once confirmed, a second AI pass reconstructs the flowing narration —
adding brief connective narration between panels and resolving vague
references ("a figure") to a character's name once introduced — without
ever rewriting the actual dialogue or reordering panels itself. Each unique
speaker is assigned one of four fixed character voices (plus a separate
narrator voice), synthesized via IBM Watson Text to Speech with SSML
prosody driven by the panel's tagged emotion (afraid, urgent, relieved,
etc.) — deliberately a fixed voice pool with simple prosody rules, not a
bespoke "personality engine," and no attempt at re-identifying characters
across chapters or art styles. Sound cues are synthesized procedurally via
Web Audio (rain, thunder, footsteps, a heartbeat, and so on) rather than
pulled from a real sound-effect library, so there's no licensing risk.
Playback pans left/right per panel based on its horizontal position on the
page — simple rule-based stereo positioning, not true 3D spatial audio.

## Emotion Lens — how it works

Upload a page (reusing the same panel-analysis pipeline as See Through
Sound) and ask about it in plain language — emotional questions ("why is
she upset?") or factual ones ("who is the man in blue?"). Answers are
grounded in a structured "story bible" built from the analyzed panels — a
per-panel summary plus a per-character index of every line they speak,
their tagged emotion, and which panel it's in — rather than an LLM just
re-reading a wall of raw text each time. Answers are required to distinguish
what the page actually states from what's inferred, cite the specific
dialogue or action an inference is based on, and hedge honestly ("it seems,"
"this suggests") instead of asserting a guess as fact or attaching a
fabricated confidence number — grounded in the same real audio-description
and literary-analysis principles used throughout Prism, not an ad hoc
prompt. Answers are read aloud, not just displayed, since this is meant to
be used by ear.

## Synesthesia Studio — how it works

Cross-sense translation is already Prism's core mechanic — See Through
Sound turns *visual → audio*, Gesture Vision turns *motion → music*.
Synesthesia Studio makes that the explicit point, with three modes sharing
one page:

- **Image → Illustration**: upload a comic page, pick an art style, and
  each panel is regenerated as a new illustration in that style — grounded
  in the panel's actual scene description, not a generic prompt. Before
  generating, a per-character visual description (hair, clothing, build —
  only what the page actually establishes, nothing invented) is extracted
  once and reused in every panel that character appears in, so the same
  character stays as consistent as prompt-level description can make them.
  This is **not** IBM tooling: watsonx has no image-generation model at
  all, on any plan, in any region (confirmed directly against the API, not
  assumed) — the challenge's own rules explicitly welcome "additional
  technologies and frameworks," and image generation via Hugging Face's
  free `hf-inference` provider (Stable Diffusion 3 Medium) is the one piece
  of Prism that isn't IBM-only. Worth being upfront about the honest limits
  here: this is prompt-based consistency, not a per-character fine-tune or
  locked seed — the same character can look slightly different panel to
  panel, which is a real, known constraint, not something this approach
  fully solves.
- **Image → Soundscape**: upload any image — not just a comic panel, any
  photo or painting — and a vision-LLM call extracts a continuous
  emotional/atmospheric profile (brightness, energy, warmth, valence, each
  0–1) rather than a discrete tag. That profile drives a generative ambient
  pad synth (layered detuned oscillators, mood-driven filter cutoff, LFO
  movement tied to energy) built entirely in Web Audio — no audio assets,
  no external synthesis API. Because the sound generation itself is 100%
  procedural, the output is always real audio, even on the mock-fallback
  path — only the mood's *accuracy* changes, never whether it makes sound.
- **Text → Soundscape**: the same mood-extraction and synth engine, driven
  by a typed description instead of an image — "a quiet, misty forest at
  dawn" and "a stormy night at sea" produce audibly, meaningfully different
  soundscapes, not just different labels.

## Selected challenge theme

July Challenge — Reimagine Creative Industries with AI. Prism is positioned
as both a creative-industries platform (new ways to *experience* and
*create* within existing and new creative mediums) and an accessibility
platform — not accessibility-only, and not another content generator.

## Honesty note

This is a first prototype, not a validated solution co-designed with blind
or neurodiverse users. Feedback from that community is the highest-value
thing that could improve this project.

## Running locally

```bash
node frontend/serve.js       # frontend, http://localhost:5174
cd backend && npm install && npm start   # backend, http://localhost:3002 (needed for every mode except Gesture Vision)
```

Open http://localhost:5174 and pick a mode. Gesture Vision needs a webcam.
Every other mode needs the backend running (all providers default to
`mock` — see `backend/.env.example` — so everything works with zero
credentials).

## File structure

```
prism/
  frontend/
    index.html          Mode selector / landing page
    serve.js             Zero-dependency static server
    src/
      modes/
        gesture-vision/
          index.html      Gesture Vision page
          style.css
          main.js         Wiring
          handGestures.js  MediaPipe tracking + gesture classification
          chordSynth.js    Web Audio synth engine
          musicTheory.js   Chord/scale math
        see-through-sound/
          index.html      Upload / reorder / playback page
          style.css
          main.js          Wiring
          player.js         Sequences narration + SFX with stereo panning
          sfxSynth.js       Procedural Web Audio sound effects
        emotion-lens/
          index.html      Upload / Q&A chat page
          style.css
          main.js          Wiring (reuses /api/comic/analyze, then Q&A)
        synesthesia-studio/
          index.html      3-tab page: illustration / image→sound / text→sound
          style.css
          main.js          Wiring for all 3 tabs
          soundscapeSynth.js Generative ambient pad engine (continuous mood → Web Audio)
  backend/
    server.js             Express app
    routes/
      comicAnalyze.js      Phase A: panel detection + transcription
      narrate.js            Phase B: narrative reconstruction + script assembly
      tts.js                 Phase B: speech synthesis
      ask.js                  Emotion Lens: story-bible-grounded Q&A
      reimagine.js             Synesthesia Studio: per-panel image generation
      synesthesia.js            Synesthesia Studio: mood extraction (image or text)
    vision/visionProvider.js   Mock / IBM watsonx / Gemini fallback (cascade + retry/fallback resilience)
    narration/                Reconstruction pass + deterministic script/voice/pan assembly
    tts/ttsProvider.js         Mock / IBM Watson Text to Speech
    emotionLens/
      storyBible.js            Structured per-panel/per-character index for Q&A grounding
      qaProvider.js             Mock / IBM watsonx / Gemini fallback Q&A
    imageGen/
      characterSheet.js         Per-character visual description extraction
      imageProvider.js           Mock / Hugging Face (non-IBM — no watsonx image-gen model exists)
      stylePresets.js             Fixed art-style vocabulary shared with the frontend picker
    synesthesia/
      moodProvider.js            Continuous mood-profile extraction (image or text)
    shared/
      cascade.js                 watsonx-first, Gemini-fallback helper used by every real provider
      diskCache.js                Generic disk-persisted response cache (protects watsonx's token quota)
      geminiClient.js              Shared Gemini text/vision call helpers (non-IBM fallback)
    rag/                       Audio-description + narrative-analysis methodology corpora
    sfx/sfxVocabulary.js       Fixed SFX tag vocabulary shared with the frontend synth
  README.md
```
