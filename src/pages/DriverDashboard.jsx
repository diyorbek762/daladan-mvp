import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function DriverDashboard() {
    const [availableJobs, setAvailableJobs] = useState([]);
    const [myJobs, setMyJobs] = useState([]);
    const [completedJobs, setCompletedJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState(null);

    // Unified select query — works for both product-based and need-based orders
    const JOB_SELECT = '*, produce_listings(name, amount, display_location), buyer:users!orders_buyer_id_fkey(full_name, region), seller:users!orders_seller_id_fkey(full_name, region)';
    const JOB_SELECT_FULL = '*, produce_listings(name, amount, display_location, seller_id, users(full_name, phone_number, region)), buyer:users!orders_buyer_id_fkey(full_name, phone_number, region), seller:users!orders_seller_id_fkey(full_name, phone_number, region)';

    // Helper: get display name for an order (product name OR request item name)
    const getJobName = (job) => {
        return job.item_name || job.produce_listings?.name || 'Delivery Job';
    };

    // Helper: get job type badge
    const getJobType = (job) => {
        if (job.request_id) return { label: '📢 Need', bg: 'bg-amber-100', color: 'text-amber-700' };
        return { label: '🌾 Product', bg: 'bg-green-100', color: 'text-green-700' };
    };

    // Helper: get seller info (from seller FK or from produce_listings join)
    const getSellerInfo = (job) => {
        if (job.seller) return job.seller;
        if (job.produce_listings?.users) return job.produce_listings.users;
        return null;
    };

    useEffect(() => { fetchJobs(); }, []);

    useEffect(() => {
        if (!userId) return;
        const channel = supabase.channel('driver-orders-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: 'status=eq.awaiting_driver' }, (payload) => {
                (async () => {
                    const { data } = await supabase.from('orders')
                        .select(JOB_SELECT)
                        .eq('id', payload.new.id).maybeSingle();
                    if (data) setAvailableJobs(prev => [data, ...prev]);
                })();
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
                const updated = payload.new;
                if (updated.status === 'driver_assigned') {
                    setAvailableJobs(prev => prev.filter(j => j.id !== updated.id));
                }
                if (updated.status === 'awaiting_driver') {
                    (async () => {
                        const { data } = await supabase.from('orders')
                            .select(JOB_SELECT)
                            .eq('id', updated.id).maybeSingle();
                        if (data) setAvailableJobs(prev => {
                            if (prev.some(j => j.id === data.id)) return prev;
                            return [data, ...prev];
                        });
                    })();
                }
                if (updated.status === 'completed') {
                    setMyJobs(prev => prev.filter(j => j.id !== updated.id));
                    (async () => {
                        const { data } = await supabase.from('orders')
                            .select(JOB_SELECT)
                            .eq('id', updated.id).maybeSingle();
                        if (data && data.driver_id === userId) {
                            setCompletedJobs(prev => {
                                if (prev.some(j => j.id === data.id)) return prev;
                                return [data, ...prev];
                            });
                        }
                    })();
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [userId]);

    const fetchJobs = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session.user.id;
        setUserId(uid);
        const [availRes, myRes, completedRes] = await Promise.all([
            supabase.from('orders').select(JOB_SELECT).eq('status', 'awaiting_driver').order('created_at', { ascending: false }),
            supabase.from('orders').select(JOB_SELECT_FULL).eq('driver_id', uid).eq('status', 'driver_assigned').order('created_at', { ascending: false }),
            supabase.from('orders').select(JOB_SELECT).eq('driver_id', uid).eq('status', 'completed').order('created_at', { ascending: false }),
        ]);
        setAvailableJobs(availRes.data || []);
        setMyJobs(myRes.data || []);
        setCompletedJobs(completedRes.data || []);
        setLoading(false);
    };

    const acceptJob = async (orderId) => {
        const { error } = await supabase.from('orders').update({ driver_id: userId, status: 'driver_assigned' }).eq('id', orderId);
        if (!error) {
            setAvailableJobs(availableJobs.filter(j => j.id !== orderId));
            const { data } = await supabase.from('orders').select(JOB_SELECT_FULL).eq('id', orderId).maybeSingle();
            if (data) setMyJobs([data, ...myJobs]);
        }
    };

    const releaseJob = async (orderId) => {
        const { error } = await supabase.from('orders').update({ driver_id: null, status: 'awaiting_driver' }).eq('id', orderId);
        if (!error) {
            const released = myJobs.find(j => j.id === orderId);
            setMyJobs(myJobs.filter(j => j.id !== orderId));
            if (released) setAvailableJobs([{ ...released, driver_id: null, status: 'awaiting_driver' }, ...availableJobs]);
        }
    };

    const markDelivered = async (orderId) => {
        const { error } = await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId);
        if (!error) {
            const delivered = myJobs.find(j => j.id === orderId);
            setMyJobs(myJobs.filter(j => j.id !== orderId));
            if (delivered) setCompletedJobs([{ ...delivered, status: 'completed' }, ...completedJobs]);
        }
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
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">🚛 Driver Dashboard</h1>
                    <p className="text-gray-500 text-sm mt-1">Accept deliveries from sales and fulfilled needs</p>
                </div>
                <div className="grid gap-8 lg:grid-cols-2">
                    {/* Available Jobs */}
                    <section>
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900">
                            <span className="w-2 h-2 rounded-full bg-amber-500" /> Available Deliveries
                            <span className="badge bg-amber-100 text-amber-700 ml-2">{availableJobs.length}</span>
                        </h2>
                        {availableJobs.length === 0 ? (
                            <div className="card text-center text-gray-400 py-12"><p className="text-4xl mb-2">📭</p><p>No deliveries available right now.</p></div>
                        ) : (
                            <div className="space-y-3">
                                {availableJobs.map((job) => {
                                    const type = getJobType(job);
                                    return (
                                        <div key={job.id} className="card p-4 animate-fade-in">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h4 className="font-semibold text-gray-900">{getJobName(job)}</h4>
                                                        <span className={`badge text-xs ${type.bg} ${type.color}`}>{type.label}</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        <span className="badge bg-gray-100 text-gray-600">{job.quantity} kg</span>
                                                        {job.produce_listings?.display_location && <span className="badge bg-blue-100 text-blue-700">📍 Pickup: {job.produce_listings.display_location}</span>}
                                                        {job.buyer?.region && <span className="badge bg-purple-100 text-purple-700">🏁 Drop: {job.buyer.region}</span>}
                                                    </div>
                                                </div>
                                                <button onClick={() => acceptJob(job.id)} className="btn-primary text-sm py-2 px-4 shrink-0">Accept</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                    {/* My Active Jobs */}
                    <section>
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900">
                            <span className="w-2 h-2 rounded-full bg-green-500" /> My Active Deliveries
                            <span className="badge bg-green-100 text-green-700 ml-2">{myJobs.length}</span>
                        </h2>
                        {myJobs.length === 0 ? (
                            <div className="card text-center text-gray-400 py-12"><p className="text-4xl mb-2">🚛</p><p>You haven't accepted any deliveries yet.</p></div>
                        ) : (
                            <div className="space-y-3">
                                {myJobs.map((job) => {
                                    const type = getJobType(job);
                                    const sellerInfo = getSellerInfo(job);
                                    return (
                                        <div key={job.id} className="card p-4 animate-fade-in border-green-200">
                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-semibold text-gray-900">{getJobName(job)}</h4>
                                                    <span className={`badge text-xs ${type.bg} ${type.color}`}>{type.label}</span>
                                                </div>
                                                <span className="badge bg-green-100 text-green-700">Active</span>
                                            </div>
                                            <div className="badge bg-gray-100 text-gray-600 mb-3">{job.quantity} kg</div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                                                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Seller</p>
                                                    <p className="text-sm font-medium text-gray-900">{sellerInfo?.full_name || 'N/A'}</p>
                                                    <p className="text-sm text-green-600">{sellerInfo?.phone_number || 'N/A'}</p>
                                                    <p className="text-xs text-gray-500">{sellerInfo?.region || ''}</p>
                                                </div>
                                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                                                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Buyer</p>
                                                    <p className="text-sm font-medium text-gray-900">{job.buyer?.full_name || 'N/A'}</p>
                                                    <p className="text-sm text-green-600">{job.buyer?.phone_number || 'N/A'}</p>
                                                    <p className="text-xs text-gray-500">{job.buyer?.region || ''}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-3 mt-3">
                                                <button onClick={() => markDelivered(job.id)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-xl text-sm transition-colors">✓ Delivered</button>
                                                <button onClick={() => releaseJob(job.id)} className="flex-1 btn-danger text-sm">Deny / Release</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </div>
                {/* Completed Deliveries History */}
                <section className="mt-12">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> Completed Deliveries
                        <span className="badge bg-emerald-100 text-emerald-700 ml-2">{completedJobs.length}</span>
                    </h2>
                    {completedJobs.length === 0 ? (
                        <div className="card text-center text-gray-400 py-12"><p className="text-4xl mb-2">📋</p><p>No completed deliveries yet.</p></div>
                    ) : (
                        <div className="overflow-x-auto card p-0">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Item</th>
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Type</th>
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Qty</th>
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Buyer</th>
                                        <th className="text-left py-3 px-4 text-gray-500 font-medium">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {completedJobs.map((job) => {
                                        const type = getJobType(job);
                                        return (
                                            <tr key={job.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                                <td className="py-3 px-4 font-medium text-gray-900">{getJobName(job)}</td>
                                                <td className="py-3 px-4"><span className={`badge text-xs ${type.bg} ${type.color}`}>{type.label}</span></td>
                                                <td className="py-3 px-4 text-gray-500">{job.quantity} kg</td>
                                                <td className="py-3 px-4 text-gray-500">{job.buyer?.full_name || 'N/A'}</td>
                                                <td className="py-3 px-4 text-gray-500">{new Date(job.created_at).toLocaleDateString()}</td>
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
