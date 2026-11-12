import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Square,
  Repeat,
  Volume2,
  Plus,
  Trash2,
  Copy,
  Zap,
  Activity,
  ChevronRight,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { FillPattern, DrumTrack, HitVelocity, StickingHand } from '../types/drum';
import { DRUM_TRACKS, PRESET_FILLS } from '../data/drumPresets';
import { drumSynth } from '../services/drumSynth';

interface FillLabProps {
  initialBpm?: number;
  initialTitle?: string;
}

export const FillLab: React.FC<FillLabProps> = ({ initialBpm, initialTitle }) => {
  const [patterns, setPatterns] = useState<FillPattern[]>(() => {
    const saved = localStorage.getItem('resodrum_custom_fills');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return [...PRESET_FILLS, ...parsed];
      } catch (e) {
        return PRESET_FILLS;
      }
    }
    return PRESET_FILLS;
  });

  const [activePatternId, setActivePatternId] = useState<string>(PRESET_FILLS[0].id);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMetronomeOnly, setIsMetronomeOnly] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [activeBeat, setActiveBeat] = useState<number>(0);
  const [isDownbeat, setIsDownbeat] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(initialBpm || PRESET_FILLS[0].bpm);
  const [metronomeOn, setMetronomeOn] = useState<boolean>(true);
  const [metronomeSound, setMetronomeSound] = useState<'woodblock' | 'digital' | 'cowbell'>('woodblock');
  const [metronomeVolume, setMetronomeVolume] = useState<number>(0.75);
  const [speedTrainerOn, setSpeedTrainerOn] = useState<boolean>(false);
  const [speedStepBpm, setSpeedStepBpm] = useState<number>(5);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [selectedCellInfo, setSelectedCellInfo] = useState<{ track: string; step: number; vel: HitVelocity } | null>(null);

  const activePattern = patterns.find((p) => p.id === activePatternId) || patterns[0];

  // Sync initial BPM or title if sent from audio recorder
  useEffect(() => {
    if (initialBpm) {
      setBpm(initialBpm);
      drumSynth.setBpm(initialBpm);
    }
  }, [initialBpm]);

  // Hook into DrumSynth events
  useEffect(() => {
    const unsubStep = drumSynth.onStep((step) => {
      setCurrentStep(step);
    });

    const unsubBeat = drumSynth.onBeat((beat, isDown) => {
      setActiveBeat(beat);
      setIsDownbeat(isDown);
    });

    const unsubStop = drumSynth.onStop(() => {
      setIsPlaying(false);
      setIsMetronomeOnly(false);
      setCurrentStep(-1);
      setActiveBeat(0);
      setIsDownbeat(false);
    });

    const unsubSpeed = drumSynth.onSpeedRamp((newBpm) => {
      setBpm(newBpm);
    });

    return () => {
      unsubStep();
      unsubBeat();
      unsubStop();
      unsubSpeed();
      drumSynth.stop();
    };
  }, []);

  // Play / Stop handler for fill playback
  const handleTogglePlay = (metronomeOnlyMode = false) => {
    if (isPlaying) {
      drumSynth.stop();
      setIsPlaying(false);
      setIsMetronomeOnly(false);
      setCurrentStep(-1);
      setActiveBeat(0);
    } else {
      drumSynth.setSpeedTrainer(speedTrainerOn, speedStepBpm, 2);
      drumSynth.setMetronomeActive(metronomeOn);
      drumSynth.setMetronomeSound(metronomeSound);
      drumSynth.setMetronomeVolume(metronomeVolume);
      drumSynth.play(activePattern, bpm, metronomeOnlyMode);
      setIsPlaying(true);
      setIsMetronomeOnly(metronomeOnlyMode);
    }
  };

  const handleMetronomeSoundChange = (sound: 'woodblock' | 'digital' | 'cowbell') => {
    setMetronomeSound(sound);
    drumSynth.setMetronomeSound(sound);
    // Audition sound
    drumSynth.triggerMetronome(drumSynth.getContext()?.currentTime || 0, true, sound, metronomeVolume);
  };

  const handleMetronomeVolumeChange = (vol: number) => {
    setMetronomeVolume(vol);
    drumSynth.setMetronomeVolume(vol);
  };

  const handleBpmChange = (newBpm: number) => {
    const clamped = Math.max(40, Math.min(240, newBpm));
    setBpm(clamped);
    drumSynth.setBpm(clamped);
  };

  // Tap Tempo detector
  const handleTapTempo = () => {
    const now = Date.now();
    const recent = [...tapTimes.filter((t) => now - t < 2500), now];
    setTapTimes(recent);

    if (recent.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < recent.length; i++) {
        intervals.push(recent[i] - recent[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const detectedBpm = Math.round(60000 / avgInterval);
      if (detectedBpm >= 40 && detectedBpm <= 240) {
        handleBpmChange(detectedBpm);
      }
    }
  };

  // Toggle cell velocity: none -> normal -> accent -> ghost -> flam -> none
  const cycleVelocity = (current: HitVelocity = 'none'): HitVelocity => {
    switch (current) {
      case 'none':
        return 'normal';
      case 'normal':
        return 'accent';
      case 'accent':
        return 'ghost';
      case 'ghost':
        return 'flam';
      case 'flam':
        return 'none';
      default:
        return 'normal';
    }
  };

  const handleCellClick = (trackId: string, stepIndex: number) => {
    const updatedPatterns = patterns.map((p) => {
      if (p.id !== activePattern.id) return p;

      const newSteps = [...p.steps];
      const stepData = { ...newSteps[stepIndex] };
      const currentVel = (stepData.hits && stepData.hits[trackId]) || 'none';
      const nextVel = cycleVelocity(currentVel);

      stepData.hits = {
        ...stepData.hits,
        [trackId]: nextVel,
      };

      // Audition hit immediately
      if (nextVel !== 'none') {
        drumSynth.playInstrumentPreview(trackId, nextVel);
      }

      newSteps[stepIndex] = stepData;
      return { ...p, steps: newSteps, isCustom: true };
    });

    setPatterns(updatedPatterns);
    persistCustomFills(updatedPatterns);
  };

  // Sticking cycle: R -> L -> K -> H -> - -> R
  const handleStickingClick = (stepIndex: number) => {
    const updatedPatterns = patterns.map((p) => {
      if (p.id !== activePattern.id) return p;

      const newSteps = [...p.steps];
      const stepData = { ...newSteps[stepIndex] };
      const curr = stepData.sticking || '-';
      const map: Record<StickingHand, StickingHand> = {
        R: 'L',
        L: 'K',
        K: 'H',
        H: '-',
        '-': 'R',
      };
      stepData.sticking = map[curr];
      newSteps[stepIndex] = stepData;
      return { ...p, steps: newSteps, isCustom: true };
    });

    setPatterns(updatedPatterns);
    persistCustomFills(updatedPatterns);
  };

  // Auto-generate standard sticking (alternating hands with kick recognition)
  const handleAutoSticking = () => {
    const updatedPatterns = patterns.map((p) => {
      if (p.id !== activePattern.id) return p;

      let nextHand: 'R' | 'L' = 'R';
      const newSteps = p.steps.map((step) => {
        const hits = step.hits || {};
        const hasKick = hits.kick && hits.kick !== 'none';
        const hasHandHit = Object.entries(hits).some(
          ([k, v]) => k !== 'kick' && v && v !== 'none'
        );

        let sticking: StickingHand = '-';
        if (hasKick && !hasHandHit) {
          sticking = 'K';
        } else if (hasHandHit) {
          sticking = nextHand;
          nextHand = nextHand === 'R' ? 'L' : 'R';
        }
        return { ...step, sticking };
      });

      return { ...p, steps: newSteps, isCustom: true };
    });

    setPatterns(updatedPatterns);
    persistCustomFills(updatedPatterns);
  };

  // Create new blank custom fill pattern
  const handleCreateNewFill = () => {
    const newId = `custom-fill-${Date.now()}`;
    const newPattern: FillPattern = {
      id: newId,
      title: initialTitle ? `Custom: ${initialTitle}` : `My Custom Fill #${patterns.length + 1}`,
      genre: 'Custom Drum Fill',
      difficulty: 'Intermediate',
      bpm: bpm || 110,
      subdivision: '16th',
      stepsCount: 16,
      description: 'Drummer custom fill pattern created in ResoDrum.',
      isCustom: true,
      steps: Array.from({ length: 16 }, (_, i) => ({
        stepIndex: i,
        hits: {},
        sticking: i % 2 === 0 ? 'R' : 'L',
      })),
    };

    const next = [newPattern, ...patterns];
    setPatterns(next);
    setActivePatternId(newId);
    persistCustomFills(next);
  };

  // Duplicate active fill
  const handleDuplicateFill = () => {
    const dupId = `custom-fill-${Date.now()}`;
    const duplicated: FillPattern = {
      ...activePattern,
      id: dupId,
      title: `${activePattern.title} (Copy)`,
      isCustom: true,
    };
    const next = [duplicated, ...patterns];
    setPatterns(next);
    setActivePatternId(dupId);
    persistCustomFills(next);
  };

  // Delete custom fill
  const handleDeleteFill = (id: string) => {
    const next = patterns.filter((p) => p.id !== id);
    setPatterns(next);
    if (activePatternId === id) {
      setActivePatternId(next[0]?.id || PRESET_FILLS[0].id);
    }
    persistCustomFills(next);
  };

  // Save to localStorage
  const persistCustomFills = (allPatterns: FillPattern[]) => {
    const customOnly = allPatterns.filter((p) => p.isCustom);
    localStorage.setItem('resodrum_custom_fills', JSON.stringify(customOnly));
  };

  // Quick preset loader
  const handleSelectPattern = (pattern: FillPattern) => {
    drumSynth.stop();
    setIsPlaying(false);
    setCurrentStep(-1);
    setActivePatternId(pattern.id);
    setBpm(pattern.bpm);
    drumSynth.setBpm(pattern.bpm);
  };

  // Beat subdivision label (1 e & a, 2 e & a, etc.)
  const getSubdivisionLabel = (step: number) => {
    const beat = Math.floor(step / 4) + 1;
    const sub = step % 4;
    const subNames = ['', 'e', '&', 'a'];
    return sub === 0 ? `${beat}` : subNames[sub];
  };

  // Velocity styling helper
  const getVelocityStyle = (vel: HitVelocity = 'none') => {
    switch (vel) {
      case 'accent':
        return 'bg-amber-400 text-black font-extrabold shadow-sm shadow-amber-500 scale-95 border-amber-300';
      case 'normal':
        return 'bg-neutral-200 text-neutral-900 font-bold';
      case 'ghost':
        return 'bg-neutral-800 text-neutral-400 border border-dashed border-neutral-600 text-[10px]';
      case 'flam':
        return 'bg-pink-500 text-white font-black text-[10px] shadow-sm shadow-pink-500';
      default:
        return 'bg-neutral-950/40 hover:bg-neutral-800/60 border border-neutral-800/80';
    }
  };

  const getVelocityText = (vel: HitVelocity = 'none') => {
    switch (vel) {
      case 'accent':
        return '>';
      case 'normal':
        return '●';
      case 'ghost':
        return '(●)';
      case 'flam':
        return 'fl';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Playback Toolbar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Play / Transport Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Main Hear Fill Play Button */}
          <button
            onClick={() => handleTogglePlay(false)}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-lg text-xs font-bold transition-all shadow-md ${
              isPlaying && !isMetronomeOnly
                ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-950'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950'
            }`}
          >
            {isPlaying && !isMetronomeOnly ? (
              <>
                <Square className="w-4 h-4 fill-black" />
                <span>Stop Fill</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Hear Fill</span>
              </>
            )}
          </button>

          {/* Standalone Metronome Only Practice Button */}
          <button
            onClick={() => handleTogglePlay(true)}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all border ${
              isPlaying && isMetronomeOnly
                ? 'bg-amber-400 text-black border-amber-300 shadow-md shadow-amber-950'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-neutral-700'
            }`}
            title="Practice on pad or kit with metronome click only (silent drums)"
          >
            {isPlaying && isMetronomeOnly ? (
              <>
                <Square className="w-3.5 h-3.5 fill-black" />
                <span>Stop Click</span>
              </>
            ) : (
              <>
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span>Click Only</span>
              </>
            )}
          </button>

          {/* BPM Slider & Stepper */}
          <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5 rounded-lg border border-neutral-800">
            <span className="text-xs text-neutral-400 font-mono">BPM</span>
            <input
              type="range"
              min="40"
              max="240"
              value={bpm}
              onChange={(e) => handleBpmChange(Number(e.target.value))}
              className="w-20 sm:w-28 accent-amber-500"
            />
            <span className="text-sm font-bold font-mono text-white tabular-nums w-8 text-right">
              {bpm}
            </span>
            <div className="flex flex-col gap-0.5 ml-0.5">
              <button
                onClick={() => handleBpmChange(bpm + 1)}
                className="text-[10px] text-neutral-400 hover:text-white leading-none px-1"
              >
                ▲
              </button>
              <button
                onClick={() => handleBpmChange(bpm - 1)}
                className="text-[10px] text-neutral-400 hover:text-white leading-none px-1"
              >
                ▼
              </button>
            </div>
          </div>

          {/* Tap Tempo Button */}
          <button
            onClick={handleTapTempo}
            className="px-2.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-mono font-medium rounded-lg border border-neutral-700 transition-colors"
            title="Tap continuously to set tempo"
          >
            Tap
          </button>
        </div>

        {/* Metronome & Speed Trainer Options */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metronome Audible Click Toggle */}
          <button
            onClick={() => {
              const next = !metronomeOn;
              setMetronomeOn(next);
              drumSynth.setMetronomeActive(next);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
              metronomeOn
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400 border-neutral-700'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Audible Click: {metronomeOn ? 'ON' : 'MUTE'}</span>
          </button>

          {/* Speed Trainer Toggle */}
          <button
            onClick={() => {
              const next = !speedTrainerOn;
              setSpeedTrainerOn(next);
              drumSynth.setSpeedTrainer(next, speedStepBpm, 2);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
              speedTrainerOn
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400 border-neutral-700'
            }`}
            title="Automatically increases tempo by +5 BPM every 2 loops for muscle memory practice"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Speed Ramp (+{speedStepBpm})</span>
          </button>

          {/* Pattern Action Buttons */}
          <button
            onClick={handleCreateNewFill}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Custom Fill</span>
          </button>
        </div>
      </div>

      {/* Visual & Audible Metronome Console */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
            <h3 className="text-sm font-semibold text-white">
              Visual & Audible Metronome
            </h3>
            <span className="text-xs font-mono text-neutral-400">
              4/4 Time Signature · {bpm} BPM
            </span>
          </div>

          {/* Click Sound Selector & Volume */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Click Sound Picker */}
            <div className="flex items-center bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs">
              {(['woodblock', 'digital', 'cowbell'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => handleMetronomeSoundChange(type)}
                  className={`px-2.5 py-1 rounded capitalize font-medium transition-colors ${
                    metronomeSound === type
                      ? 'bg-neutral-800 text-amber-400 font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {type === 'woodblock' ? 'Woodblock' : type === 'digital' ? 'Digital' : 'Cowbell'}
                </button>
              ))}
            </div>

            {/* Click Volume Slider */}
            <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1 rounded-lg border border-neutral-800">
              <Volume2 className="w-3.5 h-3.5 text-neutral-400" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={metronomeVolume}
                onChange={(e) => handleMetronomeVolumeChange(Number(e.target.value))}
                className="w-16 accent-amber-500"
                title="Click volume"
              />
              <span className="text-[11px] font-mono text-neutral-400 w-7 text-right">
                {Math.round(metronomeVolume * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* 4 Large Visual Beat Light Pods */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[1, 2, 3, 4].map((beatNum) => {
            const isDown = beatNum === 1;
            const isThisBeatActive = isPlaying && activeBeat === beatNum;
            const beatStepStart = (beatNum - 1) * 4;

            let cardStyle = 'bg-neutral-950 border-neutral-800 text-neutral-400';
            let circleStyle = 'bg-neutral-800 text-neutral-400 border-neutral-700';

            if (isThisBeatActive) {
              if (isDown) {
                cardStyle = 'bg-amber-500/10 border-amber-400 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/20';
                circleStyle = 'bg-amber-400 text-black border-amber-300 font-extrabold scale-110 shadow-[0_0_15px_rgba(245,158,11,0.8)]';
              } else {
                cardStyle = 'bg-emerald-500/10 border-emerald-400 ring-2 ring-emerald-400/50 shadow-lg shadow-emerald-500/20';
                circleStyle = 'bg-emerald-400 text-black border-emerald-300 font-extrabold scale-110 shadow-[0_0_15px_rgba(16,185,129,0.8)]';
              }
            }

            return (
              <div
                key={beatNum}
                className={`p-3.5 rounded-xl border flex flex-col items-center justify-between transition-all duration-75 relative overflow-hidden ${cardStyle}`}
              >
                {/* Header Label */}
                <div className="text-[10px] font-mono uppercase tracking-wider mb-2 font-semibold">
                  {isDown ? (
                    <span className={isThisBeatActive ? 'text-amber-400' : 'text-neutral-500'}>
                      Downbeat 1
                    </span>
                  ) : (
                    <span className={isThisBeatActive ? 'text-emerald-400' : 'text-neutral-500'}>
                      Beat {beatNum}
                    </span>
                  )}
                </div>

                {/* Beat Number Pill/Circle */}
                <div
                  className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-xl font-mono transition-transform duration-75 ${circleStyle}`}
                >
                  {beatNum}
                </div>

                {/* 16th Note Micro-Subdivision Dots (1 e & a) */}
                <div className="mt-3 flex items-center justify-center gap-1.5 w-full pt-2 border-t border-neutral-800/60 font-mono text-[10px]">
                  {['', 'e', '&', 'a'].map((subName, subIdx) => {
                    const stepIndex = beatStepStart + subIdx;
                    const isSubActive = isPlaying && currentStep === stepIndex;
                    const label = subIdx === 0 ? `${beatNum}` : subName;

                    return (
                      <span
                        key={subIdx}
                        className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                          isSubActive
                            ? isDown
                              ? 'bg-amber-400 text-black font-bold'
                              : 'bg-emerald-400 text-black font-bold'
                            : 'text-neutral-500 bg-neutral-900'
                        }`}
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Visual Pendulum Sweep Bar */}
        <div className="relative h-2 bg-neutral-950 rounded-full border border-neutral-800 overflow-hidden">
          <div
            className="absolute top-0 bottom-0 w-8 rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-100 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
            style={{
              left: isPlaying
                ? `${Math.max(0, Math.min(92, (currentStep / 15) * 92))}%`
                : '46%',
              opacity: isPlaying ? 1 : 0.4,
            }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500 font-mono">
          <span>Beat 1 (High Pitch Woodblock)</span>
          <span>{isPlaying ? (isMetronomeOnly ? 'Practice Mode: Click Active' : 'Fill Playback Active') : 'Metronome Standby'}</span>
          <span>Beats 2, 3, 4 (Low Pitch Woodblock)</span>
        </div>
      </div>

      {/* Pattern Library Picker & Current Fill Metadata */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900 border border-neutral-800 rounded-xl px-5 py-3">
        <div className="flex items-center gap-3 overflow-x-auto py-1 max-w-full">
          <span className="text-xs uppercase font-mono text-neutral-400 whitespace-nowrap">
            Presets & Custom:
          </span>
          <div className="flex items-center gap-1.5">
            {patterns.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectPattern(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                  activePattern.id === p.id
                    ? 'bg-amber-500 text-black font-semibold'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                {p.title}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDuplicateFill}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-neutral-300 hover:text-white bg-neutral-800 rounded border border-neutral-700"
            title="Duplicate fill as custom template"
          >
            <Copy className="w-3 h-3" /> Duplicate
          </button>
          {activePattern.isCustom && (
            <button
              onClick={() => handleDeleteFill(activePattern.id)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-400 hover:text-red-300 bg-neutral-800 rounded border border-neutral-700"
              title="Delete custom fill"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Description & Sticking Advice Kicker */}
      <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div>
          <span className="font-semibold text-white mr-2">{activePattern.title}</span>
          <span className="text-neutral-500">·</span>
          <span className="text-amber-400 font-mono ml-2 mr-2">{activePattern.genre}</span>
          <span className="text-neutral-500">·</span>
          <span className="text-neutral-300 ml-2">{activePattern.description}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoSticking}
            className="flex items-center gap-1 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-amber-300 rounded border border-neutral-700 font-mono text-[11px]"
          >
            <Sparkles className="w-3 h-3" />
            <span>Auto Sticking (R/L/K)</span>
          </button>
        </div>
      </div>

      {/* Main 16-Step Drum Sequencer Grid */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 overflow-x-auto">
        <div className="min-w-[760px]">
          {/* Header Row: Beat / Subdivision Numbers & Playhead Marker */}
          <div className="grid grid-cols-18 gap-1.5 pb-2 border-b border-neutral-800 text-center font-mono text-xs">
            {/* 2 Cols for Track Label */}
            <div className="col-span-2 text-left text-neutral-500 text-[11px] uppercase tracking-wider pl-1">
              Drum Kit Voice
            </div>

            {/* 16 Steps Subdivisions */}
            {Array.from({ length: 16 }, (_, i) => {
              const isDownbeat = i % 4 === 0;
              const isCurrent = currentStep === i;
              return (
                <div
                  key={i}
                  className={`py-1 rounded text-[11px] transition-colors ${
                    isCurrent
                      ? 'bg-amber-400 text-black font-extrabold shadow-sm'
                      : isDownbeat
                      ? 'text-white font-bold bg-neutral-800/50'
                      : 'text-neutral-500'
                  }`}
                >
                  {getSubdivisionLabel(i)}
                </div>
              );
            })}
          </div>

          {/* Instrument Lanes */}
          <div className="space-y-1.5 pt-2">
            {DRUM_TRACKS.map((track) => (
              <div key={track.id} className="grid grid-cols-18 gap-1.5 items-center">
                {/* Track Name + Audition preview button */}
                <button
                  onClick={() => drumSynth.playInstrumentPreview(track.id, 'accent')}
                  className="col-span-2 flex items-center justify-between px-2.5 py-2 bg-neutral-950/80 hover:bg-neutral-800 text-left rounded-lg border border-neutral-800/70 group transition-all text-xs"
                  title="Click to audition sound"
                >
                  <span className="font-semibold text-neutral-200 group-hover:text-white truncate">
                    {track.name}
                  </span>
                  <Volume2 className="w-3 h-3 text-neutral-500 group-hover:text-amber-400 shrink-0 ml-1" />
                </button>

                {/* 16 Step Buttons for this instrument */}
                {Array.from({ length: 16 }, (_, stepIdx) => {
                  const step = activePattern.steps[stepIdx];
                  const vel = step?.hits?.[track.id] || 'none';
                  const isCurrent = currentStep === stepIdx;

                  return (
                    <button
                      key={stepIdx}
                      onClick={() => handleCellClick(track.id, stepIdx)}
                      className={`h-9 rounded-md transition-all flex items-center justify-center cursor-pointer text-xs ${getVelocityStyle(
                        vel
                      )} ${isCurrent ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-neutral-950' : ''}`}
                      title={`${track.name} Step ${stepIdx + 1}: ${vel} (Click to change)`}
                    >
                      {getVelocityText(vel)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Sticking Notation Row (R, L, K, H) */}
          <div className="grid grid-cols-18 gap-1.5 items-center pt-3 mt-3 border-t border-neutral-800">
            <div className="col-span-2 pl-2 text-xs font-mono text-neutral-400">
              <span>Sticking Guide:</span>
            </div>

            {Array.from({ length: 16 }, (_, stepIdx) => {
              const step = activePattern.steps[stepIdx];
              const sticking = step?.sticking || '-';
              const isCurrent = currentStep === stepIdx;

              let color = 'text-neutral-500 bg-neutral-950/40 border-neutral-800';
              if (sticking === 'R') color = 'text-amber-400 bg-amber-500/10 border-amber-500/30 font-bold';
              if (sticking === 'L') color = 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30 font-bold';
              if (sticking === 'K') color = 'text-red-400 bg-red-500/10 border-red-500/30 font-bold';
              if (sticking === 'H') color = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 font-bold';

              return (
                <button
                  key={stepIdx}
                  onClick={() => handleStickingClick(stepIdx)}
                  className={`h-7 rounded border font-mono text-xs flex items-center justify-center transition-all ${color} ${
                    isCurrent ? 'ring-2 ring-white' : 'hover:border-neutral-600'
                  }`}
                  title={`Step ${stepIdx + 1} Sticking: ${sticking}. Click to toggle R / L / K / H`}
                >
                  {sticking}
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend / Key Helper */}
        <div className="mt-4 pt-3 border-t border-neutral-800 flex flex-wrap items-center justify-between text-[11px] text-neutral-400">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-neutral-500 font-mono">VELOCITY LEVELS:</span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-neutral-200 text-black font-bold flex items-center justify-center text-[10px]">●</span>
              Normal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-amber-400 text-black font-extrabold flex items-center justify-center text-[10px]">&gt;</span>
              Accent
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-neutral-800 border border-dashed border-neutral-600 text-neutral-400 flex items-center justify-center text-[9px]">(●)</span>
              Ghost
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-pink-500 text-white font-black flex items-center justify-center text-[9px]">fl</span>
              Flam
            </span>
          </div>

          <div className="flex items-center gap-3 font-mono text-neutral-400">
            <span>R = Right</span>
            <span>L = Left</span>
            <span>K = Kick Foot</span>
            <span>H = Hi-Hat Foot</span>
          </div>
        </div>
      </div>

      {/* "Hear & Learn" Practice Engine Advice */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
        <div>
          <h4 className="font-semibold text-white mb-1.5 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            1. Ear Training & Breakdown
          </h4>
          <p className="text-neutral-400 leading-relaxed">
            Start at a slow tempo (e.g. 70 BPM). Listen to the relationship between the kick drum punches and the hand accents. Click any step to hear its individual tone.
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-white mb-1.5 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            2. Stickings & Muscle Memory
          </h4>
          <p className="text-neutral-400 leading-relaxed">
            Follow the R / L / K notation below each column. Practicing fills with intentional hand-lead sticking ensures clean transitions between toms without crossing arms awkwardly.
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-white mb-1.5 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            3. Speed Ramp Drills
          </h4>
          <p className="text-neutral-400 leading-relaxed">
            Engage the <strong>Speed Ramp</strong> button. ResoDrum will loop the fill pattern and automatically accelerate tempo by +5 BPM every 2 measures until you reach target performance speed.
          </p>
        </div>
      </div>
    </div>
  );
};
