declare module '@strudel/webaudio' {
  interface SuperdoughAudioController {
    output: { destinationGain: GainNode };
  }

  export function getAudioContext(): AudioContext;
  export function getSuperdoughAudioController(): SuperdoughAudioController;
}
