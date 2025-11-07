// src/pages/ViewerDashboard.jsx
import React from 'react';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';

export default function ViewerDashboard() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex bg-slate-100">
      <Sidebar />

      {/* ✅ Push main content to right so Sidebar doesn't overlap */}
      <main className="flex-1 p-6 ml-64">
        <h1 className="text-2xl font-semibold">
          Welcome, {user?.name || user?.email}
        </h1>

        <p className="mt-4">
          You are a <strong>{user?.role}</strong>. You have view-only access.
        </p>

        <div className="mt-6 bg-white rounded p-4 shadow">
          <h3 className="font-semibold">KPI Snapshot (read-only)</h3>
          <p className="text-sm mt-2">
            Data displayed here is read-only for your role.
          </p>
        </div>
      </main>
    </div>
  );
}
