import { Song } from './types';

export const MOCK_SONGS: Song[] = [
  {
    id: '1',
    title: 'Nocturnal Animals',
    artist: 'Abel Korzeniowski',
    album: 'Original Soundtrack',
    coverUrl: 'https://picsum.photos/id/10/400/400',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    addedAt: Date.now(),
    description: 'A hauntingly beautiful orchestral piece with deep emotional resonance.'
  },
  {
    id: '2',
    title: 'Jem 的电台',
    artist: '广播电台',
    album: 'Jem FM',
    coverUrl: 'https://picsum.photos/id/11/400/400',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    addedAt: Date.now() - 10000,
    description: 'Upbeat electronic mixes perfect for late night drives.'
  },
  {
    id: '3',
    title: '可不可以 (抖音热歌)',
    artist: '张紫豪',
    album: 'Single',
    coverUrl: 'https://picsum.photos/id/12/400/400',
    audioUrl: '',
    addedAt: Date.now() - 20000,
    description: 'A viral acoustic pop ballad about longing and regret.'
  },
  {
    id: '4',
    title: 'Reminiscence',
    artist: 'Ramin Djawadi',
    album: 'Original Score',
    coverUrl: 'https://picsum.photos/id/13/400/400',
    audioUrl: '',
    addedAt: Date.now() - 30000,
  },
  {
    id: '5',
    title: 'The Son',
    artist: 'Hans Zimmer',
    album: 'Movie Soundtrack',
    coverUrl: 'https://picsum.photos/id/14/400/400',
    audioUrl: '',
    addedAt: Date.now() - 40000,
  },
  {
    id: '6',
    title: 'House of Cards',
    artist: 'Jeff Beal',
    album: 'TV Series Score',
    coverUrl: 'https://picsum.photos/id/15/400/400',
    audioUrl: '',
    addedAt: Date.now() - 50000,
  }
];

export const LIBRARY_ITEMS = [
  { id: 'recently_added', label: 'Recently Added', icon: 'Clock' },
  { id: 'artists', label: 'Artists', icon: 'Mic2' },
  { id: 'albums', label: 'Albums', icon: 'Disc' },
  { id: 'songs', label: 'Songs', icon: 'Music' },
  { id: 'liked', label: 'Liked Songs', icon: 'Heart' },
];