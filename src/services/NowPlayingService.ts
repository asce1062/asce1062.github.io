import { musicPlayer } from '../utils/musicPlayer';
import type { Track, Album, PlaybackState, NowPlayingState, NowPlayingEventMap } from '../types/types';


class NowPlayingManager extends EventTarget {
  private static instance: NowPlayingManager | null = null;
  private footerObserver: IntersectionObserver | null = null;

  private state: NowPlayingState = {
    isVisible: false,
    isExpanded: false,
    currentTrack: null,
    currentAlbum: null,
    isPlaying: false,
    volume: 0.7,
    isLooping: false,
    currentTime: 0,
    duration: 0,
    percentage: 0
  };

  private constructor() {
    super();
    this.init();
  }

  // Singleton pattern
  public static getInstance(): NowPlayingManager {
    if (!NowPlayingManager.instance) {
      NowPlayingManager.instance = new NowPlayingManager();
    }
    return NowPlayingManager.instance;
  }

  private init() {
    this.bindMusicPlayerEvents();
    this.setupFooterObserver();
  }

  private emitEvent<K extends keyof NowPlayingEventMap>(
    type: K,
    detail: NowPlayingEventMap[K] extends CustomEvent<infer D> ? D : never
  ): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  private bindMusicPlayerEvents() {
    // Listen to music player service events
    musicPlayer.onTrackStarted((event) => {
      const { track, album } = event.detail;
      this.updateTrackInfo(track, album);
      this.show();
    });

    musicPlayer.onStateChanged((event) => {
      this.updateFromMusicPlayerState(event.detail.state);
    });

    musicPlayer.onProgressUpdated((event) => {
      const { currentTime, duration, percentage } = event.detail;
      this.updateProgress(currentTime, duration, percentage);
    });

    musicPlayer.onVolumeChanged((event) => {
      this.state.volume = event.detail.volume;
      this.emitStateUpdate();
    });

    musicPlayer.onLoopChanged((event) => {
      this.state.isLooping = event.detail.isLooping;
      this.emitStateUpdate();
    });

    musicPlayer.onTrackChanged((event) => {
      const { track, album } = event.detail;
      this.updateTrackInfo(track, album);
    });
  }

