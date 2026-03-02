import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const ROLES = [
    { value: 'farmer', label: 'Farmer', icon: '🌾', desc: 'Sell your crops directly' },
    { value: 'buyer', label: 'Retailer', icon: '🏪', desc: 'Buy fresh produce' },
    { value: 'driver', label: 'Driver', icon: '🚛', desc: 'Deliver goods & earn' },
];

export default function Register() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [role, setRole] = useState('');
    const [form, setForm] = useState({
        fullName: '',
        email: '',
        phone: '',
        password: '',
        region: '',
    });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState('');

    const validatePhone = (phone) => /^\+998\d{9}$/.test(phone);
    const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const validate = () => {
        const errs = {};
        if (!form.fullName.trim()) errs.fullName = 'Full name is required';
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
            // 1. Create auth user
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: form.email,
                password: form.password,
            });
            if (authError) throw authError;

            // 2. Insert into users table
            const { error: profileError } = await supabase.from('users').insert({
                id: authData.user.id,
                email: form.email,
                full_name: form.fullName,
                phone_number: form.phone,
                region: form.region || null,
                role: role,
            });
            if (profileError) throw profileError;

            navigate('/login', { state: { registered: true } });
        } catch (err) {
            setServerError(err.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-lg animate-fade-in">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-extrabold bg-gradient-to-r from-brand-400 to-emerald-300 bg-clip-text text-transparent">
                        Daladan
                    </h1>
                    <p className="text-surface-400 mt-2">Agricultural B2B Platform</p>
                </div>

                <div className="card">
                    {step === 1 ? (
                        <>
                            <h2 className="text-xl font-bold text-center mb-2">Join Daladan</h2>
                            <p className="text-surface-400 text-center text-sm mb-6">Choose your role to get started</p>
                            <div className="grid gap-3">
                                {ROLES.map((r) => (
                                    <button
                                        key={r.value}
                                        onClick={() => { setRole(r.value); setStep(2); }}
                                        className={`flex items-center gap-4 p-5 rounded-xl border-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]
                      ${role === r.value
                                                ? 'border-brand-500 bg-brand-500/10'
                                                : 'border-surface-700 bg-surface-800/50 hover:border-surface-500'
                                            }`}
                                    >
                                        <span className="text-3xl">{r.icon}</span>
                                        <div className="text-left">
                                            <p className="font-semibold text-lg">{r.label}</p>
                                            <p className="text-surface-400 text-sm">{r.desc}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => setStep(1)}
                                className="text-surface-400 hover:text-surface-200 mb-4 flex items-center gap-1 text-sm transition-colors"
                            >
                                ← Change role
                            </button>
                            <h2 className="text-xl font-bold mb-1">
                                Register as {ROLES.find(r => r.value === role)?.icon} {ROLES.find(r => r.value === role)?.label}
                            </h2>
                            <p className="text-surface-400 text-sm mb-6">Fill in your details below</p>

                            {serverError && (
                                <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 mb-4 text-sm">
                                    {serverError}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-surface-300 mb-1">Full Name</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="John Doe"
                                        value={form.fullName}
                                        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                                    />
                                    {errors.fullName && <p className="text-red-400 text-xs mt-1">{errors.fullName}</p>}
                                </div>

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
                                    <input
                                        type="password"
                                        className="input-field"
                                        placeholder="Min. 6 characters"
                                        value={form.password}
                                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    />
                                    {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-surface-300 mb-1">Region (optional)</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="e.g. Tashkent"
                                        value={form.region}
                                        onChange={(e) => setForm({ ...form, region: e.target.value })}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="btn-primary w-full flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                                    ) : (
                                        'Create Account'
                                    )}
                                </button>
                            </form>
                        </>
                    )}

                    <p className="text-center text-surface-400 text-sm mt-6">
                        Already have an account?{' '}
                        <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
                            Sign In
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
