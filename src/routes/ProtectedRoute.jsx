// ✅ Updated ProtectedRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth"; // ✅ CORRECT


export default function ProtectedRoute({ children, roles = null, requireApproved = true }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="p-6">Loading...</div>;

  if (!user) return <Navigate to="/login" replace />;

  // ✅ Check if approved
  if (requireApproved && !user.approved) {
    return <Navigate to="/pending-approval" replace />;
  }

  // ✅ Check allowed roles
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
