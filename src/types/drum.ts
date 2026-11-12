export type DrumType = 
  | 'snare-batter'
  | 'snare-reso'
  | 'tom-10'
  | 'tom-12'
  | 'tom-13'
  | 'tom-14'
  | 'tom-16'
  | 'kick-22'
  | 'custom';

export interface DrumPreset {
  id: string;
  name: string;
  sizeInch: number;
  type: DrumType;
  defaultLugs: number;
  fundamentalHz: number;
  fundamentalNote: string;
  lugTargetHz: number;
  lugTargetNote: string;
  hzRange: [number, number]; // Display filter range
  description: string;
}

export interface LugMeasurement {
  lugIndex: number;
  hz: number | null;
  cents: number | null;
  targetHz: number;
  timestamp?: number;
}

export type HitVelocity = 'none' | 'ghost' | 'normal' | 'accent' | 'flam';

export type StickingHand = 'R' | 'L' | 'K' | 'H' | '-';

export interface DrumTrack {
  id: string;
  name: string;
  shortName: string;
  color: string;
  pitch: number;
}

export interface FillStep {
  stepIndex: number;
  hits: Record<string, HitVelocity>; // trackId -> velocity
  sticking?: StickingHand;
}

export interface FillPattern {
  id: string;
  title: string;
  genre: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Master';
  bpm: number;
  subdivision: '16th' | 'triplet' | '32nd';
  stepsCount: number; // 16 or 24 or 32
  description: string;
  steps: FillStep[];
  isCustom?: boolean;
}

export interface AudioRecording {
  id: string;
  title: string;
  blob: Blob;
  url: string;
  durationSec: number;
  createdAt: string;
  bpmEstimate?: number;
  transientsCount?: number;
  notes?: string;
}

export interface TuningReading {
  fundamentalHz: number;
  note: string;
  cents: number;
  confidence: number;
  isTransientHit: boolean;
  peakDb: number;
  timestamp: number;
}
