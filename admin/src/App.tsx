import { useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './components/auth/LoginPage.js';
import { AppShell } from './components/layout/AppShell.js';
import { PlansListPage } from './components/plans/PlansListPage.js';
import { PlanEditPage } from './components/plans/PlanEditPage.js';
import { api, clearToken, isLoggedIn } from './api/client.js';

export function App() {
    const [loggedIn, setLoggedIn] = useState(isLoggedIn());
    const [checkingAuth, setCheckingAuth] = useState(isLoggedIn());

    const handleLogin = useCallback(() => setLoggedIn(true), []);
    const handleLogout = useCallback(() => setLoggedIn(false), []);

    useEffect(() => {
        if (!isLoggedIn()) {
            setCheckingAuth(false);
            return;
        }
        api.me()
            .then(() => setLoggedIn(true))
            .catch(() => {
                clearToken();
                setLoggedIn(false);
            })
            .finally(() => setCheckingAuth(false));
    }, []);

    if (checkingAuth) {
        return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">Đang kiểm tra đăng nhập...</div>;
    }

    if (!loggedIn) {
        return <LoginPage onLogin={handleLogin} />;
    }

    return (
        <BrowserRouter basename="/admin">
            <AppShell onLogout={handleLogout}>
                <Routes>
                    <Route path="/" element={<PlansListPage />} />
                    <Route path="/plans/:slug" element={<PlanEditPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </AppShell>
        </BrowserRouter>
    );
}
