export interface Track {
  id: string;
  title: string;
  format: string;
  duration: string;
  description: string;
  genre: string[];
  file: string;
  size: number; // File size in MB
}

export interface Album {
  id: string;
  title: string;
  description: string;
  genre: string[];
  coverArt: string;
  releaseDate: string;
  tracks: Track[];
}

export interface MusicData {
  albums: Album[];
}

// Media Session Types
export interface ArtworkInfo {
  src: string;
  sizes: string;
  type: string;
}

export interface ExtractedMetadata {
  title: string;
  artist: string;
  album: string;
  artwork: ArtworkInfo[];
  genre?: string;
  year?: string;
}

export interface QueueItem {
  track: Track;
  album: Album;
  queueId: string;
  originalIndex: number; // Original position in album
  displayIndex: number;  // Current position in queue (for display)
}

export interface MediaSessionManagerEventMap {
  'metadata-updated': CustomEvent<{ track: Track; album: Album; metadata: MediaMetadata }>;
  'action-triggered': CustomEvent<{ action: string; details?: any }>;
  'playback-state-changed': CustomEvent<{ state: MediaSessionPlaybackState }>;
  'shuffle-state-changed': CustomEvent<{ isShuffled: boolean }>;
  'loop-state-changed': CustomEvent<{ isLooping: boolean }>;
  'remote-device-available': CustomEvent<{ available: boolean }>;
  'remote-device-connected': CustomEvent<{ deviceId: string; deviceName: string }>;
  'remote-playback-state-changed': CustomEvent<{ state: string; deviceId?: string }>;
  'queue-updated': CustomEvent<{ queue: QueueItem[]; currentIndex: number }>;
  'queue-reordered': CustomEvent<{ newQueue: QueueItem[]; newCurrentIndex: number }>;
  'queue-track-selected': CustomEvent<{ queueIndex: number; track: Track; shouldTogglePlayback: boolean }>;
  'queue-navigation': CustomEvent<{ direction: 'next' | 'previous'; newTrack: Track; newIndex: number }>;
}

// Music Player Types
export interface PlaybackState {
  currentTrack: Track | null;
  currentAlbum: Album | null;
  currentTrackIndex: number;
  isPlaying: boolean;
  isLooping: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  isShuffled: boolean;
  shuffledOrder: number[];
  originalOrder: number[];
  isVisible: boolean;
}

export interface PlaybackOptions {
  forceStart?: boolean;
  restart?: boolean;
  albumPlayback?: boolean;
  shuffleState?: boolean;
  trackIndex?: number;
  actualTrackIndex?: number;
  navigationPlayback?: boolean;
  preservePosition?: boolean;
}

export interface MusicPlayerEventMap {
  'track-started': CustomEvent<{ track: Track; album: Album; options?: PlaybackOptions }>;
  'track-paused': CustomEvent<{ track: Track }>;
  'track-resumed': CustomEvent<{ track: Track }>;
  'track-ended': CustomEvent<{ track: Track }>;
  'track-changed': CustomEvent<{ track: Track; album: Album; isAutoplay: boolean }>;
  'state-changed': CustomEvent<{ state: PlaybackState }>;
  'volume-changed': CustomEvent<{ volume: number }>;
  'loop-changed': CustomEvent<{ isLooping: boolean; trackTitle: string }>;
  'shuffle-changed': CustomEvent<{ isShuffled: boolean; order: number[] }>;
  'progress-updated': CustomEvent<{ currentTime: number; duration: number; percentage: number }>;
  'playback-error': CustomEvent<{ error: string; track?: Track }>;
  'track-navigation': CustomEvent<{ direction: 'next' | 'previous'; track: Track; album: Album }>;
  'player-ready': CustomEvent<{}>;
  'player-error': CustomEvent<{ error: string; track?: Track }>;
  'player-visibility-changed': CustomEvent<{ isVisible: boolean }>;
}

// Now Playing Service Types
export interface NowPlayingState {
  isVisible: boolean;
  isExpanded: boolean;
  currentTrack: Track | null;
  currentAlbum: Album | null;
  isPlaying: boolean;
  volume: number;
  isLooping: boolean;
  currentTime: number;
  duration: number;
  percentage: number;
}

export interface NowPlayingEventMap {
  'widget-show': CustomEvent<{ track: Track; album: Album }>;
  'widget-hide': CustomEvent<{}>;
  'widget-expand': CustomEvent<{}>;
  'widget-collapse': CustomEvent<{}>;
  'track-info-updated': CustomEvent<{ track: Track; album: Album }>;
  'playback-state-updated': CustomEvent<NowPlayingState>;
  'marquee-setup': CustomEvent<{ element: HTMLElement }>;
  'state-change': CustomEvent<{ state: NowPlayingState }>;
}

// Download Service Types
export interface DownloadOptions {
  maxConcurrent?: number;
  retries?: number;
  timeout?: number;
  compression?: 'STORE' | 'DEFLATE';
  compressionLevel?: number;
}

export interface DownloadProgress {
  total: number;
  completed: number;
  successful: number;
  failed: number;
  percentage: number;
  currentTrack?: string;
}

export interface DownloadEventMap {
  'download-started': CustomEvent<{ type: 'album' | 'custom' | 'track'; trackCount: number }>;
  'download-progress': CustomEvent<DownloadProgress>;
  'download-completed': CustomEvent<{
    successful: number;
    failed: number;
    total: number;
    downloadUrl?: string;
  }>;
  'download-error': CustomEvent<{ error: string; track?: Track }>;
  'track-downloaded': CustomEvent<{ track: Track; index: number; total: number }>;
  'zip-created': CustomEvent<{ downloadUrl: string; filename: string }>;
}
