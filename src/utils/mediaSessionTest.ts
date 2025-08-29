// Test utility for Media Session API integration
import { musicPlayer, mediaSessionManager } from './musicPlayer';
import type { ExtractedMetadata } from '../types/types';
import musicData from '../data/music.json';

export class mediaSessionTest {
  private static logEvent(message: string, data?: any): void {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`🎵 [${timestamp}] ${message}`, data || '');
  }

  public static setupLogging(): void {
    // Log Media Session events
    mediaSessionManager.onMetadataUpdated((event) => {
      const { track, album } = event.detail;
      this.logEvent('Media Session metadata updated', {
        title: track.title,
        album: album.title,
        supported: mediaSessionManager.getIsSupported()
      });
    });

    mediaSessionManager.onActionTriggered((event) => {
      const { action, details } = event.detail;
      this.logEvent(`Media Session action triggered: ${action}`, details);
    });

    mediaSessionManager.onPlaybackStateChanged((event) => {
      const { state } = event.detail;
      this.logEvent(`Media Session playback state changed: ${state}`);
    });

    mediaSessionManager.onShuffleStateChanged((event) => {
      const { isShuffled } = event.detail;
      this.logEvent(`Media Session shuffle state changed: ${isShuffled}`);
    });

    mediaSessionManager.onLoopStateChanged((event) => {
      const { isLooping } = event.detail;
      this.logEvent(`Media Session loop state changed: ${isLooping}`);
    });

    // Log Music Player events
    musicPlayer.onTrackStarted((event) => {
      const { track, album } = event.detail;
      this.logEvent('Music Player track started', {
        title: track.title,
        album: album.title
      });
    });

    musicPlayer.onStateChanged((event) => {
      const state = event.detail.state;
      this.logEvent('Music Player state changed', {
        isPlaying: state.isPlaying,
        currentTrack: state.currentTrack?.title || 'None',
        currentTime: Math.round(state.currentTime),
        duration: Math.round(state.duration)
      });
    });

    this.logEvent('Media Session demo logging enabled');
  }

  public static getStatus(): object {
    const musicState = musicPlayer.getState();
    const mediaSessionSupported = mediaSessionManager.getIsSupported();

    return {
      mediaSession: {
        supported: mediaSessionSupported,
        currentTrack: mediaSessionManager.getCurrentTrack()?.title || 'None',
        currentAlbum: mediaSessionManager.getCurrentAlbum()?.title || 'None',
        isShuffled: mediaSessionManager.getIsShuffled(),
        isLooping: mediaSessionManager.getIsLooping(),
        playbackState: mediaSessionManager.getCurrentPlaybackState()
      },
      musicPlayer: {
        isPlaying: musicState.isPlaying,
        currentTrack: musicState.currentTrack?.title || 'None',
        currentTime: Math.round(musicState.currentTime),
        duration: Math.round(musicState.duration),
        volume: musicState.volume
      }
    };
  }

  public static async testBasicPlayback(): Promise<void> {
    this.logEvent('Starting basic playback test...');

    try {
      // Try to play the first track of the first album
      const firstAlbum = musicData.albums[0];
      const firstTrack = firstAlbum.tracks[0];

      this.logEvent('Attempting to play first track', {
        track: firstTrack.title,
        album: firstAlbum.title
      });

      await musicPlayer.play(firstTrack.id, firstAlbum.id, { forceStart: true });

      this.logEvent('Playback started successfully');

      // Test pause after 3 seconds
      setTimeout(() => {
        this.logEvent('Testing pause...');
        musicPlayer.pause();

        // Test resume after 2 seconds
        setTimeout(() => {
          this.logEvent('Testing resume...');
          musicPlayer.resume();
        }, 2000);
      }, 3000);

    } catch (error) {
      this.logEvent('Basic playback test failed', error);
    }
  }

  public static logMediaSessionCapabilities(): void {
    if (!mediaSessionManager.getIsSupported()) {
      this.logEvent('Media Session API not supported in this browser');
      return;
    }

    const capabilities = {
      supported: true,
      mediaSession: typeof navigator.mediaSession !== 'undefined',
      actions: [
        'play', 'pause', 'stop',
        'previoustrack', 'nexttrack',
        'seekbackward', 'seekforward', 'seekto'
      ]
    };

    this.logEvent('Media Session capabilities', capabilities);
  }

  public static logDebugInfo(): object {
    const debugInfo = mediaSessionManager.getDebugInfo();
    this.logEvent('🔍 Media Session debug info:', debugInfo);
    return debugInfo;
  }

  public static logEnhancedMetadata(): ExtractedMetadata | null {
    const enhancedMetadata = mediaSessionManager.getEnhancedMetadata();
    if (enhancedMetadata) {
      this.logEvent('🎵 Enhanced metadata extraction:', {
        title: enhancedMetadata.title,
        artist: enhancedMetadata.artist,
        album: enhancedMetadata.album,
        genre: enhancedMetadata.genre || 'Not detected',
        year: enhancedMetadata.year || 'Not detected',
        artworkCount: enhancedMetadata.artwork.length
      });
    } else {
      this.logEvent('❌ No enhanced metadata available - no track playing');
    }
    return enhancedMetadata;
  }

  public static testDeviceCompatibility(): void {
    this.logEvent('🧪 Testing device compatibility enhancements...');

    if (!mediaSessionManager.getIsSupported()) {
      this.logEvent('❌ Media Session not supported - skipping compatibility test');
      return;
    }

    // Test enhanced metadata extraction
    this.logEvent('📋 Testing enhanced metadata extraction...');
    const metadata = this.logEnhancedMetadata();

    // Test position state precision
    this.logEvent('⏱️  Testing enhanced position state updates...');
    const testDuration = 180; // 3 minutes
    let testPosition = 45; // Start at 45 seconds

    const positionTest = setInterval(() => {
      mediaSessionManager.updatePositionState(testPosition, testDuration, 1.0);
      this.logEvent(`📍 Position update: ${testPosition}s/${testDuration}s`);

      testPosition += 2; // Advance by 2 seconds

      if (testPosition >= 60) { // Test for 30 seconds
        clearInterval(positionTest);
        this.logEvent('✅ Position state compatibility test completed');

        // Test artwork fallback
        this.logEvent('🖼️  Testing artwork compatibility...');
        if (metadata && metadata.artwork.length > 0) {
          this.logEvent(`✅ Generated ${metadata.artwork.length} artwork sizes for device compatibility`);
        }
      }
    }, 2000);

    setTimeout(() => {
      clearInterval(positionTest);
      this.logEvent('🎯 Device compatibility test completed');
    }, 35000);
  }

  public static testArtworkFallback(): void {
    this.logEvent('🖼️ Testing enhanced artwork fallback system...');

    if (!mediaSessionManager.getIsSupported()) {
      this.logEvent('❌ Media Session not supported - skipping artwork test');
      return;
    }

    const enhancedMetadata = mediaSessionManager.getEnhancedMetadata();
    if (!enhancedMetadata) {
      this.logEvent('❌ No track playing - cannot test artwork fallback');
      return;
    }

    this.logEvent('🎨 Current artwork configuration:', {
      totalArtworkSizes: enhancedMetadata.artwork.length,
      artworkSources: enhancedMetadata.artwork.map(art => ({
        size: art.sizes,
        url: art.src.replace(window.location.origin, '')
      }))
    });

    // Test artwork URL accessibility
    const testArtwork = async () => {
      for (let i = 0; i < Math.min(3, enhancedMetadata.artwork.length); i++) {
        const artwork = enhancedMetadata.artwork[i];
        try {
          const response = await fetch(artwork.src, { method: 'HEAD' });
          this.logEvent(`${response.ok ? '✅' : '❌'} ${artwork.sizes}: ${artwork.src.replace(window.location.origin, '')} - ${response.status}`);
        } catch (error) {
          this.logEvent(`❌ ${artwork.sizes}: ${artwork.src.replace(window.location.origin, '')} - Network Error`);
        }
      }

      // Test default fallback specifically
      try {
        const defaultUrl = `${window.location.origin}/art/default-cover.png`;
        const response = await fetch(defaultUrl, { method: 'HEAD' });
        this.logEvent(`${response.ok ? '✅' : '❌'} Default fallback: /art/default-cover.png - ${response.status}`);
      } catch (error) {
        this.logEvent('❌ Default fallback: /art/default-cover.png - Network Error');
      }
    };

    testArtwork();
  }


  public static testRemotePlaybackAPI(): void {
    this.logEvent('📡 Testing Remote Playback API...');

    const remoteSupported = mediaSessionManager.getRemotePlaybackSupported();
    const devicesAvailable = mediaSessionManager.getRemoteDevicesAvailable();
    const playbackState = mediaSessionManager.getRemotePlaybackState();

    this.logEvent('📡 Remote Playback Status:', {
      supported: remoteSupported,
      devicesAvailable,
      currentState: playbackState
    });

    if (!remoteSupported) {
      this.logEvent('❌ Remote Playback API not supported in this browser');
      this.logEvent('💡 Remote Playback is supported in Chrome, Edge, and some other browsers');
      return;
    }

    this.logEvent('✅ Remote Playback API is supported');

    if (!devicesAvailable) {
      this.logEvent('📱 No remote devices currently available');
      this.logEvent('💡 Try connecting a Chromecast, AirPlay device, or other casting device');
    } else {
      this.logEvent('📱 Remote devices are available for casting');
    }

    // Test prompting for remote playback
    this.logEvent('🧪 To test remote playback, use: mediaSessionManager.promptRemotePlayback()');
  }

  public static async testCastingCapabilities(): Promise<void> {
    this.logEvent('📺 Testing casting capabilities...');

    if (!mediaSessionManager.getRemotePlaybackSupported()) {
      this.logEvent('❌ Casting not supported - Remote Playback API unavailable');
      return;
    }

    try {
      // Try to prompt for remote playback
      this.logEvent('📡 Attempting to show casting dialog...');
      mediaSessionManager.promptRemotePlayback();

      this.logEvent('💡 If a casting dialog appeared, you can select a device to test casting');
      this.logEvent('💡 If no dialog appeared, no compatible casting devices are available');

    } catch (error) {
      this.logEvent('❌ Error testing casting capabilities:', error);
    }
  }

  public static testPositionUpdates(): void {
    if (!mediaSessionManager.getIsSupported()) {
      this.logEvent('❌ Cannot test position updates - Media Session not supported');
      return;
    }

    this.logEvent('🧪 Testing position updates (Chrome fix)...');

    // Force some position updates to test Chrome behavior
    let currentTime = 0;
    const duration = 180; // 3 minutes

    const testInterval = setInterval(() => {
      currentTime += 5; // Advance by 5 seconds each update

      if (currentTime >= duration) {
        clearInterval(testInterval);
        this.logEvent('✅ Position update test completed');
        return;
      }

      mediaSessionManager.updatePositionState(currentTime, duration);
      this.logEvent(`⏱️  Position update: ${currentTime}s / ${duration}s (${((currentTime/duration)*100).toFixed(1)}%)`);
    }, 1000);

    // Stop test after 30 seconds
    setTimeout(() => {
      clearInterval(testInterval);
      this.logEvent('⏹️ Position update test stopped');
    }, 30000);
  }

  public static async testShuffleAndLoop(): Promise<void> {
    this.logEvent('Starting shuffle and loop test...');

    try {
      // Start playing first track
      const firstAlbum = musicData.albums[0];
      const firstTrack = firstAlbum.tracks[0];

      await musicPlayer.play(firstTrack.id, firstAlbum.id, { forceStart: true });
      this.logEvent('Started playback for shuffle/loop test');

      // Test loop after 2 seconds
      setTimeout(() => {
        this.logEvent('Enabling loop...');
        musicPlayer.toggleLoop();

        // Test shuffle after 2 more seconds
        setTimeout(() => {
          this.logEvent('Enabling shuffle...');
          musicPlayer.toggleShuffle();

          // Test next track with shuffle after 2 more seconds
          setTimeout(() => {
            this.logEvent('Testing next track with shuffle enabled...');
            musicPlayer.nextTrack();

            // Show status after track changes
            setTimeout(() => {
              this.logEvent('Final status:', this.getStatus());
            }, 1000);
          }, 2000);
        }, 2000);
      }, 2000);

    } catch (error) {
      this.logEvent('Shuffle and loop test failed', error);
    }
  }

  public static testQueueFunctionality(): void {
    this.logEvent('🎵 Testing queue functionality...');

    if (!mediaSessionManager.getIsSupported()) {
      this.logEvent('❌ Media Session not supported - skipping queue test');
      return;
    }

    try {
      // Get first album with multiple tracks for testing
      const testAlbum = musicData.albums.find(album => album.tracks.length > 3);
      if (!testAlbum) {
        this.logEvent('❌ No suitable album found for queue testing');
        return;
      }

      this.logEvent('🧪 Testing with album:', {
        title: testAlbum.title,
        trackCount: testAlbum.tracks.length
      });

      // Test queue creation
      const firstTrack = testAlbum.tracks[0];
      mediaSessionManager.updateMetadata(firstTrack, testAlbum, 0);

      // Check queue
      const queueInfo = mediaSessionManager.getQueue();
      this.logEvent('✅ Queue created:', {
        totalTracks: queueInfo.totalTracks,
        currentPosition: queueInfo.currentIndex + 1,
        currentTrack: queueInfo.queue[queueInfo.currentIndex]?.track.title
      });

      // Test shuffle
      setTimeout(() => {
        this.logEvent('🔀 Testing shuffle...');
        mediaSessionManager.updateShuffleState(true);

        const shuffledQueue = mediaSessionManager.getQueue();
        this.logEvent('✅ Shuffled queue:', {
          newPosition: shuffledQueue.currentIndex + 1,
          firstThreeTracks: shuffledQueue.queue.slice(0, 3).map(item => item.track.title)
        });

        // Test navigation
        setTimeout(() => {
          const nextTrack = mediaSessionManager.getNextTrackInQueue();
          const prevTrack = mediaSessionManager.getPreviousTrackInQueue();

          this.logEvent('🎵 Navigation test:', {
            nextTrack: nextTrack?.track.title || 'None',
            previousTrack: prevTrack?.track.title || 'None'
          });
        }, 1000);

      }, 1000);

    } catch (error) {
      this.logEvent('❌ Queue functionality test failed:', error);
    }
  }

  public static testQueueReordering(): void {
    this.logEvent('📋 Testing queue reordering...');

    if (!mediaSessionManager.getIsSupported()) {
      this.logEvent('❌ Media Session not supported - skipping reorder test');
      return;
    }

    try {
      const queueInfo = mediaSessionManager.getQueue();
      if (queueInfo.totalTracks < 3) {
        this.logEvent('❌ Need at least 3 tracks in queue to test reordering');
        return;
      }

      this.logEvent('🔀 Original queue order:', {
        tracks: queueInfo.queue.slice(0, 3).map((item, index) =>
          `${index + 1}. ${item.track.title}`
        )
      });

      // Create a reordered version (reverse the first 3 tracks)
      const newQueue = [...queueInfo.queue];
      if (newQueue.length >= 3) {
        [newQueue[0], newQueue[2]] = [newQueue[2], newQueue[0]];
      }

      // Test reordering
      const success = mediaSessionManager.reorderQueue(newQueue);

      if (success) {
        const reorderedInfo = mediaSessionManager.getQueue();
        this.logEvent('✅ Queue reordered successfully:', {
          newCurrentPosition: reorderedInfo.currentIndex + 1,
          newOrder: reorderedInfo.queue.slice(0, 3).map((item, index) =>
            `${index + 1}. ${item.track.title}`
          )
        });
      } else {
        this.logEvent('❌ Queue reordering failed');
      }

    } catch (error) {
      this.logEvent('❌ Queue reordering test failed:', error);
    }
  }

  public static displayCurrentQueue(): void {
    this.logEvent('📋 Current queue status:');

    const queueInfo = mediaSessionManager.getQueue();

    if (queueInfo.totalTracks === 0) {
      this.logEvent('📭 Queue is empty');
      return;
    }

    this.logEvent('🎵 Queue information:', {
      totalTracks: queueInfo.totalTracks,
      currentPosition: queueInfo.currentIndex + 1,
      currentTrack: queueInfo.queue[queueInfo.currentIndex]?.track.title
    });

    // Display all tracks in queue
    const queueList = queueInfo.queue.map((item, index) => {
      const isCurrent = index === queueInfo.currentIndex;
      return `${isCurrent ? '▶️' : '  '} ${item.displayIndex}. ${item.track.title}${isCurrent ? ' (NOW PLAYING)' : ''}`;
    });

    this.logEvent('📝 Full queue:', queueList);
  }

  public static testQueueTrackSelection(): void {
    this.logEvent('🎯 Testing queue track selection...');

    const queueInfo = mediaSessionManager.getQueue();
    if (queueInfo.totalTracks === 0) {
      this.logEvent('❌ No queue available for testing track selection');
      return;
    }

    if (queueInfo.totalTracks < 3) {
      this.logEvent('❌ Need at least 3 tracks in queue for comprehensive testing');
      return;
    }

    this.logEvent('🧪 Testing track selection scenarios:', {
      totalTracks: queueInfo.totalTracks,
      currentTrack: queueInfo.currentIndex + 1
    });

    // Test 1: Select current track (should toggle play/pause)
    setTimeout(() => {
      this.logEvent('🎯 Test 1: Selecting current track (should toggle play/pause)');
      const currentIndex = queueInfo.currentIndex;
      const success = mediaSessionManager.selectTrackFromQueue(currentIndex);
      this.logEvent(`${success ? '✅' : '❌'} Select current track result: ${success}`);
    }, 1000);

    // Test 2: Select different track (should switch tracks)
    setTimeout(() => {
      this.logEvent('🎯 Test 2: Selecting different track (should switch)');
      const differentIndex = queueInfo.currentIndex === 0 ? 1 : 0;
      const success = mediaSessionManager.selectTrackFromQueue(differentIndex);
      this.logEvent(`${success ? '✅' : '❌'} Select different track result: ${success}`);

      if (success) {
        const newQueueInfo = mediaSessionManager.getQueue();
        this.logEvent('📍 New queue position:', {
          position: newQueueInfo.currentIndex + 1,
          track: newQueueInfo.queue[newQueueInfo.currentIndex]?.track.title
        });
      }
    }, 3000);

    // Test 3: Select invalid index (should fail gracefully)
    setTimeout(() => {
      this.logEvent('🎯 Test 3: Selecting invalid index (should fail gracefully)');
      const invalidIndex = queueInfo.totalTracks + 5;
      const success = mediaSessionManager.selectTrackFromQueue(invalidIndex);
      this.logEvent(`${success ? '❌' : '✅'} Invalid index test result: ${success} (should be false)`);
    }, 5000);
  }

  public static displayQueueTrackList(): void {
    this.logEvent('📝 Displaying enhanced queue track list...');

    const trackList = mediaSessionManager.getQueueTrackList();

    if (trackList.length === 0) {
      this.logEvent('📭 No tracks in queue list');
      return;
    }

    this.logEvent('🎵 Enhanced queue track list:');
    trackList.forEach(track => {
      const status = track.isCurrent ? '▶️ NOW PLAYING' : '';
      this.logEvent(`${track.index + 1}. ${track.title} by ${track.artist} ${status}`);
    });
  }

  public static testEnhancedMetadata(): void {
    this.logEvent('🎨 Testing enhanced metadata with queue context...');

    const currentTrack = mediaSessionManager.getCurrentTrack();
    const currentAlbum = mediaSessionManager.getCurrentAlbum();

    if (!currentTrack || !currentAlbum) {
      this.logEvent('❌ No track playing - cannot test enhanced metadata');
      return;
    }

    const enhancedMetadata = mediaSessionManager.getEnhancedMetadata();
    if (!enhancedMetadata) {
      this.logEvent('❌ No enhanced metadata available');
      return;
    }

    this.logEvent('🎨 Enhanced metadata with queue context:', {
      title: enhancedMetadata.title,
      artist: enhancedMetadata.artist,
      album: enhancedMetadata.album,
      genre: enhancedMetadata.genre || 'No queue context',
      queueHints: enhancedMetadata.genre?.includes('Next:') ? 'Contains navigation hints' : 'Basic metadata'
    });
  }

  public static testQueueCounterAccuracy(): void {
    this.logEvent('🔢 Testing queue counter accuracy...');

    const queueInfo = mediaSessionManager.getQueue();
    if (queueInfo.totalTracks < 3) {
      this.logEvent('❌ Need at least 3 tracks for counter accuracy test');
      return;
    }

    this.logEvent('🧪 Starting queue counter test:', {
      totalTracks: queueInfo.totalTracks,
      startingPosition: queueInfo.currentIndex + 1
    });

    let testStep = 0;
    const testSteps = Math.min(5, queueInfo.totalTracks - 1);

    const runNextTest = () => {
      if (testStep >= testSteps) {
        this.logEvent('✅ Queue counter accuracy test completed');
        return;
      }

      testStep++;
      this.logEvent(`🔢 Test step ${testStep}/${testSteps}: Testing next track...`);

      // Record position before navigation
      const beforeQueue = mediaSessionManager.getQueue();
      const beforePosition = beforeQueue.currentIndex + 1;

      // Trigger next track via Music Player (which will trigger Media Session)
      musicPlayer.nextTrack();

      // Check position after navigation
      setTimeout(() => {
        const afterQueue = mediaSessionManager.getQueue();
        const afterPosition = afterQueue.currentIndex + 1;
        const expectedPosition = beforePosition + 1 <= queueInfo.totalTracks ? beforePosition + 1 : 1;

        const isCorrect = afterPosition === expectedPosition;
        this.logEvent(`${isCorrect ? '✅' : '❌'} Position check: ${beforePosition} → ${afterPosition} (expected: ${expectedPosition})`);

        if (!isCorrect) {
          this.logEvent('❌ Queue counter accuracy test FAILED!');
          return;
        }

        // Continue to next test step
        setTimeout(runNextTest, 1000);
      }, 500);
    };

    // Start the test sequence
    runNextTest();
  }

  public static testFullQueueWorkflow(): void {
    this.logEvent('🎪 Starting comprehensive queue workflow test...');

    // Step 1: Display current state
    this.displayCurrentQueue();

    // Step 2: Test enhanced metadata
    setTimeout(() => {
      this.testEnhancedMetadata();
    }, 2000);

    // Step 3: Display track list
    setTimeout(() => {
      this.displayQueueTrackList();
    }, 4000);

    // Step 4: Test queue counter accuracy
    setTimeout(() => {
      this.testQueueCounterAccuracy();
    }, 6000);

    // Step 5: Test track selection
    setTimeout(() => {
      this.testQueueTrackSelection();
    }, 10000);

    // Step 6: Final status check
    setTimeout(() => {
      this.logEvent('🏁 Queue workflow test completed. Final status:');
      this.displayCurrentQueue();
    }, 16000);
  }

  public static debugQueueSynchronization(): void {
    this.logEvent('🔍 Debugging queue synchronization...');

    const queueInfo = mediaSessionManager.getQueue();
    const musicPlayerState = musicPlayer.getState();

    this.logEvent('📊 Current state comparison:', {
      mediaSessionQueue: {
        currentIndex: queueInfo.currentIndex,
        displayPosition: queueInfo.currentIndex + 1,
        totalTracks: queueInfo.totalTracks,
        currentTrackTitle: queueInfo.queue[queueInfo.currentIndex]?.track.title
      },
      musicPlayerState: {
        currentTrackIndex: musicPlayerState.currentTrackIndex,
        currentTrackTitle: musicPlayerState.currentTrack?.title,
        albumTracksLength: musicPlayerState.currentAlbum?.tracks.length
      }
    });

    // Test navigation and track the exact changes
    this.logEvent('🔍 Testing navigation to see exact index changes...');

    const beforeNavigation = {
      msIndex: mediaSessionManager.getQueue().currentIndex,
      mpIndex: musicPlayer.getState().currentTrackIndex
    };

    // Trigger next track and monitor changes
    musicPlayer.nextTrack();

    setTimeout(() => {
      const afterNavigation = {
        msIndex: mediaSessionManager.getQueue().currentIndex,
        mpIndex: musicPlayer.getState().currentTrackIndex
      };

      this.logEvent('📈 Navigation change analysis:', {
        before: beforeNavigation,
        after: afterNavigation,
        msChange: afterNavigation.msIndex - beforeNavigation.msIndex,
        mpChange: afterNavigation.mpIndex - beforeNavigation.mpIndex,
        inSync: afterNavigation.msIndex === afterNavigation.mpIndex
      });
    }, 1000);
  }
}

// Auto-enable logging in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  mediaSessionTest.setupLogging();
  mediaSessionTest.logMediaSessionCapabilities();

  // Make test available globally for testing
  (window as any).mediaSessionTest = mediaSessionTest;
}
