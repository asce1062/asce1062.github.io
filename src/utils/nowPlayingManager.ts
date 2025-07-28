import { nowPlayingManager } from '../services/NowPlayingService';

// Make it globally available
if (typeof window !== 'undefined') {
  window.nowPlayingManager = nowPlayingManager;
}

export { nowPlayingManager };