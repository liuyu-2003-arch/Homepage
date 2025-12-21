import React, { useState } from 'react';
import { X, Github, Loader2 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Error logging in:', error);
      setErrorMsg(error.message || 'Error logging in. Please try again.');
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
        if (isSignUp) {
            const { error } = await supabase.auth.signUp({
                email,
                password,
            });
            if (error) throw error;
            alert('Check your email for the confirmation link!');
        } else {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) throw error;
            onClose();
        }
    } catch (error: any) {
        setErrorMsg(error.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">{isSignUp ? 'Create Account' : 'Sign In'}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
            </button>
        </div>

        <div className="p-8 space-y-6">
            <form onSubmit={handleEmailAuth} className="space-y-4">
                {errorMsg && (
                    <div className="bg-red-50 text-red-500 text-xs p-3 rounded-lg">
                        {errorMsg}
                    </div>
                )}
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                    <input 
                        type="email" 
                        required 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-apple-accent focus:outline-none" 
                        placeholder="hello@example.com"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
                    <input 
                        type="password" 
                        required 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-apple-accent focus:outline-none" 
                        placeholder="••••••••"
                        minLength={6}
                    />
                </div>
                <button 
                    type="submit"
                    disabled={loading}
                    className="w-full bg-apple-accent hover:bg-red-600 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center"
                >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : (isSignUp ? 'Sign Up' : 'Sign In')}
                </button>
            </form>

            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-400">Or continue with</span>
                </div>
            </div>

            <div className="flex gap-3">
                <button 
                    onClick={() => handleOAuthLogin('google')}
                    className="flex-1 flex items-center justify-center space-x-2 bg-white border border-gray-300 text-gray-700 font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    <span className="text-sm">Google</span>
                </button>

                <button 
                    onClick={() => handleOAuthLogin('github')}
                    className="flex-1 flex items-center justify-center space-x-2 bg-[#24292e] text-white font-medium py-2 rounded-lg hover:bg-[#2f363d] transition-colors shadow-sm"
                >
                    <Github size={18} />
                    <span className="text-sm">GitHub</span>
                </button>
            </div>

            <div className="text-center text-xs text-gray-500">
                {isSignUp ? "Already have an account? " : "Don't have an account? "}
                <button 
                    onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(''); }}
                    className="text-apple-accent hover:underline font-medium"
                >
                    {isSignUp ? 'Sign In' : 'Sign Up'}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;