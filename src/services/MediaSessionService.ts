import type {
  Track,
  Album,
  ArtworkInfo,
  ExtractedMetadata,
  QueueItem,
  MediaSessionManagerEventMap,
  PlaybackState,
} from '../types/types';

class MediaSessionManager extends EventTarget {
  private static instance: MediaSessionManager | null = null;
  private isSupported: boolean = false;
  private currentTrack: Track | null = null;
  private currentAlbum: Album | null = null;
  private isShuffled: boolean = false;
  private isLooping: boolean = false;
  private currentPlaybackState: MediaSessionPlaybackState = 'none';

  // Enhanced position tracking for better device synchronization
  private lastPositionUpdate: number = 0;
  private positionUpdateThrottle: number = 500; // 500ms throttle
  private lastKnownPosition: number = 0;
  private lastKnownDuration: number = 0;
  private positionUpdateTimer: number | null = null;

  // Remote Playback API support
  private remotePlaybackSupported: boolean = false;
  private remoteDevicesAvailable: boolean = false;
  private currentAudioElement: HTMLAudioElement | null = null;
  private remotePlaybackState: string = 'disconnected';

  // Queue management
  private currentQueue: QueueItem[] = [];
  private currentQueueIndex: number = 0;
  // Removed unused queue order tracking properties

  private constructor() {
    super();
    this.checkSupport();
    this.setupActionHandlers();
  }

  // Singleton pattern
  public static getInstance(): MediaSessionManager {
    if (!MediaSessionManager.instance) {
      MediaSessionManager.instance = new MediaSessionManager();
    }
    return MediaSessionManager.instance;
  }

  private checkSupport(): void {
    // Detection for Media Session API compatibility
    this.isSupported = this.detectMediaSessionSupport();

    // Detection for Remote Playback API compatibility
    this.remotePlaybackSupported = this.detectRemotePlaybackSupport();

    if (!this.isSupported) {
      console.warn('🎵 Media Session API is not supported in this browser');
    } else {
      console.log('🎵 Media Session API is supported and ready');
    }

    if (this.remotePlaybackSupported) {
      console.log('📡 Remote Playback API is supported and ready');
      this.setupRemotePlayback();
    } else {
      console.warn('📡 Remote Playback API is not supported in this browser');
    }
  }

  private detectMediaSessionSupport(): boolean {
    console.log('🔍 Starting Media Session API detection...');

    try {
      // Check for basic Media Session API
      console.log('🔍 Step 1: Checking for navigator.mediaSession...');
      if (!('mediaSession' in navigator)) {
        console.warn('❌ navigator.mediaSession not found');
        return false;
      }
      console.log('✅ navigator.mediaSession exists');

      // Check for essential properties and methods
      console.log('🔍 Step 2: Checking mediaSession object...');
      const mediaSession = navigator.mediaSession;
      if (!mediaSession) {
        console.warn('❌ navigator.mediaSession is null/undefined');
        return false;
      }
      console.log('✅ navigator.mediaSession object is valid');

      // Check for required methods with detailed logging
      console.log('🔍 Step 3: Checking required methods...');
      const requiredMethods = ['setActionHandler', 'setPositionState'];
      const methodResults: { [key: string]: boolean } = {};

      for (const method of requiredMethods) {
        const exists = typeof (mediaSession as any)[method] === 'function';
        methodResults[method] = exists;
        console.log(`${exists ? '✅' : '❌'} ${method}: ${exists ? 'available' : 'missing'}`);

        if (!exists) {
          console.warn(`🎵 Media Session missing method: ${method}`);
          console.log('🔍 Available methods:', Object.getOwnPropertyNames(mediaSession));
          return false;
        }
      }

      // Check if we can create MediaMetadata
      console.log('🔍 Step 4: Testing MediaMetadata constructor...');
      try {
        const testMetadata = new MediaMetadata({
          title: 'Test',
          artist: 'Test',
          album: 'Test',
        });
        console.log('✅ MediaMetadata constructor works');

        // Test if we can assign it
        try {
          const originalMetadata = mediaSession.metadata;
          mediaSession.metadata = testMetadata;
          mediaSession.metadata = originalMetadata; // Restore
          console.log('✅ MediaMetadata assignment works');
        } catch (assignError) {
          console.warn('❌ MediaMetadata assignment failed:', assignError);
          return false;
        }
      } catch (error) {
        console.warn('❌ MediaMetadata constructor not available:', error);
        return false;
      }

      // Test setActionHandler with a dummy function
      console.log('🔍 Step 5: Testing setActionHandler...');
      try {
        mediaSession.setActionHandler('play', () => {}); // Dummy handler
        console.log('✅ setActionHandler works');
      } catch (handlerError) {
        console.warn('❌ setActionHandler test failed:', handlerError);
        return false;
      }

      // Test setPositionState
      console.log('🔍 Step 6: Testing setPositionState...');
      try {
        mediaSession.setPositionState({
          duration: 100,
          playbackRate: 1.0,
          position: 50,
        });
        console.log('✅ setPositionState works');
      } catch (positionError) {
        console.warn('❌ setPositionState test failed:', positionError);
        return false;
      }

      console.log('🎉 All Media Session API checks passed!');
      return true;
    } catch (error) {
      console.error('🎵 Error detecting Media Session support:', error);
      console.log('🔍 User Agent:', navigator.userAgent);
      console.log(
        '🔍 Window object keys:',
        Object.keys(window).filter((key) => key.toLowerCase().includes('media'))
      );
      return false;
    }
  }

