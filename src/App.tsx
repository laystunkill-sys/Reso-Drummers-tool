/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header, ActiveTab } from './components/Header';
import { TunerSpectrum } from './components/TunerSpectrum';
import { LugBalancer } from './components/LugBalancer';
import { DrumRecorder } from './components/DrumRecorder';
import { FillLab } from './components/FillLab';
import { DrumPreset } from './types/drum';
import { DRUM_PRESETS } from './data/drumPresets';
import { audioEngine } from './services/audioEngine';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tuner');
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  const [selectedPreset, setSelectedPreset] = useState<DrumPreset>(DRUM_PRESETS[0]);
  const [tuningMode, setTuningMode] = useState<'fundamental' | 'lug'>('fundamental');

  // Shared state for transferring recorded BPM to Fill Lab
  const [transferredBpm, setTransferredBpm] = useState<number | undefined>(undefined);
  const [transferredTitle, setTransferredTitle] = useState<string | undefined>(undefined);

  // Toggle Microphone
  const handleToggleMic = async () => {
    if (isMicActive) {
      audioEngine.stop();
      setIsMicActive(false);
    } else {
      const ok = await audioEngine.initMicrophone();
      if (ok) {
        setIsMicActive(true);
      } else {
        alert('Could not start microphone. Please ensure microphone permissions are granted in your browser.');
      }
    }
  };

  // Handle transfer from Recorder to Fill Lab
  const handleSendToFillLab = (bpm: number, title: string) => {
    setTransferredBpm(bpm);
    setTransferredTitle(title);
    setActiveTab('fills');
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* Top Bar adhering to Top Bar Contract */}
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        isMicActive={isMicActive}
        onToggleMic={handleToggleMic}
      />

      {/* Main Workspace Stage */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-x-hidden">
        {activeTab === 'tuner' && (
          <TunerSpectrum
            isMicActive={isMicActive}
            onStartMic={handleToggleMic}
            selectedPreset={selectedPreset}
            onSelectPreset={setSelectedPreset}
            tuningMode={tuningMode}
            onToggleTuningMode={setTuningMode}
          />
        )}

        {activeTab === 'lugs' && (
          <LugBalancer
            preset={selectedPreset}
            isMicActive={isMicActive}
            onStartMic={handleToggleMic}
          />
        )}

        {activeTab === 'recorder' && (
          <DrumRecorder onSendToFillLab={handleSendToFillLab} />
        )}

        {activeTab === 'fills' && (
          <FillLab
            initialBpm={transferredBpm}
            initialTitle={transferredTitle}
          />
        )}
      </main>

      {/* Clean, quiet footer without telemetry clutter */}
      <footer className="border-t border-neutral-900 bg-neutral-950/80 px-6 py-4 text-xs text-neutral-500 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span>ResoDrum Acoustic Pitch & Fill Lab</span>
          <span>·</span>
          <span>Calibrated for 6" to 24" Acoustic Drums</span>
          <span>·</span>
          <span>Bessel Mode (0,1) & (1,1) FFT</span>
        </div>
        <div>
          <span>Web Audio DSP Engine</span>
        </div>
      </footer>
    </div>
  );
}
