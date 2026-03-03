import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const [form, setForm] = useState({ email: '', phone: '', password: '' });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const validatePhone = (phone) => /^\+998\d{9}$/.test(phone);
    const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const validate = () => {
        const errs = {};
        if (!validateEmail(form.email)) errs.email = 'Valid email is required';
        if (!validatePhone(form.phone)) errs.phone = 'Must start with +998 followed by 9 digits';
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
            // 1. Authenticate with Supabase
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: form.email,
                password: form.password,
            });
            if (authError) throw authError;

            // 2. Verify phone number matches
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('phone_number, role, email')
                .eq('id', authData.user.id)
                .maybeSingle();
            if (userError) throw userError;
            if (!userData) {
                await supabase.auth.signOut();
                throw new Error('Profile not found. Please register first.');
            }

            if (userData.phone_number !== form.phone) {
                await supabase.auth.signOut();
                throw new Error('Phone number does not match our records.');
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
        <div className="min-h-screen flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md animate-fade-in">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-extrabold bg-gradient-to-r from-brand-400 to-emerald-300 bg-clip-text text-transparent">
                        Daladan
                    </h1>
                    <p className="text-surface-400 mt-2">Welcome back</p>
                </div>

                <div className="card">
                    <h2 className="text-xl font-bold text-center mb-6">Sign In</h2>

                    {location.state?.registered && (
                        <div className="bg-brand-500/10 border border-brand-500/30 text-brand-400 rounded-xl p-3 mb-4 text-sm">
                            ✅ Account created! Please sign in.
                        </div>
                    )}

                    {serverError && (
                        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 mb-4 text-sm">
                            {serverError}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-surface-300 mb-1">Email</label>
                            <input
                                type="email"
                                className="input-field"
                                placeholder="you@example.com"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                            />
                            {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-surface-300 mb-1">Phone Number</label>
                            <input
                                type="tel"
                                className="input-field"
                                placeholder="+998901234567"
                                value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            />
                            {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-surface-300 mb-1">Password</label>
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
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-surface-400 hover:text-surface-200 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
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

                    <p className="text-center text-surface-400 text-sm mt-6">
                        Don't have an account?{' '}
                        <Link to="/register" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
                            Register
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
