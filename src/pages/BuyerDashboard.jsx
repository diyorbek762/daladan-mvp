import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const STATUS_LABELS = {
    pending: { text: 'Pending', bg: 'bg-gray-100', color: 'text-gray-600', icon: '⏳' },
    awaiting_driver: { text: 'Waiting for Driver', bg: 'bg-amber-100', color: 'text-amber-700', icon: '🚛' },
    driver_assigned: { text: 'Driver Assigned', bg: 'bg-blue-100', color: 'text-blue-700', icon: '📦' },
};

export default function BuyerDashboard() {
    const [products, setProducts] = useState([]);
    const [myOrders, setMyOrders] = useState([]);
    const [purchaseHistory, setPurchaseHistory] = useState([]);
    const [myNeeds, setMyNeeds] = useState([]);
    const [sortOrder, setSortOrder] = useState('asc');
    const [loading, setLoading] = useState(true);
    const [showNeedModal, setShowNeedModal] = useState(false);
    const [checkoutProduct, setCheckoutProduct] = useState(null);
    const [deliveryMethod, setDeliveryMethod] = useState('');
    const [orderQty, setOrderQty] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [needForm, setNeedForm] = useState({ name: '', quantity: '', maxPrice: '', urgency: 'normal', notes: '' });
    const [userId, setUserId] = useState(null);

    useEffect(() => {
        fetchProducts();
    }, [sortOrder]);

    useEffect(() => {
        fetchUserData();
    }, []);

    // Real-time subscription for produce_listings
    useEffect(() => {
        const channel = supabase.channel('buyer-listings-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'produce_listings' }, (payload) => {
                (async () => {
                    const { data } = await supabase.from('produce_listings')
                        .select('*, users(full_name, region, phone_number)')
                        .eq('id', payload.new.id)
                        .maybeSingle();
                    if (data && data.is_active) setProducts(prev => [data, ...prev]);
                })();
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'produce_listings' }, (payload) => {
                const updated = payload.new;
                if (!updated.is_active || updated.amount <= 0) {
                    setProducts(prev => prev.filter(p => p.id !== updated.id));
                } else {
                    (async () => {
                        const { data } = await supabase.from('produce_listings')
                            .select('*, users(full_name, region, phone_number)')
                            .eq('id', updated.id)
                            .maybeSingle();
                        if (data) setProducts(prev => prev.map(p => p.id === data.id ? data : p));
                    })();
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    // Real-time: auto-remove needs that got fulfilled by a seller
    useEffect(() => {
        if (!userId) return;
        const channel = supabase.channel('buyer-needs-realtime')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'buyer_requests' }, (payload) => {
                if (!payload.new.is_active && payload.new.buyer_id === userId) {
                    setMyNeeds(prev => prev.filter(n => n.id !== payload.new.id));
                }
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
                // When a seller creates a need-based order for this buyer
                if (payload.new.buyer_id === userId && payload.new.request_id) {
                    (async () => {
                        const { data } = await supabase.from('orders')
                            .select('*')
                            .eq('id', payload.new.id)
                            .maybeSingle();
                        if (data) setMyOrders(prev => [data, ...prev]);
                    })();
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [userId]);

    // Real-time subscription for orders (driver assigns / delivers)
    useEffect(() => {
        if (!userId) return;

        const channel = supabase.channel('buyer-orders-realtime')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
                const updated = payload.new;

                // Only care about our own orders
                if (updated.buyer_id !== userId) return;

                if (updated.status === 'completed') {
                    // Move from myOrders → purchaseHistory
                    setMyOrders(prev => prev.filter(o => o.id !== updated.id));
                    (async () => {
                        const { data } = await supabase.from('orders')
                            .select('*')
                            .eq('id', updated.id)
                            .maybeSingle();
                        if (data) {
                            setPurchaseHistory(prev => {
                                if (prev.some(o => o.id === data.id)) return prev;
                                return [data, ...prev];
                            });
                        }
                    })();
                } else {
                    // Update status in myOrders (e.g. awaiting_driver → driver_assigned)
                    setMyOrders(prev => prev.map(o =>
                        o.id === updated.id ? { ...o, status: updated.status, driver_id: updated.driver_id } : o
                    ));
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [userId]);

    const fetchProducts = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('produce_listings')
            .select('*, users(full_name, region, phone_number)')
            .eq('is_active', true)
            .order('price', { ascending: sortOrder === 'asc' });
        setProducts(data || []);
        setLoading(false);
    };

    const fetchUserData = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session.user.id;
        setUserId(uid);
        await Promise.all([
            fetchMyOrders(uid),
            fetchPurchaseHistory(uid),
            fetchMyNeeds(uid),
        ]);
    };

    // Fetch buyer's active (non-completed) orders
    const fetchMyOrders = async (uid) => {
        const { data } = await supabase.from('orders')
            .select('*')
            .eq('buyer_id', uid)
            .in('status', ['pending', 'awaiting_driver', 'driver_assigned'])
            .order('created_at', { ascending: false });
        setMyOrders(data || []);
    };

    // Fetch completed purchase history
    const fetchPurchaseHistory = async (uid) => {
        const { data } = await supabase.from('orders')
            .select('*')
            .eq('buyer_id', uid)
            .eq('status', 'completed')
            .order('created_at', { ascending: false });
        setPurchaseHistory(data || []);
    };

    // Fetch buyer's own active needs
    const fetchMyNeeds = async (uid) => {
        const { data } = await supabase.from('buyer_requests')
            .select('*')
            .eq('buyer_id', uid)
            .eq('is_active', true)
            .order('created_at', { ascending: false });
        setMyNeeds(data || []);
    };

    const submitNeed = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        const { data: { session } } = await supabase.auth.getSession();
        const { data, error } = await supabase.from('buyer_requests').insert({
            buyer_id: session.user.id,
            name: needForm.name,
            quantity: needForm.quantity ? parseFloat(needForm.quantity) : null,
            max_price: needForm.maxPrice ? parseFloat(needForm.maxPrice) : null,
            urgency_level: needForm.urgency,
            notes: needForm.notes || null,
            region: null,
        }).select().maybeSingle();
        if (!error && data) {
            setMyNeeds([data, ...myNeeds]);
        }
        setNeedForm({ name: '', quantity: '', maxPrice: '', urgency: 'normal', notes: '' });
        setShowNeedModal(false);
        setSubmitting(false);
    };

    // Buyer fulfills / closes their own need
    const fulfillNeed = async (requestId) => {
        const { error } = await supabase.from('buyer_requests').delete().eq('id', requestId);
        if (!error) {
            setMyNeeds(myNeeds.filter(n => n.id !== requestId));
        }
    };

    // Helper: get active order for a product (if buyer already ordered it)
    const getActiveOrder = (productId) => {
        return myOrders.find(o => o.product_id === productId);
    };

    const handleCheckout = async () => {
        if (!deliveryMethod || !orderQty) return;
        setSubmitting(true);
        const { data: { session } } = await supabase.auth.getSession();
        const qty = parseFloat(orderQty);

        // Branching: self_pickup → completed, seller_delivers → pending, network_driver → awaiting_driver
        let status;
        if (deliveryMethod === 'self_pickup') status = 'completed';
        else if (deliveryMethod === 'seller_delivers') status = 'pending';
        else status = 'awaiting_driver';

        const { data: orderData, error } = await supabase.from('orders').insert({
            buyer_id: session.user.id,
            product_id: checkoutProduct.id,
            seller_id: checkoutProduct.seller_id || null,
            item_name: checkoutProduct.name,
            status,
            delivery_method: deliveryMethod,
            quantity: qty,
        }).select().maybeSingle();

        if (error) {
            alert('Order failed: ' + error.message);
            setSubmitting(false);
            return;
        }

        if (orderData) {
            if (status === 'completed') {
                // Self-pickup → straight to purchase history
                setPurchaseHistory(prev => [orderData, ...prev]);
            } else {
                // Pending or awaiting_driver → show status badge on product card
                setMyOrders(prev => [orderData, ...prev]);
            }
        }

        setCheckoutProduct(null);
        setDeliveryMethod('');
        setOrderQty('');
        setSubmitting(false);
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Navbar />
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">🏪 Buyer Dashboard</h1>
                        <p className="text-gray-500 text-sm mt-1">Browse fresh produce & announce your needs</p>
                    </div>
                    <div className="flex gap-3">
                        <select
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value)}
                            className="select-field w-auto text-sm"
                        >
                            <option value="asc">Price: Low → High</option>
                            <option value="desc">Price: High → Low</option>
                        </select>
                        <button onClick={() => setShowNeedModal(true)} className="btn-primary text-sm">
                            📢 Announce Need
                        </button>
                    </div>
                </div>

                {/* Product Grid */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <span className="animate-spin h-8 w-8 border-3 border-green-600 border-t-transparent rounded-full" />
                    </div>
                ) : products.length === 0 ? (
                    <div className="card text-center py-20 text-gray-400">
                        <p className="text-5xl mb-3">🛒</p>
                        <p className="text-lg">No products available at the moment.</p>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {products.map((p) => {
                            const activeOrder = getActiveOrder(p.id);
                            const statusInfo = activeOrder ? STATUS_LABELS[activeOrder.status] : null;

                            return (
                                <div key={p.id} className={`card p-5 flex flex-col animate-fade-in transition-colors ${activeOrder ? 'border-amber-200' : 'hover:border-green-300'}`}>
                                    <div className="flex items-start justify-between mb-3">
                                        <h3 className="font-semibold text-lg text-gray-900">{p.name}</h3>
                                        {p.seller_can_deliver && (
                                            <span className="badge bg-blue-100 text-blue-700 text-xs">🚚</span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        <span className="badge bg-green-100 text-green-700">{Number(p.price).toLocaleString()} UZS/kg</span>
                                        <span className="badge bg-gray-100 text-gray-600">{p.amount} kg avail.</span>
                                    </div>
                                    {p.display_location && (
                                        <p className="text-xs text-gray-500 mb-2">📍 {p.display_location}</p>
                                    )}
                                    {p.users && (
                                        <p className="text-xs text-gray-500 mb-4">by {p.users.full_name} · {p.users.region || 'Unknown region'}</p>
                                    )}

                                    {/* Show status badge if already ordered, otherwise show Buy button */}
                                    {activeOrder && statusInfo ? (
                                        <div className={`mt-auto text-center py-2.5 px-4 rounded-xl text-sm font-medium ${statusInfo.bg} ${statusInfo.color}`}>
                                            {statusInfo.icon} {statusInfo.text}
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => { setCheckoutProduct(p); setDeliveryMethod(''); setOrderQty(''); }}
                                            className="btn-primary text-sm mt-auto"
                                        >
                                            Buy
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* My Active Needs */}
                <section className="mt-12">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900">
                        <span className="w-2 h-2 rounded-full bg-amber-500" /> My Active Needs
                        <span className="badge bg-amber-100 text-amber-700 ml-2">{myNeeds.length}</span>
                    </h2>
                    {myNeeds.length === 0 ? (
                        <div className="card text-center text-gray-400 py-12">
                            <p className="text-4xl mb-2">📋</p>
                            <p>No active needs. Click "Announce Need" to post one.</p>
                        </div>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {myNeeds.map((need) => (
                                <div key={need.id} className="card p-4 animate-fade-in">
                                    <div className="flex items-start justify-between gap-2">
                                        <h4 className="font-semibold text-gray-900">{need.name}</h4>
                                        <span className={`badge ${need.urgency_level === 'urgent' ? 'bg-red-100 text-red-600' :
                                            need.urgency_level === 'high' ? 'bg-orange-100 text-orange-600' :
                                                'bg-gray-100 text-gray-500'
                                            }`}>
                                            {need.urgency_level}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {need.quantity && <span className="badge bg-gray-100 text-gray-600">{need.quantity} kg</span>}
                                        {need.max_price && <span className="badge bg-green-100 text-green-700">Max {Number(need.max_price).toLocaleString()} UZS</span>}
                                    </div>
                                    {need.notes && <p className="text-xs text-gray-500 mt-2">{need.notes}</p>}
                                    <button
                                        onClick={() => fulfillNeed(need.id)}
                                        className="mt-3 w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium py-2 px-4 rounded-xl text-sm border border-emerald-200 transition-colors"
                                    >
                                        ✓ Need Fulfilled
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Purchase History */}
                <section className="mt-12">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> Purchase History
                        <span className="badge bg-emerald-100 text-emerald-700 ml-2">{purchaseHistory.length}</span>
                    </h2>
                    {purchaseHistory.length === 0 ? (
                        <div className="card text-center text-gray-400 py-12">
                            <p className="text-4xl mb-2">🧾</p>
                            <p>No completed purchases yet.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto card p-0">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Item</th>
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Qty</th>
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Type</th>
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {purchaseHistory.map((order) => (
                                        <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                            <td className="py-3 px-4 font-medium text-gray-900">{order.item_name || 'N/A'}</td>
                                            <td className="py-3 px-4 text-gray-500">{order.quantity} kg</td>
                                            <td className="py-3 px-4">
                                                <span className={`badge text-xs ${order.request_id ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                                    {order.request_id ? '📢 Need' : '🌾 Sale'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-gray-500">{new Date(order.created_at).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>
            <Footer />

            {/* Announce Need Modal */}
            {showNeedModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowNeedModal(false)}>
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
                    <div className="card w-full max-w-md relative z-10 animate-slide-up" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900">📢 Announce Need</h3>
                            <button onClick={() => setShowNeedModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                        </div>
                        <form onSubmit={submitNeed} className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Product Name</label>
                                <input className="input-field" placeholder="e.g. Onions" value={needForm.name}
                                    onChange={(e) => setNeedForm({ ...needForm, name: e.target.value })} required />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm text-gray-600 mb-1">Quantity (kg)</label>
                                    <input className="input-field" type="number" min="0" step="0.01" value={needForm.quantity}
                                        onChange={(e) => setNeedForm({ ...needForm, quantity: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-600 mb-1">Max Price</label>
                                    <input className="input-field" type="number" min="0" step="0.01" value={needForm.maxPrice}
                                        onChange={(e) => setNeedForm({ ...needForm, maxPrice: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Urgency</label>
                                <select className="select-field" value={needForm.urgency}
                                    onChange={(e) => setNeedForm({ ...needForm, urgency: e.target.value })}>
                                    <option value="normal">Normal</option>
                                    <option value="high">High</option>
                                    <option value="urgent">Urgent</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Notes (optional)</label>
                                <textarea className="input-field h-20 resize-none" placeholder="Any specific requirements..."
                                    value={needForm.notes} onChange={(e) => setNeedForm({ ...needForm, notes: e.target.value })} />
                            </div>
                            <button type="submit" disabled={submitting} className="btn-primary w-full">
                                {submitting ? 'Posting...' : 'Post Need'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Checkout Modal */}
            {checkoutProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setCheckoutProduct(null)}>
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
                    <div className="card w-full max-w-md relative z-10 animate-slide-up" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900">🛒 Checkout</h3>
                            <button onClick={() => setCheckoutProduct(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                        </div>

                        <div className="card bg-gray-50 p-4 mb-4">
                            <h4 className="font-semibold text-gray-900">{checkoutProduct.name}</h4>
                            <p className="text-sm text-gray-500 mt-1">
                                {Number(checkoutProduct.price).toLocaleString()} UZS/kg · {checkoutProduct.amount} kg available
                            </p>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm text-gray-600 mb-1">Quantity (kg)</label>
                            <input className="input-field" type="number" min="0.01" max={checkoutProduct.amount} step="0.01"
                                placeholder={`Max: ${checkoutProduct.amount}`} value={orderQty}
                                onChange={(e) => setOrderQty(e.target.value)} />
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm text-gray-600 mb-2">Delivery Method</label>
                            <div className="space-y-2">
                                <label className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200 cursor-pointer hover:border-gray-300 transition-colors">
                                    <input type="radio" name="delivery" value="network_driver"
                                        checked={deliveryMethod === 'network_driver'}
                                        onChange={(e) => setDeliveryMethod(e.target.value)}
                                        className="text-green-600 focus:ring-green-500" />
                                    <span className="text-sm text-gray-700">🚛 Network Driver</span>
                                </label>
                                {checkoutProduct.seller_can_deliver && (
                                    <label className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200 cursor-pointer hover:border-gray-300 transition-colors">
                                        <input type="radio" name="delivery" value="seller_delivers"
                                            checked={deliveryMethod === 'seller_delivers'}
                                            onChange={(e) => setDeliveryMethod(e.target.value)}
                                            className="text-green-600 focus:ring-green-500" />
                                        <span className="text-sm text-gray-700">🌾 Seller Delivers</span>
                                    </label>
                                )}
                                <label className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200 cursor-pointer hover:border-gray-300 transition-colors">
                                    <input type="radio" name="delivery" value="self_pickup"
                                        checked={deliveryMethod === 'self_pickup'}
                                        onChange={(e) => setDeliveryMethod(e.target.value)}
                                        className="text-green-600 focus:ring-green-500" />
                                    <span className="text-sm text-gray-700">🏃 Self Pickup</span>
                                </label>
                            </div>
                        </div>

                        {orderQty && deliveryMethod && (
                            <div className="card bg-green-50 border-green-200 p-4 mb-4">
                                <p className="text-sm font-medium text-green-800">
                                    Total: {(parseFloat(orderQty) * parseFloat(checkoutProduct.price)).toLocaleString()} UZS
                                </p>
                            </div>
                        )}

                        <button
                            onClick={handleCheckout}
                            disabled={!deliveryMethod || !orderQty || submitting}
                            className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {submitting ? 'Processing...' : 'Confirm Order'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
