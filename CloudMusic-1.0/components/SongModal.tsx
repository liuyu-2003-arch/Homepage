import React, { useState, useEffect } from 'react';
import { Song } from '../types';
import { X, Plus, Save, Loader2, Trash2 } from 'lucide-react';
import { getSongMetadata } from '../services/geminiService';

interface SongModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (song: Song) => void;
  onDelete?: (song: Song) => void;
  editingSong?: Song | null;
}

const SongModal: React.FC<SongModalProps> = ({ isOpen, onClose, onSave, onDelete, editingSong }) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [lyricsUrl, setLyricsUrl] = useState('');
  const [loading, setLoading] = useState(false);

  // Define helpers BEFORE hooks that might use them to avoid ReferenceError
  const resetForm = () => {
      setTitle('');
      setArtist('');
      setAlbum('');
      setCoverUrl('');
      setAudioUrl('');
      setLyricsUrl('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Only fetch new AI metadata if title or artist changed significantly or if it's a new song
    let description = editingSong?.description;
    if (!editingSong || editingSong.title !== title || editingSong.artist !== artist) {
        const metadata = await getSongMetadata(title, artist);
        description = metadata.description;
    }

    const updatedSong: Song = {
      id: editingSong ? editingSong.id : Date.now().toString(),
      title,
      artist,
      album: album || 'Single',
      coverUrl: coverUrl || `https://picsum.photos/seed/${title}/400/400`,
      audioUrl: audioUrl || undefined,
      lyricsUrl: lyricsUrl || undefined,
      addedAt: editingSong ? editingSong.addedAt : Date.now(),
      description: description
    };

    onSave(updatedSong);
    setLoading(false);
    onClose();
  };

  const handleDelete = () => {
    if (editingSong && onDelete) {
      if (window.confirm(`Are you sure you want to delete "${editingSong.title}"?`)) {
        onDelete(editingSong);
        onClose();
      }
    }
  };

  useEffect(() => {
    if (editingSong) {
      setTitle(editingSong.title || '');
      setArtist(editingSong.artist || '');
      setAlbum(editingSong.album || '');
      setCoverUrl(editingSong.coverUrl || '');
      setAudioUrl(editingSong.audioUrl || '');
      setLyricsUrl(editingSong.lyricsUrl || '');
    } else {
      resetForm();
    }
  }, [editingSong, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">{editingSong ? 'Edit Music' : 'Add Music'}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors">
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

            <div className="pt-2 flex items-center gap-3">
                {editingSong && !loading && (
                    <button 
                        type="button"
                        onClick={handleDelete}
                        className="p-2.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors border border-red-100 shrink-0"
                        title="Delete from Library"
                    >
                        <Trash2 size={20} />
                    </button>
                )}
                
                <button 
                    type="submit" 
                    disabled={loading}
                    className={`flex-1 ${editingSong ? 'bg-blue-600 hover:bg-blue-700' : 'bg-apple-accent hover:bg-red-600'} text-white font-medium py-2.5 rounded-lg flex items-center justify-center space-x-2 transition-colors disabled:opacity-70`}
                >
                    {loading ? (
                        <>
                            <Loader2 size={18} className="animate-spin" />
                            <span>Processing...</span>
                        </>
                    ) : (
                        <>
                            {editingSong ? <Save size={18} /> : <Plus size={18} />}
                            <span>{editingSong ? 'Update Changes' : 'Add to Library'}</span>
                        </>
                    )}
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};

export default SongModal;