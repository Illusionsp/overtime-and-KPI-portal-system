// src/components/Sidebar.jsx
import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ClipboardList, Gauge, LogOut, TrendingUp } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const menuItems = [
    { to: "/dashboard", label: "Dashboard", icon: Gauge, roles: ["viewer", "approver", "admin"] },

    // 🚀 Available for everyone
    { to: "/overtime", label: "Overtime Portal", icon: ClipboardList, roles: ["viewer", "approver", "admin"] },

    // ✅ Admin can view overtime lists (but cannot approve)
    { to: "/admin/overtime-requests", label: "Overtime Requests", icon: ClipboardList, roles: ["admin"] },

    // ✅ Approver can see approval list
    { to: "/approver/overtime-requests", label: "Approve Requests", icon: ClipboardList, roles: ["approver"] },

    // ✅ Admin KPI Dashboard
    { to: "/kpi", label: "KPI Dashboard", icon: TrendingUp, roles: ["admin"] },
  ];

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <aside className="
      w-64 h-screen fixed top-0 left-0 bg-amber-950 text-white
      shadow-xl p-6 flex flex-col justify-between
    ">
      <div>
        <h2 className="text-2xl font-bold mb-8">Konditorie</h2>
        <nav className="space-y-3">
          {menuItems
            .filter(item => item.roles.includes(user?.role))
            .map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200
                  ${
                    isActive
                      ? "bg-amber-400 text-amber-950 shadow-md scale-105"
                      : "hover:bg-amber-200/10 hover:scale-105"
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                {label}
              </NavLink>
            ))}
        </nav>
      </div>

      <div className="mt-auto pt-6 border-t border-amber-500/20">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-3 text-red-300 hover:text-white hover:bg-red-600/40 rounded-lg transition-all"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>

        <p className="text-xs text-amber-200/40 mt-6 text-center">
          © {new Date().getFullYear()} Konditorie
        </p>
      </div>
    </aside>
  );
}

export default Sidebar;
