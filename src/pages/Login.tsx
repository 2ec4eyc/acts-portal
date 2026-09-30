import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { signInWithEmailAndPassword, setPersistence, browserSessionPersistence } from 'firebase/auth';

import { ActsLogo } from '../components/ActsLogo';
import { FormField } from '../components/FormField';
import { auth } from '../lib/firebase';

export const Login = ({ onLoginSuccess }: { onLoginSuccess: () => void }) => {
  const [email, setEmail] = useState(''); 
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false); 
  const [error, setError] = useState('');
  
  // Load the remembered email on mount. Passwords are never stored: remove any saved by older versions.
  useEffect(() => {
    localStorage.removeItem('acts_saved_password');
    const savedEmail = localStorage.getItem('acts_saved_email');
    const savedRemember = localStorage.getItem('acts_remember_me') === 'true';
    
    if (savedRemember) {
      if (savedEmail) setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    setLoading(true); 
    setError('');
    try { 
      await setPersistence(auth, browserSessionPersistence);
      // The portal account (and role) is looked up by the API after sign-in; see App.tsx.
      await signInWithEmailAndPassword(auth, email, password); 
      
      // "Remember Email" keeps only the email address
      if (rememberMe) {
        localStorage.setItem('acts_saved_email', email);
        localStorage.setItem('acts_remember_me', 'true');
      } else {
        localStorage.removeItem('acts_saved_email');
        localStorage.setItem('acts_remember_me', 'false');
      }
      
      onLoginSuccess(); 
    } catch (err: any) { 
      setError('Incorrect Email/Password'); 
      setLoading(false); 
    } 
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-fb-gray p-4">
      <div className="w-full max-w-md bg-white p-12 rounded-[2.5rem] shadow-2xl text-center space-y-10 animate-in fade-in zoom-in-95 duration-300">
        <ActsLogo className="w-24 h-24 mx-auto" /><h2 className="text-4xl font-black uppercase italic tracking-tighter text-fb-textPrimary">Acts Portal</h2>
        <form onSubmit={handleLogin} className="space-y-6 text-left">
          {error && <div className="p-4 bg-red-50 text-red-600 text-xs font-bold border-l-4 border-red-500 rounded-lg">{error}</div>}
          <FormField label="Email Address" name="email" value={email} type="email" onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
          <FormField label="Password" name="password" value={password} type="password" onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          
          <div className="flex items-center px-1">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="relative flex items-center">
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-fb-gray text-fb-blue focus:ring-fb-blue transition-all cursor-pointer appearance-none checked:bg-fb-blue checked:border-fb-blue"
                />
                <Check size={14} className={`absolute left-0.5 text-white transition-opacity pointer-events-none ${rememberMe ? 'opacity-100' : 'opacity-0'}`} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-fb-textSecondary group-hover:text-fb-textPrimary transition-colors">Remember Email</span>
            </label>
          </div>

          <button disabled={loading} className="w-full bg-fb-blue text-white py-5 rounded-2xl font-black uppercase text-xs tracking-[0.3em] shadow-xl shadow-fb-blue/20 active:scale-95 disabled:opacity-50 transition-all">Login</button>
        </form>
      </div>
    </div>
  );
};
