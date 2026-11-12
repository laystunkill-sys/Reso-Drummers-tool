/**
 * ResoDrum Synthesizer & Fill Pattern Audio Player
 * Precision lookahead scheduler and acoustic drum synthesis using Web Audio API.
 */

import { FillPattern, HitVelocity } from '../types/drum';

export class DrumSynth {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private currentStep = 0;
  private pattern: FillPattern | null = null;
  private bpm = 120;
  private lookaheadMs = 25.0; // scheduling interval ms
  private scheduleAheadSec = 0.1; // audio scheduling window sec
  private nextStepTime = 0.0;
  private timerId: number | null = null;
  private onStepListeners: ((step: number) => void)[] = [];
  private onBeatListeners: ((beat: number, isDownbeat: boolean) => void)[] = [];
  private onStopListeners: (() => void)[] = [];
  private onSpeedRampListeners: ((newBpm: number) => void)[] = [];

  // Speed trainer options
  private speedTrainerEnabled = false;
  private speedStepBpm = 5;
  private speedIntervalLoops = 2;
  private loopCount = 0;

  // Metronome & Count-in
  private metronomeEnabled = true;
  private metronomeSoundType: 'woodblock' | 'digital' | 'cowbell' = 'woodblock';
  private metronomeVolume = 0.75;
  private isMetronomeOnly = false;
  private isCountingIn = false;
  private countInStep = 0;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public getContext(): AudioContext {
    return this.ensureContext();
  }

  // --- Drum Sound Synthesis ---

  public triggerKick(time: number, velocity: HitVelocity = 'normal') {
    const ctx = this.ensureContext();
    const velGain = velocity === 'accent' ? 1.0 : velocity === 'ghost' ? 0.35 : 0.75;

    // Sub sine oscillator with rapid pitch drop
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.08);

