import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ROLES = [
    { value: 'farmer', label: 'Farmer', icon: '🌾', desc: 'Sell your crops directly' },
    { value: 'buyer', label: 'Retailer', icon: '🏪', desc: 'Buy fresh produce' },
    { value: 'driver', label: 'Driver', icon: '🚛', desc: 'Deliver goods & earn' },
];

/**
 * Strips spaces, dashes, parentheses from a phone string.
 */
function cleanPhone(raw) {
    return raw.replace(/[\s\-()]/g, '');
}

export default function Register() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [role, setRole] = useState('');
    const [form, setForm] = useState({
        fullName: '',
        phone: '',
        password: '',
        region: '',
    });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const validate = () => {
        const errs = {};
        if (!form.fullName.trim()) errs.fullName = 'Full name is required';

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
            const phoneNumber = isAdminEmail ? cleaned : cleaned;

            // Create auth user with metadata — the DB trigger handles the users table insert
            const { error: authError } = await supabase.auth.signUp({
                email,
                password: form.password,
                options: {
                    data: {
                        full_name: form.fullName,
                        phone_number: phoneNumber,
                        region: form.region || '',
                        role: role,
                    },
                },
            });
            if (authError) throw authError;

            navigate('/login', { state: { registered: true } });
        } catch (err) {
            setServerError(err.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50">
            <div className="w-full max-w-lg animate-fade-in">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-extrabold bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent">
                        Daladan
                    </h1>
                    <p className="text-gray-500 mt-2">Agricultural B2B Platform</p>
                </div>

                <div className="card">
                    {step === 1 ? (
                        <>
                            <h2 className="text-xl font-bold text-center mb-2 text-gray-900">Join Daladan</h2>
                            <p className="text-gray-500 text-center text-sm mb-6">Choose your role to get started</p>
                            <div className="grid gap-3">
                                {ROLES.map((r) => (
                                    <button
                                        key={r.value}
                                        onClick={() => { setRole(r.value); setStep(2); }}
                                        className={`flex items-center gap-4 p-5 rounded-xl border-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]
                      ${role === r.value
                                                ? 'border-green-500 bg-green-50'
                                                : 'border-gray-200 bg-white hover:border-gray-300'
                                            }`}
                                    >
                                        <span className="text-3xl">{r.icon}</span>
                                        <div className="text-left">
                                            <p className="font-semibold text-lg text-gray-900">{r.label}</p>
                                            <p className="text-gray-500 text-sm">{r.desc}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => setStep(1)}
                                className="text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1 text-sm transition-colors"
                            >
                                ← Change role
                            </button>
                            <h2 className="text-xl font-bold mb-1 text-gray-900">
                                Register as {ROLES.find(r => r.value === role)?.icon} {ROLES.find(r => r.value === role)?.label}
                            </h2>
                            <p className="text-gray-500 text-sm mb-6">Fill in your details below</p>

                            {serverError && (
                                <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 mb-4 text-sm">
                                    {serverError}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="John Doe"
                                        value={form.fullName}
                                        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                                    />
                                    {errors.fullName && <p className="text-red-500 text-xs mt-1">{errors.fullName}</p>}
                                </div>

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
                                            placeholder="Min. 6 characters"
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

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Region (optional)</label>
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

                    <p className="text-center text-gray-500 text-sm mt-6">
                        Already have an account?{' '}
                        <Link to="/login" className="text-green-600 hover:text-green-700 font-medium transition-colors">
                            Sign In
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
