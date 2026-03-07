import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * Your Telegram Bot username (without the @).
 * Replace this with your actual bot username from @BotFather.
 */
const TELEGRAM_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'DaladanBot';

/**
 * Backend URL for Telegram payload verification.
 */
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

/**
 * Role → dashboard route mapping (same as Login.jsx).
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
    const widgetRef = useRef(null);

    const [status, setStatus] = useState('checking');   // checking | widget | verifying | error
    const [error, setError] = useState('');
    const [profile, setProfile] = useState(null);

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
                setStatus('widget');
            }
        })();
    }, [navigate]);

    // ──────────────────────────────────────────────────────────────
    // Step 2: Inject the official Telegram Login Widget script
    // ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (status !== 'widget') return;

        // Expose the global callback BEFORE the script loads
        window.__onTelegramAuth = (telegramUser) => handleTelegramAuth(telegramUser);

        const script = document.createElement('script');
        script.src = 'https://telegram.org/js/telegram-widget.js?22';
        script.async = true;
        script.setAttribute('data-telegram-login', TELEGRAM_BOT_USERNAME);
        script.setAttribute('data-size', 'large');
        script.setAttribute('data-radius', '12');
        script.setAttribute('data-request-access', 'write');
        script.setAttribute('data-onauth', '__onTelegramAuth(user)');

        if (widgetRef.current) {
            widgetRef.current.innerHTML = '';         // clear any previous render
            widgetRef.current.appendChild(script);
        }

        return () => {
            delete window.__onTelegramAuth;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    // ──────────────────────────────────────────────────────────────
    // Step 3: Send Telegram payload to the backend for HMAC verify
    // ──────────────────────────────────────────────────────────────
    const handleTelegramAuth = useCallback(async (telegramUser) => {
        setStatus('verifying');
        setError('');

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Session expired. Please log in again.');

            const res = await fetch(`${BACKEND_URL}/api/verify-telegram`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify(telegramUser),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.detail || body.error || `Verification failed (${res.status})`);
            }

            // Optimistic redirect — backend already wrote the telegram_id
            navigate(getDashboardRoute(profile), { replace: true });
        } catch (err) {
            setError(err.message);
            setStatus('error');
        }
    }, [navigate, profile]);

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

                    {/* ── Widget state ── */}
                    {status === 'widget' && (
                        <div className="flex flex-col items-center gap-6 py-4">
                            <div className="text-center">
                                <h2 className="text-xl font-bold text-gray-900 mb-2">
                                    Link Your Telegram
                                </h2>
                                <p className="text-gray-500 text-sm leading-relaxed">
                                    To receive order notifications and communicate with buyers,
                                    please connect your Telegram account.
                                </p>
                            </div>

                            {/* Telegram widget injects its button here */}
                            <div ref={widgetRef} className="flex justify-center" />

                            <button
                                onClick={() => {
                                    if (profile) navigate(getDashboardRoute(profile), { replace: true });
                                }}
                                className="text-sm text-gray-400 hover:text-gray-600 transition-colors underline"
                            >
                                Skip for now
                            </button>
                        </div>
                    )}

                    {/* ── Verifying state (optimistic spinner) ── */}
                    {status === 'verifying' && (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <span className="animate-spin h-8 w-8 border-3 border-green-600 border-t-transparent rounded-full" />
                            <span className="text-gray-500 text-sm">Verifying Telegram data…</span>
                        </div>
                    )}

                    {/* ── Error state ── */}
                    {status === 'error' && (
                        <div className="flex flex-col items-center gap-4 py-6">
                            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm w-full text-center">
                                {error}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setStatus('widget')}
                                    className="btn-primary text-sm px-5 py-2"
                                >
                                    Try Again
                                </button>
                                <button
                                    onClick={() => {
                                        if (profile) navigate(getDashboardRoute(profile), { replace: true });
                                    }}
                                    className="text-sm text-gray-400 hover:text-gray-600 transition-colors underline"
                                >
                                    Skip for now
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
