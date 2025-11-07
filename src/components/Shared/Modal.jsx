import React from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, ClipboardList, Gauge } from 'lucide-react'; 

function Sidebar() {
    const baseClass = `flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-300`;
    
    return (
        <aside className={`
            w-64 min-h-screen fixed left-0 top-0 pt-20
            bg-amber-950/95 backdrop-blur-xl
            border-r border-amber-200/10 shadow-2xl z-50 text-white px-6 py-8
        `}>
            
            <nav className="space-y-3">
                {/* Dashboard Link */}
                <NavLink 
                    to="/kpi" 
                    className={({ isActive }) => `${baseClass} ${isActive ? 'bg-amber-400 text-amber-950 shadow-md scale-105' : 'hover:bg-amber-100/10 hover:scale-105 hover:text-amber-300'}`}
                >
                    <Gauge className="w-5 h-5" />
                    KPI Dashboard
                </NavLink>

                {/* Overtime Link */}
                <NavLink 
                    to="/overtime" 
                    className={({ isActive }) => `${baseClass} ${isActive ? 'bg-amber-400 text-amber-950 shadow-md scale-105' : 'hover:bg-amber-100/10 hover:scale-105 hover:text-amber-300'}`}
                >
                    <ClipboardList className="w-5 h-5" />
                    Overtime Portal
                </NavLink>
            </nav>
            
            {/* Footer / Copyright */}
            <div className="absolute bottom-6 left-0 w-full px-6">
                <p className="text-xs text-amber-100/40 tracking-wider">
                    © {new Date().getFullYear()} Konditorie
                </p>
            </div>
        </aside>
    );
}

export default Sidebar;