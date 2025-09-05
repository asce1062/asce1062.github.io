import musicData from '../data/music.json';
import type {
  Track,
  Album,
  PlaybackState,
  PlaybackOptions,
  MusicPlayerEventMap,
} from '../types/types';
import { mediaSessionManager } from './MediaSessionService';
import { androidBridgeService } from './AndroidBridgeService';

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
  // TODO: Future improvements
  // Implement continuous audio with Astro View Transitions
  // For seamless navigation without audio interruption
  private androidSyncInProgress = false;
  private lastAndroidBridgeUpdate = 0;

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
    this.setupNotificationActionListener();
    this.setupMediaSessionIntegration();
    this.setupNativeAudioDeviceHandling();
    this.setupAndroidPlaybackSync();
    this.setupAppTerminationHandler();
    this.startProgressUpdater();
    this.startStateChecker();
    this.restoreState().catch((error) => {
      console.warn('🎵 Failed to restore state:', error);
    });
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

      // Update Media Session position state periodically (throttled internally for Chrome)
      if (this.state.duration > 0) {
        mediaSessionManager.updatePositionState(this.state.currentTime, this.state.duration);
      }

      // Update AndroidBridge position state periodically (throttled to every 1 second)
      if (this.state.isPlaying && this.state.currentTrack && this.state.currentAlbum) {
        const now = Date.now();
        if (!this.lastAndroidBridgeUpdate || now - this.lastAndroidBridgeUpdate >= 1000) {
          // console.log(
          //   '🔔 TIMEUPDATE: AndroidBridge position update -',
          //   Math.round(this.state.currentTime),
          //   's, playing:',
          //   this.state.isPlaying
          // );
          // Use lightweight position-only update without triggering full MediaSession refresh
          androidBridgeService.updatePlaybackState(
            true,
            this.state.currentTrack,
            this.state.currentAlbum,
            this.state.currentTime,
            this.audioElement.duration
          );
          this.lastAndroidBridgeUpdate = now;
        }
      }
    });

    this.audioElement.addEventListener('play', () => {
      console.log('🎵 Audio play event triggered');
      this.state.isPlaying = true;
      this.state.currentTime = this.audioElement.currentTime; // Ensure accurate position
      console.log(
        '🔔 PLAY: Position captured -',
        Math.round(this.state.currentTime),
        's, audio element:',
        Math.round(this.audioElement.currentTime),
        's'
      );
      this.createAudioContextIfNeeded();
      this.emitStateChanged();
      this.saveState();

      // Update Media Session playback state
      mediaSessionManager.updatePlaybackState(this.state);

      // Update AndroidBridge when play actually starts
      if (this.state.currentTrack && this.state.currentAlbum) {
        console.log(
          '🔔 PLAY: AndroidBridge update -',
          Math.round(this.state.currentTime),
          's, playing: true'
        );
        androidBridgeService.updatePlaybackState(
          true,
          this.state.currentTrack,
          this.state.currentAlbum,
          this.state.currentTime,
          this.audioElement.duration
        );
      }
    });

    this.audioElement.addEventListener('pause', () => {
      this.state.isPlaying = false;
      this.state.currentTime = this.audioElement.currentTime; // Ensure accurate position
      console.log(
        '🔔 PAUSE: Position captured -',
        Math.round(this.state.currentTime),
        's, audio element:',
        Math.round(this.audioElement.currentTime),
        's'
      );
      this.emitStateChanged();
      this.saveState();

      // Update Media Session playback state
      mediaSessionManager.updatePlaybackState(this.state);

      // Update AndroidBridge state with accurate current position
      console.log(
        '🔔 PAUSE: AndroidBridge update -',
        Math.round(this.state.currentTime),
        's, playing: false'
      );
      androidBridgeService.updatePlaybackState(
        false,
        this.state.currentTrack,
        this.state.currentAlbum,
        this.state.currentTime,
        this.audioElement.duration
      );
    });

    this.audioElement.addEventListener('ended', () => {
      this.handleTrackEnd();
    });

    this.audioElement.addEventListener('seeking', () => {
      // Update position immediately when seeking starts (for responsive UI)
      this.state.currentTime = this.audioElement.currentTime;
      console.log(
        '🔔 SEEKING: Position captured -',
        Math.round(this.state.currentTime),
        's, audio element:',
        Math.round(this.audioElement.currentTime),
        's'
      );

      // Update website MediaSession position for immediate feedback
      if (this.state.duration > 0) {
        mediaSessionManager.updatePositionState(this.state.currentTime, this.state.duration);
      }
    });

    this.audioElement.addEventListener('seeked', () => {
      // Update position state after seek operation completes
      this.state.currentTime = this.audioElement.currentTime;
      console.log(
        '🔔 SEEKED: Position captured -',
        Math.round(this.state.currentTime),
        's, audio element:',
        Math.round(this.audioElement.currentTime),
        's'
      );

      // Update website MediaSession position
      if (this.state.duration > 0) {
        mediaSessionManager.updatePositionState(this.state.currentTime, this.state.duration);
      }

      // Update AndroidBridge position for native notifications
      if (this.state.currentTrack && this.state.currentAlbum) {
        console.log(
          '🔔 SEEKED: AndroidBridge forcePositionUpdate -',
          Math.round(this.state.currentTime),
          's, playing:',
          this.state.isPlaying
        );
        androidBridgeService.forcePositionUpdate(
          this.state.currentTime,
          this.state.isPlaying,
          this.audioElement.duration
        );
      }
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

  private setupNotificationActionListener(): void {
    // Listen for notification control actions from AndroidBridge
    document.addEventListener('android-notification-action', (event: CustomEvent) => {
      const { action, position } = event.detail;
      console.log(
        '🔔 Handling notification action:',
        action,
        position ? `at position ${Math.round(position / 1000)}s` : ''
      );

      try {
        switch (action) {
          case 'play':
            this.resume();
            break;
          case 'pause':
            this.pause();
            break;
          case 'next':
            this.nextTrack();
            break;
          case 'previous':
            this.previousTrack();
            break;
          case 'shuffle':
            this.toggleShuffle();
            break;
          case 'loop':
            this.toggleLoop();
            break;
          case 'favorite':
            // TODO: Implement favorite functionality
            console.log('🔔 Favorite action - not implemented yet');
            break;
          case 'share':
            // TODO: Implement share functionality
            console.log('🔔 Share action - not implemented yet');
            break;
          case 'seekto':
            // Handle seek from Android notification scrubbing
            if (position !== undefined && position >= 0) {
              const seekTimeSeconds = position / 1000;
              console.log(
                '🔔 Seeking to position:',
                seekTimeSeconds,
                'seconds via Android notification'
              );
              this.seek(seekTimeSeconds);
            } else {
              console.warn('🔔 Seek action received but no valid position provided');
            }
            break;
          default:
            console.warn('🔔 Unknown notification action:', action);
        }
      } catch (error) {
        console.error('🔔 Failed to handle notification action:', action, error);
      }
    });
  }

  private setupMediaSessionIntegration(): void {
    // Listen to Media Session action events
    mediaSessionManager.onActionTriggered((event) => {
      const { action, details } = event.detail;

      switch (action) {
        case 'play':
          this.resume().catch((error) => {
            console.error('Failed to resume from Media Session:', error);
          });
          break;

        case 'pause':
          this.pause();
          break;

        case 'stop':
          this.stop();
          break;

        case 'nexttrack':
          this.nextTrack();
          break;

        case 'previoustrack':
          this.previousTrack();
          break;

        case 'seekbackward':
          if (details?.seekOffset) {
            const newTime = Math.max(this.audioElement.currentTime - details.seekOffset, 0);
            this.seek(newTime);
          }
          break;

        case 'seekforward':
          if (details?.seekOffset) {
            const newTime = Math.min(
              this.audioElement.currentTime + details.seekOffset,
              this.audioElement.duration || 0
            );
            this.seek(newTime);
          }
          break;

        case 'seekto':
          if (details?.seekTime !== undefined) {
            this.seek(details.seekTime);
          }
          break;

        default:
          console.warn('🎵 Unhandled Media Session action:', action);
      }
    });

    // Listen to Media Session queue track selection events
    mediaSessionManager.onQueueTrackSelected((event) => {
      const { queueIndex, track, shouldTogglePlayback } = event.detail;

      console.log(
        `🎵 Queue track selected: ${track.title} at index ${queueIndex}, shouldTogglePlayback: ${shouldTogglePlayback}`
      );

      if (shouldTogglePlayback && this.state.currentTrack?.id === track.id) {
        // If it's the same track and we should toggle playback, toggle play/pause
        if (this.state.isPlaying) {
          this.pause();
        } else {
          this.resume().catch((error) => {
            console.error('Failed to resume from queue track selection:', error);
          });
        }
      } else {
        // Play the selected track
        this.play(track.id, this.state.currentAlbum?.id || '', { forceStart: true }).catch(
          (error) => {
            console.error('Failed to play selected queue track:', error);
          }
        );
      }
    });

    // Listen for shuffle and loop changes from the music player to sync with Media Session
    this.onShuffleChanged((event) => {
      mediaSessionManager.updateShuffleState(event.detail.isShuffled);
    });

    this.onLoopChanged((event) => {
      mediaSessionManager.updateLoopState(event.detail.isLooping);
    });

    console.log('🎵 Media Session integration set up');
  }

  private setupNativeAudioDeviceHandling(): void {
    // Set up native audio device disconnect handling for Android WebView

    // Primary method: Register callback for native Android app
    if (typeof window !== 'undefined') {
      (window as any).AndroidInterface = {
        onAudioDeviceDisconnected: () => {
          console.log('🎧 Audio device disconnected (native detection)');
          this.pauseForDeviceDisconnect();
        },
      };
    }

    // Fallback method: Listen for custom event dispatched by native app
    document.addEventListener('audioDeviceDisconnected', (event: CustomEvent) => {
      console.log('🎧 Audio device disconnected event received:', event.detail);
      this.pauseForDeviceDisconnect();
    });

    console.log('🎧 Native audio device disconnect handling set up');
  }

  private setupAndroidPlaybackSync(): void {
    // Listen for Android background playback sync events
    // This prevents duplicate audio when reopening the app after background playback
    document.addEventListener('android-playback-sync', (event: CustomEvent) => {
      console.log('🎵 Received Android playback sync event:', event.detail);

      try {
        const androidState = event.detail;

        // Validate the sync data (Android sends individual fields, not track/album objects)
        if (!androidState || !androidState.title || !androidState.artist || !androidState.trackId) {
          console.warn(
            '🎵 Invalid Android playback sync data - missing required fields:',
            androidState
          );
          return;
        }

        console.log('🎵 Syncing with Android background playback:', {
          title: androidState.title,
          artist: androidState.artist,
          album: androidState.album,
          position: Math.round(androidState.position || 0) + 'ms',
          isPlaying: androidState.isPlaying,
          trackId: androidState.trackId,
        });

        // Sync the website player state with Android background playback
        this.syncWithAndroidPlayback(androidState);
      } catch (error) {
        console.error('🎵 Failed to handle Android playback sync:', error);
      }
    });

    console.log('🎵 Android playback sync handling set up');
  }

  private setupAppTerminationHandler(): void {
    // Handle complete audio stop when app is terminated (swiped from recents)
    document.addEventListener('app-terminated', () => {
      console.log('🛑 App terminated - stopping all audio playback');
      this.stopAllAudioPlayback();
    });

    // Also listen for the direct stop_all_playback notification action
    document.addEventListener('android-notification-action', (event: CustomEvent) => {
      const { action } = event.detail;
      if (action === 'stop_all_playback') {
        console.log('🛑 Received stop_all_playback - terminating all audio');
        this.stopAllAudioPlayback();
      }
    });

    // Make stopAllAudioPlayback available globally for Android to call directly
    if (typeof window !== 'undefined') {
      (window as any).onNotificationAction = (action: string) => {
        if (action === 'stop') {
          console.log('🛑 Global stop action received - stopping all playback');
          this.stopAllAudioPlayback();
        }
      };
    }

    console.log('🛑 App termination handler set up for complete audio stop');
  }

  private stopAllAudioPlayback(): void {
    try {
      console.log('🛑 Stopping all audio playback for app termination...');

      // Stop current music player audio
      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        console.log('🛑 Stopped and reset main audio element');
      }

      // Find and stop ALL audio/video elements on the page
      const audioElements = document.querySelectorAll('audio, video');
      audioElements.forEach((element, index) => {
        if (element instanceof HTMLAudioElement || element instanceof HTMLVideoElement) {
          element.pause();
          element.currentTime = 0;
          console.log(`🛑 Stopped audio/video element ${index + 1}`);
        }
      });

      // Clear all playback state
      this.state.isPlaying = false;
      this.state.currentTime = 0;

      // Clear any active play requests
      if (this.activePlayRequest) {
        this.activePlayRequest.abort();
        this.activePlayRequest = null;
      }

      // Clear intervals and timers
      if (this.progressUpdateInterval) {
        clearInterval(this.progressUpdateInterval);
        this.progressUpdateInterval = null;
      }

      if (this.stateCheckInterval) {
        clearInterval(this.stateCheckInterval);
        this.stateCheckInterval = null;
      }

      // Update UI to reflect stopped state
      this.emitStateChanged();
      this.emitEvent('track-paused', { track: this.state.currentTrack });

      // Clear saved state since app is terminating
      this.saveState();

      console.log('✅ All audio playback stopped for app termination');
    } catch (error) {
      console.error('❌ Failed to stop all audio playback:', error);
    }
  }

  private async syncWithAndroidPlayback(androidState: any): Promise<void> {
    try {
      console.log('🎵 Starting sync with Android background playback...');

      // Set flag to prevent conflicts with restoreState
      this.androidSyncInProgress = true;

      // Stop any current website playback to prevent conflicts
      if (this.state.isPlaying) {
        console.log('🎵 Pausing current website playback for sync');
        this.pause();
      }

      // Android sends basic metadata, we need to match it with our current track
      // Since Android was playing this track, it should match our current state
      const currentTrack = this.state.currentTrack;
      const currentAlbum = this.state.currentAlbum;

      if (!currentTrack || currentTrack.id !== androidState.trackId) {
        console.warn('🎵 Cannot sync - Android track does not match current website state');
        console.warn('🎵 Android trackId:', androidState.trackId, 'title:', androidState.title);
        console.warn(
          '🎵 Website currentTrack:',
          currentTrack?.id || 'none',
          currentTrack?.title || 'none'
        );

        // Try to continue anyway - maybe the track is the same but IDs don't match
        if (currentTrack && currentTrack.title === androidState.title) {
          console.log('🎵 Track titles match - continuing sync despite ID mismatch');
        } else {
          console.error('🎵 Cannot sync - tracks do not match at all');
          return;
        }
      }

      console.log('🎵 Track match confirmed - syncing playback state');

      // Convert Android position from ms to seconds
      const positionSeconds = (androidState.position || 0) / 1000;

      // Update internal state to match Android position only
      this.state.currentTime = positionSeconds;
      this.state.duration = (androidState.duration || 0) / 1000; // Convert ms to seconds
      this.state.isPlaying = false; // Keep website paused - no takeover

      // Set audio element position but don't start playback
      this.audioElement.currentTime = positionSeconds;

      // Update Media Session to reflect synced but paused state
      if (currentTrack && currentAlbum) {
        mediaSessionManager.updateMetadata(
          currentTrack,
          currentAlbum,
          this.state.currentTrackIndex
        );
        mediaSessionManager.updatePlaybackState(this.state);
      }

      // Update UI to show the synced state
      console.log('🎵 Synced website position with Android - website remains paused');

      // Emit events to update UI
      this.emitStateChanged();
      if (currentTrack && currentAlbum) {
        this.emitEvent('track-changed', {
          track: currentTrack,
          album: currentAlbum,
          isAutoplay: false,
        });
      }

      // Save the synced state
      this.saveState();

      console.log('🎵 Successfully synced with Android background playback:', {
        track: androidState.title,
        album: androidState.album,
        position: Math.round(positionSeconds) + 's',
        androidIsPlaying: androidState.isPlaying,
        websiteIsPlaying: this.state.isPlaying,
        trackMatch: androidState.trackId === currentTrack?.id,
        note: 'Website synced position but remains paused to avoid duplicate audio',
      });
    } catch (error) {
      console.error('🎵 Failed to sync with Android playback:', error);
    } finally {
      // Clear sync flag
      this.androidSyncInProgress = false;
    }
  }

  private pauseForDeviceDisconnect(): void {
    if (this.state.isPlaying && this.state.currentTrack) {
      console.log('🎧 Pausing due to audio device disconnect:', this.state.currentTrack.title);
      this.pause();

      // Emit a special event for device disconnect pause
      this.emitEvent('track-paused', {
        track: this.state.currentTrack,
        reason: 'device-disconnect',
      } as any);

      // Show a brief notification or toast (if supported)
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Music Paused', {
            body: 'Playback paused due to audio device disconnect',
            icon: this.state.currentAlbum?.coverArt || '/favicon.ico',
            tag: 'device-disconnect',
            requireInteraction: false,
          });
        } catch (error) {
          console.log('Could not show disconnect notification:', error);
        }
      }
    }
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

        // AndroidBridge now works like MediaSession - automatic progression without periodic updates
        // Only send updates on state changes, track changes, or explicit seeks

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
      console.log(
        `🎵 Looping track: ${
          this.state.currentTrack.title
        } (Media Session sync: ${mediaSessionManager.getIsLooping()})`
      );
      this.audioElement.currentTime = 0;
      this.state.currentTime = 0;

      // Reset Media Session position to 0 for loop restart
      if (this.state.duration > 0) {
        mediaSessionManager.resetPositionState(this.state.duration);
      }

      // Force AndroidBridge position reset for loop restart
      if (this.state.currentAlbum) {
        androidBridgeService.forcePositionUpdate(0, false); // Reset position and set to paused
      }

      setTimeout(() => {
        this.audioElement.play().catch((error) => {
          console.error('Failed to loop track:', error);
        });
        // Note: The 'play' event listener will handle updating AndroidBridge to playing state
      }, 50);
    } else {
      // Auto-advance to next track (will respect shuffle state)
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
    this.shuffleArray(this.state.shuffledOrder);
  }

  private shuffleArray(array: number[]): void {
    // Fisher-Yates shuffle
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
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

  private async restoreState(): Promise<void> {
    const savedState = StateManager.restore();
    if (savedState) {
      this.state = { ...this.state, ...savedState };

      // If there was a playing track, restore and auto-resume playback
      // Skip if Android sync is in progress to prevent conflicts
      if (
        savedState.isPlaying &&
        savedState.currentTrack &&
        savedState.currentAlbum &&
        !this.androidSyncInProgress
      ) {
        console.log('🎵 Restored state for:', savedState.currentTrack.title);
        // Set up the audio element and resume playback automatically
        this.audioElement.src = savedState.currentTrack.file;
        this.audioElement.currentTime = savedState.currentTime || 0;

        // Update Media Session with restored track info
        mediaSessionManager.updateMetadata(
          savedState.currentTrack,
          savedState.currentAlbum,
          savedState.currentTrackIndex
        );

        // Ensure AudioContext is ready for progress tracking
        await this.createAudioContextIfNeeded();
        console.log('🎵 AudioContext prepared for restored playback');

        // Auto-resume playback after navigation (small delay to ensure everything is initialized)
        setTimeout(() => {
          this.resume().catch((error) => {
            console.warn(
              '🎵 Auto-resume failed after navigation - user may need to interact:',
              error
            );
            this.state.isPlaying = false;
            this.emitStateChanged();
          });
        }, 100);
      } else if (this.androidSyncInProgress) {
        console.log('🎵 Skipping state restoration - Android sync in progress');
      }

      this.emitStateChanged();

      // Update Media Session playback state and sync shuffle/loop
      mediaSessionManager.updatePlaybackState(this.state);
      mediaSessionManager.updateShuffleState(this.state.isShuffled);
      mediaSessionManager.updateLoopState(this.state.isLooping);
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

    // Position sync will be handled by play/pause events automatically
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
        const shouldPreservePosition =
          options.preservePosition && isSameTrack && this.state.currentTime > 0;
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

      // Update Media Session metadata, queue, and state
      mediaSessionManager.updateMetadata(track, album, this.state.currentTrackIndex);
      mediaSessionManager.updateQueue(track, album, this.state.isShuffled);
      mediaSessionManager.updatePlaybackState(this.state);

      // Update AndroidBridge state (updatePlaybackState handles notification internally)
      androidBridgeService.updatePlaybackState(
        this.state.isPlaying,
        track,
        album,
        this.state.currentTime,
        this.audioElement.duration
      );

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
        // Sync state with audio element's actual current time before pausing
        this.state.currentTime = this.audioElement.currentTime;
        console.log('🎵 PAUSE: Captured position =', this.state.currentTime, 'seconds');
        this.emitEvent('track-paused', { track: this.state.currentTrack });
        // Update AndroidBridge state (updatePlaybackState handles notification internally)
        if (this.state.currentAlbum) {
          androidBridgeService.updatePlaybackState(
            false,
            this.state.currentTrack,
            this.state.currentAlbum,
            this.state.currentTime,
            this.audioElement.duration
          );
        }
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
      const needsReload =
        this.state.currentTrack &&
        this.state.currentAlbum &&
        (!this.audioElement.src || this.audioElement.src !== this.state.currentTrack.file);

      if (needsReload) {
        console.log(
          '🎵 Reloading track for resume:',
          this.state.currentTrack.title,
          'at position:',
          this.state.currentTime
        );

        if (!signal.aborted) {
          this.audioElement.src = this.state.currentTrack.file;
          // Ensure we don't reset position - only set if we have a valid saved time
          const savedTime = this.state.currentTime;
          if (savedTime && savedTime > 0) {
            this.audioElement.currentTime = savedTime;
            console.log('🎵 Restored position to:', savedTime, 'seconds');
          } else {
            console.log('🎵 No saved position, starting from beginning');
          }
          await this.createAudioContextIfNeeded();
        }
      }

      // Always try to play if we have a current track and audio is paused
      if (this.state.currentTrack && this.audioElement.paused && !signal.aborted) {
        console.log('🎵 Starting playback from resume');
        await this.createAudioContextIfNeeded();
        await this.safePlay(signal);

        if (!signal.aborted) {
          // Update state to reflect that we're now playing
          this.state.isPlaying = true;
          this.emitEvent('track-resumed', { track: this.state.currentTrack });
          this.emitStateChanged();
          this.saveState();

          // Update Media Session state
          mediaSessionManager.updatePlaybackState(this.state);

          // Update AndroidBridge state (like MediaSession - simple state update)
          if (this.state.currentAlbum) {
            // For resume: always use saved state time to avoid timing issues
            const positionToUse = this.state.currentTime;
            console.log(
              '🎵 RESUME: Using saved position =',
              positionToUse,
              'seconds (audio element shows:',
              this.audioElement.currentTime,
              ')'
            );

            // Keep using saved position
            androidBridgeService.updatePlaybackState(
              true,
              this.state.currentTrack,
              this.state.currentAlbum,
              positionToUse,
              this.audioElement.duration
            );
          }
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

    // Update Media Session state
    mediaSessionManager.updatePlaybackState(this.state);

    // Update AndroidBridge state (position updates handled by progress updater)
    androidBridgeService.updatePlaybackState(false, null, null, 0, 0);
    // androidBridgeService.stopPositionUpdates();

    // Clear notification when stopped
    androidBridgeService.clearNotification();
  }

  public nextTrack(): void {
    if (!this.state.currentAlbum || !this.state.currentTrack) return;

    this.state.isLooping = false; // Reset loop on navigation
    this.saveTrackState();

    // Ensure orders are initialized and match current album length
    if (
      !this.state.originalOrder.length ||
      this.state.originalOrder.length !== this.state.currentAlbum.tracks.length
    ) {
      console.log(
        '🎵 Reinitializing orders for album with',
        this.state.currentAlbum.tracks.length,
        'tracks'
      );
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
        console.error(
          '🎵 Track index still not found after reinitialization, defaulting to first track'
        );
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
    if (
      !this.state.originalOrder.length ||
      this.state.originalOrder.length !== this.state.currentAlbum.tracks.length
    ) {
      console.log(
        '🎵 Reinitializing orders for album with',
        this.state.currentAlbum.tracks.length,
        'tracks'
      );
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
        console.error(
          '🎵 Track index still not found after reinitialization, defaulting to last track'
        );
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
      `🎵 Previous track: ${targetTrack.title} (${
        this.state.isShuffled ? 'shuffled' : 'normal'
      } order)`
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
      const targetTime = Math.max(0, Math.min(time, this.audioElement.duration));
      console.log(
        '🔔 SEEK METHOD: Seeking to -',
        Math.round(targetTime),
        's, current audio element:',
        Math.round(this.audioElement.currentTime),
        's'
      );

      this.audioElement.currentTime = targetTime;
      this.state.currentTime = targetTime;
      this.saveState();

      console.log(
        '🔔 SEEKING: Position captured -',
        Math.round(targetTime),
        's, audio element:',
        Math.round(this.audioElement.currentTime),
        's'
      );

      // Listen for seeked event to confirm position is set
      const handleSeeked = () => {
        console.log(
          '🔔 SEEKED: Position captured -',
          Math.round(this.audioElement.currentTime),
          's, audio element:',
          Math.round(this.audioElement.currentTime),
          's'
        );

        // Force AndroidBridge position update after seek completes
        console.log(
          '🔔 SEEKED: AndroidBridge forcePositionUpdate -',
          Math.round(this.audioElement.currentTime),
          's, playing:',
          this.state.isPlaying
        );
        androidBridgeService.forcePositionUpdate(
          this.audioElement.currentTime,
          this.state.isPlaying,
          this.audioElement.duration
        );

        this.audioElement.removeEventListener('seeked', handleSeeked);
      };

      this.audioElement.addEventListener('seeked', handleSeeked);

      // Fallback update in case seeked event doesn't fire
      setTimeout(() => {
        console.log(
          '🔔 SEEK METHOD: AndroidBridge forcePositionUpdate (delayed) -',
          Math.round(targetTime),
          's, playing:',
          this.state.isPlaying
        );
        androidBridgeService.forcePositionUpdate(
          targetTime,
          this.state.isPlaying,
          this.audioElement.duration
        );
      }, 50);
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

    // Note: Volume updates removed - simplified AndroidBridge only handles notifications
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

    // Update AndroidBridge state (updatePlaybackState handles notification internally)
    if (this.state.currentTrack && this.state.currentAlbum) {
      androidBridgeService.updatePlaybackState(
        this.state.isPlaying,
        this.state.currentTrack,
        this.state.currentAlbum,
        this.state.currentTime
      );
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

    // Update queue when shuffle state changes
    if (this.state.currentTrack && this.state.currentAlbum) {
      mediaSessionManager.updateQueue(
        this.state.currentTrack,
        this.state.currentAlbum,
        this.state.isShuffled
      );

      // Update AndroidBridge state (updatePlaybackState handles notification internally)
      if (this.state.currentTrack && this.state.currentAlbum) {
        androidBridgeService.updatePlaybackState(
          this.state.isPlaying,
          this.state.currentTrack,
          this.state.currentAlbum,
          this.state.currentTime
        );
      }
    }

    console.log(`🎵 Shuffle ${this.state.isShuffled ? 'enabled' : 'disabled'}`);
    this.saveState();
  }

  public getState(): Readonly<PlaybackState> {
    return { ...this.state };
  }

  public selectQueueTrack(queueIndex: number): void {
    try {
      console.log(`🎵 Selecting queue track at index: ${queueIndex}`);

      const success = mediaSessionManager.selectTrackFromQueue(queueIndex);
      if (!success) {
        console.error(`Failed to select track from queue at index: ${queueIndex}`);
        this.emitEvent('playback-error', {
          error: `Invalid queue index: ${queueIndex}`,
          track: this.state.currentTrack || undefined,
        });
      }
    } catch (error) {
      console.error('Error selecting queue track:', error);
      this.emitEvent('playback-error', {
        error: `Failed to select queue track: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        track: this.state.currentTrack || undefined,
      });
    }
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

    // Clear Media Session
    mediaSessionManager.clearMetadata();

    // Clear instance
    MusicPlayerService.instance = null;
  }
}