  private detectRemotePlaybackSupport(): boolean {
    console.log('🔍 Starting Remote Playback API detection...');

    try {
      // Check if HTMLMediaElement has remote property
      const testAudio = document.createElement('audio');

      if ('remote' in testAudio) {
        console.log('✅ Remote Playback API is available');
        return true;
      } else {
        console.log('❌ Remote Playback API not found');
        return false;
      }
    } catch (error) {
      console.error('🔍 Error detecting Remote Playback API:', error);
      return false;
    }
  }

  private setupRemotePlayback(): void {
    console.log('📡 Setting up Remote Playback API...');

    // We'll set up remote playback when we have an audio element
    // This will be called from setAudioElement method
  }

  public setAudioElement(audioElement: HTMLAudioElement): void {
    this.currentAudioElement = audioElement;

    if (this.remotePlaybackSupported && audioElement && 'remote' in audioElement) {
      this.initializeRemotePlayback(audioElement);
    }
  }

  private initializeRemotePlayback(audioElement: HTMLAudioElement): void {
    const remote = (audioElement as any).remote;

    if (!remote) return;

    try {
      // Watch for available remote playback devices
      remote.watchAvailability((available: boolean) => {
        console.log(`📡 Remote devices ${available ? 'available' : 'unavailable'}`);
        this.remoteDevicesAvailable = available;
        this.emitEvent('remote-device-available', { available });
      });

      // Listen for state changes
      remote.addEventListener('connecting', () => {
        console.log('📡 Connecting to remote device...');
        this.remotePlaybackState = 'connecting';
        this.emitEvent('remote-playback-state-changed', { state: 'connecting' });
      });

      remote.addEventListener('connect', () => {
        console.log('📡 Connected to remote device');
        this.remotePlaybackState = 'connected';
        this.emitEvent('remote-playback-state-changed', { state: 'connected' });
        this.emitEvent('remote-device-connected', {
          deviceId: 'remote-device',
          deviceName: 'Remote Device',
        });
      });

      remote.addEventListener('disconnect', () => {
        console.log('📡 Disconnected from remote device');
        this.remotePlaybackState = 'disconnected';
        this.emitEvent('remote-playback-state-changed', { state: 'disconnected' });
      });
    } catch (error) {
      console.warn('📡 Error setting up remote playback listeners:', error);
    }
  }

  private extractMetadataFromTrack(track: Track, album: Album): ExtractedMetadata {
    // Enhanced artist extraction with multiple strategies
    let title = track.title;
    let artist = 'Unknown Artist';
    let foundArtist = false;

    // Strategy 1: Extract from track title with common separators
    const separators = [' - ', ' – ', ' — ', ' | ', ' by ', ' BY ', ': ', ' : '];

    for (const separator of separators) {
      if (track.title.includes(separator)) {
        const parts = track.title.split(separator);
        if (parts.length >= 2) {
          // For "by" separators, artist comes after
          if (separator.toLowerCase().includes('by')) {
            artist = parts[1].trim();
            title = parts[0].trim();
          } else {
            // For other separators, artist comes first
            artist = parts[0].trim();
            title = parts.slice(1).join(separator).trim();
          }
          foundArtist = true;
          break;
        }
      }
    }

    // Strategy 2: Check for parenthetical artist info like "Title (feat. Artist)"
    if (!foundArtist) {
      const featMatch = track.title.match(/(.*?)\s*\((?:feat\.?|featuring|ft\.?)\s+([^)]+)\)/i);
      if (featMatch) {
        title = featMatch[1].trim();
        artist = featMatch[2].trim();
        foundArtist = true;
      }
    }

