import type {
  Track,
  Album,
  NotificationMetadata,
  NotificationAction,
  BridgeError,
  SimplifiedAndroidBridge,
  MediaSessionMetadata,
  AndroidMediaSessionPlaybackState,
} from '../types/types';
import { SITE_TITLE } from '@/consts';
import { PlaybackStateConstants } from '../types/types';

// Notification action with optional parameters
interface EnhancedNotificationAction {
  action: NotificationAction | 'seekto';
  position?: number; // For seek actions, position in milliseconds
  [key: string]: any; // For future extensions
}

// Native MediaSession bridge interface
declare global {
  interface Window {
    AndroidBridge?: SimplifiedAndroidBridge;
    // Callback for notification actions (Native → Website)
    // Now supports enhanced actions
    onNotificationAction?: (action: NotificationAction | EnhancedNotificationAction) => void;
    // Bridge ready handshake
    onBridgeReady?: () => void;
  }
}

/**
 * AndroidBridge Service Implementation
 * Currently Focused on metadata and broadcasting for rich media notifications across casting and connected devices
 */
class AndroidBridgeService extends EventTarget {
  private static instance: AndroidBridgeService | null = null;

  // Core state
  private isEnabled: boolean = false;
  private isReady: boolean = false;
  private bridgeVersion: string = '1.0.6.2';

  // Current metadata (for deduplication)
  private currentMetadata: NotificationMetadata | null = null;

  // Position update timer
  private positionUpdateTimer: number | null = null;
  private readonly POSITION_UPDATE_INTERVAL = 1000; // Update every second

  // Current playback state (provided by MusicPlayerService)
  private currentPlaybackState: {
    isPlaying: boolean;
    currentTrack: Track | null;
    currentAlbum: Album | null;
    currentTime: number;
  } | null = null;

  private constructor() {
    super();
    this.initializeBridge();
  }

  public static getInstance(): AndroidBridgeService {
    if (!AndroidBridgeService.instance) {
      AndroidBridgeService.instance = new AndroidBridgeService();
    }
    return AndroidBridgeService.instance;
  }

  /**
   * Initialize the bridge system
   */
  private async initializeBridge(): Promise<void> {
    console.log('🔔 Initializing Notification-Only AndroidBridge Service v' + this.bridgeVersion);

    this.checkBridgeAvailability();
    this.setupOriginSecurity();
    this.setupNotificationActionHandler();
    this.setupBridgeReadyHandler();

    if (this.isEnabled) {
      console.log('🔔 Bridge available - waiting for ready signal');
      await this.waitForBridgeReady();
      console.log('🔔 Notification bridge initialization complete');
    } else {
      console.log('🔔 Bridge not available - running in web-only mode');
    }
  }

  /**
   * Check if AndroidBridge is available with notification methods
   */
  private checkBridgeAvailability(): void {
    this.isEnabled = typeof window !== 'undefined' && !!window.AndroidBridge;

    if (this.isEnabled) {
      // Only validate MediaSession-related methods
      const requiredMethods = ['updateMediaSession', 'clearMediaSession', 'setMediaSessionActive'];
      const availableMethods = Object.keys(window.AndroidBridge || {});
      const missingMethods = requiredMethods.filter((method) => !availableMethods.includes(method));

      if (missingMethods.length > 0) {
        console.warn('🔔 AndroidBridge missing MediaSession methods:', missingMethods);
        this.isEnabled = false;
        return;
      }

      console.log('🔔 AndroidBridge MediaSession interface validated');
    }

    console.log('🔔 AndroidBridge availability:', this.isEnabled);
  }

