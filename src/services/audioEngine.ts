/**
 * ResoDrum Audio Engine & Pitch Analyzer
 * Precision real-time FFT & transient-isolated pitch detection for acoustic drums.
 */

export interface PitchAnalysisResult {
  frequency: number;
  note: string;
  cents: number;
  confidence: number;
  rms: number;
  peakDb: number;
  isTransientHit: boolean;
  spectrum: Float32Array;
  sampleRate: number;
}

const NOTE_STRINGS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function frequencyToNote(freq: number): { note: string; cents: number; targetFreq: number } {
  if (freq <= 0) return { note: '--', cents: 0, targetFreq: 0 };
  const midi = 12 * (Math.log2(freq / 440)) + 69;
  const roundedMidi = Math.round(midi);
  const noteIndex = (roundedMidi % 12 + 12) % 12;
  const octave = Math.floor(roundedMidi / 12) - 1;
  const noteName = `${NOTE_STRINGS[noteIndex]}${octave}`;
  const targetFreq = 440 * Math.pow(2, (roundedMidi - 69) / 12);
  const cents = Math.round(1200 * Math.log2(freq / targetFreq));
  return { note: noteName, cents, targetFreq };
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private referenceOsc: OscillatorNode | null = null;
  private referenceGain: GainNode | null = null;

  private isRunning = false;
  private animFrameId: number | null = null;
  private subscribers: ((result: PitchAnalysisResult) => void)[] = [];

  // Transient state tracking for drum strike isolation
  private previousRms = 0;
  private transientCooldown = 0;
  private strikeHistory: number[] = [];
  private filterMinHz = 30;
  private filterMaxHz = 800;

  public async initMicrophone(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioCtx();
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      // Drum capture settings: disable aggressive speech AGC/noise-suppression to keep real acoustic decay
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      this.stream = stream;
      this.sourceNode = this.ctx.createMediaStreamSource(stream);

      // High quality FFT analyzer: 4096 bins gives ~10.7Hz bins at 44.1kHz; parabolic interpolation refines to <0.2Hz
      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 4096;
      this.analyserNode.smoothingTimeConstant = 0.65;

      // Bandpass filter to suppress low room rumble (<30Hz) and high sizzle (>1200Hz)
      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'bandpass';
      this.filterNode.frequency.value = 250;
      this.filterNode.Q.value = 0.7; // Broad musical Q

      this.sourceNode.connect(this.filterNode);
      this.filterNode.connect(this.analyserNode);

      this.isRunning = true;
      this.startAnalysisLoop();
      return true;
    } catch (err) {
      console.error('Failed to init microphone for drum tuner:', err);
      return false;
    }
  }

  public setFilterRange(minHz: number, maxHz: number) {
    this.filterMinHz = Math.max(25, minHz);
    this.filterMaxHz = Math.min(1500, maxHz);
    if (this.filterNode && this.ctx) {
      const center = Math.sqrt(this.filterMinHz * this.filterMaxHz);
      this.filterNode.frequency.setTargetAtTime(center, this.ctx.currentTime, 0.05);
    }
  }

  public subscribe(cb: (result: PitchAnalysisResult) => void): () => void {
    this.subscribers.push(cb);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb);
    };
  }

  private startAnalysisLoop = () => {
    if (!this.analyserNode || !this.ctx || !this.isRunning) return;

    const fftSize = this.analyserNode.fftSize;
    const timeBuffer = new Float32Array(fftSize);
    const freqBuffer = new Float32Array(this.analyserNode.frequencyBinCount);

    const loop = () => {
      if (!this.isRunning || !this.analyserNode || !this.ctx) return;

      this.analyserNode.getFloatTimeDomainData(timeBuffer);
      this.analyserNode.getFloatFrequencyData(freqBuffer);

      // Calculate RMS power
      let sumSquares = 0;
      for (let i = 0; i < timeBuffer.length; i++) {
        sumSquares += timeBuffer[i] * timeBuffer[i];
      }
      const rms = Math.sqrt(sumSquares / timeBuffer.length);
      const peakDb = 20 * Math.log10(Math.max(rms, 1e-5));

      // Transient hit detection: sudden rise in RMS energy
      const isTransientHit = rms > 0.02 && rms > this.previousRms * 1.9 && this.transientCooldown <= 0;
      if (isTransientHit) {
        this.transientCooldown = 12; // debounce frames (~200ms)
      } else if (this.transientCooldown > 0) {
        this.transientCooldown--;
      }
      this.previousRms = rms;

      // Extract frequency using Parabolic Interpolated FFT Peak within drum bounds
      const sampleRate = this.ctx.sampleRate;
      const binResolution = sampleRate / fftSize;
      const minBin = Math.max(1, Math.floor(this.filterMinHz / binResolution));
      const maxBin = Math.min(freqBuffer.length - 2, Math.ceil(this.filterMaxHz / binResolution));

      let maxVal = -Infinity;
      let peakBin = -1;

      for (let i = minBin; i <= maxBin; i++) {
        if (freqBuffer[i] > maxVal) {
          maxVal = freqBuffer[i];
          peakBin = i;
        }
      }

      let detectedFreq = 0;
      let confidence = 0;

      // Only compute if sound level is above threshold (-48 dBFS)
      if (peakBin > 0 && maxVal > -48) {
        // Parabolic Interpolation for exact peak:
        // delta = 0.5 * (alpha - gamma) / (alpha - 2*beta + gamma)
        const alpha = freqBuffer[peakBin - 1];
        const beta = freqBuffer[peakBin];
        const gamma = freqBuffer[peakBin + 1];
        const denom = alpha - 2 * beta + gamma;
        const delta = denom !== 0 ? (0.5 * (alpha - gamma)) / denom : 0;
        const refinedBin = peakBin + delta;
        detectedFreq = refinedBin * binResolution;

        // Confidence metric based on peak prominence over noise floor
        const noiseFloor = (freqBuffer[minBin] + freqBuffer[maxBin]) / 2;
        confidence = Math.min(1, Math.max(0, (maxVal - noiseFloor) / 35));

        // Smooth sudden erratic leaps if low confidence
        if (confidence > 0.35 && detectedFreq >= this.filterMinHz && detectedFreq <= this.filterMaxHz) {
          this.strikeHistory.push(detectedFreq);
          if (this.strikeHistory.length > 5) this.strikeHistory.shift();
        }
      }

      // If peak is noisy, fallback to median of recent stable hits
      let finalFreq = detectedFreq;
      if (this.strikeHistory.length > 2 && confidence > 0.4) {
        const sorted = [...this.strikeHistory].sort((a, b) => a - b);
        finalFreq = sorted[Math.floor(sorted.length / 2)];
      }

      const { note, cents } = frequencyToNote(finalFreq);

      const result: PitchAnalysisResult = {
        frequency: finalFreq > 0 ? Number(finalFreq.toFixed(1)) : 0,
        note,
        cents: finalFreq > 0 ? cents : 0,
        confidence,
        rms,
        peakDb: Number(peakDb.toFixed(1)),
        isTransientHit,
        spectrum: freqBuffer,
        sampleRate,
      };

      for (const sub of this.subscribers) {
        sub(result);
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  };

  // Play a reference tuning pitch so the drummer can tune by ear
  public playReferenceTone(frequency: number, durationSec = 1.5): void {
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioCtx();
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      this.stopReferenceTone();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, now);

      // Warm acoustic envelope with subtle fundamental overtone
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + durationSec);

      this.referenceOsc = osc;
      this.referenceGain = gain;
    } catch (e) {
      console.error('Reference tone error:', e);
    }
  }

  public stopReferenceTone(): void {
    if (this.referenceOsc) {
      try {
        this.referenceOsc.stop();
        this.referenceOsc.disconnect();
      } catch (_) {
        // already stopped
      }
      this.referenceOsc = null;
    }
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.stopReferenceTone();
  }
}

// Global audio engine singleton
export const audioEngine = new AudioEngine();
