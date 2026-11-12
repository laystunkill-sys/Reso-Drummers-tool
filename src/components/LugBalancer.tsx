import React, { useState, useEffect } from 'react';
import { RotateCcw, CheckCircle2, AlertCircle, ArrowUpRight, ArrowDownRight, Compass } from 'lucide-react';
import { DrumPreset, LugMeasurement } from '../types/drum';
import { audioEngine, PitchAnalysisResult } from '../services/audioEngine';

interface LugBalancerProps {
  preset: DrumPreset;
  isMicActive: boolean;
  onStartMic: () => void;
}

export const LugBalancer: React.FC<LugBalancerProps> = ({
  preset,
  isMicActive,
  onStartMic,
}) => {
  const [numLugs, setNumLugs] = useState<number>(preset.defaultLugs);
  const [activeLugIndex, setActiveLugIndex] = useState<number>(0);
  const [targetHz, setTargetHz] = useState<number>(preset.lugTargetHz);
  const [lugs, setLugs] = useState<LugMeasurement[]>([]);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [lastStrikeHz, setLastStrikeHz] = useState<number | null>(null);

  // Initialize lugs when preset or numLugs changes
  useEffect(() => {
    setNumLugs(preset.defaultLugs);
    setTargetHz(preset.lugTargetHz);
    resetLugData(preset.defaultLugs, preset.lugTargetHz);
  }, [preset]);

  const resetLugData = (count: number, target: number) => {
    const newLugs: LugMeasurement[] = Array.from({ length: count }, (_, i) => ({
      lugIndex: i,
      hz: null,
      cents: null,
      targetHz: target,
    }));
    setLugs(newLugs);
    setActiveLugIndex(0);
    setLastStrikeHz(null);
  };

  const handleNumLugsChange = (count: number) => {
    setNumLugs(count);
    resetLugData(count, targetHz);
  };

  // Listen to audio engine for drum hits near active lug
  useEffect(() => {
    const unsub = audioEngine.subscribe((result: PitchAnalysisResult) => {
      if (result.isTransientHit && result.frequency > 40 && result.confidence > 0.45) {
        const hitHz = result.frequency;
        setLastStrikeHz(hitHz);

        setLugs((prev) => {
          const updated = [...prev];
          const centsDiff = Math.round(1200 * Math.log2(hitHz / targetHz));
          updated[activeLugIndex] = {
            lugIndex: activeLugIndex,
            hz: hitHz,
            cents: centsDiff,
            targetHz,
            timestamp: Date.now(),
          };
          return updated;
        });

        // Auto advance to next lug in star/crisscross sequence or sequential
        if (autoAdvance) {
          setTimeout(() => {
            setActiveLugIndex((prev) => (prev + 1) % numLugs);
          }, 600);
        }
      }
    });

    return () => unsub();
  }, [activeLugIndex, autoAdvance, numLugs, targetHz]);

  // Calculate statistics across recorded lugs
  const measuredLugs = lugs.filter((l) => l.hz !== null) as (LugMeasurement & { hz: number })[];
  const averageHz = measuredLugs.length > 0
    ? measuredLugs.reduce((acc, curr) => acc + curr.hz, 0) / measuredLugs.length
    : null;

  const maxDeviation = measuredLugs.length > 0
    ? Math.max(...measuredLugs.map((l) => Math.abs(l.hz - targetHz)))
    : null;

  const isBalanced = measuredLugs.length === numLugs && maxDeviation !== null && maxDeviation <= 2.0;

  // Star / crisscross pairing for even tensioning:
  // e.g. for 8 lugs: 1 -> 5 -> 2 -> 6 -> 3 -> 7 -> 4 -> 8
  const getNextCrissCrossIndex = (current: number, total: number) => {
    const half = Math.floor(total / 2);
    if (current < half) {
      return current + half;
    } else {
      return (current - half + 1) % total;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Strip */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-neutral-400 font-mono">
            {preset.name}
          </span>
          <span className="text-neutral-600">|</span>
          <label className="text-xs text-neutral-400">Lugs count:</label>
          <div className="flex gap-1">
            {[6, 8, 10, 12].map((count) => (
              <button
                key={count}
                onClick={() => handleNumLugsChange(count)}
                className={`px-2.5 py-1 text-xs font-mono rounded ${
                  numLugs === count
                    ? 'bg-amber-500 text-black font-bold'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(e) => setAutoAdvance(e.target.checked)}
              className="rounded accent-amber-500"
            />
            <span>Auto-advance on strike</span>
          </label>

          <button
            onClick={() => resetLugData(numLugs, targetHz)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-400 hover:text-white bg-neutral-800 rounded-lg border border-neutral-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Map</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Circle & Lugs Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Drumhead Rim Map (7 cols) */}
        <div className="lg:col-span-7 bg-neutral-900 border border-neutral-800 rounded-xl p-4 sm:p-6 flex flex-col items-center justify-center relative min-h-[400px] sm:min-h-[460px] overflow-hidden">
          {/* Active Lug Strike Instructions */}
          <div className="w-full flex items-center justify-between text-[11px] sm:text-xs font-mono mb-2">
            <span className="text-neutral-400">
              TARGETING: <strong className="text-amber-400">LUG #{activeLugIndex + 1}</strong>
            </span>
            <span className="text-neutral-500 hidden xs:inline">
              Tap 1 inch inside screw #{activeLugIndex + 1}
            </span>
          </div>

          {/* Drum Rim Circular SVG & Interactive Lugs */}
          <div className="relative w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 my-4 sm:my-6 flex items-center justify-center max-w-full">
            {/* Outer Rim Ring */}
            <div className="absolute inset-0 rounded-full border-8 border-neutral-700 shadow-2xl bg-neutral-950 flex items-center justify-center">
              {/* Inner Drumhead Surface */}
              <div className="w-[82%] h-[82%] rounded-full border border-neutral-800 bg-neutral-900/80 flex flex-col items-center justify-center p-4 sm:p-6 text-center">
                <span className="text-[10px] sm:text-xs uppercase tracking-wider text-neutral-500 font-mono">
                  {preset.sizeInch}" {preset.type.includes('snare') ? 'SNARE' : 'TOM'} HEAD
                </span>

                <div className="my-2">
                  <div className="text-3xl sm:text-4xl font-mono font-bold text-white tabular-nums">
                    {lastStrikeHz ? `${lastStrikeHz.toFixed(1)} Hz` : `${targetHz} Hz`}
                  </div>
                  <div className="text-xs font-mono text-amber-400 mt-1">
                    TARGET: {targetHz.toFixed(1)} Hz
                  </div>
                </div>

                {averageHz ? (
                  <div className="text-xs font-mono text-neutral-400">
                    AVG: <span className="text-white font-bold">{averageHz.toFixed(1)} Hz</span>
                    <span className="ml-1 text-neutral-500">({measuredLugs.length}/{numLugs} read)</span>
                  </div>
                ) : (
                  <span className="text-xs text-neutral-500">
                    {isMicActive ? 'Awaiting stick strike...' : 'Start mic to begin reading'}
                  </span>
                )}
              </div>
            </div>

            {/* Lug Nodes arranged radially */}
            {lugs.map((lug, idx) => {
              const angleRad = (idx / numLugs) * 2 * Math.PI - Math.PI / 2;
              const radiusPercent = 46; // percentage of half-width
              const x = 50 + radiusPercent * Math.cos(angleRad);
              const y = 50 + radiusPercent * Math.sin(angleRad);

              const isActive = activeLugIndex === idx;
              const hasReading = lug.hz !== null;
              const diff = hasReading ? lug.hz! - targetHz : null;
              const isLugInTune = diff !== null && Math.abs(diff) <= 2.0;

              let nodeColor = 'bg-neutral-800 border-neutral-600 text-neutral-300';
              if (hasReading) {
                if (isLugInTune) {
                  nodeColor = 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-900/50';
                } else if (diff! > 0) {
                  nodeColor = 'bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-900/50';
                } else {
                  nodeColor = 'bg-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-900/50';
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => setActiveLugIndex(idx)}
                  className={`absolute transform -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full border-2 flex flex-col items-center justify-center transition-all cursor-pointer ${nodeColor} ${
                    isActive ? 'ring-4 ring-white ring-offset-2 ring-offset-neutral-950 scale-110 z-20' : 'hover:scale-105'
                  }`}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  title={`Lug #${idx + 1}: ${hasReading ? `${lug.hz!.toFixed(1)} Hz` : 'Not measured'}`}
                >
                  <span className="text-[10px] font-bold leading-none">#{idx + 1}</span>
                  {hasReading && (
                    <span className="text-[9px] font-mono leading-none mt-0.5">
                      {Math.round(lug.hz!)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Step Advance Buttons */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setActiveLugIndex((prev) => (prev - 1 + numLugs) % numLugs)}
              className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded font-medium"
            >
              Previous Lug
            </button>
            <button
              onClick={() => setActiveLugIndex((prev) => (prev + 1) % numLugs)}
              className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded font-medium"
            >
              Next Lug
            </button>
            <button
              onClick={() => setActiveLugIndex(getNextCrissCrossIndex(activeLugIndex, numLugs))}
              className="px-3 py-1 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-xs rounded font-medium flex items-center gap-1"
            >
              <Compass className="w-3 h-3" />
              <span>Cross-Pair (Lug #{getNextCrissCrossIndex(activeLugIndex, numLugs) + 1})</span>
            </button>
          </div>
        </div>

        {/* Right: Lug Inspection Table & Key Adjustment Recommendations (5 cols) */}
        <div className="lg:col-span-5 bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-neutral-400 font-mono mb-3">
              <span>LUG TENSION AUDIT</span>
              <span className="text-amber-400">
                {measuredLugs.length} of {numLugs} CAPTURED
              </span>
            </div>

            {/* Balance Status Banner */}
            {isBalanced ? (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-emerald-300">Drumhead Cleared & Balanced!</div>
                  <div className="text-[11px] text-emerald-400/80">
                    All lugs within 2 Hz. Pure singing tone with zero warble.
                  </div>
                </div>
              </div>
            ) : maxDeviation !== null && maxDeviation > 4.0 ? (
              <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-amber-300">Tension Imbalance Detected</div>
                  <div className="text-[11px] text-amber-400/80">
                    Max spread is {maxDeviation.toFixed(1)} Hz. Adjust highlighted lugs below.
                  </div>
                </div>
              </div>
            ) : null}

            {/* List of Lugs with Drum Key Suggestions */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {lugs.map((lug, idx) => {
                const isSelected = activeLugIndex === idx;
                const hasHz = lug.hz !== null;
                const diff = hasHz ? lug.hz! - targetHz : null;
                const inRange = diff !== null && Math.abs(diff) <= 2.0;

                // Estimated drum key turn (1/8 turn is roughly 4-6 Hz on 2.3mm triple-flanged hoops)
                let recommendation = 'Waiting for strike';
                let isUp = false;
                if (hasHz) {
                  if (inRange) {
                    recommendation = 'Perfect tension';
                  } else if (diff! > 8) {
                    recommendation = 'Loosen counter-clockwise ~1/4 turn';
                  } else if (diff! > 0) {
                    recommendation = 'Loosen counter-clockwise ~1/8 turn';
                  } else if (diff! < -8) {
                    recommendation = 'Tighten clockwise ~1/4 turn';
                    isUp = true;
                  } else {
                    recommendation = 'Tighten clockwise ~1/8 turn';
                    isUp = true;
                  }
                }

                return (
                  <div
                    key={idx}
                    onClick={() => setActiveLugIndex(idx)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-neutral-800 border-amber-400 ring-1 ring-amber-400'
                        : 'bg-neutral-950/80 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-full bg-neutral-800 text-neutral-300 font-bold font-mono text-[11px] flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-semibold text-white">
                          {hasHz ? `${lug.hz!.toFixed(1)} Hz` : '--.- Hz'}
                        </div>
                        <div className="text-[11px] text-neutral-400 flex items-center gap-1">
                          {hasHz && !inRange && (
                            isUp ? <ArrowUpRight className="w-3 h-3 text-cyan-400 inline" /> : <ArrowDownRight className="w-3 h-3 text-amber-400 inline" />
                          )}
                          <span>{recommendation}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      {hasHz ? (
                        <span
                          className={`font-bold tabular-nums ${
                            inRange
                              ? 'text-emerald-400'
                              : diff! > 0
                              ? 'text-amber-400'
                              : 'text-cyan-400'
                          }`}
                        >
                          {diff! > 0 ? '+' : ''}{diff!.toFixed(1)} Hz
                        </span>
                      ) : (
                        <span className="text-neutral-600">Pending</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Drum Tech Advice */}
          <div className="mt-4 pt-4 border-t border-neutral-800 text-[11px] text-neutral-400">
            <strong>Cross-Tuning Rule:</strong> Always tune opposing lugs across the drum diameter in pairs to ensure hoop seats flat and prevents warping.
          </div>
        </div>
      </div>
    </div>
  );
};
