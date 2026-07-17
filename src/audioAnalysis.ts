import { useEffect, useState } from 'react';
import { getAudioContext, getSuperdoughAudioController } from '@strudel/webaudio';

const BAND_COUNT = 32;
const FFT_SIZE = 2048;
const UPDATE_INTERVAL = 1000 / 30;

export interface StrudelAudioAnalysis {
  spectrum: number[];
  volume: number;
  low: number;
  mid: number;
  high: number;
  envelope: number;
}

const EMPTY_ANALYSIS: StrudelAudioAnalysis = {
  spectrum: Array(BAND_COUNT).fill(0),
  volume: 0,
  low: 0,
  mid: 0,
  high: 0,
  envelope: 0,
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function averageFrequencyRange(data: Uint8Array, sampleRate: number, fftSize: number, minHz: number, maxHz: number) {
  const binHz = sampleRate / fftSize;
  const start = Math.max(1, Math.floor(minHz / binHz));
  const end = Math.min(data.length, Math.ceil(maxHz / binHz));
  if (end <= start) return 0;
  let sum = 0;
  for (let index = start; index < end; index += 1) sum += data[index] / 255;
  return clamp01(sum / (end - start));
}

function logarithmicSpectrum(data: Uint8Array, sampleRate: number, fftSize: number) {
  const binHz = sampleRate / fftSize;
  const minHz = Math.max(30, binHz);
  const maxHz = Math.min(20000, sampleRate / 2);
  return Array.from({ length: BAND_COUNT }, (_, band) => {
    const startHz = minHz * (maxHz / minHz) ** (band / BAND_COUNT);
    const endHz = minHz * (maxHz / minHz) ** ((band + 1) / BAND_COUNT);
    const start = Math.max(1, Math.floor(startHz / binHz));
    const end = Math.min(data.length, Math.max(start + 1, Math.ceil(endHz / binHz)));
    let sum = 0;
    for (let index = start; index < end; index += 1) sum += data[index] / 255;
    return clamp01(sum / Math.max(1, end - start));
  });
}

export function useStrudelAudioAnalysis(): StrudelAudioAnalysis {
  const [analysis, setAnalysis] = useState<StrudelAudioAnalysis>(EMPTY_ANALYSIS);

  useEffect(() => {
    const audioContext = getAudioContext();
    const controller = getSuperdoughAudioController();
    const output = controller.output.destinationGain;
    const analyser = audioContext.createAnalyser();
    const silentMonitor = audioContext.createGain();
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const timeData = new Float32Array(analyser.fftSize);
    let frame = 0;
    let lastUpdate = 0;
    let smoothedVolume = 0;
    let envelope = 0;

    analyser.fftSize = FFT_SIZE;
    analyser.minDecibels = -100;
    analyser.maxDecibels = -20;
    analyser.smoothingTimeConstant = 0.72;
    silentMonitor.gain.value = 0;

    // Keep Strudel's audible destination connection untouched. This silent branch
    // makes the analyser part of the live graph without duplicating the mix.
    output.connect(analyser);
    analyser.connect(silentMonitor);
    silentMonitor.connect(audioContext.destination);

    const sample = (time: number) => {
      frame = requestAnimationFrame(sample);
      if (time - lastUpdate < UPDATE_INTERVAL) return;
      lastUpdate = time;

      analyser.getByteFrequencyData(frequencyData);
      analyser.getFloatTimeDomainData(timeData);

      let squareSum = 0;
      let peak = 0;
      for (let index = 0; index < timeData.length; index += 1) {
        const value = timeData[index];
        squareSum += value * value;
        peak = Math.max(peak, Math.abs(value));
      }
      const rms = clamp01(Math.sqrt(squareSum / timeData.length));
      const volumeCoefficient = rms > smoothedVolume ? 0.45 : 0.16;
      smoothedVolume += (rms - smoothedVolume) * volumeCoefficient;
      const envelopeCoefficient = peak > envelope ? 0.58 : 0.08;
      envelope += (peak - envelope) * envelopeCoefficient;

      setAnalysis({
        spectrum: logarithmicSpectrum(frequencyData, audioContext.sampleRate, analyser.fftSize),
        volume: clamp01(smoothedVolume),
        low: averageFrequencyRange(frequencyData, audioContext.sampleRate, analyser.fftSize, 20, 250),
        mid: averageFrequencyRange(frequencyData, audioContext.sampleRate, analyser.fftSize, 250, 4000),
        high: averageFrequencyRange(frequencyData, audioContext.sampleRate, analyser.fftSize, 4000, 20000),
        envelope: clamp01(envelope),
      });
    };

    frame = requestAnimationFrame(sample);
    return () => {
      cancelAnimationFrame(frame);
      try { output.disconnect(analyser); } catch { /* Strudel may have rebuilt its output graph. */ }
      analyser.disconnect();
      silentMonitor.disconnect();
    };
  }, []);

  return analysis;
}
