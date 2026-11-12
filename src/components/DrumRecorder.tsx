import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Trash2, Download, FastForward, Repeat, Sparkles, Clock, Music } from 'lucide-react';
import { AudioRecording } from '../types/drum';

interface DrumRecorderProps {
  onSendToFillLab?: (bpm: number, title: string) => void;
}

export const DrumRecorder: React.FC<DrumRecorderProps> = ({ onSendToFillLab }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordings, setRecordings] = useState<AudioRecording[]>([]);
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isLooping, setIsLooping] = useState(false);

  // References
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveAudioCtxRef = useRef<AudioContext | null>(null);
  const liveAnalyserRef = useRef<AnalyserNode | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Start Live Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      liveStreamRef.current = stream;
      audioChunksRef.current = [];

      // Setup audio analysis for live waveform visualization
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      liveAudioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      liveAnalyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);

        // Analyze transient hits & estimate BPM from the recorded audio
        const { bpm, transients } = await analyzeAudioBuffer(audioBlob);

        const newRec: AudioRecording = {
          id: `rec-${Date.now()}`,
          title: `Drum Take #${recordings.length + 1}`,
          blob: audioBlob,
          url: audioUrl,
          durationSec: recordDuration,
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bpmEstimate: bpm,
          transientsCount: transients,
        };

        setRecordings((prev) => [newRec, ...prev]);
        setActiveRecordingId(newRec.id);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordDuration(0);

      recordTimerRef.current = window.setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);

      // Start live waveform loop
      drawLiveWaveform();
    } catch (err) {
      console.error('Error starting recording:', err);
      alert('Could not access microphone for recording. Please allow microphone permissions.');
    }
  };

  // Stop Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((t) => t.stop());
      liveStreamRef.current = null;
    }
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (liveAudioCtxRef.current) {
      liveAudioCtxRef.current.close();
      liveAudioCtxRef.current = null;
    }
    setIsRecording(false);
  };

  // Live Waveform Canvas Drawer
  const drawLiveWaveform = () => {
    const canvas = liveCanvasRef.current;
    const analyser = liveAnalyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);

    const render = () => {
      analyser.getFloatTimeDomainData(dataArray);

      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ef4444'; // Red recording wave
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i];
        const y = (v + 1) * (canvas.height / 2);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();
  };

  // Analyze drum transient spikes & estimate BPM
  const analyzeAudioBuffer = async (blob: Blob): Promise<{ bpm: number; transients: number }> => {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const offlineCtx = new AudioCtx();
      const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
      const data = audioBuffer.getChannelData(0);

      // Onset detection: identify steep volume spikes (drum hits)
      const peaks: number[] = [];
      const windowSize = Math.floor(audioBuffer.sampleRate * 0.05); // 50ms window
      let prevEnergy = 0;

      for (let i = 0; i < data.length; i += windowSize) {
        let energy = 0;
        const end = Math.min(i + windowSize, data.length);
        for (let j = i; j < end; j++) {
          energy += data[j] * data[j];
        }
        if (energy > 0.015 && energy > prevEnergy * 2.2) {
          peaks.push(i / audioBuffer.sampleRate);
        }
        prevEnergy = energy;
      }

      offlineCtx.close();

      // Estimate tempo from intervals between peaks
      let estimatedBpm = 110;
      if (peaks.length >= 4) {
        const intervals: number[] = [];
        for (let i = 1; i < peaks.length; i++) {
          const dt = peaks[i] - peaks[i - 1];
          if (dt > 0.15 && dt < 1.5) {
            intervals.push(dt);
          }
        }
        if (intervals.length > 0) {
          intervals.sort((a, b) => a - b);
          const medianInterval = intervals[Math.floor(intervals.length / 2)];
          const rawBpm = Math.round(60 / medianInterval);
          // Normalize to common 70-170 bpm range
          estimatedBpm = rawBpm;
          if (estimatedBpm < 70) estimatedBpm *= 2;
          if (estimatedBpm > 180) estimatedBpm = Math.round(estimatedBpm / 2);
        }
      }

      return { bpm: estimatedBpm, transients: peaks.length };
    } catch (e) {
      return { bpm: 110, transients: 0 };
    }
  };

  // Active audio player handlers
  const activeRecording = recordings.find((r) => r.id === activeRecordingId);

  const togglePlayback = () => {
    if (!audioElementRef.current || !activeRecording) return;
    if (isPlaying) {
      audioElementRef.current.pause();
      setIsPlaying(false);
    } else {
      audioElementRef.current.playbackRate = playbackRate;
      audioElementRef.current.loop = isLooping;
      audioElementRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioElementRef.current) {
      audioElementRef.current.playbackRate = rate;
    }
  };

  const handleDelete = (id: string) => {
    setRecordings((prev) => prev.filter((r) => r.id !== id));
    if (activeRecordingId === id) {
      setActiveRecordingId(null);
      setIsPlaying(false);
    }
  };

  const formatSec = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="space-y-6">
      {/* Hidden audio element for playback */}
      {activeRecording && (
        <audio
          ref={audioElementRef}
          src={activeRecording.url}
          onTimeUpdate={() => {
            if (audioElementRef.current) {
              setPlaybackTime(audioElementRef.current.currentTime);
            }
          }}
          onEnded={() => {
            if (!isLooping) setIsPlaying(false);
          }}
        />
      )}

      {/* Main Recording Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Recording Studio Cockpit (7 cols) */}
        <div className="lg:col-span-7 bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-neutral-400 font-mono mb-4">
              <span>REAL-TIME DRUM ACOUSTIC RECORDER</span>
              <span className="flex items-center gap-1.5">
                {isRecording ? (
                  <span className="text-red-400 font-bold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    RECORDING LIVE
                  </span>
                ) : (
                  <span className="text-neutral-500">STANDBY</span>
                )}
              </span>
            </div>

            {/* Live Waveform Canvas */}
            <div className="rounded-lg overflow-hidden border border-neutral-800 bg-black relative mb-4">
              <canvas
                ref={liveCanvasRef}
                width={800}
                height={160}
                className="w-full h-36 block"
              />
              {!isRecording && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-neutral-500 font-mono">
                  Press Record Drum Hit / Fill to capture live sound
                </div>
              )}
            </div>

            {/* Record Control Bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-red-950 transition-all"
                  >
                    <Square className="w-4 h-4 fill-white" />
                    <span>Stop Recording</span>
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-red-950 transition-all"
                  >
                    <Mic className="w-4 h-4" />
                    <span>Record Drum Hit / Fill</span>
                  </button>
                )}

                <div className="text-xl font-mono font-bold text-white tabular-nums">
                  {formatSec(recordDuration)}
                </div>
              </div>

              <span className="text-xs text-neutral-400 hidden sm:inline">
                Zero DSP processing · Raw acoustic transients
              </span>
            </div>
          </div>

          {/* Active Audio Playback Player */}
          {activeRecording && (
            <div className="mt-6 pt-5 border-t border-neutral-800">
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <span className="text-white font-semibold">{activeRecording.title}</span>
                <span className="text-neutral-400">
                  {formatSec(playbackTime)} / {formatSec(activeRecording.durationSec)}
                </span>
              </div>

              {/* Progress Seek Bar */}
              <input
                type="range"
                min="0"
                max={activeRecording.durationSec || 1}
                step="0.05"
                value={playbackTime}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setPlaybackTime(val);
                  if (audioElementRef.current) {
                    audioElementRef.current.currentTime = val;
                  }
                }}
                className="w-full accent-amber-500 mb-3"
              />

              {/* Player Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlayback}
                    className="p-2.5 bg-amber-500 hover:bg-amber-400 text-black rounded-lg transition-colors"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-black" />}
                  </button>

                  <button
                    onClick={() => {
                      setIsLooping(!isLooping);
                      if (audioElementRef.current) audioElementRef.current.loop = !isLooping;
                    }}
                    className={`p-2 rounded-lg border transition-colors ${
                      isLooping
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                        : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                    }`}
                    title="Loop fill playback"
                  >
                    <Repeat className="w-4 h-4" />
                  </button>
                </div>

                {/* Speed Multiplier for slow-motion breakdown */}
                <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs font-mono">
                  <span className="text-[10px] text-neutral-500 px-1">SPEED:</span>
                  {[0.5, 0.75, 1.0, 1.25].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => handleRateChange(rate)}
                      className={`px-2 py-0.5 rounded ${
                        playbackRate === rate
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>

                {/* Transfer to Fill Lab Button */}
                {onSendToFillLab && activeRecording.bpmEstimate && (
                  <button
                    onClick={() => onSendToFillLab(activeRecording.bpmEstimate!, activeRecording.title)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-neutral-700 rounded-lg text-xs font-medium"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Send to Fill Lab ({activeRecording.bpmEstimate} BPM)</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Library of Recorded Takes & Transient Breakdown (5 cols) */}
        <div className="lg:col-span-5 bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-neutral-400 font-mono mb-3">
              <span>RECORDED TAKES LIBRARY</span>
              <span className="text-neutral-500">{recordings.length} TAKES</span>
            </div>

            {/* List of Recordings */}
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {recordings.length === 0 ? (
                <div className="py-12 text-center text-xs text-neutral-500">
                  No takes recorded yet. Hit the record button to capture drum fills, tuning comparisons, or groove ideas.
                </div>
              ) : (
                recordings.map((rec) => {
                  const isSelected = activeRecordingId === rec.id;
                  return (
                    <div
                      key={rec.id}
                      onClick={() => {
                        setActiveRecordingId(rec.id);
                        setIsPlaying(false);
                      }}
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-neutral-800 border-amber-400'
                          : 'bg-neutral-950/70 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="font-semibold text-white flex items-center gap-2">
                          <span>{rec.title}</span>
                          {rec.bpmEstimate && (
                            <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                              ~{rec.bpmEstimate} BPM
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-400 flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-neutral-500" />
                            {formatSec(rec.durationSec)}
                          </span>
                          <span>·</span>
                          <span>{rec.createdAt}</span>
                          {rec.transientsCount ? (
                            <>
                              <span>·</span>
                              <span>{rec.transientsCount} drum hits</span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <a
                          href={rec.url}
                          download={`${rec.title.replace(/\s+/g, '_')}.webm`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 text-neutral-400 hover:text-white rounded hover:bg-neutral-700"
                          title="Download recording"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(rec.id);
                          }}
                          className="p-1.5 text-neutral-400 hover:text-red-400 rounded hover:bg-neutral-700"
                          title="Delete take"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Quick Learning Advice */}
          <div className="mt-4 pt-4 border-t border-neutral-800 text-[11px] text-neutral-400">
            <strong>Slow-Down Technique:</strong> Set playback to <strong>0.5x</strong> or <strong>0.75x</strong> with loop enabled to transcribe fast gospel chops and double-stroke roll transitions cleanly.
          </div>
        </div>
      </div>
    </div>
  );
};
