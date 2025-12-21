import React, { useState } from 'react';
import { Song } from '../types';
import { X, Plus, Music, Loader2 } from 'lucide-react';
import { getSongMetadata } from '../services/geminiService';

interface AddMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (song: Song) => void;
}

const AddMusicModal: React.FC<AddMusicModalProps> = ({ isOpen, onClose, onAdd }) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [lyricsUrl, setLyricsUrl] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // AI Enhancement
    const metadata = await getSongMetadata(title, artist);

    const newSong: Song = {
      id: Date.now().toString(),
      title,
      artist,
      album: album || 'Single',
      coverUrl: coverUrl || `https://picsum.photos/seed/${title}/400/400`,
      audioUrl: audioUrl || undefined,
      lyricsUrl: lyricsUrl || undefined,
      addedAt: Date.now(),
      description: metadata.description
    };

    onAdd(newSong);
    setLoading(false);
    resetForm();
    onClose();
  };

  const resetForm = () => {
      setTitle('');
      setArtist('');
      setAlbum('');
      setCoverUrl('');
      setAudioUrl('');
      setLyricsUrl('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Add Music</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
            </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                    <input required value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-apple-accent focus:outline-none" placeholder="Song Title" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Artist</label>
                    <input required value={artist} onChange={e => setArtist(e.target.value)} className="w-full bg-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-apple-accent focus:outline-none" placeholder="Artist Name" />
                </div>
            </div>

            <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Album</label>
                <input value={album} onChange={e => setAlbum(e.target.value)} className="w-full bg-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-apple-accent focus:outline-none" placeholder="Album Name" />
            </div>

            <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cover Image URL</label>
                <input value={coverUrl} onChange={e => setCoverUrl(e.target.value)} className="w-full bg-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-apple-accent focus:outline-none" placeholder="https://..." />
            </div>

            <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Audio Link (mp3/wav)</label>
                <input value={audioUrl} onChange={e => setAudioUrl(e.target.value)} className="w-full bg-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-apple-accent focus:outline-none" placeholder="https://..." />
            </div>

            <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Lyrics Link</label>
                <input value={lyricsUrl} onChange={e => setLyricsUrl(e.target.value)} className="w-full bg-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-apple-accent focus:outline-none" placeholder="https://..." />
            </div>

            <div className="pt-2">
                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-apple-accent hover:bg-red-600 text-white font-medium py-2.5 rounded-lg flex items-center justify-center space-x-2 transition-colors disabled:opacity-70"
                >
                    {loading ? (
                        <>
                            <Loader2 size={18} className="animate-spin" />
                            <span>Enhancing with AI...</span>
                        </>
                    ) : (
                        <>
                            <Plus size={18} />
                            <span>Add to Library</span>
                        </>
                    )}
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};

export default AddMusicModal;