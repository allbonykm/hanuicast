export interface Paper {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  authors: string;
  journal: string;
  date: string;
  originalUrl: string;
  audioUrl?: string; // Blob URL for the audio
}

export interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoading: boolean;
}

export enum LoadingState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}