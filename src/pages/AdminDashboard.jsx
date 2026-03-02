import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const ADMIN_EMAILS = [
    'dedamirzayevdiyorbek9@gmail.com',
    'gulomovtop@gmail.com',
];

export default function AdminDashboard() {
    const [stats, setStats] = useState({ dau: 0, activeProducts: 0, activeDeliveries: 0, totalUsers: 0 });
    const [users, setUsers] = useState([]);
    const [listings, setListings] = useState([]);
    const [requests, setRequests] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        fetchAll();
    }, []);

    const fetchAll = async () => {
        const { data: { session } } = await supabase.auth.getSession();

        // Verify admin
        const { data: profile } = await supabase.from('users')
            .select('email')
            .eq('id', session.user.id)
            .single();

        if (!profile || !ADMIN_EMAILS.includes(profile.email)) {
            window.location.href = '/login';
            return;
        }

        const [usersRes, listingsRes, requestsRes, ordersRes] = await Promise.all([
            supabase.from('users').select('*').order('created_at', { ascending: false }),
            supabase.from('produce_listings').select('*, users(full_name)').eq('is_active', true).order('created_at', { ascending: false }),
            supabase.from('buyer_requests').select('*, users(full_name)').eq('is_active', true).order('created_at', { ascending: false }),
            supabase.from('orders').select('*').eq('status', 'driver_assigned'),
        ]);

        const allUsers = usersRes.data || [];
        const now = new Date();
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const dau = allUsers.filter(u => new Date(u.updated_at || u.created_at) > dayAgo).length;

        setUsers(allUsers);
        setListings(listingsRes.data || []);
        setRequests(requestsRes.data || []);
        setStats({
            dau,
            activeProducts: (listingsRes.data || []).length,
            activeDeliveries: (ordersRes.data || []).length,
            totalUsers: allUsers.length,
        });
        setLoading(false);
    };

    const trashListing = async (id) => {
        await supabase.from('produce_listings').update({ is_active: false }).eq('id', id);
        setListings(listings.filter(l => l.id !== id));
        setStats({ ...stats, activeProducts: stats.activeProducts - 1 });
    };

    const trashRequest = async (id) => {
        await supabase.from('buyer_requests').update({ is_active: false }).eq('id', id);
        setRequests(requests.filter(r => r.id !== id));
    };

    const filteredUsers = users.filter(u =>
        u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        u.phone_number?.includes(search)
    );

    const tabs = [
        { id: 'overview', label: '📊 Overview' },
        { id: 'users', label: '👥 Users' },
        { id: 'moderation', label: '🛡️ Moderation' },
    ];

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col">
                <Navbar />
                <div className="flex-1 flex items-center justify-center">
                    <span className="animate-spin h-8 w-8 border-3 border-brand-500 border-t-transparent rounded-full" />
                </div>
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold">🛡️ Admin Dashboard</h1>
                    <p className="text-surface-400 text-sm mt-1">Platform oversight & moderation</p>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id
                                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20'
                                    : 'bg-surface-800/50 text-surface-400 hover:text-white hover:bg-surface-700/50 border border-surface-700/50'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in">
                        {[
                            { label: 'Daily Active Users', value: stats.dau, icon: '👥', color: 'brand' },
                            { label: 'Total Users', value: stats.totalUsers, icon: '🌍', color: 'blue' },
                            { label: 'Active Products', value: stats.activeProducts, icon: '🌾', color: 'amber' },
                            { label: 'Active Deliveries', value: stats.activeDeliveries, icon: '🚛', color: 'purple' },
                        ].map((s) => (
                            <div key={s.label} className="card text-center">
                                <p className="text-3xl mb-2">{s.icon}</p>
                                <p className={`text-3xl font-bold text-${s.color}-400`}>{s.value}</p>
                                <p className="text-sm text-surface-400 mt-1">{s.label}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Users Tab */}
                {activeTab === 'users' && (
                    <div className="animate-fade-in">
                        <div className="mb-4">
                            <input
                                className="input-field max-w-md"
                                placeholder="Search by name or +998 phone..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-surface-700">
                                        <th className="text-left py-3 px-4 text-surface-400 font-medium">Name</th>
                                        <th className="text-left py-3 px-4 text-surface-400 font-medium">Email</th>
                                        <th className="text-left py-3 px-4 text-surface-400 font-medium">Phone</th>
                                        <th className="text-left py-3 px-4 text-surface-400 font-medium">Role</th>
                                        <th className="text-left py-3 px-4 text-surface-400 font-medium">Region</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map((u) => (
                                        <tr key={u.id} className="border-b border-surface-800 hover:bg-surface-800/30 transition-colors">
                                            <td className="py-3 px-4 font-medium">{u.full_name}</td>
                                            <td className="py-3 px-4 text-surface-400">{u.email}</td>
                                            <td className="py-3 px-4 text-surface-400">{u.phone_number}</td>
                                            <td className="py-3 px-4">
                                                <span className={`badge ${u.role === 'farmer' ? 'bg-brand-500/20 text-brand-400' :
                                                        u.role === 'buyer' ? 'bg-blue-500/20 text-blue-400' :
                                                            u.role === 'driver' ? 'bg-purple-500/20 text-purple-400' :
                                                                'bg-amber-500/20 text-amber-400'
                                                    }`}>{u.role}</span>
                                            </td>
                                            <td className="py-3 px-4 text-surface-400">{u.region || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {filteredUsers.length === 0 && (
                                <p className="text-center text-surface-500 py-8">No users found.</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Moderation Tab */}
                {activeTab === 'moderation' && (
                    <div className="grid gap-8 lg:grid-cols-2 animate-fade-in">
                        {/* Listings */}
                        <section>
                            <h2 className="text-lg font-semibold mb-4">Active Listings ({listings.length})</h2>
                            {listings.length === 0 ? (
                                <div className="card text-center text-surface-400 py-8">No active listings.</div>
                            ) : (
                                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                                    {listings.map(l => (
                                        <div key={l.id} className="card p-4 flex items-center justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-medium truncate">{l.name}</h4>
                                                <p className="text-xs text-surface-500">by {l.users?.full_name} · {Number(l.price).toLocaleString()} UZS</p>
                                            </div>
                                            <button onClick={() => trashListing(l.id)} className="btn-danger text-xs py-1.5 px-3 shrink-0">
                                                🗑️ Trash
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* Buyer Requests */}
                        <section>
                            <h2 className="text-lg font-semibold mb-4">Buyer Requests ({requests.length})</h2>
                            {requests.length === 0 ? (
                                <div className="card text-center text-surface-400 py-8">No active requests.</div>
                            ) : (
                                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                                    {requests.map(r => (
                                        <div key={r.id} className="card p-4 flex items-center justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-medium truncate">{r.name}</h4>
                                                <p className="text-xs text-surface-500">
                                                    by {r.users?.full_name} · {r.urgency_level}
                                                    {r.max_price && ` · Max ${Number(r.max_price).toLocaleString()} UZS`}
                                                </p>
                                            </div>
                                            <button onClick={() => trashRequest(r.id)} className="btn-danger text-xs py-1.5 px-3 shrink-0">
                                                🗑️ Trash
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </main>
            <Footer />
        </div>
    );
}
