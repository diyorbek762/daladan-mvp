import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * Strips spaces, dashes, parentheses from a phone string.
 * Returns cleaned string.
 */
function cleanPhone(raw) {
    return raw.replace(/[\s\-()]/g, '');
}

export default function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const [form, setForm] = useState({ phone: '', password: '' });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const validate = () => {
        const errs = {};
        const cleaned = cleanPhone(form.phone);
        const isAdminEmail = cleaned.includes('@');

        if (!isAdminEmail && !/^\+998\d{9}$/.test(cleaned)) {
            errs.phone = 'Must start with +998 followed by 9 digits';
        }
        if (!isAdminEmail && !cleaned) {
            errs.phone = 'Phone number is required';
        }
        if (form.password.length < 6) errs.password = 'Minimum 6 characters';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        setLoading(true);
        setServerError('');

        try {
            const cleaned = cleanPhone(form.phone);
            const isAdminEmail = cleaned.includes('@');

            // Admin override: if contains @, use as-is. Otherwise append @daladan.com
            const email = isAdminEmail ? cleaned : `${cleaned}@daladan.com`;

            // 1. Authenticate with Supabase
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password: form.password,
            });
            if (authError) throw authError;

            // 2. Fetch role
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('role, email')
                .eq('id', authData.user.id)
                .maybeSingle();
            if (userError) throw userError;
            if (!userData) {
                await supabase.auth.signOut();
                throw new Error('Profile not found. Please register first.');
            }

            // 3. Route based on role or admin email
            const ADMIN_EMAILS = [
                'dedamirzayevdiyorbek9@gmail.com',
                'gulomovtop@gmail.com',
            ];

            if (ADMIN_EMAILS.includes(userData.email)) {
                navigate('/admin-dashboard');
            } else {
                const roleRoutes = {
                    farmer: '/seller-dashboard',
                    buyer: '/buyer-dashboard',
                    driver: '/driver-dashboard',
                };
                navigate(roleRoutes[userData.role] || '/login');
            }
        } catch (err) {
            setServerError(err.message || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
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
                    <p className="text-gray-500 mt-2">Welcome back</p>
                </div>

                <div className="card">
                    <h2 className="text-xl font-bold text-center mb-6 text-gray-900">Sign In</h2>

                    {location.state?.registered && (
                        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 mb-4 text-sm">
                            ✅ Account created! Please sign in.
                        </div>
                    )}

                    {serverError && (
                        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 mb-4 text-sm">
                            {serverError}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                            <input
                                type="tel"
                                className="input-field"
                                placeholder="+998901234567"
                                value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            />
                            <p className="text-gray-400 text-xs mt-1">Admins: enter your Gmail address instead</p>
                            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className="input-field pr-10"
                                    placeholder="Enter your password"
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>

                    <p className="text-center text-gray-500 text-sm mt-6">
                        Don't have an account?{' '}
                        <Link to="/register" className="text-green-600 hover:text-green-700 font-medium transition-colors">
                            Register
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
