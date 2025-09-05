import { MusicPlayerService } from '../services/MusicPlayerService';
import { mediaSessionManager } from '../services/MediaSessionService';

// Global instance accessor
export const musicPlayer = MusicPlayerService.getInstance();

// Global window access for debugging/console use
if (typeof window !== 'undefined') {
  (window as any).musicPlayer = musicPlayer;
  (window as any).mediaSessionManager = mediaSessionManager;
  // Dynamically import mediaSessionTest to avoid circular dependency
  import('./mediaSessionTest').then(({ mediaSessionTest }) => {
    (window as any).mediaSessionTest = mediaSessionTest;
  });
}

// Export the service class for type access
export { MusicPlayerService } from '../services/MusicPlayerService';
export { mediaSessionManager, MediaSessionManager } from '../services/MediaSessionService';
export type { PlaybackState, PlaybackOptions, MusicPlayerEventMap } from '../types/types';
export type { MediaSessionManagerEventMap, ExtractedMetadata, ArtworkInfo } from '../types/types';