    // Strategy 3: Check for square bracket artist info like "Title [Artist]"
    if (!foundArtist) {
      const bracketMatch = track.title.match(/(.*?)\s*\[([^\]]+)\]/);
      if (bracketMatch) {
        const potentialArtist = bracketMatch[2].trim();
        // Only use if it doesn't look like metadata (year, genre, etc.)
        if (
          !potentialArtist.match(/^\d{4}$/) &&
          !potentialArtist.toLowerCase().match(/^(remix|mix|version|edit|remaster)$/)
        ) {
          title = bracketMatch[1].trim();
          artist = potentialArtist;
          foundArtist = true;
        }
      }
    }

    // Strategy 4: Use album title as artist if it doesn't look like a compilation
    if (!foundArtist && album.title && album.title !== 'Unknown Album') {
      // Avoid using album title if it looks like a compilation
      const compilationKeywords = [
        'compilation',
        'greatest hits',
        'best of',
        'collection',
        'anthology',
        'mixtape',
        'various artists',
      ];
      const isCompilation = compilationKeywords.some((keyword) =>
        album.title.toLowerCase().includes(keyword)
      );

      if (!isCompilation) {
        artist = album.title;
        foundArtist = true;
      }
    }

    // Strategy 5: Enhanced fallback - try to extract from filename patterns
    if (!foundArtist && track.file) {
      const filename = track.file.split('/').pop() || '';
      const nameWithoutExt = filename.replace(/\.[^.]+$/, '');

      for (const separator of separators) {
        if (nameWithoutExt.includes(separator)) {
          const parts = nameWithoutExt.split(separator);
          if (parts.length >= 2) {
            artist = parts[0].trim();
            // Update title only if current title looks generic
            if (title === track.title && (title.includes('.') || title.length < 5)) {
              title = parts.slice(1).join(separator).trim();
            }
            foundArtist = true;
            break;
          }
        }
      }
    }

    // Enhanced artwork generation with better fallback strategies
    const baseArtworkUrl = album.coverArt.startsWith('/')
      ? `${window.location.origin}${album.coverArt}`
      : album.coverArt;

    // Generate artwork sizes - MediaSession has limits on number of images
    const artwork: ArtworkInfo[] = [
      { src: baseArtworkUrl, sizes: '512x512', type: 'image/png' },
      { src: baseArtworkUrl, sizes: '256x256', type: 'image/png' },
      { src: baseArtworkUrl, sizes: '128x128', type: 'image/png' },
    ];

    // Enhanced fallback artwork system using actual directory structure
    if (!baseArtworkUrl.includes('default-cover.png')) {
      // First fallback: Try specific album artwork path
      const albumSlug = album.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Remove multiple consecutive hyphens
        .trim();

      if (albumSlug) {
        const albumFallbackUrl = `${window.location.origin}/art/${albumSlug}/cover.png`;
        artwork.push(
          { src: albumFallbackUrl, sizes: '512x512', type: 'image/png' },
          { src: albumFallbackUrl, sizes: '256x256', type: 'image/png' }
        );
      }

      // Final fallback: Default cover
      const defaultFallbackUrl = `${window.location.origin}/art/default-cover.png`;
      artwork.push(
        { src: defaultFallbackUrl, sizes: '512x512', type: 'image/png' },
        { src: defaultFallbackUrl, sizes: '256x256', type: 'image/png' },
        { src: defaultFallbackUrl, sizes: '128x128', type: 'image/png' },
        { src: defaultFallbackUrl, sizes: '96x96', type: 'image/png' }
      );
    }

    // Clean up title and artist for better display
    const cleanTitle = title.replace(/\.(mp3|wav|flac|m4a|ogg)$/i, '').trim();
    const cleanArtist = artist.replace(/^(the|a|an)\s+/i, '').trim();

    // Extract genre and year information if available
    let genre: string | undefined;
    let year: string | undefined;

    // Try to extract year from track title or album title (YYYY format)
    const yearMatch = (track.title + ' ' + album.title).match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      year = yearMatch[0];
    }

    // Extract genre from track metadata first, then fallback to detection
    if (track.genre && track.genre.length > 0) {
      genre = track.genre[0]; // Use first genre from track metadata
    } else if (album.genre && album.genre.length > 0) {
      genre = album.genre[0]; // Use first genre from album metadata
    } else {
      // Fallback: Try to extract genre from titles and file paths
      const genreKeywords = [
        'rock',
        'pop',
        'jazz',
        'classical',
        'electronic',
        'hip-hop',
        'rap',
        'country',
        'blues',
        'reggae',
        'folk',
        'metal',
        'punk',
        'indie',
        'alternative',
        'ambient',
        'dance',
        'house',
        'techno',
        'trance',
        'dubstep',
        'drum and bass',
        'funk',
        'soul',
        'r&b',
        'gospel',
        'world',
        'latin',
        'ska',
        'disco',
        'new age',
      ];

      const textToSearch = `${album.title} ${track.file || ''} ${track.title}`.toLowerCase();
      for (const genreKeyword of genreKeywords) {
        if (textToSearch.includes(genreKeyword.toLowerCase())) {
          genre = genreKeyword.charAt(0).toUpperCase() + genreKeyword.slice(1);
          break;
        }
      }
    }

    // Extract year from common patterns in titles
    if (!year) {
      const patterns = [
        /\((\d{4})\)/, // (2025)
        /\[(\d{4})\]/, // [2025]
        /\s(\d{4})\s/, // 2025
        /-\s*(\d{4})\s*-/, // - 2025 -
      ];

      for (const pattern of patterns) {
        const match = (track.title + ' ' + album.title).match(pattern);
        if (match && match[1]) {
          const yearNum = parseInt(match[1]);
          if (yearNum >= 1900 && yearNum <= new Date().getFullYear() + 1) {
            year = match[1];
            break;
          }
        }
      }
    }

    return {
      title: cleanTitle || track.title,
      artist: cleanArtist || artist,
      album: album.title || 'Unknown Album',
      artwork,
      genre,
      year,
    };
  }

  // Queue management methods
  public updateQueue(currentTrack: Track, album: Album, isShuffled: boolean = false): void {
    console.log('🎵 Updating Media Session queue for album:', album.title);

    // Create queue items with proper IDs and indices
    let queueOrder = album.tracks.map((_, index) => index);

    // Apply shuffle if needed
    if (isShuffled) {
      queueOrder = this.generateShuffleOrder(album.tracks.length);
    }

    // Build the queue
    this.currentQueue = queueOrder.map((trackIndex, displayIndex) => ({
      track: album.tracks[trackIndex],
      album: album,
      queueId: `${album.id}-${album.tracks[trackIndex].id}-${displayIndex}`,
      originalIndex: trackIndex,
      displayIndex: displayIndex + 1, // 1-based for display
    }));

    // Find current track position in queue
    this.currentQueueIndex = this.findTrackInQueue(currentTrack.id);

    console.log(
      `🎵 Queue updated: ${this.currentQueue.length} tracks, current position: ${
        this.currentQueueIndex + 1
      }/${this.currentQueue.length}`
    );

    // Emit queue update event
    this.emitEvent('queue-updated', {
      queue: this.currentQueue,
      currentIndex: this.currentQueueIndex,
    });
  }

  private generateShuffleOrder(length: number): number[] {
    const order = Array.from({ length }, (_, i) => i);

    // Fisher-Yates shuffle
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    return order;
  }

  private findTrackInQueue(trackId: string): number {
    const index = this.currentQueue.findIndex((item) => item.track.id === trackId);
    return index >= 0 ? index : 0;
  }

  /**
   * Updates the current queue index based on a track ID without regenerating the queue
   * @param trackId - The ID of the track to find and set as current
   */
  public updateQueueIndex(trackId: string): void {
    if (this.currentQueue.length === 0) {
      console.warn('🎵 Cannot update queue index: queue is empty');
      return;
    }

    const newIndex = this.findTrackInQueue(trackId);
    const oldIndex = this.currentQueueIndex;

    if (newIndex !== oldIndex) {
      this.currentQueueIndex = newIndex;

      console.log(
        `🎵 Queue index updated from ${oldIndex + 1} to ${newIndex + 1}/${
          this.currentQueue.length
        } for track: ${trackId}`
      );

      // Emit queue navigation event to notify about the index change
      this.emitEvent('queue-updated', {
        queue: this.currentQueue,
        currentIndex: this.currentQueueIndex,
      });
    } else {
      console.log(
        `🎵 Queue index unchanged: already at position ${newIndex + 1}/${
          this.currentQueue.length
        } for track: ${trackId}`
      );
    }
  }

  public reorderQueue(newOrder: QueueItem[]): boolean {
    if (!newOrder || newOrder.length !== this.currentQueue.length) {
      console.warn('🎵 Invalid queue reorder: length mismatch');
      return false;
    }

    console.log('🎵 Reordering queue...');

    // Find the currently playing track in the new order
    const currentTrackId = this.currentQueue[this.currentQueueIndex]?.track.id;
    const newCurrentIndex = newOrder.findIndex((item) => item.track.id === currentTrackId);

    if (newCurrentIndex === -1) {
      console.warn('🎵 Current track not found in new queue order');
      return false;
    }

    // Update queue with new order and corrected display indices
    this.currentQueue = newOrder.map((item, index) => ({
      ...item,
      displayIndex: index + 1,
    }));

    this.currentQueueIndex = newCurrentIndex;

    console.log(
      `🎵 Queue reordered: current position now ${this.currentQueueIndex + 1}/${
        this.currentQueue.length
      }`
    );

    // Emit reorder event
    this.emitEvent('queue-reordered', {
      newQueue: this.currentQueue,
      newCurrentIndex: this.currentQueueIndex,
    });

    return true;
  }

  public getQueue(): { queue: QueueItem[]; currentIndex: number; totalTracks: number } {
    return {
      queue: this.currentQueue,
      currentIndex: this.currentQueueIndex,
      totalTracks: this.currentQueue.length,
    };
  }

  public getNextTrackInQueue(): QueueItem | null {
    if (this.currentQueue.length === 0) return null;

    const nextIndex = this.currentQueueIndex + 1;
    if (nextIndex >= this.currentQueue.length) {
      // Handle loop mode or end of queue
      return this.isLooping ? this.currentQueue[0] : null;
    }

    return this.currentQueue[nextIndex];
  }

  public getPreviousTrackInQueue(): QueueItem | null {
    if (this.currentQueue.length === 0) return null;

    const prevIndex = this.currentQueueIndex - 1;
    if (prevIndex < 0) {
      // Handle loop mode or beginning of queue
      return this.isLooping ? this.currentQueue[this.currentQueue.length - 1] : null;
    }

    return this.currentQueue[prevIndex];
  }

  public jumpToQueuePosition(queueIndex: number): QueueItem | null {
    if (queueIndex < 0 || queueIndex >= this.currentQueue.length) {
      console.warn(`🎵 Invalid queue position: ${queueIndex}`);
      return null;
    }

    this.currentQueueIndex = queueIndex;
    console.log(`🎵 Jumped to queue position: ${queueIndex + 1}/${this.currentQueue.length}`);

    return this.currentQueue[queueIndex];
  }

  public selectTrackFromQueue(queueIndex: number): boolean {
    if (queueIndex < 0 || queueIndex >= this.currentQueue.length) {
      console.warn(`🎵 Invalid queue index for track selection: ${queueIndex}`);
      return false;
    }

    const selectedItem = this.currentQueue[queueIndex];
    const isCurrentTrack = queueIndex === this.currentQueueIndex;

    console.log(
      `🎵 Selecting track from queue: position ${queueIndex + 1}/${
        this.currentQueue.length
      }, isCurrent: ${isCurrentTrack}`
    );

    // Update current queue position
    this.currentQueueIndex = queueIndex;

    // Emit track selection event
    this.emitEvent('queue-track-selected', {
      queueIndex,
      track: selectedItem.track,
      shouldTogglePlayback: isCurrentTrack,
    });

    return true;
  }

  public getQueueTrackList(): {
    index: number;
    title: string;
    artist: string;
    isCurrent: boolean;
  }[] {
    return this.currentQueue.map((item, index) => {
      const extractedMetadata = this.extractMetadataFromTrack(item.track, item.album);

      return {
        index,
        title: extractedMetadata.title,
        artist: extractedMetadata.artist,
        isCurrent: index === this.currentQueueIndex,
      };
    });
  }

  public enhanceMetadataWithQueueContext(extractedMetadata: ExtractedMetadata): ExtractedMetadata {
    if (this.currentQueue.length === 0) {
      return extractedMetadata;
    }

    const queueInfo = this.getQueue();
    const nextTrack = this.getNextTrackInQueue();
    const previousTrack = this.getPreviousTrackInQueue();

    // Create enhanced metadata with queue context
    const enhancedMetadata = { ...extractedMetadata };

    // Add queue position information to album title
    if (queueInfo.totalTracks > 1) {
      const queueContext = `${queueInfo.currentIndex + 1}/${queueInfo.totalTracks}`;
      enhancedMetadata.album = `${extractedMetadata.album} • Queue: ${queueContext}`;
    }

    // Add next/previous track hints to genre or create a new field
    let contextHints: string[] = [];

    if (previousTrack) {
      const prevMetadata = this.extractMetadataFromTrack(previousTrack.track, previousTrack.album);
      contextHints.push(`Previous: ${prevMetadata.title}`);
    }

    if (nextTrack) {
      const nextMetadata = this.extractMetadataFromTrack(nextTrack.track, nextTrack.album);
      contextHints.push(`Next: ${nextMetadata.title}`);
    }

    // Enhance the genre field with context if we have hints
    if (contextHints.length > 0) {
      const baseGenre = extractedMetadata.genre || 'Unknown';
      enhancedMetadata.genre = `${baseGenre} • ${contextHints.join(' • ')}`;
    }

    return enhancedMetadata;
  }

  private setupActionHandlers(): void {
    if (!this.isSupported) return;

    // Set up handlers for all browsers using unified approach
    try {
      // Basic playback controls
      navigator.mediaSession.setActionHandler('play', this.handlePlay.bind(this));
      navigator.mediaSession.setActionHandler('pause', this.handlePause.bind(this));
      navigator.mediaSession.setActionHandler('stop', this.handleStop.bind(this));

      // Track navigation
      navigator.mediaSession.setActionHandler('previoustrack', this.handlePreviousTrack.bind(this));
      navigator.mediaSession.setActionHandler('nexttrack', this.handleNextTrack.bind(this));

      // Seek controls
      navigator.mediaSession.setActionHandler('seekbackward', this.handleSeekBackward.bind(this));
      navigator.mediaSession.setActionHandler('seekforward', this.handleSeekForward.bind(this));
      navigator.mediaSession.setActionHandler('seekto', this.handleSeekTo.bind(this));

      console.log('🎵 Media Session action handlers registered');
    } catch (error) {
      console.warn('🎵 Error setting up Media Session action handlers:', error);
    }
  }

  // Enhanced action handler methods with broadcast functionality
  private handlePlay(): void {
    console.log('🎵 Media Session: Play action triggered');
    this.broadcastMediaAction('play', {
      isShuffled: this.isShuffled,
      isLooping: this.isLooping,
    });
  }

  private handlePause(): void {
    console.log('🎵 Media Session: Pause action triggered');
    this.broadcastMediaAction('pause', {
      isShuffled: this.isShuffled,
      isLooping: this.isLooping,
    });
  }

  private handleStop(): void {
    console.log('🎵 Media Session: Stop action triggered');
    this.broadcastMediaAction('stop', {
      isShuffled: this.isShuffled,
      isLooping: this.isLooping,
    });
  }

  private handlePreviousTrack(): void {
    console.log('🎵 Media Session: Previous track action triggered');

    // Let MusicPlayerService handle all navigation logic
    this.broadcastMediaAction('previoustrack', {
      isShuffled: this.isShuffled,
      isLooping: this.isLooping,
    });
  }

  private handleNextTrack(): void {
    console.log('🎵 Media Session: Next track action triggered');

    // Let MusicPlayerService handle all navigation logic
    this.broadcastMediaAction('nexttrack', {
      isShuffled: this.isShuffled,
      isLooping: this.isLooping,
    });
  }

  private handleSeekBackward(details: MediaSessionActionDetails): void {
    const seekOffset = (details as any).seekOffset || 10;
    console.log(`🎵 Media Session: Seek backward ${seekOffset}s`);
    this.broadcastMediaAction('seekbackward', {
      seekOffset,
      currentPosition: this.lastKnownPosition,
    });
  }

  private handleSeekForward(details: MediaSessionActionDetails): void {
    const seekOffset = (details as any).seekOffset || 10;
    console.log(`🎵 Media Session: Seek forward ${seekOffset}s`);
    this.broadcastMediaAction('seekforward', {
      seekOffset,
      currentPosition: this.lastKnownPosition,
    });
  }

  private handleSeekTo(details: MediaSessionActionDetails): void {
    const seekTime = (details as any).seekTime || 0;
    console.log(`🎵 Media Session: Seek to ${seekTime}s`);
    this.broadcastMediaAction('seekto', {
      seekTime,
      duration: this.lastKnownDuration,
    });
  }

  private emitEvent<K extends keyof MediaSessionManagerEventMap>(
    type: K,
    detail: MediaSessionManagerEventMap[K] extends CustomEvent<infer D> ? D : never
  ): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  // Enhanced broadcast functionality for better device compatibility
  private broadcastMediaAction(action: string, details?: any): void {
    // Emit standard event for music player integration
    this.emitEvent('action-triggered', {
      action,
      details: {
        ...details,
        timestamp: Date.now(),
        source: 'MediaSession',
      },
    });

    // Enhanced logging for debugging device interactions
    console.log(`🔊 Broadcasting media action: ${action}`, {
      action,
      details,
      deviceInfo: {
        userAgent: navigator.userAgent,
        mediaSessionSupported: this.isSupported,
      },
    });

    // Future: Add Remote Playback API broadcast here
    this.broadcastToRemoteDevices(action, details);
  }

  // Remote Playback API integration
  private broadcastToRemoteDevices(action: string, details?: any): void {
    if (!this.remotePlaybackSupported || !this.currentAudioElement) {
      console.log(
        `📡 Remote device broadcast skipped: ${action} (not supported or no audio element)`
      );
      return;
    }

    const remote = (this.currentAudioElement as any).remote;
    if (!remote) return;

    try {
      switch (action) {
        case 'play':
          if (this.remotePlaybackState === 'connected') {
            console.log('📡 Broadcasting play to remote device');
            // Remote device will handle playback automatically
          }
          break;

        case 'pause':
          if (this.remotePlaybackState === 'connected') {
            console.log('📡 Broadcasting pause to remote device');
            // Remote device will handle pause automatically
          }
          break;

        case 'seekto':
          if (this.remotePlaybackState === 'connected' && details?.seekTime !== undefined) {
            console.log(`📡 Broadcasting seek to ${details.seekTime}s to remote device`);
            this.currentAudioElement.currentTime = details.seekTime;
          }
          break;

        default:
          console.log(`📡 Broadcasting ${action} to remote device:`, details);
          break;
      }
    } catch (error) {
      console.warn(`📡 Error broadcasting ${action} to remote device:`, error);
    }
  }

  // Public method to trigger remote playback
  public promptRemotePlayback(): void {
    if (!this.remotePlaybackSupported || !this.currentAudioElement) {
      console.warn('📡 Remote playback not supported or no audio element available');
      return;
    }

    const remote = (this.currentAudioElement as any).remote;
    if (!remote) return;

    try {
      remote
        .prompt()
        .then(() => {
          console.log('📡 Remote playback prompt successful');
        })
        .catch((error: any) => {
          console.warn('📡 Remote playback prompt failed:', error);
        });
    } catch (error) {
      console.warn('📡 Error prompting remote playback:', error);
    }
  }

  // Public API methods
  public updateMetadata(track: Track, album: Album, trackIndex?: number): void {
    if (!this.isSupported) return;

    this.currentTrack = track;
    this.currentAlbum = album;

    try {
      const extractedMetadata = this.extractMetadataFromTrack(track, album);

      // Calculate position using the provided trackIndex
      const position = trackIndex !== undefined ? trackIndex + 1 : 1;
      const totalTracks = album.tracks.length;

      // Update metadata with position info
      const enhancedTitle =
        totalTracks > 1
          ? `${extractedMetadata.title} (${position}/${totalTracks})`
          : extractedMetadata.title;

      const metadata = new MediaMetadata({
        title: enhancedTitle,
        artist: extractedMetadata.artist,
        album: `${extractedMetadata.album}${
          totalTracks > 1 ? ` • Track ${position} of ${totalTracks}` : ''
        }`,
        artwork: extractedMetadata.artwork.map((art) => ({
          src: art.src,
          sizes: art.sizes,
          type: art.type,
        })),
      });

      navigator.mediaSession.metadata = metadata;

      // Reset position state for new track to prevent showing stale position from previous track
      this.lastKnownPosition = 0;
      this.lastKnownDuration = 0;
      this.lastPositionUpdate = 0;

      // Clear any existing position timer to prevent conflicts
      if (this.positionUpdateTimer) {
        clearTimeout(this.positionUpdateTimer);
        this.positionUpdateTimer = null;
      }

      // Explicitly set position to 0 for new track
      try {
        navigator.mediaSession.setPositionState({
          duration: 0, // Will be updated when playback state is set
          playbackRate: 1.0, // Cannot be zero per MediaSession API spec
          position: 0,
        });
      } catch (error) {
        console.warn('🎵 Failed to reset position state for new track:', error);
      }

      console.log('🎵 Media Session metadata updated:', {
        title: extractedMetadata.title,
        artist: extractedMetadata.artist,
        album: extractedMetadata.album,
        genre: extractedMetadata.genre || 'Unknown',
        year: extractedMetadata.year || 'Unknown',
        artworkSizes: extractedMetadata.artwork.length,
        trackPosition: `${position}/${totalTracks}`,
      });
      console.log('🎵 Reset position state for new track');

      this.emitEvent('metadata-updated', { track, album, metadata });
    } catch (error) {
      console.warn('🎵 Error updating Media Session metadata:', error);
    }
  }

  public updatePlaybackState(state: PlaybackState): void {
    if (!this.isSupported) return;

    try {
      let playbackState: MediaSessionPlaybackState = 'none';

      if (state.currentTrack) {
        playbackState = state.isPlaying ? 'playing' : 'paused';
      }

      // Only update if state actually changed to reduce API calls
      if (this.currentPlaybackState !== playbackState) {
        this.currentPlaybackState = playbackState;
        navigator.mediaSession.playbackState = playbackState;

        console.log('🎵 Media Session playback state updated:', playbackState);
        this.emitEvent('playback-state-changed', { state: playbackState });
      }

      // Enhanced position state updates with better timing
      if (state.currentTrack && state.duration > 0) {
        // Use more frequent updates during state changes for better synchronization
        const playbackRate = state.isPlaying ? 1.0 : 0.0;
        this.updatePositionState(state.currentTime, state.duration, playbackRate);
      }

      // Sync shuffle and loop states with device compatibility optimization
      this.updateShuffleState(state.isShuffled);
      this.updateLoopState(state.isLooping);

      // Clear position timer when paused to prevent drift
      if (!state.isPlaying && this.positionUpdateTimer) {
        clearTimeout(this.positionUpdateTimer);
        this.positionUpdateTimer = null;
      }
    } catch (error) {
      console.warn('🎵 Error updating Media Session playback state:', error);
    }
  }

  public updateShuffleState(isShuffled: boolean): void {
    if (this.isShuffled !== isShuffled) {
      this.isShuffled = isShuffled;
      console.log('🎵 Media Session shuffle state updated:', isShuffled);
      this.emitEvent('shuffle-state-changed', { isShuffled });
    }
  }

  public updateLoopState(isLooping: boolean): void {
    if (this.isLooping !== isLooping) {
      this.isLooping = isLooping;
      console.log('🎵 Media Session loop state updated:', isLooping);
      this.emitEvent('loop-state-changed', { isLooping });
    }
  }

  public resetPositionState(duration: number = 0): void {
    if (!this.isSupported) return;

    try {
      // Clear any existing position timer to prevent conflicts
      if (this.positionUpdateTimer) {
        clearTimeout(this.positionUpdateTimer);
        this.positionUpdateTimer = null;
      }

      // Reset position tracking state
      this.lastKnownPosition = 0;
      this.lastPositionUpdate = 0;
      if (duration > 0) {
        this.lastKnownDuration = duration;
      }

      // Set MediaSession position to 0
      navigator.mediaSession.setPositionState({
        duration: duration > 0 ? duration : this.lastKnownDuration,
        playbackRate: this.currentPlaybackState === 'playing' ? 1.0 : 0.0,
        position: 0,
      });

      console.log('🎵 Media Session position state reset to 0');
    } catch (error) {
      console.warn('🎵 Error resetting Media Session position state:', error);
    }
  }

  public updatePositionState(
    currentTime: number,
    duration: number,
    playbackRate: number = 1.0
  ): void {
    if (!this.isSupported) return;

    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastPositionUpdate;

    // Enhanced validation and normalization
    const validDuration = duration && !isNaN(duration) && duration > 0 && isFinite(duration);
    const validCurrentTime = !isNaN(currentTime) && isFinite(currentTime) && currentTime >= 0;

    if (!validDuration || !validCurrentTime) {
      return;
    }

    // Normalize position to be within bounds
    const normalizedPosition = Math.max(0, Math.min(currentTime, duration));
    const normalizedDuration = Math.max(0, duration);
    const normalizedRate = Math.max(0.1, Math.min(playbackRate, 4.0)); // Clamp rate

    // Smart throttling - update more frequently for significant changes
    const positionDiff = Math.abs(normalizedPosition - this.lastKnownPosition);
    const durationDiff = Math.abs(normalizedDuration - this.lastKnownDuration);
    const significantChange = positionDiff > 1 || durationDiff > 0.1 || normalizedRate !== 1.0;

    const shouldUpdate = significantChange || timeSinceLastUpdate >= this.positionUpdateThrottle;

    if (!shouldUpdate) return;

    try {
      // Clear any existing timer to prevent conflicts
      if (this.positionUpdateTimer) {
        clearTimeout(this.positionUpdateTimer);
        this.positionUpdateTimer = null;
      }

      // Update position state with enhanced precision
      navigator.mediaSession.setPositionState({
        duration: normalizedDuration,
        playbackRate: normalizedRate,
        position: normalizedPosition,
      });

      // Track state for smart throttling
      this.lastPositionUpdate = now;
      this.lastKnownPosition = normalizedPosition;
      this.lastKnownDuration = normalizedDuration;

      // Schedule next update for smooth progress during playback
      if (this.currentPlaybackState === 'playing' && normalizedRate > 0) {
        this.positionUpdateTimer = window.setTimeout(() => {
          // Auto-update position during playback for smoother experience
          const estimatedPosition =
            normalizedPosition + normalizedRate * (this.positionUpdateThrottle / 1000);
          if (estimatedPosition < normalizedDuration) {
            this.updatePositionState(estimatedPosition, normalizedDuration, normalizedRate);
          }
        }, this.positionUpdateThrottle);
      }

      // console.log(`🎵 Position state updated: ${normalizedPosition.toFixed(1)}s/${normalizedDuration.toFixed(1)}s (${normalizedRate}x)`);
    } catch (error) {
      console.warn('🎵 Error updating Media Session position state:', error);
      // Reset tracking on error
      this.lastPositionUpdate = 0;
      this.lastKnownPosition = 0;
      this.lastKnownDuration = 0;
    }
  }

  public clearMetadata(): void {
    if (!this.isSupported) return;

    try {
      // Clean up position tracking
      if (this.positionUpdateTimer) {
        clearTimeout(this.positionUpdateTimer);
        this.positionUpdateTimer = null;
      }
      this.lastPositionUpdate = 0;
      this.lastKnownPosition = 0;
      this.lastKnownDuration = 0;

      // Clear queue
      this.currentQueue = [];
      this.currentQueueIndex = 0;

      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      this.currentTrack = null;
      this.currentAlbum = null;
      this.isShuffled = false;
      this.isLooping = false;
      this.currentPlaybackState = 'none';

      console.log('🎵 Media Session metadata and queue cleared');
    } catch (error) {
      console.warn('🎵 Error clearing Media Session metadata:', error);
    }
  }

  public getIsSupported(): boolean {
    return this.isSupported;
  }

  public getCurrentTrack(): Track | null {
    return this.currentTrack;
  }

  public getCurrentAlbum(): Album | null {
    return this.currentAlbum;
  }

  public getIsShuffled(): boolean {
    return this.isShuffled;
  }

  public getIsLooping(): boolean {
    return this.isLooping;
  }

  public getCurrentPlaybackState(): MediaSessionPlaybackState {
    return this.currentPlaybackState;
  }

  public getEnhancedMetadata(): ExtractedMetadata | null {
    if (!this.currentTrack || !this.currentAlbum) return null;
    return this.extractMetadataFromTrack(this.currentTrack, this.currentAlbum);
  }

  public getRemotePlaybackSupported(): boolean {
    return this.remotePlaybackSupported;
  }

  public getRemoteDevicesAvailable(): boolean {
    return this.remoteDevicesAvailable;
  }

  public getRemotePlaybackState(): string {
    return this.remotePlaybackState;
  }

  // Debug method for troubleshooting
  public getDebugInfo(): object {
    return {
      mediaSession: {
        isSupported: this.isSupported,
        mediaSessionExists: 'mediaSession' in navigator,
        mediaSessionObject: !!navigator.mediaSession,
        setActionHandlerExists: !!(
          navigator.mediaSession && typeof navigator.mediaSession.setActionHandler === 'function'
        ),
        setPositionStateExists: !!(
          navigator.mediaSession && typeof navigator.mediaSession.setPositionState === 'function'
        ),
        mediaMetadataExists: typeof MediaMetadata !== 'undefined',
      },
      remotePlayback: {
        isSupported: this.remotePlaybackSupported,
        devicesAvailable: this.remoteDevicesAvailable,
        playbackState: this.remotePlaybackState,
        hasAudioElement: !!this.currentAudioElement,
        audioElementHasRemote: !!(this.currentAudioElement && 'remote' in this.currentAudioElement),
      },
      currentState: {
        track: this.currentTrack?.title || 'None',
        album: this.currentAlbum?.title || 'None',
        playbackState: this.currentPlaybackState,
        isShuffled: this.isShuffled,
        isLooping: this.isLooping,
        positionTracking: {
          lastKnownPosition: this.lastKnownPosition,
          lastKnownDuration: this.lastKnownDuration,
          hasPositionTimer: !!this.positionUpdateTimer,
        },
      },
      environment: {
        userAgent: navigator.userAgent,
      },
    };
  }

  // Event listener helper methods
  public onMetadataUpdated(
    callback: (event: CustomEvent<{ track: Track; album: Album; metadata: MediaMetadata }>) => void
  ): void {
    this.addEventListener('metadata-updated', callback as EventListener);
  }

  public onActionTriggered(
    callback: (event: CustomEvent<{ action: string; details?: any }>) => void
  ): void {
    this.addEventListener('action-triggered', callback as EventListener);
  }

  public onPlaybackStateChanged(
    callback: (event: CustomEvent<{ state: MediaSessionPlaybackState }>) => void
  ): void {
    this.addEventListener('playback-state-changed', callback as EventListener);
  }

  public onShuffleStateChanged(
    callback: (event: CustomEvent<{ isShuffled: boolean }>) => void
  ): void {
    this.addEventListener('shuffle-state-changed', callback as EventListener);
  }

  public onLoopStateChanged(callback: (event: CustomEvent<{ isLooping: boolean }>) => void): void {
    this.addEventListener('loop-state-changed', callback as EventListener);
  }

  public onQueueUpdated(
    callback: (event: CustomEvent<{ queue: QueueItem[]; currentIndex: number }>) => void
  ): void {
    this.addEventListener('queue-updated', callback as EventListener);
  }

  public onQueueReordered(
    callback: (event: CustomEvent<{ newQueue: QueueItem[]; newCurrentIndex: number }>) => void
  ): void {
    this.addEventListener('queue-reordered', callback as EventListener);
  }

  public onQueueTrackSelected(
    callback: (
      event: CustomEvent<{ queueIndex: number; track: Track; shouldTogglePlayback: boolean }>
    ) => void
  ): void {
    this.addEventListener('queue-track-selected', callback as EventListener);
  }

  public onQueueNavigation(
    callback: (
      event: CustomEvent<{ direction: 'next' | 'previous'; newTrack: Track; newIndex: number }>
    ) => void
  ): void {
    this.addEventListener('queue-navigation', callback as EventListener);
  }

  // Cleanup method
  public destroy(): void {
    this.clearMetadata();
    MediaSessionManager.instance = null;
  }
}

// Export singleton instance
export const mediaSessionManager = MediaSessionManager.getInstance();

// Make it globally available for debugging
if (typeof window !== 'undefined') {
  (window as any).mediaSessionManager = mediaSessionManager;
}

// Export the service class
export { MediaSessionManager };
