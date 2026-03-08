import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * Role → dashboard route mapping.
 */
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function TelegramVerificationInterceptor() {
    const navigate = useNavigate();

    const [status, setStatus] = useState('checking');   // checking | otp | verifying | error
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [profile, setProfile] = useState(null);
    const [otpCode, setOtpCode] = useState('');

    // ──────────────────────────────────────────────────────────────
    // Step 1: Check if user already has a telegram_id
    // ──────────────────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/login', { replace: true });
                return;
            }

            const { data: profileData, error: profileError } = await supabase
                .from('users')
                .select('telegram_id, role, email')
                .eq('id', session.user.id)
                .maybeSingle();

            if (profileError || !profileData) {
                navigate('/login', { replace: true });
                return;
            }

            setProfile(profileData);

            // Already linked → go straight to dashboard
            if (profileData.telegram_id) {
                navigate(getDashboardRoute(profileData), { replace: true });
            } else {
                setStatus('otp');
            }
        })();
    }, [navigate]);

    // ──────────────────────────────────────────────────────────────
    // OTP digit handling
    // ──────────────────────────────────────────────────────────────
    const handleOtpChange = (value) => {
        const cleaned = value.replace(/\D/g, '').slice(0, 6);
        setOtpCode(cleaned);
    };

    // ──────────────────────────────────────────────────────────────
    // Submit OTP for verification
    // ──────────────────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (otpCode.length !== 6) {
            setError('Please enter the full 6-digit code.');
            return;
        }

        setStatus('verifying');
        setError('');
        setSuccess('');

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Session expired. Please log in again.');

            const res = await fetch('/api/verify-telegram-otp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    code: otpCode,
                    supabaseUserId: session.user.id,
                }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.error || `Verification failed (${res.status})`);
            }

            setSuccess('Telegram linked successfully! Redirecting…');

            // Brief pause so user sees the success state
            setTimeout(() => {
                navigate(getDashboardRoute(profile), { replace: true });
            }, 800);
        } catch (err) {
            console.error('[TelegramOTP] Error:', err);
            setError(err.message);
            setStatus('otp');
        }
    };

    // ──────────────────────────────────────────────────────────────
    // Render
    // ──────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50">
            <div className="w-full max-w-md animate-fade-in">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-extrabold bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent">
                        Daladan
                    </h1>
                    <p className="text-gray-500 mt-2">One more step…</p>
                </div>

                <div className="card">
                    {/* ── Checking state ── */}
                    {status === 'checking' && (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <span className="animate-spin h-8 w-8 border-3 border-green-600 border-t-transparent rounded-full" />
                            <span className="text-gray-500 text-sm">Checking account…</span>
                        </div>
                    )}

                    {/* ── OTP state ── */}
                    {status === 'otp' && (
                        <div className="flex flex-col gap-5 py-2">
                            <div className="text-center">
                                <h2 className="text-xl font-bold text-gray-900 mb-2">
                                    Link Your Telegram
                                </h2>
                                <p className="text-gray-500 text-sm leading-relaxed">
                                    To complete sign-in, verify your Telegram account with a one-time code.
                                </p>
                            </div>

                            {/* Step 1: Get Code */}
                            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-xl p-5">
                                <div className="flex items-start gap-3">
                                    <span className="text-2xl mt-0.5">💬</span>
                                    <div className="flex-1">
                                        <p className="font-semibold text-gray-800 text-sm mb-1">Step 1: Get your code</p>
                                        <p className="text-gray-500 text-xs mb-3">
                                            Open our Telegram bot and press <b>Start</b> to receive your 6-digit code.
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
                            <div>
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

                                <form onSubmit={handleSubmit} className="space-y-4">
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

                                    <button
                                        type="submit"
                                        disabled={otpCode.length !== 6}
                                        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Verify &amp; Sign In
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* ── Verifying state (spinner) ── */}
                    {status === 'verifying' && (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <span className="animate-spin h-8 w-8 border-3 border-green-600 border-t-transparent rounded-full" />
                            <span className="text-gray-500 text-sm">Verifying your code…</span>
                        </div>
                    )}

                    {/* ── Error state ── */}
                    {status === 'error' && (
                        <div className="flex flex-col items-center gap-4 py-6">
                            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm w-full text-center">
                                {error}
                            </div>
                            <button
                                onClick={() => { setStatus('otp'); setError(''); }}
                                className="btn-primary text-sm px-5 py-2"
                            >
                                Try Again
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
