import musicData from '../data/music.json';
import type { Track, Album } from '../types/music';

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
}

class StateManager {
  private static readonly STORAGE_KEY = 'musicPlayerState';
  private static readonly MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

  static save(state: PlaybackState): void {
    try {
      const stateToSave = {
        ...state,
        timestamp: Date.now(),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (error) {
      console.warn('Failed to save music player state:', error);
    }
  }

  static restore(): Partial<PlaybackState> | null {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Check if state is recent
        if (Date.now() - (parsed.timestamp || 0) < this.MAX_AGE) {
          delete parsed.timestamp;
          return parsed;
        }
      }
    } catch (error) {
      console.warn('Failed to restore music player state:', error);
    }
    return null;
  }

  static clear(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

export class MusicPlayerService extends EventTarget {
  private static instance: MusicPlayerService | null = null;
  private audioElement: HTMLAudioElement;
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private progressUpdateInterval: number | null = null;
  private stateCheckInterval: number | null = null;
  private lastSavedTime = 0;
  private isTabActive = true;
  private activePlayRequest: AbortController | null = null;
  private hasPendingRestoration = false;

  private state: PlaybackState = {
    currentTrack: null,
    currentAlbum: null,
    currentTrackIndex: 0,
    isPlaying: false,
    isLooping: false,
    volume: 0.7,
    currentTime: 0,
    duration: 0,
    isShuffled: false,
    shuffledOrder: [],
    originalOrder: [],
    isVisible: false,
  };

  private constructor() {
    super();
    this.createGlobalAudioElement();
    this.createAudioContextIfNeeded();
    this.setupAudioEventListeners();
    this.setupVisibilityHandling();
    this.setupUserInteractionDetection();
    this.startProgressUpdater();
    this.startStateChecker();
    this.restoreState();
  }

  // Singleton pattern
  public static getInstance(): MusicPlayerService {
    if (!MusicPlayerService.instance) {
      MusicPlayerService.instance = new MusicPlayerService();
    }
    return MusicPlayerService.instance;
  }

  private createGlobalAudioElement(): void {
    // Check if global audio element already exists
    let existingAudio = document.getElementById('global-audio-player') as HTMLAudioElement;

    if (!existingAudio) {
      // Create new global audio element
      existingAudio = document.createElement('audio');
      existingAudio.id = 'global-audio-player';
      existingAudio.preload = 'metadata';
      existingAudio.style.display = 'none';
      existingAudio.setAttribute('playsinline', 'true');
      existingAudio.setAttribute('webkit-playsinline', 'true');
      document.body.appendChild(existingAudio);
    }

    this.audioElement = existingAudio;
    this.audioElement.volume = this.state.volume;
  }

  private setupAudioEventListeners(): void {
    this.audioElement.addEventListener('loadedmetadata', () => {
      this.state.duration = this.audioElement.duration;
      this.emitEvent('progress-updated', {
        currentTime: this.state.currentTime,
        duration: this.state.duration,
        percentage: this.state.duration ? (this.state.currentTime / this.state.duration) * 100 : 0,
      });
    });

    this.audioElement.addEventListener('timeupdate', () => {
      this.state.currentTime = this.audioElement.currentTime;
      this.emitEvent('progress-updated', {
        currentTime: this.state.currentTime,
        duration: this.state.duration,
        percentage: this.state.duration ? (this.state.currentTime / this.state.duration) * 100 : 0,
      });
    });

    this.audioElement.addEventListener('play', () => {
      this.state.isPlaying = true;
      this.createAudioContextIfNeeded();
      this.emitStateChanged();
      this.saveState();
    });

    this.audioElement.addEventListener('pause', () => {
      this.state.isPlaying = false;
      this.emitStateChanged();
      this.saveState();
    });

    this.audioElement.addEventListener('ended', () => {
      this.handleTrackEnd();
    });

    this.audioElement.addEventListener('error', (error) => {
      console.error('Audio playback error:', error);
      this.emitEvent('playback-error', {
        error: 'Audio playback failed',
        track: this.state.currentTrack || undefined,
      });
    });

    // Handle audio interruptions
    this.audioElement.addEventListener('suspend', () => this.saveState());
    this.audioElement.addEventListener('resume', () => this.checkAndRestorePlayback());
    this.audioElement.addEventListener('stalled', () => this.handleAudioStall());
    this.audioElement.addEventListener('canplaythrough', () => this.handleCanPlayThrough());
  }

  private setupVisibilityHandling(): void {
    document.addEventListener('visibilitychange', () => {
      this.isTabActive = !document.hidden;
      if (this.isTabActive) {
        this.checkAndRestorePlayback();
      } else {
        this.saveState();
      }
    });

    window.addEventListener('focus', () => {
      this.isTabActive = true;
      this.checkAndRestorePlayback();
    });

    window.addEventListener('blur', () => {
      this.isTabActive = false;
      this.saveState();
    });

    window.addEventListener('beforeunload', () => this.saveState());
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        this.checkAndRestorePlayback();
      }
    });
    window.addEventListener('pagehide', () => this.saveState());
  }

  private setupUserInteractionDetection(): void {
    // Handle first user interaction to resume AudioContext and pending restoration
    const handleFirstInteraction = () => {
      this.createAudioContextIfNeeded();

      // If we have a pending restoration, resume playback
      if (this.hasPendingRestoration && this.state.currentTrack && this.state.currentAlbum) {
        console.log('🎵 Resuming restored playback after user interaction');
        this.hasPendingRestoration = false;
        this.resume();
      }
    };

    document.addEventListener('click', handleFirstInteraction, { once: true });
    document.addEventListener('keydown', handleFirstInteraction, { once: true });
    document.addEventListener('touchstart', handleFirstInteraction, { once: true });
  }

  private async createAudioContextIfNeeded(): Promise<boolean> {

    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.gainNode = this.audioContext.createGain();
        this.source = this.audioContext.createMediaElementSource(this.audioElement);

        this.source.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);
        this.gainNode.gain.value = this.state.volume;

        console.log('🎵 AudioContext created successfully');
        return true;
      } catch (error) {
        console.warn('Web Audio API not supported:', error);
        return false;
      }
    }

    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        console.log('🎵 AudioContext resumed');
        return true;
      } catch (error) {
        console.warn('Failed to resume AudioContext:', error);
        return false;
      }
    }

    return true;
  }

  private startProgressUpdater(): void {
    this.progressUpdateInterval = window.setInterval(() => {
      if (this.state.isPlaying && !this.audioElement.paused) {
        this.state.currentTime = this.audioElement.currentTime;
        this.emitEvent('progress-updated', {
          currentTime: this.state.currentTime,
          duration: this.state.duration,
          percentage: this.state.duration
            ? (this.state.currentTime / this.state.duration) * 100
            : 0,
        });

        // Save progress periodically
        if (Math.abs(this.state.currentTime - this.lastSavedTime) > 5) {
          this.lastSavedTime = this.state.currentTime;
          this.saveState();
        }
      }
    }, 100);
  }

  private startStateChecker(): void {
    this.stateCheckInterval = window.setInterval(() => {
      if (this.state.isPlaying && this.audioElement.paused) {
        console.log('Detected unexpected pause, attempting to resume...');
        this.audioElement.play().catch((error) => {
          console.warn('Failed to auto-resume:', error);
        });
      }

      if (this.state.isPlaying) {
        this.saveState();
      }
    }, 2000);
  }

  private handleTrackEnd(): void {
    this.state.isPlaying = false;

    if (this.state.currentTrack) {
      this.emitEvent('track-ended', { track: this.state.currentTrack });
    }

    if (this.state.isLooping && this.state.currentTrack) {
      console.log(`🎵 Looping track: ${this.state.currentTrack.title}`);
      this.audioElement.currentTime = 0;
      setTimeout(() => {
        this.audioElement.play().catch((error) => {
          console.error('Failed to loop track:', error);
        });
      }, 50);
    } else {
      // Auto-advance to next track
      setTimeout(() => {
        this.nextTrack();
      }, 100);
    }
  }

  private handleAudioStall(): void {
    console.warn('Audio stalled, attempting to resume...');
    if (this.state.isPlaying) {
      setTimeout(() => {
        this.audioElement.play().catch((error) => {
          console.error('Failed to resume after stall:', error);
        });
      }, 1000);
    }
  }

  private handleCanPlayThrough(): void {
    if (this.state.isPlaying && this.audioElement.paused) {
      this.audioElement.play().catch((error) => {
        console.error('Failed to resume after canplaythrough:', error);
      });
    }
  }

  private checkAndRestorePlayback(): void {
    setTimeout(() => {
      try {
        const savedState = StateManager.restore();
        if (savedState?.isPlaying && savedState.currentTrack) {
          if (this.audioElement.src !== savedState.currentTrack.file) {
            this.audioElement.src = savedState.currentTrack.file;
            this.audioElement.currentTime = savedState.currentTime || 0;
          }

          if (this.audioElement.paused) {
            this.audioElement.play().catch((error) => {
              console.log('Could not auto-resume playback:', error.message);
            });
          }
        }
      } catch (error) {
        console.error('Failed to restore playback:', error);
      }
    }, 100);
  }

  private initializeShuffleOrder(): void {
    if (!this.state.currentAlbum) return;

    this.state.originalOrder = Array.from(
      { length: this.state.currentAlbum.tracks.length },
      (_, i) => i
    );
    this.generateShuffledOrder();
  }

  private generateShuffledOrder(): void {
    if (!this.state.currentAlbum) return;

    this.state.shuffledOrder = [...this.state.originalOrder];

    // Fisher-Yates shuffle
    for (let i = this.state.shuffledOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.state.shuffledOrder[i], this.state.shuffledOrder[j]] = [
        this.state.shuffledOrder[j],
        this.state.shuffledOrder[i],
      ];
    }
  }

  private getCurrentOrder(): number[] {
    return this.state.isShuffled ? this.state.shuffledOrder : this.state.originalOrder;
  }

  private findCurrentTrackInOrder(): number {
    const currentOrder = this.getCurrentOrder();
    return currentOrder.indexOf(this.state.currentTrackIndex);
  }

  private findTrackById(
    trackId: string,
    albumId: string
  ): { track: Track; album: Album; index: number } | null {
    const album = musicData.albums.find((a) => a.id === albumId);
    if (!album) return null;

    const trackIndex = album.tracks.findIndex((t) => t.id === trackId);
    if (trackIndex === -1) return null;

    return {
      track: album.tracks[trackIndex],
      album,
      index: trackIndex,
    };
  }

  private saveState(): void {
    StateManager.save(this.state);
  }

  private restoreState(): void {
    const savedState = StateManager.restore();
    if (savedState) {
      this.state = { ...this.state, ...savedState };

      // If there was a playing track, restore the state but don't auto-play on page load
      // This respects browser autoplay policies
      if (savedState.isPlaying && savedState.currentTrack && savedState.currentAlbum) {
        console.log('🎵 Restored state for:', savedState.currentTrack.title);
        // Set up the audio element but don't play yet
        this.audioElement.src = savedState.currentTrack.file;
        this.audioElement.currentTime = savedState.currentTime || 0;
        // Set state to paused until user interaction
        this.state.isPlaying = false;
        this.hasPendingRestoration = true;
      }

      this.emitStateChanged();
    }
  }

  private emitEvent<K extends keyof MusicPlayerEventMap>(
    type: K,
    detail: MusicPlayerEventMap[K] extends CustomEvent<infer D> ? D : never
  ): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  private emitStateChanged(): void {
    this.emitEvent('state-changed', { state: { ...this.state } });
  }

  private async safePlay(signal: AbortSignal): Promise<void> {
    try {
      // Check if request was aborted before attempting to play
      if (signal.aborted) {
        return;
      }

      await this.audioElement.play();
    } catch (error) {
      // Handle AbortError specifically
      if (error instanceof DOMException && error.name === 'AbortError') {
        // This is expected when a play request is interrupted
        console.log('🎵 Play request was interrupted by another action');
        return;
      }

      // Re-throw other errors
      throw error;
    }
  }

  // Public API Methods
  public async play(
    trackId: string,
    albumId: string,
    options: PlaybackOptions = {}
  ): Promise<void> {
    // Cancel any ongoing play request
    if (this.activePlayRequest) {
      this.activePlayRequest.abort();
    }

    // Create new abort controller for this request
    this.activePlayRequest = new AbortController();
    const signal = this.activePlayRequest.signal;

    const trackInfo = this.findTrackById(trackId, albumId);
    if (!trackInfo) {
      throw new Error(`Track not found: ${trackId} in album ${albumId}`);
    }

    const { track, album, index } = trackInfo;
    const isSameTrack = this.state.currentTrack?.id === trackId;
    const shouldForceReload = options.forceStart || options.albumPlayback;

    // Check if request was aborted
    if (signal.aborted) {
      return;
    }

    // Update state
    this.state.currentTrack = track;
    this.state.currentAlbum = album;
    this.state.currentTrackIndex = index;
    this.state.isVisible = true;

    // Initialize shuffle order if needed
    if (!this.state.originalOrder.length) {
      this.initializeShuffleOrder();
    }

    // Load track state (loop, etc.)
    this.loadTrackState(trackId);


    try {
      // Check if request was aborted before starting audio operations
      if (signal.aborted) {
        return;
      }

      if (isSameTrack && !shouldForceReload) {
        if (options.restart) {
          this.audioElement.currentTime = 0;
        }

        if (this.audioElement.paused && !signal.aborted) {
          await this.safePlay(signal);
        }
      } else {
        // Load new track
        if (!this.audioElement.paused) {
          this.audioElement.pause();
        }

        // Check if request was aborted before loading new track
        if (signal.aborted) {
          return;
        }

        this.audioElement.src = track.file;

        // Preserve position if requested and this is the same track
        const shouldPreservePosition = options.preservePosition && isSameTrack && this.state.currentTime > 0;
        const targetTime = shouldPreservePosition ? this.state.currentTime : 0;

        this.audioElement.currentTime = targetTime;
        this.state.currentTime = targetTime;

        await this.createAudioContextIfNeeded();

        if (!signal.aborted) {
          await this.safePlay(signal);
        }
      }

      // Check if request was aborted before emitting events
      if (signal.aborted) {
        return;
      }

      this.emitEvent('track-started', { track, album, options });
      this.emitStateChanged();
      this.saveState();

      // Clear the active request on successful completion
      this.activePlayRequest = null;
    } catch (error) {
      // Only log error if it's not due to an aborted request
      if (!signal.aborted) {
        console.error('Failed to play track:', error);
        this.emitEvent('playback-error', {
          error: `Failed to play ${track.title}`,
          track,
        });
      }
      this.activePlayRequest = null;
    }
  }

  public pause(): void {
    if (!this.audioElement.paused) {
      this.audioElement.pause();
      if (this.state.currentTrack) {
        this.emitEvent('track-paused', { track: this.state.currentTrack });
      }
    }
  }

  public async resume(): Promise<void> {
    // Cancel any ongoing play request
    if (this.activePlayRequest) {
      this.activePlayRequest.abort();
    }

    // Create new abort controller for this request
    this.activePlayRequest = new AbortController();
    const signal = this.activePlayRequest.signal;

    try {
      // Check if we need to load/reload the track
      const needsReload = this.state.currentTrack && this.state.currentAlbum &&
        (!this.audioElement.src || this.audioElement.src !== this.state.currentTrack.file);

      if (needsReload) {
        console.log('🎵 Reloading track for resume:', this.state.currentTrack.title);

        if (!signal.aborted) {
          this.audioElement.src = this.state.currentTrack.file;
          this.audioElement.currentTime = this.state.currentTime || 0;
          await this.createAudioContextIfNeeded();
        }
      }

      // Always try to play if we have a current track and audio is paused
      if (this.state.currentTrack && this.audioElement.paused && !signal.aborted) {
        console.log('🎵 Starting playback from resume');
        await this.safePlay(signal);

        if (!signal.aborted) {
          // Update state to reflect that we're now playing
          this.state.isPlaying = true;
          this.emitEvent('track-resumed', { track: this.state.currentTrack });
          this.emitStateChanged();
          this.saveState();
        }
      }

      this.activePlayRequest = null;
    } catch (error) {
      if (!signal.aborted) {
        console.error('Failed to resume:', error);
      }
      this.activePlayRequest = null;
    }
  }

  public stop(): void {
    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    this.state.currentTime = 0;
    this.state.isPlaying = false;
    this.emitStateChanged();
  }

  public nextTrack(): void {
    if (!this.state.currentAlbum || !this.state.currentTrack) return;

    this.state.isLooping = false; // Reset loop on navigation
    this.saveTrackState();

    // Ensure orders are initialized and match current album length
    if (!this.state.originalOrder.length || this.state.originalOrder.length !== this.state.currentAlbum.tracks.length) {
      console.log('🎵 Reinitializing orders for album with', this.state.currentAlbum.tracks.length, 'tracks');
      this.initializeShuffleOrder();
    }

    const currentOrder = this.getCurrentOrder();
    let currentPositionInOrder = this.findCurrentTrackInOrder();

    // If current track not found in order, find it by track index
    if (currentPositionInOrder === -1) {
      console.warn('🎵 Current track not found in order, finding by index');
      console.warn('🎵 Debug - currentTrackIndex:', this.state.currentTrackIndex);
      console.warn('🎵 Debug - currentOrder:', currentOrder);
      console.warn('🎵 Debug - album tracks length:', this.state.currentAlbum.tracks.length);
      currentPositionInOrder = currentOrder.indexOf(this.state.currentTrackIndex);
    }

    // Still not found, reinitialize orders and try again
    if (currentPositionInOrder === -1) {
      console.warn('🎵 Track index not found, reinitializing orders');
      this.initializeShuffleOrder();
      const newCurrentOrder = this.getCurrentOrder();
      currentPositionInOrder = newCurrentOrder.indexOf(this.state.currentTrackIndex);

      // If still not found, default to first track
      if (currentPositionInOrder === -1) {
        console.error('🎵 Track index still not found after reinitialization, defaulting to first track');
        console.error('🎵 Debug - currentTrackIndex:', this.state.currentTrackIndex);
        console.error('🎵 Debug - newCurrentOrder:', newCurrentOrder);
        currentPositionInOrder = 0;
      }
    }

    let targetPositionInOrder: number;
    if (currentPositionInOrder >= currentOrder.length - 1) {
      targetPositionInOrder = 0; // Loop back to beginning of album
    } else {
      targetPositionInOrder = currentPositionInOrder + 1;
    }

    const targetTrackIndex = currentOrder[targetPositionInOrder];
    const targetTrack = this.state.currentAlbum.tracks[targetTrackIndex];

    if (!targetTrack) {
      console.error('🎵 Target track not found, aborting navigation');
      return;
    }

    console.log(
      `🎵 Next track: ${targetTrack.title} (${this.state.isShuffled ? 'shuffled' : 'normal'} order)`
    );

    this.play(targetTrack.id, this.state.currentAlbum.id, { forceStart: true });

    this.emitEvent('track-changed', {
      track: targetTrack,
      album: this.state.currentAlbum,
      isAutoplay: true,
    });
  }

  public previousTrack(): void {
    if (!this.state.currentAlbum || !this.state.currentTrack) return;

    this.state.isLooping = false; // Reset loop on navigation
    this.saveTrackState();

    // Ensure orders are initialized and match current album length
    if (!this.state.originalOrder.length || this.state.originalOrder.length !== this.state.currentAlbum.tracks.length) {
      console.log('🎵 Reinitializing orders for album with', this.state.currentAlbum.tracks.length, 'tracks');
      this.initializeShuffleOrder();
    }

    const currentOrder = this.getCurrentOrder();
    let currentPositionInOrder = this.findCurrentTrackInOrder();

    // If current track not found in order, find it by track index
    if (currentPositionInOrder === -1) {
      console.warn('🎵 Current track not found in order, finding by index');
      console.warn('🎵 Debug - currentTrackIndex:', this.state.currentTrackIndex);
      console.warn('🎵 Debug - currentOrder:', currentOrder);
      console.warn('🎵 Debug - album tracks length:', this.state.currentAlbum.tracks.length);
      currentPositionInOrder = currentOrder.indexOf(this.state.currentTrackIndex);
    }

    // Still not found, reinitialize orders and try again
    if (currentPositionInOrder === -1) {
      console.warn('🎵 Track index not found, reinitializing orders');
      this.initializeShuffleOrder();
      const newCurrentOrder = this.getCurrentOrder();
      currentPositionInOrder = newCurrentOrder.indexOf(this.state.currentTrackIndex);

      // If still not found, default to last track
      if (currentPositionInOrder === -1) {
        console.error('🎵 Track index still not found after reinitialization, defaulting to last track');
        console.error('🎵 Debug - currentTrackIndex:', this.state.currentTrackIndex);
        console.error('🎵 Debug - newCurrentOrder:', newCurrentOrder);
        currentPositionInOrder = currentOrder.length - 1;
      }
    }

    let targetPositionInOrder: number;
    if (currentPositionInOrder <= 0) {
      targetPositionInOrder = currentOrder.length - 1; // Loop to end of album
    } else {
      targetPositionInOrder = currentPositionInOrder - 1;
    }

    const targetTrackIndex = currentOrder[targetPositionInOrder];
    const targetTrack = this.state.currentAlbum.tracks[targetTrackIndex];

    if (!targetTrack) {
      console.error('🎵 Target track not found, aborting navigation');
      return;
    }

    console.log(
      `🎵 Previous track: ${targetTrack.title} (${this.state.isShuffled ? 'shuffled' : 'normal'} order)`
    );

    this.play(targetTrack.id, this.state.currentAlbum.id, { forceStart: true });

    this.emitEvent('track-changed', {
      track: targetTrack,
      album: this.state.currentAlbum,
      isAutoplay: false,
    });
  }

  public seek(time: number): void {
    if (this.audioElement.duration && !isNaN(this.audioElement.duration)) {
      this.audioElement.currentTime = Math.max(0, Math.min(time, this.audioElement.duration));
      this.state.currentTime = this.audioElement.currentTime;
      this.saveState();
    }
  }

  public setVolume(volume: number): void {
    this.state.volume = Math.max(0, Math.min(1, volume));
    this.audioElement.volume = this.state.volume;

    if (this.gainNode) {
      this.gainNode.gain.value = this.state.volume;
    }

    this.emitEvent('volume-changed', { volume: this.state.volume });
    this.saveState();
  }

  public toggleLoop(): void {
    this.state.isLooping = !this.state.isLooping;
    this.saveTrackState();

    if (this.state.currentTrack) {
      this.emitEvent('loop-changed', {
        isLooping: this.state.isLooping,
        trackTitle: this.state.currentTrack.title,
      });
    }

    console.log(`🎵 Loop ${this.state.isLooping ? 'enabled' : 'disabled'}`);
  }

  public toggleShuffle(): void {
    this.state.isShuffled = !this.state.isShuffled;

    if (this.state.isShuffled) {
      this.generateShuffledOrder();
    }

    this.emitEvent('shuffle-changed', {
      isShuffled: this.state.isShuffled,
      order: this.getCurrentOrder(),
    });

    console.log(`🎵 Shuffle ${this.state.isShuffled ? 'enabled' : 'disabled'}`);
    this.saveState();
  }

  public getState(): Readonly<PlaybackState> {
    return { ...this.state };
  }

  private loadTrackState(trackId: string): void {
    try {
      const loopStates = JSON.parse(localStorage.getItem('trackLoopStates') || '{}');
      this.state.isLooping = loopStates[trackId] || false;
    } catch (error) {
      console.error('Failed to load track state:', error);
      this.state.isLooping = false;
    }
  }

  private saveTrackState(): void {
    if (!this.state.currentTrack) return;

    try {
      const loopStates = JSON.parse(localStorage.getItem('trackLoopStates') || '{}');
      loopStates[this.state.currentTrack.id] = this.state.isLooping;
      localStorage.setItem('trackLoopStates', JSON.stringify(loopStates));
    } catch (error) {
      console.error('Failed to save track state:', error);
    }
  }

  // Event listener helper methods
  public onTrackStarted(
    callback: (
      event: CustomEvent<{ track: Track; album: Album; options?: PlaybackOptions }>
    ) => void
  ): void {
    this.addEventListener('track-started', callback as EventListener);
  }

  public onTrackPaused(callback: (event: CustomEvent<{ track: Track }>) => void): void {
    this.addEventListener('track-paused', callback as EventListener);
  }

  public onTrackResumed(callback: (event: CustomEvent<{ track: Track }>) => void): void {
    this.addEventListener('track-resumed', callback as EventListener);
  }

  public onTrackEnded(callback: (event: CustomEvent<{ track: Track }>) => void): void {
    this.addEventListener('track-ended', callback as EventListener);
  }

  public onTrackChanged(
    callback: (event: CustomEvent<{ track: Track; album: Album; isAutoplay: boolean }>) => void
  ): void {
    this.addEventListener('track-changed', callback as EventListener);
  }

  public onStateChanged(callback: (event: CustomEvent<{ state: PlaybackState }>) => void): void {
    this.addEventListener('state-changed', callback as EventListener);
  }

  public onVolumeChanged(callback: (event: CustomEvent<{ volume: number }>) => void): void {
    this.addEventListener('volume-changed', callback as EventListener);
  }

  public onLoopChanged(
    callback: (event: CustomEvent<{ isLooping: boolean; trackTitle: string }>) => void
  ): void {
    this.addEventListener('loop-changed', callback as EventListener);
  }

  public onShuffleChanged(
    callback: (event: CustomEvent<{ isShuffled: boolean; order: number[] }>) => void
  ): void {
    this.addEventListener('shuffle-changed', callback as EventListener);
  }

  public onProgressUpdated(
    callback: (
      event: CustomEvent<{ currentTime: number; duration: number; percentage: number }>
    ) => void
  ): void {
    this.addEventListener('progress-updated', callback as EventListener);
  }

  public onPlaybackError(
    callback: (event: CustomEvent<{ error: string; track?: Track }>) => void
  ): void {
    this.addEventListener('playback-error', callback as EventListener);
  }

  // Cleanup method
  public destroy(): void {
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval);
    }
    if (this.stateCheckInterval) {
      clearInterval(this.stateCheckInterval);
    }

    // Disconnect Web Audio API nodes
    if (this.source) {
      this.source.disconnect();
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
    }
    if (this.audioContext) {
      this.audioContext.close();
    }

    // Clear instance
    MusicPlayerService.instance = null;
  }
}