  /**
   * Setup origin security validation
   */
  private setupOriginSecurity(): void {
    if (typeof window === 'undefined') return;

    const trustedOrigins = [
      'https://asce1062.github.io', // website
    ];

    // Check for trusted localhost development origins with Astro's incremental port allocation
    const trustedLocalhostHosts = ['localhost', '127.0.0.1', '10.0.2.2']; // Android emulator host
    const astroPortRange = { min: 4321, max: 4330 }; // Support ports 4321-4330 for Astro dev server

    const currentOrigin = location.origin;
    const url = new URL(currentOrigin);

    const isProduction = trustedOrigins.includes(currentOrigin);
    const isDevelopment =
      trustedLocalhostHosts.includes(url.hostname) &&
      url.protocol === 'http:' &&
      parseInt(url.port) >= astroPortRange.min &&
      parseInt(url.port) <= astroPortRange.max;

    if (!isProduction && !isDevelopment) {
      console.warn('🚨 AndroidBridge disabled: Untrusted origin', currentOrigin);
      console.log('🔍 Expected: Production origin or localhost with ports 4321-4330');
      this.isEnabled = false;
      return;
    }

    console.log('🔔 Origin security validation passed for:', currentOrigin);
  }

  /**
   * Setup notification action handler (Native → Website)
   */
  private setupNotificationActionHandler(): void {
    if (typeof window === 'undefined') return;

    window.onNotificationAction = (actionData: NotificationAction | EnhancedNotificationAction) => {
      // Handle both simple actions and enhanced actions
      const action = typeof actionData === 'string' ? actionData : actionData.action;
      const position = typeof actionData === 'object' ? actionData.position : undefined;

      console.log(
        '🔔 Notification action received:',
        action,
        position ? `at position ${Math.round(position / 1000)}s` : ''
      );

      try {
        // For seek actions, include position data
        const eventDetail = {
          action,
          position,
          timestamp: Date.now(),
        };

        // Dispatch event that website can listen to
        this.dispatchEvent(
          new CustomEvent('notification-action', {
            detail: eventDetail,
          })
        );

        // Also dispatch to document for broader listening
        document.dispatchEvent(
          new CustomEvent('android-notification-action', {
            detail: eventDetail,
          })
        );
      } catch (error) {
        console.error('🔔 Error handling notification action:', error);
        this.reportError({
          code: 'ACTION_FAILED',
          message: `Notification action ${action} failed: ${error.message}`,
          timestamp: Date.now(),
          recoverable: true,
        });
      }
    };
  }

  /**
   * Setup bridge ready handshake handler
   */
  private setupBridgeReadyHandler(): void {
    if (typeof window === 'undefined') return;

    window.onBridgeReady = () => {
      console.log('🔔 Bridge ready signal received from native');
      this.isReady = true;
      this.dispatchEvent(new CustomEvent('bridge-ready'));
    };
  }

  /**
   * Wait for bridge ready signal with timeout
   */
  private async waitForBridgeReady(timeout: number = 3000): Promise<void> {
    if (!this.isEnabled) return;

    return new Promise((resolve) => {
      if (this.isReady) {
        resolve();
        return;
      }

      const timeoutId = setTimeout(() => {
        console.warn('🔔 Bridge ready timeout - proceeding anyway');
        this.isReady = true;
        resolve();
      }, timeout);

      this.addEventListener(
        'bridge-ready',
        () => {
          clearTimeout(timeoutId);
          resolve();
        },
        { once: true }
      );
    });
  }

