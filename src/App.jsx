import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home.jsx';

const Planner = lazy(() => import('./pages/Planner.jsx'));

export default function App() {
  return (
    <Suspense fallback={<div className="page-loading" role="status">Loading planner…</div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/plan" element={<Planner />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