  private setupFooterObserver() {
    // Create intersection observer to detect when footer is visible
    this.footerObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((_entry) => {
          this.updateWidgetPosition();
        });
      },
      {
        root: null,
        rootMargin: '0px',
        threshold: 0.1,
      }
    );

    // Observe the footer element
    const footer = document.querySelector('footer');
    if (footer && this.footerObserver) {
      this.footerObserver.observe(footer);
    }

    // Also listen for scroll events
    let scrollTimeout: number | null = null;
    window.addEventListener('scroll', () => {
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      scrollTimeout = window.setTimeout(() => {
        this.updateWidgetPosition();
      }, 10);
    });

    window.addEventListener('resize', () => {
      this.updateWidgetPosition();
    });
  }

  private updateWidgetPosition() {
    if (!this.state.isVisible || this.state.isExpanded) return;

    const footer = document.querySelector('footer');
    if (!footer) return;

    const footerRect = footer.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const margin = 16;

    let maxBottom = margin;
    if (footerRect.top < viewportHeight) {
      const footerVisibleHeight = viewportHeight - footerRect.top;
      maxBottom = footerVisibleHeight + margin + 10;
    }

    // Emit position update event
    this.dispatchEvent(new CustomEvent('position-update', {
      detail: { bottom: maxBottom }
    }));
  }

  private updateFromMusicPlayerState(musicState: PlaybackState) {
    if (musicState.currentTrack && musicState.currentAlbum) {
      this.updateTrackInfo(musicState.currentTrack, musicState.currentAlbum);
      this.state.isPlaying = musicState.isPlaying;
      this.state.isLooping = musicState.isLooping;
      this.state.volume = musicState.volume;

      if (musicState.isVisible) {
        this.show();
      }

      this.emitStateUpdate();
    } else if (this.state.isVisible) {
      this.hide();
    }
  }

  private updateTrackInfo(track: Track, album: Album) {
    this.state.currentTrack = track;
    this.state.currentAlbum = album;

    this.emitEvent('track-info-updated', { track, album });
    this.emitStateUpdate();
  }

  private updateProgress(currentTime: number, duration: number, percentage: number) {
    this.state.currentTime = currentTime;
    this.state.duration = duration;
    this.state.percentage = percentage;

    this.emitStateUpdate();
  }

  private emitStateUpdate() {
    this.emitEvent('playback-state-updated', { ...this.state });
  }

  // Public API methods
  public show() {
    if (this.state.isVisible) return;

    this.state.isVisible = true;
    this.emitEvent('widget-show', {
      track: this.state.currentTrack!,
      album: this.state.currentAlbum!
    });
    this.updateWidgetPosition();
  }

  public hide() {
    if (!this.state.isVisible) return;

    this.state.isVisible = false;
    this.emitEvent('widget-hide', {});
  }

  public expand() {
    if (this.state.isExpanded) return;

    this.state.isExpanded = true;
    this.emitEvent('widget-expand', {});
  }

  public collapse() {
    if (!this.state.isExpanded) return;

    this.state.isExpanded = false;
    this.emitEvent('widget-collapse', {});

    if (this.state.isVisible) {
      this.updateWidgetPosition();
    }
  }

  public togglePlayPause() {
    const musicState = musicPlayer.getState();
    if (musicState.isPlaying) {
      musicPlayer.pause();
    } else {
      // Use play() with forceStart to ensure proper loading, but preserve position
      if (musicState.currentTrack && musicState.currentAlbum) {
        console.log('Now Playing: Resuming current track:', musicState.currentTrack.title);
        musicPlayer.play(musicState.currentTrack.id, musicState.currentAlbum.id, {
          forceStart: true,
          preservePosition: true
        }).catch(error => {
          console.error('Failed to resume playback:', error);
        });
      }
    }
  }

  public previousTrack() {
    musicPlayer.previousTrack();
  }

  public nextTrack() {
    musicPlayer.nextTrack();
  }

  public toggleLoop() {
    musicPlayer.toggleLoop();
  }

  public setVolume(volume: number) {
    musicPlayer.setVolume(volume);
  }

  public seek(percentage: number) {
    const musicState = musicPlayer.getState();
    if (musicState.duration && !isNaN(musicState.duration)) {
      const seekTime = percentage * musicState.duration;
      musicPlayer.seek(seekTime);
    }
  }

  public setupMarquee(textElement: HTMLElement) {
    // Remove any existing marquee animation
    textElement.classList.remove('scrolling');

    // Use setTimeout to ensure the element has rendered with the new text
    setTimeout(() => {
      const container = textElement.parentElement;
      if (!container) return;

      // Check if text overflows container
      const textWidth = textElement.scrollWidth;
      const containerWidth = container.clientWidth;

      if (textWidth > containerWidth) {
        // Add margin to prevent text from being cut off
        textElement.style.paddingRight = '20px';
        textElement.classList.add('scrolling');
      } else {
        // Reset padding if text doesn't overflow
        textElement.style.paddingRight = '0px';
        textElement.classList.remove('scrolling');
      }

      this.emitEvent('marquee-setup', { element: textElement });
    }, 100);
  }

  public formatTime(seconds: number): string {
    if (isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  public getState(): Readonly<NowPlayingState> {
    return { ...this.state };
  }

  // Event listener helper methods
  public onWidgetShow(callback: (event: CustomEvent<{ track: Track; album: Album }>) => void): void {
    this.addEventListener('widget-show', callback as EventListener);
  }

  public onWidgetHide(callback: (event: CustomEvent<{}>) => void): void {
    this.addEventListener('widget-hide', callback as EventListener);
  }

  public onWidgetExpand(callback: (event: CustomEvent<{}>) => void): void {
    this.addEventListener('widget-expand', callback as EventListener);
  }

  public onWidgetCollapse(callback: (event: CustomEvent<{}>) => void): void {
    this.addEventListener('widget-collapse', callback as EventListener);
  }

  public onTrackInfoUpdated(callback: (event: CustomEvent<{ track: Track; album: Album }>) => void): void {
    this.addEventListener('track-info-updated', callback as EventListener);
  }

  public onPlaybackStateUpdated(callback: (event: CustomEvent<NowPlayingState>) => void): void {
    this.addEventListener('playback-state-updated', callback as EventListener);
  }

  public onPositionUpdate(callback: (event: CustomEvent<{ bottom: number }>) => void): void {
    this.addEventListener('position-update', callback as EventListener);
  }

  public onMarqueeSetup(callback: (event: CustomEvent<{ element: HTMLElement }>) => void): void {
    this.addEventListener('marquee-setup', callback as EventListener);
  }

  // Cleanup method
  public destroy(): void {
    if (this.footerObserver) {
      this.footerObserver.disconnect();
    }
    NowPlayingManager.instance = null;
  }
}

// Export singleton instance
export const nowPlayingManager = NowPlayingManager.getInstance();

// Make it globally available
declare global {
  interface Window {
    nowPlayingManager: NowPlayingManager;
  }
}
