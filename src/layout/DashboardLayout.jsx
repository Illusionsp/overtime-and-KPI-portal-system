import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

export default function DashboardLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {/* ✅ Push content right so it doesn’t hide behind sidebar */}
      <main className="flex-1 ml-64 p-6 bg-slate-100">
        <Outlet />
      </main>
    </div>
  );
}
