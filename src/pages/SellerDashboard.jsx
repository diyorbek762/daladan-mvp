import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function SellerDashboard() {
    const [listings, setListings] = useState([]);
    const [requests, setRequests] = useState([]);
    const [pendingDeliveries, setPendingDeliveries] = useState([]);
    const [salesHistory, setSalesHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [locLoading, setLocLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [userId, setUserId] = useState(null);
    const [fulfillingId, setFulfillingId] = useState(null);
    const [form, setForm] = useState({
        name: '', amount: '', price: '', sellerDelivers: false,
        latitude: null, longitude: null, displayLocation: '',
    });

    useEffect(() => {
        fetchData();
    }, []);

    // Real-time subscription for orders
    useEffect(() => {
        if (!userId) return;

        const channel = supabase.channel('seller-orders-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
                // New seller_delivers order for this seller → add to pending
                if (payload.new.seller_id === userId && payload.new.delivery_method === 'seller_delivers' && payload.new.status === 'pending') {
                    (async () => {
                        const { data } = await supabase.from('orders')
                            .select('*, buyer:users!orders_buyer_id_fkey(full_name, phone_number, region)')
                            .eq('id', payload.new.id).maybeSingle();
                        if (data) setPendingDeliveries(prev => [data, ...prev]);
                    })();
                }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
                if (payload.new.status === 'completed') {
                    // Move from pending → sales history
                    setPendingDeliveries(prev => prev.filter(o => o.id !== payload.new.id));
                    fetchSalesHistory(userId);
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [userId]);

    // Real-time: remove need cards that got deactivated (by our trigger)
    useEffect(() => {
        const channel = supabase.channel('seller-requests-realtime')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'buyer_requests' }, (payload) => {
                if (!payload.new.is_active) {
                    setRequests(prev => prev.filter(r => r.id !== payload.new.id));
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const fetchData = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session.user.id;
        setUserId(uid);
        const [listingsRes, requestsRes, pendingRes] = await Promise.all([
            supabase.from('produce_listings')
                .select('*')
                .eq('seller_id', uid)
                .eq('is_active', true)
                .order('created_at', { ascending: false }),
            supabase.from('buyer_requests')
                .select('*, users!inner(full_name, region, phone_number)')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(20),
            supabase.from('orders')
                .select('*, buyer:users!orders_buyer_id_fkey(full_name, phone_number, region)')
                .eq('seller_id', uid)
                .eq('delivery_method', 'seller_delivers')
                .eq('status', 'pending')
                .order('created_at', { ascending: false }),
        ]);
        setListings(listingsRes.data || []);
        setRequests(requestsRes.data || []);
        setPendingDeliveries(pendingRes.data || []);
        await fetchSalesHistory(uid);
        setLoading(false);
    };

    // Sales History — includes all completed orders for this seller
    const fetchSalesHistory = async (sellerId) => {
        const { data } = await supabase.from('orders')
            .select('*, buyer:users!orders_buyer_id_fkey(full_name)')
            .eq('seller_id', sellerId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false });
        setSalesHistory(data || []);
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

        const { data, error } = await supabase.from('produce_listings').insert(row).select().maybeSingle();
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

    // Fulfill Need: creates an order (delivery job) and the DB trigger auto-deactivates the request
    const fulfillNeed = async (request) => {
        setFulfillingId(request.id);

        const { error } = await supabase.from('orders').insert({
            buyer_id: request.buyer_id,
            seller_id: userId,
            request_id: request.id,
            product_id: null,
            item_name: request.name,
            status: 'awaiting_driver',
            delivery_method: 'network_driver',
            quantity: request.quantity || 1,
        });

        if (error) {
            alert('Fulfill failed: ' + error.message);
            setFulfillingId(null);
            return;
        }

        setRequests(requests.filter(r => r.id !== request.id));
        setFulfillingId(null);
    };

    // Seller marks their own delivery as completed
    const markSellerDelivered = async (orderId) => {
        const { error } = await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId);
        if (error) {
            alert('Update failed: ' + error.message);
            return;
        }
        const delivered = pendingDeliveries.find(o => o.id === orderId);
        setPendingDeliveries(pendingDeliveries.filter(o => o.id !== orderId));
        if (delivered) setSalesHistory(prev => [{ ...delivered, status: 'completed' }, ...prev]);
    };

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
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">🌾 Seller Dashboard</h1>
                        <p className="text-gray-500 text-sm mt-1">Manage your inventory, fulfill needs & deliver orders</p>
                    </div>
                    <button onClick={() => setShowForm(!showForm)} className="btn-primary">
                        {showForm ? 'Cancel' : '+ Add Product'}
                    </button>
                </div>

                {/* Add Product Form */}
                {showForm && (
                    <div className="card mb-8 animate-slide-up">
                        <h3 className="font-semibold text-lg mb-4 text-gray-900">New Product</h3>
                        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Product Name</label>
                                <input className="input-field" placeholder="e.g. Tomatoes" value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Amount (kg)</label>
                                <input className="input-field" type="number" min="0" step="0.01" placeholder="e.g. 500"
                                    value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Price (per kg)</label>
                                <input className="input-field" type="number" min="0" step="0.01" placeholder="e.g. 15000"
                                    value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                            </div>
                            <div className="flex flex-col justify-end">
                                <button type="button" onClick={getLocation} disabled={locLoading}
                                    className="btn-secondary w-full flex items-center justify-center gap-2">
                                    {locLoading ? <span className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full" /> : '📍'} Get My Location
                                </button>
                                {form.displayLocation && (
                                    <p className="text-xs text-green-600 mt-1">📍 {form.displayLocation}</p>
                                )}
                            </div>
                            <div className="sm:col-span-2 flex items-center gap-2">
                                <input type="checkbox" id="deliver" checked={form.sellerDelivers}
                                    onChange={(e) => setForm({ ...form, sellerDelivers: e.target.checked })}
                                    className="w-4 h-4 rounded border-gray-300 bg-white text-green-600 focus:ring-green-500" />
                                <label htmlFor="deliver" className="text-sm text-gray-700">I can deliver this product</label>
                            </div>
                            <div className="sm:col-span-2">
                                <button type="submit" disabled={submitting} className="btn-primary w-full sm:w-auto">
                                    {submitting ? 'Posting...' : 'Post Product'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* My Pending Deliveries (seller_delivers) */}
                {pendingDeliveries.length > 0 && (
                    <section className="mb-8">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900">
                            <span className="w-2 h-2 rounded-full bg-blue-500" /> My Pending Deliveries
                            <span className="badge bg-blue-100 text-blue-700 ml-2">{pendingDeliveries.length}</span>
                        </h2>
                        <div className="space-y-3">
                            {pendingDeliveries.map((order) => (
                                <div key={order.id} className="card p-4 border-blue-200 animate-fade-in">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-semibold text-gray-900">{order.item_name || 'N/A'}</h4>
                                                <span className="badge bg-blue-100 text-blue-700 text-xs">🚚 You deliver</span>
                                            </div>
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                <span className="badge bg-gray-100 text-gray-600">{order.quantity} kg</span>
                                            </div>
                                            {order.buyer && (
                                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 mt-3">
                                                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Deliver to</p>
                                                    <p className="text-sm font-medium text-gray-900">{order.buyer.full_name}</p>
                                                    <p className="text-sm text-green-600">{order.buyer.phone_number || 'N/A'}</p>
                                                    {order.buyer.region && <p className="text-xs text-gray-500">{order.buyer.region}</p>}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => markSellerDelivered(order.id)}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-xl text-sm transition-colors shrink-0"
                                        >
                                            ✓ Delivered
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <div className="grid gap-8 lg:grid-cols-2">
                    {/* My Inventory */}
                    <section>
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900">
                            <span className="w-2 h-2 rounded-full bg-green-500" /> My Inventory
                            <span className="badge bg-green-100 text-green-700 ml-2">{listings.length}</span>
                        </h2>
                        {listings.length === 0 ? (
                            <div className="card text-center text-gray-400 py-12">
                                <p className="text-4xl mb-2">📦</p>
                                <p>No products yet. Click "Add Product" to start selling.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {listings.map((item) => (
                                    <div key={item.id} className="card p-4 flex items-center justify-between gap-3 animate-fade-in">
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-semibold truncate text-gray-900">{item.name}</h4>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                <span className="badge bg-gray-100 text-gray-600">{item.amount} kg</span>
                                                <span className="badge bg-green-100 text-green-700">{Number(item.price).toLocaleString()} UZS/kg</span>
                                                {item.seller_can_deliver && (
                                                    <span className="badge bg-blue-100 text-blue-700">🚚 Delivers</span>
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
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900">
                            <span className="w-2 h-2 rounded-full bg-amber-500" /> Market Needs
                            <span className="badge bg-amber-100 text-amber-700 ml-2">{requests.length}</span>
                        </h2>
                        {requests.length === 0 ? (
                            <div className="card text-center text-gray-400 py-12">
                                <p className="text-4xl mb-2">📋</p>
                                <p>No buyer requests at the moment.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {requests.map((req) => (
                                    <div key={req.id} className="card p-4 animate-fade-in">
                                        <div className="flex items-start justify-between gap-2">
                                            <h4 className="font-semibold text-gray-900">{req.name}</h4>
                                            <span className={`badge ${req.urgency_level === 'urgent' ? 'bg-red-100 text-red-600' :
                                                req.urgency_level === 'high' ? 'bg-orange-100 text-orange-600' :
                                                    'bg-gray-100 text-gray-500'
                                                }`}>
                                                {req.urgency_level}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {req.quantity && <span className="badge bg-gray-100 text-gray-600">{req.quantity} kg</span>}
                                            {req.max_price && <span className="badge bg-green-100 text-green-700">Max {Number(req.max_price).toLocaleString()} UZS</span>}
                                            {req.region && <span className="badge bg-gray-100 text-gray-600">📍 {req.region}</span>}
                                        </div>
                                        {req.users && (
                                            <p className="text-xs text-gray-500 mt-2">by {req.users.full_name}{req.users.region ? ` · ${req.users.region}` : ''}</p>
                                        )}

                                        {/* Fulfill Need — creates a delivery job */}
                                        <button
                                            onClick={() => fulfillNeed(req)}
                                            disabled={fulfillingId === req.id}
                                            className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-colors disabled:opacity-50"
                                        >
                                            {fulfillingId === req.id ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                                    Creating job...
                                                </span>
                                            ) : (
                                                '🚛 Fulfill & Send Driver'
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                {/* Sales History */}
                <section className="mt-12">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> Sales History
                        <span className="badge bg-emerald-100 text-emerald-700 ml-2">{salesHistory.length}</span>
                    </h2>
                    {salesHistory.length === 0 ? (
                        <div className="card text-center text-gray-400 py-12">
                            <p className="text-4xl mb-2">💰</p>
                            <p>No completed sales yet.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto card p-0">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Item</th>
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Delivery</th>
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Qty</th>
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Buyer</th>
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {salesHistory.map((order) => {
                                        const deliveryBadge = order.delivery_method === 'self_pickup'
                                            ? { label: '🏃 Pickup', bg: 'bg-gray-100', color: 'text-gray-600' }
                                            : order.delivery_method === 'seller_delivers'
                                                ? { label: '🚚 You', bg: 'bg-blue-100', color: 'text-blue-700' }
                                                : { label: '🚛 Driver', bg: 'bg-amber-100', color: 'text-amber-700' };
                                        return (
                                            <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                                <td className="py-3 px-4 font-medium text-gray-900">{order.item_name || 'N/A'}</td>
                                                <td className="py-3 px-4">
                                                    <span className={`badge text-xs ${deliveryBadge.bg} ${deliveryBadge.color}`}>{deliveryBadge.label}</span>
                                                </td>
                                                <td className="py-3 px-4 text-gray-500">{order.quantity} kg</td>
                                                <td className="py-3 px-4 text-gray-500">{order.buyer?.full_name || 'N/A'}</td>
                                                <td className="py-3 px-4 text-gray-500">{new Date(order.created_at).toLocaleDateString()}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>
            <Footer />
        </div>
    );
}