  /**
   * PUBLIC API: Update MediaSession (native media experience)
   * Creates proper Android MediaSession with media controls, casting, and device broadcasting
   */
  public updateNotification(
    track: Track,
    album: Album,
    isPlaying: boolean = false,
    currentPositionMs?: number,
    actualDurationSeconds?: number
  ): void {
    if (!this.isEnabled || !this.isReady) {
      // console.log('🔔 Bridge not available for MediaSession update');
      return;
    }

    try {
      // Create native Android MediaSession metadata (use actual duration if provided)
      const mediaMetadata = this.createMediaSessionMetadata(track, album, actualDurationSeconds);
      const playbackState = this.createMediaSessionPlaybackState(isPlaying, currentPositionMs || 0);

      // Create and validate metadata for caching
      const newMetadata = this.createNotificationMetadata(
        track,
        album,
        isPlaying,
        currentPositionMs
      );
      if (!this.validateMetadata(newMetadata)) {
        throw new Error('Invalid track metadata');
      }

      // Skip update if metadata hasn't changed AND position hasn't changed significantly
      if (this.isSameMetadata(newMetadata)) {
        const positionDiff = Math.abs(
          (currentPositionMs || 0) - (this.currentMetadata?.currentPositionMs || 0)
        );
        if (positionDiff < 1000) {
          // Less than 1 second difference
          return;
        }
        console.log(
          '🔔 Updating MediaSession for position change:',
          Math.round(positionDiff),
          'ms'
        );
      }

      console.log(
        '🔔 Updating MediaSession:',
        track.title,
        'by',
        SITE_TITLE,
        isPlaying ? '▶️' : '⏸️',
        'Position:',
        Math.round((currentPositionMs || 0) / 1000) + 's',
        '📡 Broadcasting to connected devices'
      );

      // Update Android MediaSession (this creates the native notification)
      window.AndroidBridge?.updateMediaSession(
        JSON.stringify(mediaMetadata),
        JSON.stringify(playbackState)
      );

      // Activate MediaSession for lockscreen, casting, and connected device broadcasting
      window.AndroidBridge?.setMediaSessionActive(true);

      // Cache the metadata for deduplication
      this.currentMetadata = newMetadata;

      this.dispatchEvent(
        new CustomEvent('media-session-updated', {
          detail: { track, album, isPlaying, position: currentPositionMs },
        })
      );
    } catch (error) {
      console.error('🔔 Failed to update MediaSession:', error);
      this.reportError({
        code: 'NOTIFICATION_FAILED',
        message: `MediaSession update failed: ${error.message}`,
        timestamp: Date.now(),
        context: { track: track.title, album: album.title },
        recoverable: true,
      });
    }
  }

  /**
   * PUBLIC API: Clear MediaSession
   * Called when playback stops or app goes to background
   */
  public clearNotification(): void {
    if (!this.isEnabled || !this.isReady) {
      console.log('🔔 Bridge not available for MediaSession clear');
      return;
    }

    try {
      console.log('🔔 Clearing MediaSession');

      // Deactivate and clear MediaSession
      window.AndroidBridge?.setMediaSessionActive(false);
      window.AndroidBridge?.clearMediaSession();
      this.currentMetadata = null;

      this.dispatchEvent(new CustomEvent('media-session-cleared'));
    } catch (error) {
      console.error('🔔 Failed to clear MediaSession:', error);
      this.reportError({
        code: 'NOTIFICATION_FAILED',
        message: `MediaSession clear failed: ${error.message}`,
        timestamp: Date.now(),
        recoverable: true,
      });
    }
  }

  /**
   * Create Android MediaSession metadata (native format)
   */
  private createMediaSessionMetadata(
    track: Track,
    album: Album,
    actualDurationSeconds?: number
  ): MediaSessionMetadata {
    // Use actual audio duration if provided, otherwise parse from track metadata
    const durationMs = actualDurationSeconds
      ? Math.round(actualDurationSeconds * 1000)
      : this.parseDurationToMs(track.duration);

    console.log(
      '🔔 Creating metadata with duration:',
      durationMs,
      'ms',
      actualDurationSeconds ? '(actual)' : '(parsed)'
    );

    return {
      'android.media.metadata.TITLE': track.title,
      'android.media.metadata.ARTIST': SITE_TITLE,
      'android.media.metadata.ALBUM': album.title,
      'android.media.metadata.DURATION': durationMs,
      'android.media.metadata.ART_URI': `https://asce1062.github.io${album.coverArt}`,

      // Enhanced display fields
      'android.media.metadata.DISPLAY_TITLE': track.title,
      'android.media.metadata.DISPLAY_SUBTITLE': SITE_TITLE,
      'android.media.metadata.DISPLAY_DESCRIPTION': album.title,

      // Additional metadata
      'android.media.metadata.ALBUM_ART_URI': `https://asce1062.github.io${album.coverArt}`,
      'android.media.metadata.GENRE': Array.isArray(track.genre)
        ? track.genre.join(', ')
        : track.genre?.[0] || '',
      'android.media.metadata.YEAR': new Date(album.releaseDate).getFullYear(),
      'android.media.metadata.ALBUM_ARTIST': SITE_TITLE,
      'android.media.metadata.MEDIA_ID': track.id,
      'android.media.metadata.MEDIA_URI': `https://asce1062.github.io${track.file}`,
    };
  }

