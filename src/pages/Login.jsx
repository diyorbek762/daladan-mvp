import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const ADMIN_EMAILS = [
    'dedamirzayevdiyorbek9@gmail.com',
    'gulomovtop@gmail.com',
];

function getDashboardRoute(profile) {
    if (ADMIN_EMAILS.includes(profile.email)) return '/admin-dashboard';
    const roleRoutes = {
        farmer: '/seller-dashboard',
        buyer: '/buyer-dashboard',
        driver: '/driver-dashboard',
    };
    return roleRoutes[profile.role] || '/login';
}

export default function Login() {
    const navigate = useNavigate();

    // ── OTP Login State ──
    const [otpCode, setOtpCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // ── Admin Login State ──
    const [showAdminLogin, setShowAdminLogin] = useState(false);
    const [adminForm, setAdminForm] = useState({ email: '', password: '' });
    const [adminLoading, setAdminLoading] = useState(false);

    // ── OTP digit handling ──
    const handleOtpChange = (value) => {
        // Only allow digits, max 6
        const cleaned = value.replace(/\D/g, '').slice(0, 6);
        setOtpCode(cleaned);
    };

    // ── OTP Submit ──
    const handleOtpSubmit = async (e) => {
        e.preventDefault();
        if (otpCode.length !== 6) {
            setError('Please enter the full 6-digit code.');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            // 1. Verify OTP with backend
            const res = await fetch('/api/verify-telegram-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: otpCode }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Verification failed.');
            }

            setSuccess('Code verified! Signing you in…');

            // 2. Sign in with the returned credentials
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: data.email,
                password: data.password,
            });

            if (authError) throw authError;

            // 3. Fetch profile and redirect
            const { data: profile, error: profileError } = await supabase
                .from('users')
                .select('role, email')
                .eq('id', authData.user.id)
                .maybeSingle();

            if (profileError || !profile) {
                throw new Error('Profile not found. Please try again.');
            }

            navigate(getDashboardRoute(profile), { replace: true });
        } catch (err) {
            setError(err.message || 'Something went wrong.');
            setSuccess('');
        } finally {
            setLoading(false);
        }
    };

    // ── Admin Login Submit ──
    const handleAdminSubmit = async (e) => {
        e.preventDefault();
        setAdminLoading(true);
        setError('');

        try {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: adminForm.email,
                password: adminForm.password,
            });
            if (authError) throw authError;

            const { data: profile, error: profileError } = await supabase
                .from('users')
                .select('role, email')
                .eq('id', authData.user.id)
                .maybeSingle();

            if (profileError || !profile) {
                await supabase.auth.signOut();
                throw new Error('Profile not found.');
            }

            navigate(getDashboardRoute(profile), { replace: true });
        } catch (err) {
            setError(err.message || 'Admin login failed.');
        } finally {
            setAdminLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50">
            <div className="w-full max-w-md animate-fade-in">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-extrabold bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent">
                        Daladan
                    </h1>
                    <p className="text-gray-500 mt-2">Agricultural B2B Marketplace</p>
                </div>

                <div className="card">
                    {!showAdminLogin ? (
                        <>
                            <h2 className="text-xl font-bold text-center mb-2 text-gray-900">
                                Sign In with Telegram
                            </h2>
                            <p className="text-gray-500 text-center text-sm mb-6 leading-relaxed">
                                Get a one-time code from our bot, then enter it below.
                            </p>

                            {/* Step 1: Get Code */}
                            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-xl p-5 mb-5">
                                <div className="flex items-start gap-3">
                                    <span className="text-2xl mt-0.5">💬</span>
                                    <div className="flex-1">
                                        <p className="font-semibold text-gray-800 text-sm mb-1">Step 1: Get your code</p>
                                        <p className="text-gray-500 text-xs mb-3">
                                            Open our Telegram bot and press <b>Start</b> to receive your 6-digit login code.
                                        </p>
                                        <a
                                            href="https://t.me/daladan_official_bot"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 bg-[#0088cc] hover:bg-[#006daa] text-white font-medium text-sm px-4 py-2.5 rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-sm"
                                        >
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                                            </svg>
                                            Get Code from Bot
                                        </a>
                                    </div>
                                </div>
                            </div>

                            {/* Step 2: Enter Code */}
                            <div className="mb-2">
                                <p className="font-semibold text-gray-800 text-sm mb-3 flex items-center gap-2">
                                    <span className="text-lg">🔑</span> Step 2: Enter your code
                                </p>

                                {error && (
                                    <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 mb-3 text-sm">
                                        {error}
                                    </div>
                                )}

                                {success && (
                                    <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 mb-3 text-sm">
                                        {success}
                                    </div>
                                )}

                                <form onSubmit={handleOtpSubmit} className="space-y-4">
                                    <div>
                                        <input
                                            id="otp-input"
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            className="input-field text-center text-2xl font-mono tracking-[0.5em] placeholder:tracking-normal placeholder:text-base placeholder:font-normal"
                                            placeholder="Enter 6-digit code"
                                            value={otpCode}
                                            onChange={(e) => handleOtpChange(e.target.value)}
                                            maxLength={6}
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading || otpCode.length !== 6}
                                        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? (
                                            <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                                        ) : (
                                            'Verify & Sign In'
                                        )}
                                    </button>
                                </form>
                            </div>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => { setShowAdminLogin(false); setError(''); }}
                                className="text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1 text-sm transition-colors"
                            >
                                ← Back to OTP login
                            </button>

                            <h2 className="text-xl font-bold text-center mb-6 text-gray-900">Admin Sign In</h2>

                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 mb-4 text-sm">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleAdminSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        className="input-field"
                                        placeholder="admin@example.com"
                                        value={adminForm.email}
                                        onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                    <input
                                        type="password"
                                        className="input-field"
                                        placeholder="Enter your password"
                                        value={adminForm.password}
                                        onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={adminLoading}
                                    className="btn-primary w-full flex items-center justify-center gap-2"
                                >
                                    {adminLoading ? (
                                        <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                                    ) : (
                                        'Sign In'
                                    )}
                                </button>
                            </form>
                        </>
                    )}

                    {/* Admin escape hatch */}
                    {!showAdminLogin && (
                        <p className="text-center text-gray-400 text-xs mt-5">
                            Admin?{' '}
                            <button
                                onClick={() => { setShowAdminLogin(true); setError(''); }}
                                className="text-green-600 hover:text-green-700 font-medium transition-colors underline underline-offset-2"
                            >
                                Sign in with email
                            </button>
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
