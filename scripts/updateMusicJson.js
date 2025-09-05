import fs from 'fs';
import path from 'path';
import { parseFile } from 'music-metadata';
import slugify from 'slugify';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// __dirname workaround for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AUDIO_DIR = path.resolve(__dirname, '../public/audio');
const JSON_PATH = path.resolve(__dirname, '../src/data/music.json');

const DEFAULT_DESCRIPTION = 'Chip Music';
const DEFAULT_GENRE = ['8-Bit', 'Chiptune', 'Electronic', 'Experimental', 'Synthwave'];

function generateId(title) {
  return slugify(title, { lower: true, strict: true });
}


async function getTrackInfo(filePath) {
  const { size, birthtime } = fs.statSync(filePath);
  const relPath = filePath.split(/public[\\/]/i)[1].replace(/\\/g, '/');
  const fileName = path.basename(filePath, '.mp3');
  const title = fileName.replace(/^\d+\./, '').trim();
  const id = generateId(title);

  let duration = '0:00';
  let year = null;
  let dayMonthDate = birthtime;

  try {
    const metadata = await parseFile(filePath);
    const seconds = metadata.format.duration || 0;
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    duration = `${min}:${sec}`;

    // Extract year and optional creation date
    year = metadata.common.year;
    if (metadata.common.date) {
      dayMonthDate = new Date(metadata.common.date);
    }
  } catch {}

  // Genre tagging logic
  const isRemix = /remix/i.test(title);
  const isBonus = /\/extras\//i.test(relPath);
  let genre;

  if (isRemix) {
    genre = ['Remix'];
    if (isBonus) genre.push('Bonus');
  } else if (isBonus) {
    genre = [...DEFAULT_GENRE, 'Bonus'];
  } else {
    genre = [...DEFAULT_GENRE];
  }

 // Ensure "Bonus" is first if present
  if (genre.includes('Bonus')) {
    genre = ['Bonus', ...genre.filter(tag => tag !== 'Bonus')];
  }

  return {
    id,
    title,
    format: 'mp3',
    duration,
    description: DEFAULT_DESCRIPTION,
    genre,
    file: `/${relPath}`,
    size: +(size / (1024 * 1024)).toFixed(2),
    releaseMeta: {
      year,
      date: dayMonthDate,
    },
  };
}

async function crawlAudio() {
  const albums = {};
  const seenIds = new Set();

  async function recurse(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await recurse(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.mp3')) {
        const relative = path.relative(AUDIO_DIR, entryPath);
        const parts = relative.split(path.sep);
        const albumRawName = parts[0]; // e.g., "Album B"
        const albumSlug = generateId(albumRawName); // e.g., "album-b"

        const track = await getTrackInfo(entryPath);

        // Deduplication logic
        const originalId = track.id;
        if (seenIds.has(originalId)) {
          const dedupedId = `${originalId}-${albumSlug}`;
          const albumSuffix = ` (${albumRawName})`;
          console.warn(`⚠️ Duplicate track ID "${originalId}" found. Renaming to "${dedupedId}" and appending album name to title`);

          track.id = dedupedId;
          if (!track.title.includes(albumSuffix)) {
            track.title += albumSuffix;
          }
        }

        seenIds.add(track.id);

        if (!albums[albumSlug]) albums[albumSlug] = [];
        albums[albumSlug].push(track);
      }
    }
  }

  await recurse(AUDIO_DIR);
  return albums;
}