    gain.gain.setValueAtTime(velGain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    // Beater click transient
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(300, time);
    clickOsc.frequency.exponentialRampToValueAtTime(60, time + 0.02);

    clickGain.gain.setValueAtTime(velGain * 0.4, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);

    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(time);
    clickOsc.stop(time + 0.03);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.36);
  }

  public triggerSnare(time: number, velocity: HitVelocity = 'normal') {
    const ctx = this.ensureContext();
    if (velocity === 'flam') {
      // Grace note ~22ms prior
      this.triggerSnareSingle(time - 0.022, 'ghost');
      this.triggerSnareSingle(time, 'accent');
    } else {
      this.triggerSnareSingle(time, velocity);
    }
  }

  private triggerSnareSingle(time: number, velocity: HitVelocity) {
    const ctx = this.ensureContext();
    const velGain = velocity === 'accent' ? 1.0 : velocity === 'ghost' ? 0.28 : 0.75;
    const safeTime = Math.max(ctx.currentTime, time);

    // 1. Dual tone shell resonance
    const toneOsc = ctx.createOscillator();
    const toneGain = ctx.createGain();
    toneOsc.type = 'triangle';
    toneOsc.frequency.setValueAtTime(185, safeTime);
    toneOsc.frequency.exponentialRampToValueAtTime(130, safeTime + 0.1);

    toneGain.gain.setValueAtTime(velGain * 0.65, safeTime);
    toneGain.gain.exponentialRampToValueAtTime(0.001, safeTime + 0.15);

    toneOsc.connect(toneGain);
    toneGain.connect(ctx.destination);
    toneOsc.start(safeTime);
    toneOsc.stop(safeTime + 0.16);

    // 2. White noise snare wires with highpass filter
    const bufferSize = ctx.sampleRate * 0.25;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(800, safeTime);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(velGain * 0.7, safeTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, safeTime + (velocity === 'ghost' ? 0.08 : 0.22));

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    whiteNoise.start(safeTime);
    whiteNoise.stop(safeTime + 0.25);
  }

  public triggerTom(time: number, pitchHz: number, velocity: HitVelocity = 'normal') {
    const ctx = this.ensureContext();
    const velGain = velocity === 'accent' ? 1.0 : velocity === 'ghost' ? 0.35 : 0.75;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitchHz * 1.35, time);
    osc.frequency.exponentialRampToValueAtTime(pitchHz, time + 0.08);

    gain.gain.setValueAtTime(velGain * 0.85, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.42);
  }

  public triggerHiHat(time: number, isOpen: boolean, velocity: HitVelocity = 'normal') {
    const ctx = this.ensureContext();
    const velGain = velocity === 'accent' ? 0.7 : velocity === 'ghost' ? 0.2 : 0.45;
    const decay = isOpen ? 0.35 : 0.055;

    // Metallic sound cluster through bandpass
    const bufferSize = ctx.sampleRate * decay;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(9500, time);
    bandpass.Q.setValueAtTime(3.0, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(velGain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);

    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(ctx.destination);

    source.start(time);
    source.stop(time + decay + 0.01);
  }

  public triggerCymbal(time: number, isCrash: boolean, velocity: HitVelocity = 'normal') {
    const ctx = this.ensureContext();
    const velGain = velocity === 'accent' ? 0.85 : 0.55;
    const duration = isCrash ? 1.4 : 0.8;

    const bufferSize = ctx.sampleRate * duration;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = isCrash ? 'highpass' : 'bandpass';
    filter.frequency.setValueAtTime(isCrash ? 4500 : 6500, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(velGain * 0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(time);
    source.stop(time + duration + 0.05);
  }

  public triggerMetronome(
    time: number,
    isDownbeat: boolean,
    soundType: 'woodblock' | 'digital' | 'cowbell' = 'woodblock',
    volume = 0.5
  ) {
    const ctx = this.ensureContext();
    const safeVolume = Math.max(0, Math.min(1, volume));
    if (safeVolume <= 0) return;

    if (soundType === 'cowbell') {
      // 808-style dual square oscillator cowbell
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc1.type = 'square';
      osc2.type = 'square';
      osc1.frequency.setValueAtTime(isDownbeat ? 840 : 587, time);
      osc2.frequency.setValueAtTime(isDownbeat ? 1260 : 840, time);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(isDownbeat ? 1000 : 800, time);
      filter.Q.setValueAtTime(3.5, time);

      gain.gain.setValueAtTime(safeVolume * 0.4, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(time);
      osc2.start(time);
      osc1.stop(time + 0.13);
      osc2.stop(time + 0.13);
      return;
    }

    if (soundType === 'digital') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(isDownbeat ? 1760 : 880, time); // A6 vs A5

      gain.gain.setValueAtTime(safeVolume * 0.45, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.04);
      return;
    }

    // Default: 'woodblock' click (warm percussive attack + body)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    const baseFreq = isDownbeat ? 2200 : 1400;
    osc.frequency.setValueAtTime(baseFreq, time);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, time + 0.03);

    gain.gain.setValueAtTime(safeVolume * 0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + (isDownbeat ? 0.05 : 0.03));

    // Fast noise transient for crisp attack
    const bufferSize = Math.floor(ctx.sampleRate * 0.008);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(safeVolume * 0.35, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.008);

    noiseSource.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseSource.start(time);
    noiseSource.stop(time + 0.01);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.055);
  }

  public playInstrumentPreview(instrumentId: string, velocity: HitVelocity = 'normal') {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    switch (instrumentId) {
      case 'kick':
        this.triggerKick(now, velocity);
        break;
      case 'snare':
        this.triggerSnare(now, velocity);
        break;
      case 'high_tom':
        this.triggerTom(now, 165, velocity);
        break;
      case 'mid_tom':
        this.triggerTom(now, 130, velocity);
        break;
      case 'floor_tom':
        this.triggerTom(now, 85, velocity);
        break;
      case 'hihat_closed':
        this.triggerHiHat(now, false, velocity);
        break;
      case 'hihat_open':
        this.triggerHiHat(now, true, velocity);
        break;
      case 'crash':
        this.triggerCymbal(now, true, velocity);
        break;
      case 'ride':
        this.triggerCymbal(now, false, velocity);
        break;
      default:
        this.triggerSnare(now, velocity);
    }
  }

  // --- Scheduler & Playback Engine ---

  public play(pattern: FillPattern, initialBpm?: number, metronomeOnly = false) {
    const ctx = this.ensureContext();
    this.pattern = pattern;
    this.bpm = initialBpm || pattern.bpm;
    this.isMetronomeOnly = metronomeOnly;
    this.currentStep = 0;
    this.loopCount = 0;
    this.isPlaying = true;
    this.nextStepTime = ctx.currentTime + 0.05;

    this.scheduler();
  }

  public stop() {
    this.isPlaying = false;
    this.isMetronomeOnly = false;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.currentStep = 0;
    for (const listener of this.onStopListeners) {
      listener();
    }
  }

  private scheduler = () => {
    if (!this.isPlaying || !this.ctx || !this.pattern) return;

    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadSec) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.advanceStep();
    }

    this.timerId = window.setTimeout(this.scheduler, this.lookaheadMs);
  };

  private scheduleStep(stepIndex: number, time: number) {
    if (!this.pattern) return;

    const stepsPerBeat = this.pattern.subdivision === 'triplet' ? 3 : 4;
    const isQuarterBeat = stepIndex % stepsPerBeat === 0;
    const beatIndex = Math.floor(stepIndex / stepsPerBeat);
    const isDownbeat = stepIndex === 0;

    // Metronome audible click on quarter notes (Beats 1, 2, 3, 4)
    if (this.metronomeEnabled && isQuarterBeat) {
      this.triggerMetronome(time, isDownbeat, this.metronomeSoundType, this.metronomeVolume);
    }

    // Schedule visual beat callback synchronized with audio clock
    if (isQuarterBeat) {
      const beatDelayMs = Math.max(0, (time - this.ctx!.currentTime) * 1000);
      window.setTimeout(() => {
        if (this.isPlaying) {
          for (const listener of this.onBeatListeners) {
            listener(beatIndex + 1, isDownbeat);
          }
        }
      }, beatDelayMs);
    }

    // Drum kit hits (only if not in metronome-only practice mode)
    if (!this.isMetronomeOnly) {
      const stepData = this.pattern.steps[stepIndex];
      if (stepData && stepData.hits) {
        const hits = stepData.hits;
        if (hits.kick && hits.kick !== 'none') this.triggerKick(time, hits.kick);
        if (hits.snare && hits.snare !== 'none') this.triggerSnare(time, hits.snare);
        if (hits.high_tom && hits.high_tom !== 'none') this.triggerTom(time, 165, hits.high_tom);
        if (hits.mid_tom && hits.mid_tom !== 'none') this.triggerTom(time, 130, hits.mid_tom);
        if (hits.floor_tom && hits.floor_tom !== 'none') this.triggerTom(time, 85, hits.floor_tom);
        if (hits.hihat_closed && hits.hihat_closed !== 'none') this.triggerHiHat(time, false, hits.hihat_closed);
        if (hits.hihat_open && hits.hihat_open !== 'none') this.triggerHiHat(time, true, hits.hihat_open);
        if (hits.crash && hits.crash !== 'none') this.triggerCymbal(time, true, hits.crash);
        if (hits.ride && hits.ride !== 'none') this.triggerCymbal(time, false, hits.ride);
      }
    }

    // Schedule visual callback via setTimeout aligned with audio time
    const delayMs = Math.max(0, (time - this.ctx!.currentTime) * 1000);
    window.setTimeout(() => {
      if (this.isPlaying) {
        for (const listener of this.onStepListeners) {
          listener(stepIndex);
        }
      }
    }, delayMs);
  }

  private advanceStep() {
    if (!this.pattern) return;

    // Time per step: for 16th notes, 1 beat = 4 steps. Seconds per beat = 60 / BPM. Step = 60 / (BPM * 4)
    const stepsPerBeat = this.pattern.subdivision === 'triplet' ? 3 : 4;
    const stepDuration = 60.0 / (this.bpm * stepsPerBeat);
    this.nextStepTime += stepDuration;

    this.currentStep++;
    if (this.currentStep >= this.pattern.stepsCount) {
      this.currentStep = 0;
      this.loopCount++;

      // Speed Trainer acceleration check
      if (this.speedTrainerEnabled && this.loopCount % this.speedIntervalLoops === 0) {
        this.bpm = Math.min(240, this.bpm + this.speedStepBpm);
        for (const listener of this.onSpeedRampListeners) {
          listener(this.bpm);
        }
      }
    }
  }

  // --- Controls & Config ---

  public setBpm(newBpm: number) {
    this.bpm = Math.max(40, Math.min(260, newBpm));
  }

  public getBpm(): number {
    return this.bpm;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getIsMetronomeOnly(): boolean {
    return this.isMetronomeOnly;
  }

  public toggleMetronome(): boolean {
    this.metronomeEnabled = !this.metronomeEnabled;
    return this.metronomeEnabled;
  }

  public setMetronomeActive(active: boolean) {
    this.metronomeEnabled = active;
  }

  public isMetronomeActive(): boolean {
    return this.metronomeEnabled;
  }

  public setMetronomeSound(type: 'woodblock' | 'digital' | 'cowbell') {
    this.metronomeSoundType = type;
  }

  public getMetronomeSound() {
    return this.metronomeSoundType;
  }

  public setMetronomeVolume(vol: number) {
    this.metronomeVolume = Math.max(0, Math.min(1, vol));
  }

  public getMetronomeVolume() {
    return this.metronomeVolume;
  }

  public setSpeedTrainer(enabled: boolean, stepBpm = 5, intervalLoops = 2) {
    this.speedTrainerEnabled = enabled;
    this.speedStepBpm = stepBpm;
    this.speedIntervalLoops = intervalLoops;
  }

  public onStep(listener: (step: number) => void): () => void {
    this.onStepListeners.push(listener);
    return () => {
      this.onStepListeners = this.onStepListeners.filter((l) => l !== listener);
    };
  }

  public onBeat(listener: (beat: number, isDownbeat: boolean) => void): () => void {
    this.onBeatListeners.push(listener);
    return () => {
      this.onBeatListeners = this.onBeatListeners.filter((l) => l !== listener);
    };
  }

  public onStop(listener: () => void): () => void {
    this.onStopListeners.push(listener);
    return () => {
      this.onStopListeners = this.onStopListeners.filter((l) => l !== listener);
    };
  }

  public onSpeedRamp(listener: (bpm: number) => void): () => void {
    this.onSpeedRampListeners.push(listener);
    return () => {
      this.onSpeedRampListeners = this.onSpeedRampListeners.filter((l) => l !== listener);
    };
  }
}

export const drumSynth = new DrumSynth();
