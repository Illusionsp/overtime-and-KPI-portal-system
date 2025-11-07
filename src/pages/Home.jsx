// src/pages/Home.jsx

import React from 'react';
import { NavLink } from 'react-router-dom';
import { Building2, UsersRound } from 'lucide-react'; // Assuming you have lucide-react installed

function Home() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-900 via-amber-800 to-amber-950 text-white flex items-center justify-center px-6">
            <div className="text-center max-w-3xl animate-fadeIn">
                <div className="flex justify-center mb-6">
                    <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md shadow-md">
                        {/* Building Icon (using a placeholder for lucide-react Building2) */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12h4"/><path d="M10 8h4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/></svg>
                    </div>
                </div>
                <h1 className="text-5xl font-bold tracking-wide drop-shadow-xl">Konditorie HR Portal</h1>
                <p className="text-lg mt-4 text-white/80">Manage employees, departments & KPI performance with efficiency.</p>
                
                <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                    <NavLink to="/login" className="px-8 py-3 bg-amber-700 rounded-2xl shadow-lg font-semibold flex items-center justify-center gap-2 hover:bg-amber-600 transition-all hover:scale-105">
                        Sign In &rarr;
                    </NavLink>
                    <NavLink to="/register" className="px-8 py-3 bg-white/20 border border-white/30 backdrop-blur rounded-2xl shadow-lg font-semibold flex items-center justify-center gap-2 hover:bg-white/30 transition-all hover:scale-105">
                        Register 
                        {/* Users Round Icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/></svg>
                    </NavLink>
                </div>
            </div>
        </div>
    );
}

export default Home;