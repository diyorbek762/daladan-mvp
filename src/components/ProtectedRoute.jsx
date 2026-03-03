import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const ADMIN_EMAILS = [
    'dedamirzayevdiyorbek9@gmail.com',
    'gulomovtop@gmail.com',
];

export default function ProtectedRoute({ children, allowedRole }) {
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setLoading(false);
                return;
            }

            setUser(session.user);

            const { data: profileData } = await supabase
                .from('users')
                .select('role, email, full_name')
                .eq('id', session.user.id)
                .maybeSingle();

            setProfile(profileData);
            setLoading(false);
        };

        checkAuth();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-3">
                    <span className="animate-spin h-8 w-8 border-3 border-green-600 border-t-transparent rounded-full" />
                    <span className="text-gray-500 text-sm">Loading...</span>
                </div>
            </div>
        );
    }

    // Not logged in
    if (!user || !profile) return <Navigate to="/login" replace />;

    const isAdmin = ADMIN_EMAILS.includes(profile.email);

    // Admin check
    if (allowedRole === 'admin') {
        return isAdmin ? children : <Navigate to="/login" replace />;
    }

    // Admin emails always go to admin dashboard
    if (isAdmin && allowedRole !== 'admin') {
        return <Navigate to="/admin-dashboard" replace />;
    }

    // Role check
    if (profile.role !== allowedRole) {
        const roleRoutes = {
            farmer: '/seller-dashboard',
            buyer: '/buyer-dashboard',
            driver: '/driver-dashboard',
        };
        return <Navigate to={roleRoutes[profile.role] || '/login'} replace />;
    }

    return children;
}
