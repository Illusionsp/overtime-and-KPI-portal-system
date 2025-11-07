import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';


// rolesAllowed: array of roles or undefined to allow all logged-in users
const AuthGuard = ({ children, rolesAllowed }) => {
const { user, loading } = useAuth();


if (loading) return null; // or a spinner
if (!user) return <Navigate to="/login" replace />;
if (rolesAllowed && !rolesAllowed.includes(user.role)) {
return <Navigate to="/no-access" replace />;
}


return children;
};


export default AuthGuard;