import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function SellerDashboard() {
    const [listings, setListings] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [locLoading, setLocLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({
        name: '', amount: '', price: '', sellerDelivers: false,
        latitude: null, longitude: null, displayLocation: '',
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const [listingsRes, requestsRes] = await Promise.all([
            supabase.from('produce_listings')
                .select('*')
                .eq('seller_id', session.user.id)
                .eq('is_active', true)
                .order('created_at', { ascending: false }),
            supabase.from('buyer_requests')
                .select('*, users(full_name, region)')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(20),
        ]);
        setListings(listingsRes.data || []);
        setRequests(requestsRes.data || []);
        setLoading(false);
    };

    const getLocation = () => {
        setLocLoading(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setForm({
                    ...form,
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    displayLocation: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
                });
                setLocLoading(false);
            },
            () => {
                alert('Could not get location. Please allow location access.');
                setLocLoading(false);
            }
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name || !form.amount || !form.price) return;
        setSubmitting(true);

        const { data: { session } } = await supabase.auth.getSession();
        const row = {
            seller_id: session.user.id,
            name: form.name,
            amount: parseFloat(form.amount),
            price: parseFloat(form.price),
            seller_can_deliver: form.sellerDelivers,
            latitude: form.latitude,
            longitude: form.longitude,
            display_location: form.displayLocation || null,
        };

        const { data, error } = await supabase.from('produce_listings').insert(row).select().single();
        if (!error && data) {
            setListings([data, ...listings]);
            setForm({ name: '', amount: '', price: '', sellerDelivers: false, latitude: null, longitude: null, displayLocation: '' });
            setShowForm(false);
        }
        setSubmitting(false);
    };

    const softDelete = async (id) => {
        const { error } = await supabase.from('produce_listings').update({ is_active: false }).eq('id', id);
        if (!error) setListings(listings.filter((l) => l.id !== id));
    };

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
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold">🌾 Seller Dashboard</h1>
                        <p className="text-surface-400 text-sm mt-1">Manage your inventory and view market needs</p>
                    </div>
                    <button onClick={() => setShowForm(!showForm)} className="btn-primary">
                        {showForm ? 'Cancel' : '+ Add Product'}
                    </button>
                </div>

                {/* Add Product Form */}
                {showForm && (
                    <div className="card mb-8 animate-slide-up">
                        <h3 className="font-semibold text-lg mb-4">New Product</h3>
                        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="block text-sm text-surface-400 mb-1">Product Name</label>
                                <input className="input-field" placeholder="e.g. Tomatoes" value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                            </div>
                            <div>
                                <label className="block text-sm text-surface-400 mb-1">Amount (kg)</label>
                                <input className="input-field" type="number" min="0" step="0.01" placeholder="e.g. 500"
                                    value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                            </div>
                            <div>
                                <label className="block text-sm text-surface-400 mb-1">Price (per kg)</label>
                                <input className="input-field" type="number" min="0" step="0.01" placeholder="e.g. 15000"
                                    value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                            </div>
                            <div className="flex flex-col justify-end">
                                <button type="button" onClick={getLocation} disabled={locLoading}
                                    className="btn-secondary w-full flex items-center justify-center gap-2">
                                    {locLoading ? <span className="animate-spin h-4 w-4 border-2 border-surface-400 border-t-transparent rounded-full" /> : '📍'} Get My Location
                                </button>
                                {form.displayLocation && (
                                    <p className="text-xs text-brand-400 mt-1">📍 {form.displayLocation}</p>
                                )}
                            </div>
                            <div className="sm:col-span-2 flex items-center gap-2">
                                <input type="checkbox" id="deliver" checked={form.sellerDelivers}
                                    onChange={(e) => setForm({ ...form, sellerDelivers: e.target.checked })}
                                    className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500 focus:ring-brand-500" />
                                <label htmlFor="deliver" className="text-sm text-surface-300">I can deliver this product</label>
                            </div>
                            <div className="sm:col-span-2">
                                <button type="submit" disabled={submitting} className="btn-primary w-full sm:w-auto">
                                    {submitting ? 'Posting...' : 'Post Product'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                <div className="grid gap-8 lg:grid-cols-2">
                    {/* My Inventory */}
                    <section>
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-brand-500" /> My Inventory
                            <span className="badge bg-brand-500/20 text-brand-400 ml-2">{listings.length}</span>
                        </h2>
                        {listings.length === 0 ? (
                            <div className="card text-center text-surface-400 py-12">
                                <p className="text-4xl mb-2">📦</p>
                                <p>No products yet. Click "Add Product" to start selling.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {listings.map((item) => (
                                    <div key={item.id} className="card p-4 flex items-center justify-between gap-3 animate-fade-in">
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-semibold truncate">{item.name}</h4>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                <span className="badge bg-surface-700/50 text-surface-300">{item.amount} kg</span>
                                                <span className="badge bg-brand-500/20 text-brand-400">{Number(item.price).toLocaleString()} UZS/kg</span>
                                                {item.seller_can_deliver && (
                                                    <span className="badge bg-blue-500/20 text-blue-400">🚚 Delivers</span>
                                                )}
                                            </div>
                                        </div>
                                        <button onClick={() => softDelete(item.id)} className="btn-danger text-xs py-1.5 px-3 shrink-0">
                                            Delete
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Market Needs */}
                    <section>
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500" /> Market Needs
                            <span className="badge bg-amber-500/20 text-amber-400 ml-2">{requests.length}</span>
                        </h2>
                        {requests.length === 0 ? (
                            <div className="card text-center text-surface-400 py-12">
                                <p className="text-4xl mb-2">📋</p>
                                <p>No buyer requests at the moment.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {requests.map((req) => (
                                    <div key={req.id} className="card p-4 animate-fade-in">
                                        <div className="flex items-start justify-between gap-2">
                                            <h4 className="font-semibold">{req.name}</h4>
                                            <span className={`badge ${req.urgency_level === 'urgent' ? 'bg-red-500/20 text-red-400' :
                                                    req.urgency_level === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                                        'bg-surface-700/50 text-surface-400'
                                                }`}>
                                                {req.urgency_level}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {req.quantity && <span className="badge bg-surface-700/50 text-surface-300">{req.quantity} kg</span>}
                                            {req.max_price && <span className="badge bg-brand-500/20 text-brand-400">Max {Number(req.max_price).toLocaleString()} UZS</span>}
                                            {req.region && <span className="badge bg-surface-700/50 text-surface-300">📍 {req.region}</span>}
                                        </div>
                                        {req.users && (
                                            <p className="text-xs text-surface-500 mt-2">by {req.users.full_name}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </main>
            <Footer />
        </div>
    );
}
