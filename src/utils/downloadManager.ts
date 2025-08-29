import { downloadManager } from '../services/DownloadService';

// Make download manager globally available
if (typeof window !== 'undefined') {
  window.downloadManager = downloadManager;
}

export { downloadManager };
export type { DownloadOptions, DownloadProgress } from '../types/types';