import musicData from '../data/music.json';
import type { Track, Album, DownloadOptions, DownloadProgress, DownloadEventMap } from '../types/types';


class DownloadManager extends EventTarget {
  private static instance: DownloadManager | null = null;
  private defaultOptions: DownloadOptions = {
    maxConcurrent: 3,
    retries: 3,
    timeout: 10000,
    compression: 'DEFLATE',
    compressionLevel: 6,
  };

  private constructor() {
    super();
  }

  // Singleton pattern
  public static getInstance(): DownloadManager {
    if (!DownloadManager.instance) {
      DownloadManager.instance = new DownloadManager();
    }
    return DownloadManager.instance;
  }

  private emitEvent<K extends keyof DownloadEventMap>(
    type: K,
    detail: DownloadEventMap[K] extends CustomEvent<infer D> ? D : never
  ): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  // Enhanced fetch function with retry logic
  private async fetchWithRetry(url: string, options: DownloadOptions): Promise<Blob> {
    const { retries = 3, timeout = 10000 } = options;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        console.log(`🔄 Fetching ${url} (attempt ${attempt}/${retries})`);

        const response = await fetch(url, {
          signal: controller.signal,
          cache: 'no-cache',
        });

        clearTimeout(timer);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();
        console.log(`✅ Successfully fetched ${url} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
        return blob;
      } catch (error) {
        console.warn(`⚠️ Attempt ${attempt} failed for ${url}:`, (error as Error).message);

        if (attempt === retries) {
          console.error(`❌ All ${retries} attempts failed for ${url}`);
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error('Fetch failed after all retries');
  }

  // Download album art and add to ZIP
  private async addAlbumArtToZip(zip: any, album: Album, folderPath: string = ''): Promise<void> {
    try {
      if (album.coverArt) {
        console.log(`🎨 Downloading album art for: ${album.title}`);
        const artBlob = await this.fetchWithRetry(album.coverArt, this.defaultOptions);

        const artPath = folderPath ? `${folderPath}/AlbumArt.png` : 'AlbumArt.png';
        zip.file(artPath, artBlob);
        console.log(`✅ Added album art: ${artPath}`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to download album art for ${album.title}:`, (error as Error).message);
      // Don't fail the entire download if album art fails
    }
  }

  // Process tracks with parallel fetching and throttling
  private async processTracksWithThrottling(
    zip: any,
    tracks: (Track & { albumTitle?: string; albumId?: string })[],
    options: DownloadOptions,
    organizeByAlbum: boolean = false,
    includeAlbumArt: boolean = false
  ): Promise<void> {
    const { maxConcurrent = 3 } = options;
    const total = tracks.length;
    let completed = 0;
    let successful = 0;
    let failed = 0;

    console.log(
      `🚀 Starting parallel download of ${total} tracks (max ${maxConcurrent} concurrent)`
    );

    // If including album art, add it for each unique album
    if (includeAlbumArt) {
      const processedAlbums = new Set<string>();

      for (const track of tracks) {
        if (track.albumId && !processedAlbums.has(track.albumId)) {
          const album = musicData.albums.find((a) => a.id === track.albumId);
          if (album) {
            const folderPath =
              organizeByAlbum && track.albumTitle
                ? track.albumTitle.replace(/[^a-zA-Z0-9]/g, '_')
                : '';

            await this.addAlbumArtToZip(zip, album, folderPath);
            processedAlbums.add(track.albumId);
          }
        }
      }
    }

    // Create a semaphore to limit concurrent downloads
    const semaphore = new Array(maxConcurrent).fill(null);

    // Function to acquire semaphore slot
    const acquireSlot = (): Promise<number> => {
      return new Promise((resolve) => {
        const checkSlot = () => {
          for (let i = 0; i < semaphore.length; i++) {
            if (semaphore[i] === null) {
              semaphore[i] = true;
              resolve(i);
              return;
            }
          }
          // No slot available, check again in 50ms
          setTimeout(checkSlot, 50);
        };
        checkSlot();
      });
    };

    // Function to release semaphore slot
    const releaseSlot = (slotIndex: number) => {
      semaphore[slotIndex] = null;
    };

    // Process each track with throttling
    const downloadPromises = tracks.map(async (track) => {
      const slotIndex = await acquireSlot();

      try {
        this.emitEvent('download-progress', {
          total,
          completed,
          successful,
          failed,
          percentage: (completed / total) * 100,
          currentTrack: track.title,
        });

        const blob = await this.fetchWithRetry(track.file, options);

        // Organize files
        if (organizeByAlbum && track.albumTitle) {
          const folderName = track.albumTitle.replace(/[^a-zA-Z0-9]/g, '_');
          const fileName = `${track.title}.${track.format}`;
          zip.folder(folderName)?.file(fileName, blob);
        } else {
          zip.file(`${track.title}.${track.format}`, blob);
        }

        successful++;
      } catch (error) {
        console.error(`❌ Failed to download ${track.title}:`, (error as Error).message);
        this.emitEvent('download-error', {
          error: `Failed to download ${track.title}`,
          track,
        });
        failed++;
      } finally {
        releaseSlot(slotIndex);
        completed++;

        // Emit progress update
        this.emitEvent('download-progress', {
          total,
          completed,
          successful,
          failed,
          percentage: (completed / total) * 100,
        });
      }
    });

    // Wait for all downloads to complete
    await Promise.all(downloadPromises);

    console.log(`📊 Download Summary: ${successful} successful, ${failed} failed, ${total} total`);

    // Show user feedback about results
    if (failed > 0) {
      const message = `Download completed with ${failed} failed tracks. ${successful} tracks were successfully processed.`;
      console.warn(`⚠️ ${message}`);
    } else {
      console.log(`🎉 All ${successful} tracks downloaded successfully!`);
    }
  }

  // Download a single track
  public async downloadTrack(
    trackId: string,
    albumId: string,
    options: Partial<DownloadOptions> = {}
  ): Promise<void> {
    try {
      // Find the track and album
      const album = musicData.albums.find((a) => a.id === albumId);
      if (!album) {
        throw new Error(`Album not found: ${albumId}`);
      }

      const track = album.tracks.find((t) => t.id === trackId);
      if (!track) {
        throw new Error(`Track not found: ${trackId} in album ${albumId}`);
      }

      this.emitEvent('download-started', {
        type: 'track',
        trackCount: 1,
      });

      const mergedOptions = { ...this.defaultOptions, ...options };
      const blob = await this.fetchWithRetry(track.file, mergedOptions);

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${track.title}.${track.format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.emitEvent('download-completed', {
        successful: 1,
        failed: 0,
        total: 1,
        downloadUrl: url,
      });
    } catch (error) {
      console.error('Failed to download track:', error);
      this.emitEvent('download-error', {
        error: `Failed to download track: ${(error as Error).message}`,
      });
    }
  }

  // Download entire album
  public async downloadAlbum(
    albumId: string,
    options: Partial<DownloadOptions> = {}
  ): Promise<void> {
    try {
      // Find the album
      const album = musicData.albums.find((a) => a.id === albumId);
      if (!album) {
        throw new Error(`Album not found: ${albumId}`);
      }

      this.emitEvent('download-started', {
        type: 'album',
        trackCount: album.tracks.length,
      });

      const mergedOptions = { ...this.defaultOptions, ...options };

      // Ensure JSZip is available
      if (!window.JSZip) {
        throw new Error('JSZip library not loaded');
      }

      const zip = new window.JSZip();

      // Add album title to tracks for processing
      const tracksWithAlbum = album.tracks.map((track) => ({
        ...track,
        albumTitle: album.title,
        albumId: album.id,
      }));

      // Add album art to the root of the ZIP
      await this.addAlbumArtToZip(zip, album);

      await this.processTracksWithThrottling(zip, tracksWithAlbum, mergedOptions, false, false);

      // Generate and download ZIP
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: mergedOptions.compression,
        compressionOptions: { level: mergedOptions.compressionLevel },
      });

      // Create download link
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${album.title.replace(/[^a-zA-Z0-9]/g, '_')}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.emitEvent('download-completed', {
        successful: album.tracks.length,
        failed: 0,
        total: album.tracks.length,
        downloadUrl: url,
      });
    } catch (error) {
      console.error('Failed to download album:', error);
      this.emitEvent('download-error', {
        error: `Failed to download album: ${(error as Error).message}`,
      });
    }
  }

  // Download custom selection of tracks
  public async downloadCustomSelection(
    trackIds: string[],
    filename?: string,
    organizeByAlbum: boolean = true,
    options: Partial<DownloadOptions> = {}
  ): Promise<void> {
    try {
      if (trackIds.length === 0) {
        throw new Error('No tracks selected for download');
      }

      this.emitEvent('download-started', {
        type: 'custom',
        trackCount: trackIds.length,
      });

      const mergedOptions = { ...this.defaultOptions, ...options };

      // Ensure JSZip is available
      if (!window.JSZip) {
        throw new Error('JSZip library not loaded');
      }

      // Find all selected tracks
      const selectedTracks: (Track & { albumTitle: string; albumId: string })[] = [];

      musicData.albums.forEach((album) => {
        album.tracks.forEach((track) => {
          if (trackIds.includes(track.id)) {
            selectedTracks.push({
              ...track,
              albumTitle: album.title,
              albumId: album.id,
            });
          }
        });
      });

      if (selectedTracks.length === 0) {
        throw new Error('No valid tracks found for the selected IDs');
      }

      const zip = new window.JSZip();
      await this.processTracksWithThrottling(
        zip,
        selectedTracks,
        mergedOptions,
        organizeByAlbum,
        true
      );

      // Generate and download ZIP
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: mergedOptions.compression,
        compressionOptions: { level: mergedOptions.compressionLevel },
      });

      // Create download link
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        filename || `alex_immer_selected_tracks_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.emitEvent('download-completed', {
        successful: selectedTracks.length,
        failed: 0,
        total: selectedTracks.length,
        downloadUrl: url,
      });
    } catch (error) {
      console.error('Failed to download custom selection:', error);
      this.emitEvent('download-error', {
        error: `Failed to download custom selection: ${(error as Error).message}`,
      });
    }
  }

  // Event listener helper methods
  public onDownloadStarted(
    callback: (
      event: CustomEvent<{ type: 'album' | 'custom' | 'track'; trackCount: number }>
    ) => void
  ): void {
    this.addEventListener('download-started', callback as EventListener);
  }

  public onDownloadProgress(callback: (event: CustomEvent<DownloadProgress>) => void): void {
    this.addEventListener('download-progress', callback as EventListener);
  }

  public onDownloadCompleted(
    callback: (
      event: CustomEvent<{
        successful: number;
        failed: number;
        total: number;
        downloadUrl?: string;
      }>
    ) => void
  ): void {
    this.addEventListener('download-completed', callback as EventListener);
  }

  public onDownloadError(
    callback: (event: CustomEvent<{ error: string; track?: Track }>) => void
  ): void {
    this.addEventListener('download-error', callback as EventListener);
  }

  // Cleanup method
  public destroy(): void {
    DownloadManager.instance = null;
  }
}

// Export singleton instance
export const downloadManager = DownloadManager.getInstance();

// Make it globally available
declare global {
  interface Window {
    downloadManager: DownloadManager;
    JSZip: any;
  }
}
