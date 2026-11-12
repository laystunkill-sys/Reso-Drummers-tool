import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Play, RotateCcw, Sliders, ShieldCheck } from 'lucide-react';
import { DrumPreset } from '../types/drum';
import { DRUM_PRESETS } from '../data/drumPresets';
import { audioEngine, PitchAnalysisResult } from '../services/audioEngine';

interface TunerSpectrumProps {
  isMicActive: boolean;
  onStartMic: () => void;
  selectedPreset: DrumPreset;
  onSelectPreset: (preset: DrumPreset) => void;
  tuningMode: 'fundamental' | 'lug';
  onToggleTuningMode: (mode: 'fundamental' | 'lug') => void;
}

interface StrikeLog {
  id: number;
  hz: number;
  note: string;
  cents: number;
  time: string;
}

export const TunerSpectrum: React.FC<TunerSpectrumProps> = ({
  isMicActive,
  onStartMic,
  selectedPreset,
  onSelectPreset,
  tuningMode,
  onToggleTuningMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pitchData, setPitchData] = useState<PitchAnalysisResult | null>(null);
  const [isPlayingRefTone, setIsPlayingRefTone] = useState(false);
  const [strikeHistory, setStrikeHistory] = useState<StrikeLog[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [customTargetHz, setCustomTargetHz] = useState<number>(selectedPreset.fundamentalHz);
  const [filterMin, setFilterMin] = useState<number>(selectedPreset.hzRange[0]);
  const [filterMax, setFilterMax] = useState<number>(selectedPreset.hzRange[1]);

  const targetHz = tuningMode === 'fundamental' 
    ? (selectedPreset.id === 'custom' ? customTargetHz : selectedPreset.fundamentalHz)
    : selectedPreset.lugTargetHz;

  // Sync target when preset changes
  useEffect(() => {
    setCustomTargetHz(selectedPreset.fundamentalHz);
    setFilterMin(selectedPreset.hzRange[0]);
    setFilterMax(selectedPreset.hzRange[1]);
    audioEngine.setFilterRange(selectedPreset.hzRange[0], selectedPreset.hzRange[1]);
  }, [selectedPreset]);

  // Handle live audio subscription
  useEffect(() => {
    const unsub = audioEngine.subscribe((result) => {
      setPitchData(result);

      if (result.isTransientHit && result.frequency > 30) {
        setStrikeHistory((prev) => [
          {
            id: Date.now(),
            hz: result.frequency,
            note: result.note,
            cents: result.cents,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          },
          ...prev.slice(0, 11),
        ]);
      }
    });

    return () => {
      unsub();
    };
  }, []);

  // Update filter bounds in audio engine
  const handleFilterChange = (min: number, max: number) => {
    setFilterMin(min);
    setFilterMax(max);
    audioEngine.setFilterRange(min, max);
  };

  // Real-time Canvas Rendering for FFT Spectrum & Target Cursors
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);

      // Draw subtle frequency grid
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      const gridFrequencies = [50, 100, 150, 200, 300, 400, 500, 600];
      const maxFreq = 650;

      gridFrequencies.forEach((f) => {
        const x = (f / maxFreq) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillText(`${f}Hz`, x + 3, height - 6);
      });

      // Draw Target Marker Line
      if (targetHz > 0 && targetHz < maxFreq) {
        const targetX = (targetHz / maxFreq) * width;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(targetX, 0);
        ctx.lineTo(targetX, height);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#f59e0b';
        ctx.font = '11px Outfit, sans-serif';
        ctx.fillText(`TARGET: ${targetHz.toFixed(1)}Hz`, targetX + 4, 16);
      }

      // Draw Spectrum Curve if active
      if (pitchData && pitchData.spectrum && pitchData.spectrum.length > 0) {
        const spectrum = pitchData.spectrum;
        const binResolution = pitchData.sampleRate / (spectrum.length * 2);

        ctx.beginPath();
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;

        let hasStarted = false;
        const maxBins = Math.min(spectrum.length, Math.floor(maxFreq / binResolution));

        for (let i = 0; i < maxBins; i++) {
          const freq = i * binResolution;
          const x = (freq / maxFreq) * width;
          // dBFS is typically -100 to 0
          const db = spectrum[i];
          const normalized = Math.max(0, Math.min(1, (db + 95) / 75));
          const y = height - normalized * (height - 24) - 12;

          if (!hasStarted) {
            ctx.moveTo(x, y);
            hasStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();

        // Fill subtle gradient below spectrum
        ctx.lineTo((maxBins * binResolution / maxFreq) * width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, 'rgba(6, 182, 212, 0.15)');
        grad.addColorStop(1, 'rgba(6, 182, 212, 0.0)');
        ctx.fillStyle = grad;
        ctx.fill();

        // Highlight detected peak frequency
        if (pitchData.frequency > 0 && pitchData.frequency < maxFreq) {
          const peakX = (pitchData.frequency / maxFreq) * width;
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(peakX, 32, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 11px JetBrains Mono, monospace';
          ctx.fillText(`${pitchData.frequency.toFixed(1)}Hz`, peakX + 6, 36);
        }
      } else {
        // Idle guide line
        ctx.fillStyle = '#475569';
        ctx.font = '12px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          isMicActive ? 'Waiting for drum strike transient...' : 'Click "Start Mic" to begin real-time tuning',
          width / 2,
          height / 2
        );
        ctx.textAlign = 'left';
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [pitchData, targetHz, isMicActive]);

  // Reference tone player
  const toggleRefTone = () => {
    if (isPlayingRefTone) {
      audioEngine.stopReferenceTone();
      setIsPlayingRefTone(false);
    } else {
      audioEngine.playReferenceTone(targetHz, 3.0);
      setIsPlayingRefTone(true);
      setTimeout(() => setIsPlayingRefTone(false), 3000);
    }
  };

  const detectedHz = pitchData?.frequency || 0;
  const hzDifference = detectedHz > 0 ? detectedHz - targetHz : 0;
  const inTuneThreshold = 1.5; // +/- 1.5 Hz is tight drum tuning!
  const isInTune = detectedHz > 0 && Math.abs(hzDifference) <= inTuneThreshold;

  // Gauge needle rotation (-45 deg for flat, +45 deg for sharp)
  const needleAngle = detectedHz > 0
    ? Math.max(-45, Math.min(45, (hzDifference / 15) * 45))
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Console Strip: Drum Preset Selector & Mode Buttons */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Preset Selector */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs uppercase tracking-wider text-neutral-400 font-mono">
            Drum Target
          </label>
          <div className="flex flex-wrap gap-1.5">
            {DRUM_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => onSelectPreset(preset)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  selectedPreset.id === preset.id
                    ? 'bg-amber-500 text-black font-semibold shadow-sm'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Mode Selector & Reference Tone */}
        <div className="flex items-center gap-2">
          {/* Tuning Mode Toggle: Fundamental vs Lug */}
          <div className="flex items-center bg-neutral-950 p-1 rounded-lg border border-neutral-800">
            <button
              onClick={() => onToggleTuningMode('fundamental')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                tuningMode === 'fundamental'
                  ? 'bg-neutral-800 text-amber-400 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Fundamental Mode
            </button>
            <button
              onClick={() => onToggleTuningMode('lug')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                tuningMode === 'lug'
                  ? 'bg-neutral-800 text-amber-400 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Lug Pitch Mode
            </button>
          </div>

          {/* Reference Tone Player */}
          <button
            onClick={toggleRefTone}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              isPlayingRefTone
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-700'
            }`}
            title="Play target pitch tone through speakers"
          >
            {isPlayingRefTone ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-neutral-400" />}
            <span>Tone ({targetHz}Hz)</span>
          </button>
        </div>
      </div>

      {/* Main Tuner Gauge & Telemetry Display */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Analog Strobe Meter & Primary Readout (7 cols) */}
        <div className="lg:col-span-7 bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-neutral-400 font-mono mb-2">
              <span>ACOUSTIC RESONANCE TUNER</span>
              <span className="flex items-center gap-1.5">
                <span className="text-neutral-500">MODE:</span>
                <span className="text-amber-400 uppercase font-semibold">
                  {tuningMode === 'fundamental' ? 'Fundamental Note' : 'Rim Lug Tension'}
                </span>
              </span>
            </div>

            {/* Target & Note Banner */}
            <div className="flex items-baseline justify-between border-b border-neutral-800 pb-4 mb-4">
              <div>
                <span className="text-xs text-neutral-400 font-medium">Target Frequency</span>
                <div className="text-xl font-bold font-mono text-white flex items-baseline gap-2">
                  <span>{targetHz.toFixed(1)}</span>
                  <span className="text-xs text-neutral-500 font-mono">Hz</span>
                  <span className="text-sm font-semibold text-amber-400 ml-2">
                    {tuningMode === 'fundamental' ? selectedPreset.fundamentalNote : selectedPreset.lugTargetNote}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs text-neutral-400 font-medium">Deviation</span>
                <div className={`text-xl font-bold font-mono ${
                  detectedHz === 0
                    ? 'text-neutral-500'
                    : isInTune
                    ? 'text-emerald-400'
                    : hzDifference > 0
                    ? 'text-amber-400'
                    : 'text-cyan-400'
                }`}>
                  {detectedHz === 0
                    ? '--'
                    : `${hzDifference > 0 ? '+' : ''}${hzDifference.toFixed(1)} Hz`}
                </div>
              </div>
            </div>
          </div>

          {/* Curved Meter Dial Representation */}
          <div className="relative my-4 flex flex-col items-center justify-center">
            {/* Meter Scale Arc */}
            <div className="w-72 h-36 border-t-4 border-l-4 border-r-4 border-neutral-700 rounded-t-full relative flex items-end justify-center overflow-hidden bg-neutral-950/60 shadow-inner">
              {/* Tick Marks */}
              <div className="absolute top-2 w-full flex justify-between px-6 text-[10px] font-mono text-neutral-500">
                <span>-15Hz</span>
                <span>-5Hz</span>
                <span className="text-emerald-400 font-bold">0</span>
                <span>+5Hz</span>
                <span>+15Hz</span>
              </div>

              {/* In-tune sweetspot highlight zone */}
              <div className="absolute top-1 w-12 h-6 border-t-4 border-emerald-400 rounded-t-full"></div>

              {/* Center Needle */}
              <div
                className="w-1.5 h-28 bg-amber-400 origin-bottom transition-transform duration-150 rounded-t shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                style={{
                  transform: `rotate(${needleAngle}deg)`,
                }}
              />

              {/* Pivot Cap */}
              <div className="absolute -bottom-3 w-8 h-8 rounded-full bg-neutral-800 border-2 border-amber-500"></div>
            </div>

            {/* Pitch Tuning Readout */}
            <div className="mt-4 text-center">
              <div className="text-4xl sm:text-5xl font-mono font-bold tracking-tight text-white tabular-nums">
                {detectedHz > 0 ? detectedHz.toFixed(1) : '---.-'}
                <span className="text-lg text-neutral-500 font-normal ml-2">Hz</span>
              </div>

              <div className="mt-2 flex items-center justify-center gap-3">
                <span className="text-2xl font-bold text-amber-400">
                  {pitchData?.note || '--'}
                </span>
                <span className="text-neutral-500">·</span>
                <span className={`text-sm font-mono ${
                  isInTune ? 'text-emerald-400 font-semibold' : 'text-neutral-400'
                }`}>
                  {pitchData ? `${pitchData.cents > 0 ? '+' : ''}${pitchData.cents} cents` : '0 cents'}
                </span>
                <span className="text-neutral-500">·</span>
                {isInTune ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" /> IN TUNE
                  </span>
                ) : detectedHz > 0 ? (
                  <span className={`text-xs font-semibold ${hzDifference > 0 ? 'text-amber-400' : 'text-cyan-400'}`}>
                    {hzDifference > 0 ? 'TIGHT (SHARP) · LOOSEN' : 'LOOSE (FLAT) · TIGHTEN'}
                  </span>
                ) : (
                  <span className="text-xs text-neutral-500">STRIKE DRUM</span>
                )}
              </div>
            </div>
          </div>

          {/* Action prompt if mic inactive */}
          {!isMicActive && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between">
              <span className="text-xs text-amber-200">
                Microphone is off. Enable to begin real-time pitch detection.
              </span>
              <button
                onClick={onStartMic}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded"
              >
                Enable Mic
              </button>
            </div>
          )}
        </div>

        {/* Right: Strike Log & Drum Acoustic Tuning Advice (5 cols) */}
        <div className="lg:col-span-5 bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-neutral-400 font-mono mb-3">
              <span>RECENT STRIKE TRANSIENTS</span>
              <button
                onClick={() => setStrikeHistory([])}
                className="text-neutral-500 hover:text-white flex items-center gap-1 text-[11px]"
              >
                <RotateCcw className="w-3 h-3" /> Clear
              </button>
            </div>

            {/* Strike History Table */}
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {strikeHistory.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-500">
                  Hit the drum near the center for fundamental, or 1" from a lug to capture pitch strikes.
                </div>
              ) : (
                strikeHistory.map((s) => {
                  const diff = s.hz - targetHz;
                  const inRange = Math.abs(diff) <= 1.5;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between px-3 py-2 bg-neutral-950/70 border border-neutral-800/80 rounded-lg text-xs font-mono"
                    >
                      <span className="text-neutral-500 text-[11px]">{s.time}</span>
                      <span className="font-bold text-white tabular-nums">{s.hz.toFixed(1)} Hz</span>
                      <span className="text-amber-400">{s.note}</span>
                      <span
                        className={`tabular-nums ${
                          inRange ? 'text-emerald-400 font-bold' : diff > 0 ? 'text-amber-400' : 'text-cyan-400'
                        }`}
                      >
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)} Hz
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Pro Drum Tuning Guide Card */}
          <div className="mt-4 pt-4 border-t border-neutral-800">
            <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-mono mb-2">
              Drum Tech Tuning Tip
            </h4>
            <p className="text-xs text-neutral-300 leading-relaxed">
              {tuningMode === 'fundamental'
                ? `To tune fundamental pitch (${targetHz}Hz), mute the resonant head with a towel and strike softly in the dead center of the batter head. Match both heads equally for maximum sustain, or tune bottom head higher for shorter decay.`
                : `To clear lug pitch (${targetHz}Hz), tap lightly with the stick bead 1 inch from each rim screw while resting a finger lightly in the center of the head to dampen the fundamental ring.`}
            </p>
          </div>
        </div>
      </div>

      {/* Real-Time FFT Frequency Spectrum Canvas */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-white">
              Real-Time FFT Spectrum Analyzer
            </h3>
            <span className="text-xs text-neutral-400">
              0 Hz – 650 Hz Drum Frequency Range
            </span>
          </div>

          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white font-mono"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Filter Band ({filterMin}-{filterMax} Hz)</span>
          </button>
        </div>

        {/* Filter Sliders if expanded */}
        {showAdvancedFilters && (
          <div className="mb-4 p-3 bg-neutral-950 rounded-lg border border-neutral-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-xs text-neutral-400 font-mono mb-1">
                <span>Filter Min Cutoff</span>
                <span className="text-amber-400">{filterMin} Hz</span>
              </div>
              <input
                type="range"
                min="25"
                max="200"
                value={filterMin}
                onChange={(e) => handleFilterChange(Number(e.target.value), filterMax)}
                className="w-full accent-amber-500"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs text-neutral-400 font-mono mb-1">
                <span>Filter Max Cutoff</span>
                <span className="text-amber-400">{filterMax} Hz</span>
              </div>
              <input
                type="range"
                min="100"
                max="1000"
                value={filterMax}
                onChange={(e) => handleFilterChange(filterMin, Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>
          </div>
        )}

        {/* The Live Spectrum Canvas */}
        <canvas
          ref={canvasRef}
          width={900}
          height={180}
          className="w-full h-44 rounded-lg bg-black border border-neutral-800 block"
        />

        <div className="mt-2.5 flex items-center justify-between text-[11px] text-neutral-500 font-mono">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-cyan-400 rounded-sm inline-block"></span>
              Live Resonance Curve
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-amber-400 rounded-sm inline-block"></span>
              Target Peak ({targetHz}Hz)
            </span>
          </div>
          <span>Bessel Modal Isolation (0,1 Fundamental & 1,1 Lug)</span>
        </div>
      </div>
    </div>
  );
};
