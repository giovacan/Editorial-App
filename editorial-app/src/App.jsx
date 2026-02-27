import { Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import Layout from './components/Layout/Layout';
import { LoginPage } from './components/Auth/LoginPage';
import { RegisterPage } from './components/Auth/RegisterPage';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import { AdminRoute } from './components/Auth/AdminRoute';
import BooksPage from './pages/BooksPage';
import { PricingPage } from './pages/PricingPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminConfig from './pages/admin/AdminConfig';
import AdminUsers from './pages/admin/AdminUsers';
import AdminPlans from './pages/admin/AdminPlans';
import AdminStats from './pages/admin/AdminStats';
import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/pricing" element={<PricingPage />} />

        {/* Protected routes - requires authentication */}
        <Route element={<ProtectedRoute />}>
          <Route path="/books" element={<BooksPage />} />
          <Route path="/app" element={<Layout />} />
        </Route>

        {/* Admin routes - requires authentication AND admin privileges */}
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="config" replace />} />
            <Route path="config" element={<AdminConfig />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="plans" element={<AdminPlans />} />
            <Route path="stats" element={<AdminStats />} />
          </Route>
        </Route>

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/books" replace />} />
        <Route path="*" element={<Navigate to="/books" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