  /**
   * Create Android MediaSession PlaybackState (native format)
   */
  private createMediaSessionPlaybackState(
    isPlaying: boolean,
    currentPositionMs: number
  ): AndroidMediaSessionPlaybackState {
    console.log(
      '🔔 CREATING PLAYBACK STATE: position =',
      currentPositionMs,
      'ms, playing =',
      isPlaying
    );

    // Calculate available actions bitmask
    const actions =
      PlaybackStateConstants.ACTION_PLAY |
      PlaybackStateConstants.ACTION_PAUSE |
      PlaybackStateConstants.ACTION_PLAY_PAUSE |
      PlaybackStateConstants.ACTION_SKIP_TO_NEXT |
      PlaybackStateConstants.ACTION_SKIP_TO_PREVIOUS |
      PlaybackStateConstants.ACTION_SEEK_TO |
      PlaybackStateConstants.ACTION_SET_REPEAT_MODE |
      PlaybackStateConstants.ACTION_SET_SHUFFLE_MODE;

    const playbackState = {
      state: isPlaying ? PlaybackStateConstants.STATE_PLAYING : PlaybackStateConstants.STATE_PAUSED,
      position: currentPositionMs,
      playbackSpeed: isPlaying ? 1.0 : 0.0,
      updateTime: Date.now(),
      actions: actions,

      // TO DO: Custom actions for additional controls
      customActions: [
        {
          action: 'favorite',
          name: 'Favorite',
          icon: 0, // Will need resource ID from native side
        },
        {
          action: 'share',
          name: 'Share',
          icon: 0, // Will need resource ID from native side
        },
      ],
    };

    console.log('🔔 PLAYBACK STATE CREATED:', JSON.stringify(playbackState, null, 2));
    return playbackState;
  }

  /**
   * Create rich media notification metadata (MediaCompat-style) - for caching
   */
  private createNotificationMetadata(
    track: Track,
    album: Album,
    isPlaying: boolean,
    currentPositionMs?: number
  ): NotificationMetadata {
    const durationMs = this.parseDurationToMs(track.duration);

    return {
      // Core track info
      title: track.title,
      artist: SITE_TITLE,
      album: album.title,
      artworkUrl: `https://asce1062.github.io${album.coverArt}`,
      durationMs: durationMs,
      isPlaying: isPlaying,

      // Additional metadata for rich notifications
      trackId: track.id,
      albumId: album.id,
      genre: Array.isArray(track.genre) ? track.genre.join(', ') : track.genre?.[0],
      year: new Date(album.releaseDate).getFullYear().toString(),

      // Rich Media Styling (MediaCompat-style)
      useArtworkBackground: true, // Use album art as notification background
      showLargeIcon: true, // Show large album art icon
      enableLockscreenControls: true, // Show controls on lockscreen
      enableCompactView: true, // Enable compact notification view

      // Playback Position (for lockscreen scrubbing)
      currentPositionMs: currentPositionMs,

      // Media Session Integration
      enableMediaSession: true, // Enable Android MediaSession integration
      enableCasting: true, // Enable casting to connected devices
      mediaSessionId: `session_${track.id}_${Date.now()}`,

      // Connected Device Broadcasting
      broadcastToDevices: true, // Broadcast to connected devices
      deviceTypes: ['bluetooth', 'wifi', 'chromecast', 'automotive'],

      // Notification Behavior
      priority: isPlaying ? 'high' : 'default', // Higher priority when playing
      category: 'media', // Android media notification category
      showWhen: false, // Don't show timestamp for media
      ongoing: isPlaying, // Persistent notification while playing

      // Background Playback Support
      backgroundPlayback: true, // Enable background playback
      allowInBackground: true, // Allow playback when app is backgrounded

      // Actions Configuration
      availableActions: ['previous', 'play', 'pause', 'next'] as NotificationAction[],
      customActions: [
        { action: 'favorite', icon: 'ic_favorite', title: 'Add to Favorites' },
        { action: 'share', icon: 'ic_share', title: 'Share Track' },
      ],
    };
  }

