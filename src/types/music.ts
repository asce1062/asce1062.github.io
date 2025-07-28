export interface Track {
  id: string;
  title: string;
  format: string;
  duration: string;
  description: string;
  genre: string[];
  file: string;
  size: number; // File size in MB
}

export interface Album {
  id: string;
  title: string;
  description: string;
  genre: string[];
  coverArt: string;
  releaseDate: string;
  tracks: Track[];
}

export interface MusicData {
  albums: Album[];
}