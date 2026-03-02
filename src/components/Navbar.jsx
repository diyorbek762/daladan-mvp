import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Navbar() {
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [showProfile, setShowProfile] = useState(false);

    useEffect(() => {
        const fetchProfile = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const { data } = await supabase
                    .from('users')
                    .select('full_name, email, role, phone_number, region')
                    .eq('id', session.user.id)
                    .maybeSingle();
                setProfile(data);
            }
        };
        fetchProfile();
    }, []);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    const roleLabel = {
        farmer: '🌾 Farmer',
        buyer: '🏪 Retailer',
        driver: '🚛 Driver',
        admin: '🛡️ Admin',
    };

    return (
        <>
            <nav className="sticky top-0 z-50 glass border-b border-white/10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <h1 className="text-xl font-bold bg-gradient-to-r from-brand-400 to-emerald-300 bg-clip-text text-transparent">
                            Daladan
                        </h1>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowProfile(!showProfile)}
                                className="flex items-center gap-2 bg-surface-800/50 hover:bg-surface-700/50 rounded-xl px-3 py-2 transition-all border border-surface-700/50"
                            >
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-emerald-400 flex items-center justify-center text-sm font-bold text-white">
                                    {profile?.full_name?.charAt(0) || '?'}
                                </div>
                                <span className="hidden sm:block text-sm font-medium">{profile?.full_name || 'User'}</span>
                            </button>

                            <button
                                onClick={handleSignOut}
                                className="btn-secondary text-sm py-2 px-3"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Profile Slide */}
            {showProfile && (
                <div className="fixed inset-0 z-40" onClick={() => setShowProfile(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="absolute right-0 top-0 h-full w-full max-w-sm bg-surface-900 border-l border-surface-700 p-6 animate-slide-in shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold">Profile</h3>
                            <button onClick={() => setShowProfile(false)} className="text-surface-400 hover:text-white text-xl">✕</button>
                        </div>

                        <div className="flex flex-col items-center mb-6">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-500 to-emerald-400 flex items-center justify-center text-3xl font-bold text-white mb-3">
                                {profile?.full_name?.charAt(0) || '?'}
                            </div>
                            <h4 className="text-lg font-semibold">{profile?.full_name}</h4>
                            <span className="text-sm text-surface-400">{roleLabel[profile?.role] || profile?.role}</span>
                        </div>

                        <div className="space-y-4">
                            <div className="card bg-surface-800/30 p-4">
                                <p className="text-xs text-surface-500 uppercase tracking-wider mb-1">Email</p>
                                <p className="text-sm">{profile?.email}</p>
                            </div>
                            <div className="card bg-surface-800/30 p-4">
                                <p className="text-xs text-surface-500 uppercase tracking-wider mb-1">Phone</p>
                                <p className="text-sm">{profile?.phone_number}</p>
                            </div>
                            {profile?.region && (
                                <div className="card bg-surface-800/30 p-4">
                                    <p className="text-xs text-surface-500 uppercase tracking-wider mb-1">Region</p>
                                    <p className="text-sm">{profile?.region}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
