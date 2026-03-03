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
            <nav className="sticky top-0 z-50 glass border-b border-gray-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <h1 className="text-xl font-bold bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent">
                            Daladan
                        </h1>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowProfile(!showProfile)}
                                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 rounded-xl px-3 py-2 transition-all border border-gray-200"
                            >
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-emerald-400 flex items-center justify-center text-sm font-bold text-white">
                                    {profile?.full_name?.charAt(0) || '?'}
                                </div>
                                <span className="hidden sm:block text-sm font-medium text-gray-700">{profile?.full_name || 'User'}</span>
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
                    <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
                    <div
                        className="absolute right-0 top-0 h-full w-full max-w-sm bg-white border-l border-gray-200 p-6 animate-slide-in shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-gray-900">Profile</h3>
                            <button onClick={() => setShowProfile(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                        </div>

                        <div className="flex flex-col items-center mb-6">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-400 flex items-center justify-center text-3xl font-bold text-white mb-3">
                                {profile?.full_name?.charAt(0) || '?'}
                            </div>
                            <h4 className="text-lg font-semibold text-gray-900">{profile?.full_name}</h4>
                            <span className="text-sm text-gray-500">{roleLabel[profile?.role] || profile?.role}</span>
                        </div>

                        <div className="space-y-4">
                            <div className="card bg-gray-50 p-4">
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Email</p>
                                <p className="text-sm text-gray-900">{profile?.email}</p>
                            </div>
                            <div className="card bg-gray-50 p-4">
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Phone</p>
                                <p className="text-sm text-gray-900">{profile?.phone_number}</p>
                            </div>
                            {profile?.region && (
                                <div className="card bg-gray-50 p-4">
                                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Region</p>
                                    <p className="text-sm text-gray-900">{profile?.region}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