function buildReleaseDate({ year, date }) {
  const fallback = new Date();
  const useDate = date || fallback;

  const yyyy = year || useDate.getFullYear();
  const mm = String(useDate.getMonth() + 1).padStart(2, '0');
  const dd = String(useDate.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

async function updateMusicJson() {
  console.log('🔄 Updating music.json...');

  const newTracksByAlbum = await crawlAudio();

  // Load existing music.json if it exists
  let existingMusicData = { albums: [] };
  if (fs.existsSync(JSON_PATH)) {
    try {
      const existingContent = fs.readFileSync(JSON_PATH, 'utf8');
      existingMusicData = JSON.parse(existingContent);
      console.log(`📂 Loaded existing music.json with ${existingMusicData.albums.length} album(s)`);
    } catch (error) {
      console.warn('⚠️  Could not parse existing music.json, starting fresh');
      existingMusicData = { albums: [] };
    }
  }

  // Create lookup maps for existing albums and tracks
  const existingAlbums = new Map();
  const existingTracks = new Map();

  for (const album of existingMusicData.albums) {
    existingAlbums.set(album.id, album);
    for (const track of album.tracks) {
      existingTracks.set(track.id, track);
    }
  }

  const updatedAlbums = [];
  let newAlbumsCount = 0;
  let newTracksCount = 0;

  // Process albums from filesystem
  for (const [albumId, newTracks] of Object.entries(newTracksByAlbum)) {
    const existingAlbum = existingAlbums.get(albumId);

    if (existingAlbum) {
      // Album exists, merge tracks
      console.log(`🔄 Processing existing album: ${existingAlbum.title}`);

      const newTracksToAdd = [];

      // Collect only new tracks and check for duration updates on existing tracks
      for (const newTrack of newTracks) {
        const { releaseMeta, ...trackWithoutMeta } = newTrack;

        if (!existingTracks.has(trackWithoutMeta.id)) {
          newTracksToAdd.push(trackWithoutMeta);
          newTracksCount++;
          console.log(`  ➕ Added new track: ${trackWithoutMeta.title}`);
        } else {
          // Check if existing track duration needs updating
          const existingTrack = existingTracks.get(trackWithoutMeta.id);
          if (existingTrack.duration !== trackWithoutMeta.duration) {
            console.log(`  🔄 Updated duration for ${trackWithoutMeta.title}: ${existingTrack.duration} → ${trackWithoutMeta.duration}`);
            existingTrack.duration = trackWithoutMeta.duration;
          }
        }
      }

      // Separate existing tracks into main and extras
      const existingMainTracks = existingAlbum.tracks.filter(track => !track.file.includes('/extras/') && !track.file.includes('/Extras/'));
      const existingExtrasTracks = existingAlbum.tracks.filter(track => track.file.includes('/extras/') || track.file.includes('/Extras/'));

      // Separate new tracks into main and extras
      const newMainTracks = newTracksToAdd.filter(track => !track.file.includes('/extras/') && !track.file.includes('/Extras/'));
      const newExtrasTracks = newTracksToAdd.filter(track => track.file.includes('/extras/') || track.file.includes('/Extras/'));

      // Merge: existing main + new main + existing extras + new extras
      const mergedTracks = [
        ...existingMainTracks,
        ...newMainTracks,
        ...existingExtrasTracks,
        ...newExtrasTracks
      ];

      updatedAlbums.push({
        ...existingAlbum,
        tracks: mergedTracks
      });

    } else {
      // New album
      const prettyTitle = albumId.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

      // Clean up tracks and separate main from extras
      const cleanedTracks = newTracks.map(({ releaseMeta, ...rest }) => rest);
      const mainTracks = cleanedTracks.filter(track => !track.file.includes('/extras/') && !track.file.includes('/Extras/'));
      const extrasTracks = cleanedTracks.filter(track => track.file.includes('/extras/') || track.file.includes('/Extras/'));

      // Order tracks: main tracks first, then extras
      const orderedTracks = [...mainTracks, ...extrasTracks];

      // Use release metadata from first track (should be from main tracks if available)
      const firstTrack = newTracks[0];
      const releaseDate = buildReleaseDate(firstTrack.releaseMeta);

      const newAlbum = {
        id: albumId,
        title: prettyTitle,
        description: DEFAULT_DESCRIPTION,
        genre: DEFAULT_GENRE,
        coverArt: `/art/${albumId}/cover.png`,
        releaseDate,
        tracks: orderedTracks,
      };

      updatedAlbums.push(newAlbum);
      newAlbumsCount++;
      newTracksCount += newAlbum.tracks.length;
      console.log(`➕ Added new album: ${prettyTitle} with ${newAlbum.tracks.length} tracks`);
    }
  }

  // Add any existing albums that weren't found in filesystem (preserves manually added albums)
  for (const existingAlbum of existingMusicData.albums) {
    if (!newTracksByAlbum.hasOwnProperty(existingAlbum.id)) {
      updatedAlbums.push(existingAlbum);
      console.log(`🔒 Preserved existing album not found in filesystem: ${existingAlbum.title}`);
    }
  }

  const musicData = { albums: updatedAlbums };

  fs.writeFileSync(JSON_PATH, JSON.stringify(musicData, null, 2));

  console.log(`✅ music.json updated:`);
  console.log(`📁 Total albums: ${musicData.albums.length}`);
  console.log(`➕ New albums: ${newAlbumsCount}`);
  console.log(`🎵 New tracks: ${newTracksCount}`);
}

updateMusicJson().catch((err) => console.error('❌ Error:', err));