  /**
   * Check if metadata has changed (for deduplication)
   */
  private isSameMetadata(newMetadata: NotificationMetadata): boolean {
    if (!this.currentMetadata) return false;

    return (
      this.currentMetadata.title === newMetadata.title &&
      this.currentMetadata.artist === newMetadata.artist &&
      this.currentMetadata.album === newMetadata.album &&
      this.currentMetadata.isPlaying === newMetadata.isPlaying &&
      this.currentMetadata.artworkUrl === newMetadata.artworkUrl
    );
  }

  /**
   * Validate notification metadata
   */
  private validateMetadata(metadata: NotificationMetadata): boolean {
    const required = ['title', 'artist', 'album', 'artworkUrl'];
    const isValid = required.every(
      (field) => field in metadata && metadata[field as keyof NotificationMetadata] != null
    );

    if (!isValid) {
      console.error('🔔 Invalid notification metadata:', metadata);
    }

    return isValid;
  }

  /**
   * Parse duration string to milliseconds
   */
  private parseDurationToMs(duration: string): number {
    const parts = duration.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0], 10);
      const seconds = parseInt(parts[1], 10);
      return (minutes * 60 + seconds) * 1000;
    }
    return 0;
  }

  /**
   * Error reporting to native side
   */
  private reportError(error: BridgeError): void {
    if (!this.isEnabled || !window.AndroidBridge?.reportError) {
      console.log('🔔 Error reporting not available:', error);
      return;
    }

    try {
      const errorJson = JSON.stringify(error);
      window.AndroidBridge.reportError(errorJson);
      console.log('🔔 Error reported to native:', error.code);
    } catch (e) {
      console.error('🔔 Failed to report error to native:', e);
    }
  }

  /**
   * PUBLIC API: Utility methods
   */
  public isConnected(): boolean {
    return this.isEnabled && this.isReady;
  }

  public getBridgeVersion(): string {
    return this.bridgeVersion;
  }

  public getCurrentMetadata(): NotificationMetadata | null {
    return this.currentMetadata;
  }

  /**
   * PUBLIC API: Test the MediaSession bridge
   */
  public testNotificationBridge(): void {
    console.log('🔔 Testing MediaSession Bridge...');
    console.log('- Version:', this.bridgeVersion);
    console.log('- Enabled:', this.isEnabled);
    console.log('- Ready:', this.isReady);
    console.log('- Current metadata:', this.currentMetadata);

    if (!this.isEnabled) {
      console.log('🔔 Bridge not available for testing');
      return;
    }

    // Test with sample MediaSession
    try {
      const testMediaMetadata: MediaSessionMetadata = {
        'android.media.metadata.TITLE': 'Test Track',
        'android.media.metadata.ARTIST': SITE_TITLE,
        'android.media.metadata.ALBUM': 'Test Album',
        'android.media.metadata.DURATION': 180000,
        'android.media.metadata.ART_URI': 'https://asce1062.github.io/art/default-cover.png',
        'android.media.metadata.DISPLAY_TITLE': 'Test Track',
        'android.media.metadata.DISPLAY_SUBTITLE': SITE_TITLE,
        'android.media.metadata.DISPLAY_DESCRIPTION': 'Test Album',
        'android.media.metadata.ALBUM_ART_URI': 'https://asce1062.github.io/art/default-cover.png',
        'android.media.metadata.GENRE': 'Electronic',
        'android.media.metadata.YEAR': 2024,
        'android.media.metadata.MEDIA_ID': 'test-123',
      };

      const testPlaybackState: AndroidMediaSessionPlaybackState = {
        state: PlaybackStateConstants.STATE_PLAYING,
        position: 42000,
        playbackSpeed: 1.0,
        updateTime: Date.now(),
        actions:
          PlaybackStateConstants.ACTION_PLAY |
          PlaybackStateConstants.ACTION_PAUSE |
          PlaybackStateConstants.ACTION_SKIP_TO_NEXT |
          PlaybackStateConstants.ACTION_SKIP_TO_PREVIOUS |
          PlaybackStateConstants.ACTION_SEEK_TO,
      };

      console.log('🔔 Testing with sample MediaSession...');
      window.AndroidBridge?.updateMediaSession(
        JSON.stringify(testMediaMetadata),
        JSON.stringify(testPlaybackState)
      );
      window.AndroidBridge?.setMediaSessionActive(true);
      console.log('🔔 MediaSession bridge test completed successfully');
    } catch (error) {
      console.error('🔔 Notification bridge test failed:', error);
    }
  }

  /**
   * Start periodic position updates during playback
   * NOTE: Now mainly for fallback - MusicPlayerService drives most updates
   */
  public startPositionUpdates(): void {
    if (this.positionUpdateTimer) {
      clearInterval(this.positionUpdateTimer);
    }

    // Longer interval since MusicPlayerService handles frequent updates
    this.positionUpdateTimer = window.setInterval(() => {
      this.sendCurrentPositionUpdate();
    }, this.POSITION_UPDATE_INTERVAL * 2); // Every 2 seconds as fallback

    console.log(
      '🔔 Started fallback position updates (every',
      this.POSITION_UPDATE_INTERVAL * 2,
      'ms)'
    );
  }

  /**
   * Stop periodic position updates
   */
  public stopPositionUpdates(): void {
    if (this.positionUpdateTimer) {
      clearInterval(this.positionUpdateTimer);
      this.positionUpdateTimer = null;
      console.log('🔔 Stopped periodic position updates');
    }
  }

  /**
   * Send current position update to MediaSession
   * NOTE: This is now redundant since MusicPlayerService provides regular updates
   * Keeping for fallback/debugging purposes but may not be called regularly
   */
  private sendCurrentPositionUpdate(): void {
    try {
      // Use cached playback state provided by MusicPlayerService
      const state = this.currentPlaybackState;

      // Only send updates if playing and we have track info
      if (state?.isPlaying && state.currentTrack && state.currentAlbum) {
        const currentPositionMs = Math.round(state.currentTime * 1000);

        // Only update if position has changed significantly (avoid excessive calls)
        const lastPositionMs = this.currentMetadata?.currentPositionMs || 0;
        const positionDiff = Math.abs(currentPositionMs - lastPositionMs);

        if (positionDiff >= 500) {
          // Update if position changed by 0.5+ seconds
          console.log(
            '🔔 Fallback position update triggered:',
            Math.round(positionDiff),
            'ms diff'
          );
          this.updateNotification(state.currentTrack, state.currentAlbum, true, currentPositionMs);
        }
      }
    } catch (error) {
      console.warn('🔔 Failed to send position update:', error);
    }
  }

  /**
   * Update playback state (called by MusicPlayerService)
   */
  public updatePlaybackState(
    isPlaying: boolean,
    currentTrack: Track | null,
    currentAlbum: Album | null,
    currentTime: number,
    actualDuration?: number
  ): void {
    // console.log(
    //   '🔔 ANDROIDBRIDGE: updatePlaybackState called - playing:',
    //   isPlaying,
    //   'position:',
    //   Math.round(currentTime),
    //   's'
    // );

    this.currentPlaybackState = {
      isPlaying,
      currentTrack,
      currentAlbum,
      currentTime,
    };

    // No need to block updates during seek - let Android MediaSession handle progression like web MediaSession
    // Update MediaSession only on meaningful state or content changes (like web MediaSession)
    if (currentTrack && currentAlbum) {
      const stateChanged = this.currentMetadata?.isPlaying !== isPlaying;
      const trackChanged = this.currentMetadata?.trackId !== currentTrack.id;
      const albumChanged = this.currentMetadata?.albumId !== currentAlbum.id;

      // console.log(
      //   '🔔 ANDROIDBRIDGE: Change detection - stateChanged:',
      //   stateChanged,
      //   'trackChanged:',
      //   trackChanged,
      //   'albumChanged:',
      //   albumChanged
      // );

      // Only update on actual state/track/album changes, not position drift
      if (stateChanged || trackChanged || albumChanged) {
        const currentPositionMs = Math.round(currentTime * 1000);

        if (stateChanged) {
          // console.log(
          //   '🔔 ANDROIDBRIDGE: Play state changed to',
          //   isPlaying ? '▶️ PLAYING' : '⏸️ PAUSED',
          //   'at position:',
          //   Math.round(currentTime * 1000),
          //   'ms (' + Math.round(currentTime) + 's)'
          // );
        } else if (trackChanged || albumChanged) {
          // console.log(
          //   '🔔 ANDROIDBRIDGE: Track/Album changed - updating MediaSession:',
          //   currentTrack.title,
          //   'by',
          //   currentAlbum.title
          // );
        }

        this.updateNotification(
          currentTrack,
          currentAlbum,
          isPlaying,
          currentPositionMs,
          actualDuration
        );
      } else {
        // console.log(
        //   '🔔 ANDROIDBRIDGE: No significant changes detected - skipping MediaSession update'
        // );
      }
    } else {
      console.warn('🔔 ANDROIDBRIDGE: updatePlaybackState called but no track/album provided');
    }
  }

  /**
   * Force position update (for seeks, loop restarts, etc.)
   */
  public forcePositionUpdate(
    currentTime: number,
    forcePlayingState?: boolean,
    actualDurationSeconds?: number
  ): void {
    if (this.currentPlaybackState?.currentTrack && this.currentPlaybackState?.currentAlbum) {
      const playingState =
        forcePlayingState !== undefined ? forcePlayingState : this.currentPlaybackState.isPlaying;
      console.log(
        '🔔 ANDROIDBRIDGE: forcePositionUpdate called - position:',
        Math.round(currentTime),
        's, playing:',
        playingState,
        '📡 Broadcasting to connected devices'
      );
      this.updateNotification(
        this.currentPlaybackState.currentTrack,
        this.currentPlaybackState.currentAlbum,
        playingState,
        Math.round(currentTime * 1000),
        actualDurationSeconds
      );
    } else {
      console.warn('🔔 ANDROIDBRIDGE: forcePositionUpdate called but no track/album available');
    }
  }


  /**
   * Debug method to track position updates and connected device broadcasting
   */
  public debugPositionUpdates(): void {
    console.log('🔔 AndroidBridge Debug Info:');
    console.log('- Current metadata:', this.currentMetadata);
    console.log('- Current playback state:', this.currentPlaybackState);
    console.log('- Position update timer active:', !!this.positionUpdateTimer);
    console.log(
      '- Connected device broadcasting enabled:',
      this.currentMetadata?.broadcastToDevices
    );
    console.log('- Device types:', this.currentMetadata?.deviceTypes);
    console.log('- MediaSession casting enabled:', this.currentMetadata?.enableCasting);
  }

  /**
   * Test connected device broadcasting
   */
  public testConnectedDeviceBroadcast(): void {
    console.log('🔔 Testing connected device broadcast...');
    if (this.currentPlaybackState?.currentTrack && this.currentPlaybackState?.currentAlbum) {
      console.log('📡 Sending test broadcast to connected devices');
      this.forcePositionUpdate(
        this.currentPlaybackState.currentTime,
        this.currentPlaybackState.isPlaying
      );
    } else {
      console.log('❌ No active track for connected device broadcast test');
    }
  }

  /**
   * Cleanup and destroy
   */
  public destroy(): void {
    // Stop position updates
    this.stopPositionUpdates();

    // Clear current notification
    this.clearNotification();

    // Clean up event handlers
    if (typeof window !== 'undefined') {
      window.onNotificationAction = undefined;
      window.onBridgeReady = undefined;
    }

    console.log('🔔 Notification AndroidBridge service destroyed');
    AndroidBridgeService.instance = null;
  }
}

// Export singleton instance
export const androidBridgeService = AndroidBridgeService.getInstance();

// Global access for testing
if (typeof window !== 'undefined') {
  (window as any).androidBridgeService = androidBridgeService;
}
