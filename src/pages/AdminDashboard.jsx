import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const ADMIN_EMAILS = [
    'dedamirzayevdiyorbek9@gmail.com',
    'gulomovtop@gmail.com',
];

export default function AdminDashboard() {
    const [stats, setStats] = useState({ dau: 0, activeProducts: 0, activeDeliveries: 0, totalUsers: 0, totalDelivered: 0 });
    const [users, setUsers] = useState([]);
    const [listings, setListings] = useState([]);
    const [requests, setRequests] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        fetchAll();
    }, []);

    // Real-time subscription for orders
    useEffect(() => {
        const channel = supabase.channel('admin-orders-realtime')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
                fetchStats();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
                fetchStats();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const fetchStats = async () => {
        const [ordersActiveRes, ordersCompletedRes, listingsRes] = await Promise.all([
            supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['awaiting_driver', 'driver_assigned']),
            supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
            supabase.from('produce_listings').select('*', { count: 'exact', head: true }).eq('is_active', true),
        ]);

        setStats(prev => ({
            ...prev,
            activeDeliveries: ordersActiveRes.count || 0,
            totalDelivered: ordersCompletedRes.count || 0,
            activeProducts: listingsRes.count || 0,
        }));
    };

    const fetchAll = async () => {
        const { data: { session } } = await supabase.auth.getSession();

        // Verify admin
        const { data: profile } = await supabase.from('users')
            .select('email')
            .eq('id', session.user.id)
            .maybeSingle();

        if (!profile || !ADMIN_EMAILS.includes(profile.email)) {
            window.location.href = '/login';
            return;
        }

        const [usersRes, listingsRes, requestsRes, ordersActiveRes, ordersCompletedRes] = await Promise.all([
            supabase.from('users').select('*').order('created_at', { ascending: false }),
            supabase.from('produce_listings').select('*, users(full_name)').eq('is_active', true).order('created_at', { ascending: false }),
            supabase.from('buyer_requests').select('*, users(full_name)').eq('is_active', true).order('created_at', { ascending: false }),
            supabase.from('orders').select('*').in('status', ['awaiting_driver', 'driver_assigned']),
            supabase.from('orders').select('*').eq('status', 'completed'),
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
            activeDeliveries: (ordersActiveRes.data || []).length,
            totalUsers: allUsers.length,
            totalDelivered: (ordersCompletedRes.data || []).length,
        });
        setLoading(false);
    };

    const trashListing = async (id) => {
        const { error } = await supabase.from('produce_listings').delete().eq('id', id);
        if (error) {
            alert('Delete failed: ' + error.message);
            return;
        }
        setListings(listings.filter(l => l.id !== id));
        setStats({ ...stats, activeProducts: stats.activeProducts - 1 });
    };

    const trashRequest = async (id) => {
        const { error } = await supabase.from('buyer_requests').delete().eq('id', id);
        if (error) {
            alert('Delete failed: ' + error.message);
            return;
        }
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
            <div className="min-h-screen flex flex-col bg-gray-50">
                <Navbar />
                <div className="flex-1 flex items-center justify-center">
                    <span className="animate-spin h-8 w-8 border-3 border-green-600 border-t-transparent rounded-full" />
                </div>
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Navbar />
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">🛡️ Admin Dashboard</h1>
                    <p className="text-gray-500 text-sm mt-1">Platform oversight & moderation</p>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id
                                ? 'bg-green-600 text-white shadow-md shadow-green-600/20'
                                : 'bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 animate-fade-in">
                        {[
                            { label: 'Daily Active Users', value: stats.dau, icon: '👥', color: 'green' },
                            { label: 'Total Users', value: stats.totalUsers, icon: '🌍', color: 'blue' },
                            { label: 'Active Products', value: stats.activeProducts, icon: '🌾', color: 'amber' },
                            { label: 'Active Deliveries', value: stats.activeDeliveries, icon: '🚛', color: 'purple' },
                            { label: 'Total Delivered', value: stats.totalDelivered, icon: '✅', color: 'emerald' },
                        ].map((s) => (
                            <div key={s.label} className="card text-center">
                                <p className="text-3xl mb-2">{s.icon}</p>
                                <p className={`text-3xl font-bold text-${s.color}-600`}>{s.value}</p>
                                <p className="text-sm text-gray-500 mt-1">{s.label}</p>
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
                        <div className="overflow-x-auto card p-0">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Name</th>
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Email</th>
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Phone</th>
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Role</th>
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Region</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map((u) => (
                                        <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                            <td className="py-3 px-4 font-medium text-gray-900">{u.full_name}</td>
                                            <td className="py-3 px-4 text-gray-500">{u.email}</td>
                                            <td className="py-3 px-4 text-gray-500">{u.phone_number}</td>
                                            <td className="py-3 px-4">
                                                <span className={`badge ${u.role === 'farmer' ? 'bg-green-100 text-green-700' :
                                                    u.role === 'buyer' ? 'bg-blue-100 text-blue-700' :
                                                        u.role === 'driver' ? 'bg-purple-100 text-purple-700' :
                                                            'bg-amber-100 text-amber-700'
                                                    }`}>{u.role}</span>
                                            </td>
                                            <td className="py-3 px-4 text-gray-500">{u.region || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {filteredUsers.length === 0 && (
                                <p className="text-center text-gray-400 py-8">No users found.</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Moderation Tab */}
                {activeTab === 'moderation' && (
                    <div className="grid gap-8 lg:grid-cols-2 animate-fade-in">
                        {/* Listings */}
                        <section>
                            <h2 className="text-lg font-semibold mb-4 text-gray-900">Active Listings ({listings.length})</h2>
                            {listings.length === 0 ? (
                                <div className="card text-center text-gray-400 py-8">No active listings.</div>
                            ) : (
                                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                                    {listings.map(l => (
                                        <div key={l.id} className="card p-4 flex items-center justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-medium text-gray-900 truncate">{l.name}</h4>
                                                <p className="text-xs text-gray-500">by {l.users?.full_name} · {Number(l.price).toLocaleString()} UZS</p>
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
                            <h2 className="text-lg font-semibold mb-4 text-gray-900">Buyer Requests ({requests.length})</h2>
                            {requests.length === 0 ? (
                                <div className="card text-center text-gray-400 py-8">No active requests.</div>
                            ) : (
                                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                                    {requests.map(r => (
                                        <div key={r.id} className="card p-4 flex items-center justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-medium text-gray-900 truncate">{r.name}</h4>
                                                <p className="text-xs text-gray-500">
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
