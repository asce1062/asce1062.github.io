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

// Error types
export interface BridgeError {
  code: 'METADATA_INVALID' | 'PLAYBACK_FAILED' | 'QUEUE_ERROR' |
        'NETWORK_ERROR' | 'PERMISSION_DENIED' | 'BRIDGE_DISCONNECTED' |
        'NOTIFICATION_FAILED' | 'ACTION_FAILED';
  message: string;
  timestamp: number;
  context?: any;
  recoverable: boolean;
}

// Rich Media Notification Metadata (MediaCompat-style)
export interface NotificationMetadata {
  // Core track info
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  durationMs: number;
  isPlaying: boolean;

  // Additional metadata for rich notifications
  trackId: string;
  albumId: string;
  genre?: string;
  year?: string;

  // Rich Media Styling (MediaCompat-style)
  useArtworkBackground: boolean;          // Use album art as notification background
  showLargeIcon: boolean;                 // Show large album art icon
  enableLockscreenControls: boolean;      // Show controls on lockscreen
  enableCompactView: boolean;             // Enable compact notification view

  // Playback Position (for lockscreen scrubbing)
  currentPositionMs?: number;

  // Media Session Integration
  enableMediaSession: boolean;            // Enable Android MediaSession integration
  enableCasting: boolean;                 // Enable casting to connected devices
  mediaSessionId?: string;               // Unique session identifier

  // Connected Device Broadcasting
  broadcastToDevices: boolean;           // Broadcast to connected devices (Bluetooth, etc)
  deviceTypes?: string[];                // Types of devices to broadcast to ['bluetooth', 'wifi', 'chromecast']

  // Notification Behavior
  priority: 'low' | 'default' | 'high' | 'max';  // Notification priority
  category: 'media' | 'transport';              // Android notification category
  showWhen: boolean;                            // Show timestamp
  ongoing: boolean;                             // Make notification persistent during playback

  // Background Playback Support
  backgroundPlayback?: boolean;                  // Enable background playback
  allowInBackground?: boolean;                   // Allow playback when app is backgrounded

  // Actions Configuration
  availableActions: NotificationAction[];        // Which actions to show
  customActions?: { action: string; icon: string; title: string }[];  // Custom actions
}

export type NotificationAction = 'play' | 'pause' | 'next' | 'previous' | 'favorite' | 'share' | 'shuffle' | 'loop';

// Native MediaSession Bridge Interface (for true native media experience)
export interface SimplifiedAndroidBridge {
  // MediaSession API methods (replaces custom notifications)
  updateMediaSession(metadataJson: string, playbackStateJson: string): void;
  clearMediaSession(): void;

  // MediaSession lifecycle
  setMediaSessionActive(active: boolean): void;

  // Error reporting
  reportError(errorJson: string): void;
}

// MediaSession Metadata (Android MediaMetadata format)
export interface MediaSessionMetadata {
  // Required fields
  [key: string]: string | number;

  // Standard MediaMetadata keys
  'android.media.metadata.TITLE': string;
  'android.media.metadata.ARTIST': string;
  'android.media.metadata.ALBUM': string;
  'android.media.metadata.DURATION': number;           // Duration in ms
  'android.media.metadata.ART_URI': string;            // Album art URI

  // Optional fields for rich experience
  'android.media.metadata.ALBUM_ART_URI'?: string;     // Album art URI (alternative)
  'android.media.metadata.DISPLAY_TITLE'?: string;     // Display title
  'android.media.metadata.DISPLAY_SUBTITLE'?: string;  // Display subtitle (artist)
  'android.media.metadata.DISPLAY_DESCRIPTION'?: string; // Display description (album)
  'android.media.metadata.GENRE'?: string;
  'android.media.metadata.DATE'?: string;              // Release date
  'android.media.metadata.YEAR'?: number;              // Release year
  'android.media.metadata.TRACK_NUMBER'?: number;
  'android.media.metadata.NUM_TRACKS'?: number;
  'android.media.metadata.ALBUM_ARTIST'?: string;
  'android.media.metadata.COMPILATION'?: string;       // "1" if compilation
  'android.media.metadata.COMPOSER'?: string;
  'android.media.metadata.WRITER'?: string;
  'android.media.metadata.AUTHOR'?: string;
  'android.media.metadata.DISC_NUMBER'?: number;
  'android.media.metadata.BT_FOLDER_TYPE'?: number;    // Bluetooth folder type
  'android.media.metadata.MEDIA_ID'?: string;          // Unique media ID
  'android.media.metadata.MEDIA_URI'?: string;         // Media URI
  'android.media.metadata.ADVERTISEMENT'?: string;     // "1" if advertisement
  'android.media.metadata.DOWNLOAD_STATUS'?: number;   // Download status
}

// Android MediaSession PlaybackState (Android PlaybackState format)
export interface AndroidMediaSessionPlaybackState {
  // Playback state
  state: number;                    // PlaybackState.STATE_* constants
  position: number;                 // Current position in ms
  playbackSpeed: number;           // Playback speed (1.0 = normal)
  updateTime: number;              // System.currentTimeMillis()

  // Available actions (bitmask of PlaybackState.ACTION_* constants)
  actions: number;

  // Custom actions (optional)
  customActions?: {
    action: string;
    name: string;
    icon: number;                  // Resource ID
  }[];

  // Active queue item ID (optional)
  activeQueueItemId?: number;

  // Buffered position (optional)
  bufferedPosition?: number;

  // Error message (optional)
  errorMessage?: string;

  // Extras (optional)
  extras?: { [key: string]: any };
}

// Android PlaybackState constants
export const PlaybackStateConstants = {
  // States
  STATE_NONE: 0,
  STATE_STOPPED: 1,
  STATE_PAUSED: 2,
  STATE_PLAYING: 3,
  STATE_FAST_FORWARDING: 4,
  STATE_REWINDING: 5,
  STATE_BUFFERING: 6,
  STATE_ERROR: 7,
  STATE_CONNECTING: 8,
  STATE_SKIPPING_TO_PREVIOUS: 9,
  STATE_SKIPPING_TO_NEXT: 10,
  STATE_SKIPPING_TO_QUEUE_ITEM: 11,

  // Actions (bitmask)
  ACTION_STOP: 1,
  ACTION_PAUSE: 2,
  ACTION_PLAY: 4,
  ACTION_REWIND: 8,
  ACTION_SKIP_TO_PREVIOUS: 16,
  ACTION_SKIP_TO_NEXT: 32,
  ACTION_FAST_FORWARD: 64,
  ACTION_SET_RATING: 128,
  ACTION_SEEK_TO: 256,
  ACTION_PLAY_PAUSE: 512,
  ACTION_PLAY_FROM_MEDIA_ID: 1024,
  ACTION_PLAY_FROM_SEARCH: 2048,
  ACTION_SKIP_TO_QUEUE_ITEM: 4096,
  ACTION_PLAY_FROM_URI: 8192,
  ACTION_PREPARE: 16384,
  ACTION_PREPARE_FROM_MEDIA_ID: 32768,
  ACTION_PREPARE_FROM_SEARCH: 65536,
  ACTION_PREPARE_FROM_URI: 131072,
  ACTION_SET_REPEAT_MODE: 262144,
  ACTION_SET_SHUFFLE_MODE: 524288,
  ACTION_SET_CAPTIONING_ENABLED: 1048576,
} as const;
