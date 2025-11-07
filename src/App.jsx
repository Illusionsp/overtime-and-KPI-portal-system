// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AuthGuard from "./components/AuthGuard";

// Auth Pages
import Login from "./pages/Login";
import Register from "./pages/Register";

// Dashboards
import AdminDashboard from "./pages/AdminDashboard";
import ApproverDashboard from "./pages/ApproverDashboard";
import ViewerDashboard from "./pages/ViewerDashboard";

// Overtime Components
import OvertimePortal from "./components/OvertimePortal";
import EmployeeOvertimeWrapper from "./components/EmployeeOvertimeWrapper";
import OvertimeAdminList from "./components/OvertimeAdminList";

// KPI Dashboard ✅
import KPIDashboard from "./components/KPIDashboard";

// Other page
import NoAccess from "./pages/NoAccess";

function DashboardRouter() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  switch (user.role) {
    case "admin":
      return <Navigate to="/admin" replace />;
    case "approver":
      return <Navigate to="/approver" replace />;
    case "viewer":
    default:
      return <Navigate to="/viewer" replace />;
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>

          {/* Redirect Root */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Auto Dashboard selection */}
          <Route
            path="/dashboard"
            element={
              <AuthGuard>
                <DashboardRouter />
              </AuthGuard>
            }
          />

          {/* Viewer Pages */}
          <Route
            path="/viewer"
            element={
              <AuthGuard rolesAllowed={["viewer", "approver", "admin"]}>
                <ViewerDashboard />
              </AuthGuard>
            }
          />
          <Route
            path="/viewer/my-overtime"
            element={
              <AuthGuard rolesAllowed={["viewer", "approver", "admin"]}>
                <EmployeeOvertimeWrapper />
              </AuthGuard>
            }
          />

          {/* Approver Pages */}
          <Route
            path="/approver"
            element={
              <AuthGuard rolesAllowed={["approver"]}>
                <ApproverDashboard />
              </AuthGuard>
            }
          />
          <Route
            path="/approver/overtime-requests"
            element={
              <AuthGuard rolesAllowed={["approver"]}>
                <OvertimeAdminList allowApprove={true} />
              </AuthGuard>
            }
          />

          {/* Admin Pages */}
          <Route
            path="/admin"
            element={
              <AuthGuard rolesAllowed={["admin", "approver"]}>
                <AdminDashboard />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/overtime-requests"
            element={
              <AuthGuard rolesAllowed={["admin"]}>
                <OvertimeAdminList allowApprove={false} />
              </AuthGuard>
            }
          />

          {/* ✅ KPI Dashboard */}
          <Route
            path="/kpi"
            element={
              <AuthGuard rolesAllowed={["admin", "approver"]}>
                <KPIDashboard />
              </AuthGuard>
            }
          />

          {/* ✅ Overtime Portal for Admin, Approver & Viewer */}
          <Route
            path="/overtime"
            element={
              <AuthGuard rolesAllowed={["admin", "approver", "viewer"]}>
                <OvertimePortal />
              </AuthGuard>
            }
          />

          {/* No Access Page */}
          <Route path="/no-access" element={<NoAccess />} />

          {/* Catch All Routes */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
