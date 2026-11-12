import React from 'react';
import { Mic, MicOff } from 'lucide-react';

export type ActiveTab = 'tuner' | 'lugs' | 'recorder' | 'fills';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isMicActive: boolean;
  onToggleMic: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  isMicActive,
  onToggleMic,
}) => {
  return (
    <header className="border-b border-neutral-800 bg-neutral-950/95 backdrop-blur sticky top-0 z-50 px-4 sm:px-6 py-2.5 sm:py-3.5">
      {/* Desktop & Tablet: Clean 1-row layout (md and up) */}
      <div className="hidden md:flex items-center justify-between gap-6">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <span className="text-lg font-bold tracking-tight text-white">
            ResoDrum
          </span>
          <span className="text-xs text-neutral-500 font-mono">
            Acoustic Lab
          </span>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="flex items-center gap-1.5 lg:gap-2">
          <button
            onClick={() => onTabChange('tuner')}
            className={`px-3 py-1.5 text-xs lg:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'tuner'
                ? 'bg-neutral-800 text-amber-400 font-semibold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Tuner & Spectrum
          </button>
          <button
            onClick={() => onTabChange('lugs')}
            className={`px-3 py-1.5 text-xs lg:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'lugs'
                ? 'bg-neutral-800 text-amber-400 font-semibold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Lug Balancer
          </button>
          <button
            onClick={() => onTabChange('recorder')}
            className={`px-3 py-1.5 text-xs lg:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'recorder'
                ? 'bg-neutral-800 text-amber-400 font-semibold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Sound Recorder
          </button>
          <button
            onClick={() => onTabChange('fills')}
            className={`px-3 py-1.5 text-xs lg:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'fills'
                ? 'bg-neutral-800 text-amber-400 font-semibold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Fill Lab
          </button>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggleMic}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
              isMicActive
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-950'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
            }`}
            title={isMicActive ? 'Microphone is active' : 'Click to enable microphone'}
          >
            {isMicActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5 text-neutral-400" />}
            <span>{isMicActive ? 'Mic Active' : 'Start Mic'}</span>
          </button>
        </div>
      </div>

      {/* Mobile Phone Layout: No horizontal scrolling! */}
      <div className="flex md:hidden flex-col gap-2">
        {/* Top line on phone: Brand on left, Start Mic on right */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold tracking-tight text-white">
              ResoDrum
            </span>
            <span className="text-[10px] text-neutral-500 font-mono">
              Acoustic Lab
            </span>
          </div>

          <button
            onClick={onToggleMic}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 ${
              isMicActive
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-neutral-800 text-neutral-200 border border-neutral-700'
            }`}
          >
            {isMicActive ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3 text-neutral-400" />}
            <span>{isMicActive ? 'Mic Active' : 'Start Mic'}</span>
          </button>
        </div>

        {/* Navigation Tabs 2x2 Matrix: Sound Recorder & Fill Lab placed directly under Tuner & Spectrum and Lug Balancer */}
        <nav className="grid grid-cols-2 gap-1.5 pt-0.5">
          {/* Top Row: Tuner & Spectrum and Lug Balancer */}
          <button
            onClick={() => onTabChange('tuner')}
            className={`py-1.5 px-2 text-xs font-medium rounded-md text-center transition-colors truncate ${
              activeTab === 'tuner'
                ? 'bg-neutral-800 text-amber-400 font-semibold border border-neutral-700'
                : 'bg-neutral-900/80 text-neutral-400 hover:text-white border border-neutral-800'
            }`}
          >
            Tuner & Spectrum
          </button>
          <button
            onClick={() => onTabChange('lugs')}
            className={`py-1.5 px-2 text-xs font-medium rounded-md text-center transition-colors truncate ${
              activeTab === 'lugs'
                ? 'bg-neutral-800 text-amber-400 font-semibold border border-neutral-700'
                : 'bg-neutral-900/80 text-neutral-400 hover:text-white border border-neutral-800'
            }`}
          >
            Lug Balancer
          </button>

          {/* Under Row: Sound Recorder and Fill Lab */}
          <button
            onClick={() => onTabChange('recorder')}
            className={`py-1.5 px-2 text-xs font-medium rounded-md text-center transition-colors truncate ${
              activeTab === 'recorder'
                ? 'bg-neutral-800 text-amber-400 font-semibold border border-neutral-700'
                : 'bg-neutral-900/80 text-neutral-400 hover:text-white border border-neutral-800'
            }`}
          >
            Sound Recorder
          </button>
          <button
            onClick={() => onTabChange('fills')}
            className={`py-1.5 px-2 text-xs font-medium rounded-md text-center transition-colors truncate ${
              activeTab === 'fills'
                ? 'bg-neutral-800 text-amber-400 font-semibold border border-neutral-700'
                : 'bg-neutral-900/80 text-neutral-400 hover:text-white border border-neutral-800'
            }`}
          >
            Fill Lab
          </button>
        </nav>
      </div>
    </header>
  );
};
