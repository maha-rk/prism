// Fixed vocabulary shared between the vision-LLM prompt (so tags are
// constrained to values we can actually render) and the frontend's
// procedural SFX synth. No real audio assets are used anywhere in this
// project — every effect is generated at playback time via Web Audio, so
// there is no licensing risk from borrowed sound-effect libraries.
const SFX_VOCABULARY = [
  'rain',
  'thunder',
  'wind',
  'footsteps',
  'heartbeat',
  'door_creak',
  'crash',
  'glass_break',
  'whoosh',
  'silence_tension',
  'crowd_murmur',
  'fire_crackle',
  'punch',
  'gunshot',
  'explosion',
];

module.exports = { SFX_VOCABULARY };
