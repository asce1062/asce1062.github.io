import { MusicPlayerService } from '../services/MusicPlayerService';

// Global instance accessor
export const musicPlayer = MusicPlayerService.getInstance();

// Global window access for debugging/console use
if (typeof window !== 'undefined') {
  (window as any).musicPlayer = musicPlayer;
}

// Export the service class for type access
export { MusicPlayerService } from '../services/MusicPlayerService';
export type { PlaybackState, PlaybackOptions, MusicPlayerEventMap } from '../services/MusicPlayerService';