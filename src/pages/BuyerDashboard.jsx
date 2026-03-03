import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function BuyerDashboard() {
    const [products, setProducts] = useState([]);
    const [purchaseHistory, setPurchaseHistory] = useState([]);
    const [sortOrder, setSortOrder] = useState('asc');
    const [loading, setLoading] = useState(true);
    const [showNeedModal, setShowNeedModal] = useState(false);
    const [checkoutProduct, setCheckoutProduct] = useState(null);
    const [deliveryMethod, setDeliveryMethod] = useState('');
    const [orderQty, setOrderQty] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [needForm, setNeedForm] = useState({ name: '', quantity: '', maxPrice: '', urgency: 'normal', notes: '' });

    useEffect(() => {
        fetchProducts();
    }, [sortOrder]);

    useEffect(() => {
        fetchPurchaseHistory();
    }, []);

    // Feature 5: Real-time subscription for produce_listings
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

    // Feature 4: Fetch purchase history
    const fetchPurchaseHistory = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const { data } = await supabase.from('orders')
            .select('*, produce_listings(name, price)')
            .eq('buyer_id', session.user.id)
            .eq('status', 'completed')
            .order('created_at', { ascending: false });
        setPurchaseHistory(data || []);
    };

    const submitNeed = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        const { data: { session } } = await supabase.auth.getSession();
        await supabase.from('buyer_requests').insert({
            buyer_id: session.user.id,
            name: needForm.name,
            quantity: needForm.quantity ? parseFloat(needForm.quantity) : null,
            max_price: needForm.maxPrice ? parseFloat(needForm.maxPrice) : null,
            urgency_level: needForm.urgency,
            notes: needForm.notes || null,
            region: null,
        });
        setNeedForm({ name: '', quantity: '', maxPrice: '', urgency: 'normal', notes: '' });
        setShowNeedModal(false);
        setSubmitting(false);
    };

    const handleCheckout = async () => {
        if (!deliveryMethod || !orderQty) return;
        setSubmitting(true);
        const { data: { session } } = await supabase.auth.getSession();
        const qty = parseFloat(orderQty);

        const status = deliveryMethod === 'network_driver' ? 'awaiting_driver' : 'pending';
        await supabase.from('orders').insert({
            buyer_id: session.user.id,
            product_id: checkoutProduct.id,
            status,
            delivery_method: deliveryMethod,
            quantity: qty,
        });

        // Update product amount
        const newAmount = Math.max(0, checkoutProduct.amount - qty);
        await supabase.from('produce_listings')
            .update({ amount: newAmount, is_active: newAmount > 0 })
            .eq('id', checkoutProduct.id);

        setProducts(products.map(p =>
            p.id === checkoutProduct.id ? { ...p, amount: newAmount } : p
        ).filter(p => p.amount > 0));

        setCheckoutProduct(null);
        setDeliveryMethod('');
        setOrderQty('');
        setSubmitting(false);
    };

    return (
        <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold">🏪 Buyer Dashboard</h1>
                        <p className="text-surface-400 text-sm mt-1">Browse fresh produce & announce your needs</p>
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
                        <span className="animate-spin h-8 w-8 border-3 border-brand-500 border-t-transparent rounded-full" />
                    </div>
                ) : products.length === 0 ? (
                    <div className="card text-center py-20 text-surface-400">
                        <p className="text-5xl mb-3">🛒</p>
                        <p className="text-lg">No products available at the moment.</p>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {products.map((p) => (
                            <div key={p.id} className="card p-5 flex flex-col animate-fade-in hover:border-brand-500/30 transition-colors">
                                <div className="flex items-start justify-between mb-3">
                                    <h3 className="font-semibold text-lg">{p.name}</h3>
                                    {p.seller_can_deliver && (
                                        <span className="badge bg-blue-500/20 text-blue-400 text-xs">🚚</span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    <span className="badge bg-brand-500/20 text-brand-400">{Number(p.price).toLocaleString()} UZS/kg</span>
                                    <span className="badge bg-surface-700/50 text-surface-300">{p.amount} kg avail.</span>
                                </div>
                                {p.display_location && (
                                    <p className="text-xs text-surface-500 mb-2">📍 {p.display_location}</p>
                                )}
                                {p.users && (
                                    <p className="text-xs text-surface-500 mb-4">by {p.users.full_name} · {p.users.region || 'Unknown region'}</p>
                                )}
                                <button
                                    onClick={() => { setCheckoutProduct(p); setDeliveryMethod(''); setOrderQty(''); }}
                                    className="btn-primary text-sm mt-auto"
                                >
                                    Buy
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Feature 4: Purchase History */}
                <section className="mt-12">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> Purchase History
                        <span className="badge bg-emerald-500/20 text-emerald-400 ml-2">{purchaseHistory.length}</span>
                    </h2>
                    {purchaseHistory.length === 0 ? (
                        <div className="card text-center text-surface-400 py-12">
                            <p className="text-4xl mb-2">🧾</p>
                            <p>No completed purchases yet.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-surface-700">
                                        <th className="text-left py-3 px-4 text-surface-400 font-medium">Product</th>
                                        <th className="text-left py-3 px-4 text-surface-400 font-medium">Qty</th>
                                        <th className="text-left py-3 px-4 text-surface-400 font-medium">Price/kg</th>
                                        <th className="text-left py-3 px-4 text-surface-400 font-medium">Total</th>
                                        <th className="text-left py-3 px-4 text-surface-400 font-medium">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {purchaseHistory.map((order) => (
                                        <tr key={order.id} className="border-b border-surface-800 hover:bg-surface-800/30 transition-colors">
                                            <td className="py-3 px-4 font-medium">{order.produce_listings?.name || 'N/A'}</td>
                                            <td className="py-3 px-4 text-surface-400">{order.quantity} kg</td>
                                            <td className="py-3 px-4 text-surface-400">{order.produce_listings?.price ? Number(order.produce_listings.price).toLocaleString() + ' UZS' : '—'}</td>
                                            <td className="py-3 px-4 text-brand-400 font-medium">{order.produce_listings?.price ? (Number(order.produce_listings.price) * Number(order.quantity)).toLocaleString() + ' UZS' : '—'}</td>
                                            <td className="py-3 px-4 text-surface-400">{new Date(order.created_at).toLocaleDateString()}</td>
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
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <div className="card w-full max-w-md relative z-10 animate-slide-up" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold">📢 Announce Need</h3>
                            <button onClick={() => setShowNeedModal(false)} className="text-surface-400 hover:text-white text-xl">✕</button>
                        </div>
                        <form onSubmit={submitNeed} className="space-y-4">
                            <div>
                                <label className="block text-sm text-surface-400 mb-1">Product Name</label>
                                <input className="input-field" placeholder="e.g. Onions" value={needForm.name}
                                    onChange={(e) => setNeedForm({ ...needForm, name: e.target.value })} required />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm text-surface-400 mb-1">Quantity (kg)</label>
                                    <input className="input-field" type="number" min="0" step="0.01" value={needForm.quantity}
                                        onChange={(e) => setNeedForm({ ...needForm, quantity: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm text-surface-400 mb-1">Max Price</label>
                                    <input className="input-field" type="number" min="0" step="0.01" value={needForm.maxPrice}
                                        onChange={(e) => setNeedForm({ ...needForm, maxPrice: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-surface-400 mb-1">Urgency</label>
                                <select className="select-field" value={needForm.urgency}
                                    onChange={(e) => setNeedForm({ ...needForm, urgency: e.target.value })}>
                                    <option value="normal">Normal</option>
                                    <option value="high">High</option>
                                    <option value="urgent">Urgent</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-surface-400 mb-1">Notes (optional)</label>
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
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <div className="card w-full max-w-md relative z-10 animate-slide-up" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold">🛒 Checkout</h3>
                            <button onClick={() => setCheckoutProduct(null)} className="text-surface-400 hover:text-white text-xl">✕</button>
                        </div>

                        <div className="card bg-surface-800/30 p-4 mb-4">
                            <h4 className="font-semibold">{checkoutProduct.name}</h4>
                            <p className="text-sm text-surface-400 mt-1">
                                {Number(checkoutProduct.price).toLocaleString()} UZS/kg · {checkoutProduct.amount} kg available
                            </p>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm text-surface-400 mb-1">Quantity (kg)</label>
                            <input className="input-field" type="number" min="0.01" max={checkoutProduct.amount} step="0.01"
                                placeholder={`Max: ${checkoutProduct.amount}`} value={orderQty}
                                onChange={(e) => setOrderQty(e.target.value)} />
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm text-surface-400 mb-2">Delivery Method</label>
                            <div className="space-y-2">
                                <label className="flex items-center gap-3 p-3 rounded-xl bg-surface-800/50 border border-surface-700 cursor-pointer hover:border-surface-500 transition-colors">
                                    <input type="radio" name="delivery" value="network_driver"
                                        checked={deliveryMethod === 'network_driver'}
                                        onChange={(e) => setDeliveryMethod(e.target.value)}
                                        className="text-brand-500 focus:ring-brand-500" />
                                    <span className="text-sm">🚛 Network Driver</span>
                                </label>
                                {checkoutProduct.seller_can_deliver && (
                                    <label className="flex items-center gap-3 p-3 rounded-xl bg-surface-800/50 border border-surface-700 cursor-pointer hover:border-surface-500 transition-colors">
                                        <input type="radio" name="delivery" value="seller_delivers"
                                            checked={deliveryMethod === 'seller_delivers'}
                                            onChange={(e) => setDeliveryMethod(e.target.value)}
                                            className="text-brand-500 focus:ring-brand-500" />
                                        <span className="text-sm">🌾 Seller Delivers</span>
                                    </label>
                                )}
                                <label className="flex items-center gap-3 p-3 rounded-xl bg-surface-800/50 border border-surface-700 cursor-pointer hover:border-surface-500 transition-colors">
                                    <input type="radio" name="delivery" value="self_pickup"
                                        checked={deliveryMethod === 'self_pickup'}
                                        onChange={(e) => setDeliveryMethod(e.target.value)}
                                        className="text-brand-500 focus:ring-brand-500" />
                                    <span className="text-sm">🏃 Self Pickup</span>
                                </label>
                            </div>
                        </div>

                        {orderQty && deliveryMethod && (
                            <div className="card bg-brand-500/10 border-brand-500/30 p-4 mb-4">
                                <p className="text-sm font-medium">
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
