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

    useEffect(() => {
        fetchJobs();
    }, []);

    // Feature 5: Real-time subscriptions
    useEffect(() => {
        if (!userId) return;

        const channel = supabase.channel('driver-orders-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: 'status=eq.awaiting_driver' }, (payload) => {
                // New job available — fetch full data with joins
                (async () => {
                    const { data } = await supabase.from('orders')
                        .select('*, produce_listings(name, amount, display_location), buyer:users!orders_buyer_id_fkey(full_name, region)')
                        .eq('id', payload.new.id)
                        .maybeSingle();
                    if (data) setAvailableJobs(prev => [data, ...prev]);
                })();
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
                const updated = payload.new;

                if (updated.status === 'driver_assigned') {
                    // Someone accepted this job — remove from available
                    setAvailableJobs(prev => prev.filter(j => j.id !== updated.id));

                    // If this driver accepted it, it's already handled by acceptJob()
                }

                if (updated.status === 'awaiting_driver') {
                    // A job was released — refetch and add to available
                    (async () => {
                        const { data } = await supabase.from('orders')
                            .select('*, produce_listings(name, amount, display_location), buyer:users!orders_buyer_id_fkey(full_name, region)')
                            .eq('id', updated.id)
                            .maybeSingle();
                        if (data) setAvailableJobs(prev => {
                            if (prev.some(j => j.id === data.id)) return prev;
                            return [data, ...prev];
                        });
                    })();
                }

                if (updated.status === 'completed') {
                    // Remove from active jobs if it's there
                    setMyJobs(prev => prev.filter(j => j.id !== updated.id));
                    // Refetch completed jobs
                    (async () => {
                        const { data } = await supabase.from('orders')
                            .select('*, produce_listings(name), buyer:users!orders_buyer_id_fkey(full_name, region)')
                            .eq('id', updated.id)
                            .maybeSingle();
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
            supabase.from('orders')
                .select('*, produce_listings(name, amount, display_location), buyer:users!orders_buyer_id_fkey(full_name, region)')
                .eq('status', 'awaiting_driver')
                .order('created_at', { ascending: false }),
            supabase.from('orders')
                .select('*, produce_listings(name, amount, display_location, seller_id, users(full_name, phone_number, region)), buyer:users!orders_buyer_id_fkey(full_name, phone_number, region)')
                .eq('driver_id', uid)
                .eq('status', 'driver_assigned')
                .order('created_at', { ascending: false }),
            // Feature 4: Completed deliveries history
            supabase.from('orders')
                .select('*, produce_listings(name), buyer:users!orders_buyer_id_fkey(full_name, region)')
                .eq('driver_id', uid)
                .eq('status', 'completed')
                .order('created_at', { ascending: false }),
        ]);

        setAvailableJobs(availRes.data || []);
        setMyJobs(myRes.data || []);
        setCompletedJobs(completedRes.data || []);
        setLoading(false);
    };

    const acceptJob = async (orderId) => {
        const { error } = await supabase.from('orders')
            .update({ driver_id: userId, status: 'driver_assigned' })
            .eq('id', orderId);

        if (!error) {
            setAvailableJobs(availableJobs.filter(j => j.id !== orderId));
            const { data } = await supabase.from('orders')
                .select('*, produce_listings(name, amount, display_location, seller_id, users(full_name, phone_number, region)), buyer:users!orders_buyer_id_fkey(full_name, phone_number, region)')
                .eq('id', orderId)
                .maybeSingle();
            if (data) setMyJobs([data, ...myJobs]);
        }
    };

    const releaseJob = async (orderId) => {
        const { error } = await supabase.from('orders')
            .update({ driver_id: null, status: 'awaiting_driver' })
            .eq('id', orderId);

        if (!error) {
            const released = myJobs.find(j => j.id === orderId);
            setMyJobs(myJobs.filter(j => j.id !== orderId));
            if (released) {
                setAvailableJobs([{ ...released, driver_id: null, status: 'awaiting_driver' }, ...availableJobs]);
            }
        }
    };

    // Feature 2: Mark as delivered
    const markDelivered = async (orderId) => {
        const { error } = await supabase.from('orders')
            .update({ status: 'completed' })
            .eq('id', orderId);

        if (!error) {
            const delivered = myJobs.find(j => j.id === orderId);
            setMyJobs(myJobs.filter(j => j.id !== orderId));
            if (delivered) {
                setCompletedJobs([{ ...delivered, status: 'completed' }, ...completedJobs]);
            }
        }
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
                <div className="mb-8">
                    <h1 className="text-2xl font-bold">🚛 Driver Dashboard</h1>
                    <p className="text-surface-400 text-sm mt-1">Accept deliveries and manage your active jobs</p>
                </div>

                <div className="grid gap-8 lg:grid-cols-2">
                    {/* Available Jobs */}
                    <section>
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500" /> Available Deliveries
                            <span className="badge bg-amber-500/20 text-amber-400 ml-2">{availableJobs.length}</span>
                        </h2>
                        {availableJobs.length === 0 ? (
                            <div className="card text-center text-surface-400 py-12">
                                <p className="text-4xl mb-2">📭</p>
                                <p>No deliveries available right now.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {availableJobs.map((job) => (
                                    <div key={job.id} className="card p-4 animate-fade-in">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-semibold">{job.produce_listings?.name || 'Product'}</h4>
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    <span className="badge bg-surface-700/50 text-surface-300">
                                                        {job.quantity} kg
                                                    </span>
                                                    {job.produce_listings?.display_location && (
                                                        <span className="badge bg-blue-500/20 text-blue-400">
                                                            📍 Pickup: {job.produce_listings.display_location}
                                                        </span>
                                                    )}
                                                    {job.buyer?.region && (
                                                        <span className="badge bg-purple-500/20 text-purple-400">
                                                            🏁 Drop: {job.buyer.region}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <button onClick={() => acceptJob(job.id)} className="btn-primary text-sm py-2 px-4 shrink-0">
                                                Accept
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* My Active Jobs */}
                    <section>
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-brand-500" /> My Active Deliveries
                            <span className="badge bg-brand-500/20 text-brand-400 ml-2">{myJobs.length}</span>
                        </h2>
                        {myJobs.length === 0 ? (
                            <div className="card text-center text-surface-400 py-12">
                                <p className="text-4xl mb-2">🚛</p>
                                <p>You haven't accepted any deliveries yet.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {myJobs.map((job) => (
                                    <div key={job.id} className="card p-4 animate-fade-in border-brand-500/20">
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <h4 className="font-semibold">{job.produce_listings?.name || 'Product'}</h4>
                                            <span className="badge bg-brand-500/20 text-brand-400">Active</span>
                                        </div>
                                        <div className="badge bg-surface-700/50 text-surface-300 mb-3">{job.quantity} kg</div>

                                        {/* Revealed Contact Info */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                            <div className="bg-surface-800/50 rounded-xl p-3 border border-surface-700/50">
                                                <p className="text-xs text-surface-500 uppercase tracking-wider mb-1">Seller</p>
                                                <p className="text-sm font-medium">{job.produce_listings?.users?.full_name || 'N/A'}</p>
                                                <p className="text-sm text-brand-400">{job.produce_listings?.users?.phone_number || 'N/A'}</p>
                                                <p className="text-xs text-surface-500">{job.produce_listings?.users?.region || ''}</p>
                                            </div>
                                            <div className="bg-surface-800/50 rounded-xl p-3 border border-surface-700/50">
                                                <p className="text-xs text-surface-500 uppercase tracking-wider mb-1">Buyer</p>
                                                <p className="text-sm font-medium">{job.buyer?.full_name || 'N/A'}</p>
                                                <p className="text-sm text-brand-400">{job.buyer?.phone_number || 'N/A'}</p>
                                                <p className="text-xs text-surface-500">{job.buyer?.region || ''}</p>
                                            </div>
                                        </div>

                                        {/* Feature 2: Delivered + Deny buttons */}
                                        <div className="flex gap-3 mt-3">
                                            <button onClick={() => markDelivered(job.id)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 px-4 rounded-xl text-sm transition-colors">
                                                ✓ Delivered
                                            </button>
                                            <button onClick={() => releaseJob(job.id)} className="flex-1 btn-danger text-sm">
                                                Deny / Release
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                {/* Feature 4: Completed Deliveries History */}
                <section className="mt-12">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> Completed Deliveries
                        <span className="badge bg-emerald-500/20 text-emerald-400 ml-2">{completedJobs.length}</span>
                    </h2>
                    {completedJobs.length === 0 ? (
                        <div className="card text-center text-surface-400 py-12">
                            <p className="text-4xl mb-2">📋</p>
                            <p>No completed deliveries yet.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-surface-700">
                                        <th className="text-left py-3 px-4 text-surface-400 font-medium">Product</th>
                                        <th className="text-left py-3 px-4 text-surface-400 font-medium">Qty</th>
                                        <th className="text-left py-3 px-4 text-surface-400 font-medium">Buyer</th>
                                        <th className="text-left py-3 px-4 text-surface-400 font-medium">Region</th>
                                        <th className="text-left py-3 px-4 text-surface-400 font-medium">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {completedJobs.map((job) => (
                                        <tr key={job.id} className="border-b border-surface-800 hover:bg-surface-800/30 transition-colors">
                                            <td className="py-3 px-4 font-medium">{job.produce_listings?.name || 'N/A'}</td>
                                            <td className="py-3 px-4 text-surface-400">{job.quantity} kg</td>
                                            <td className="py-3 px-4 text-surface-400">{job.buyer?.full_name || 'N/A'}</td>
                                            <td className="py-3 px-4 text-surface-400">{job.buyer?.region || '—'}</td>
                                            <td className="py-3 px-4 text-surface-400">{new Date(job.created_at).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
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
