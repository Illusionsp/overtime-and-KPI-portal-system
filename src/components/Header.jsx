import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut, User } from 'lucide-react'; 
// Import both auth and the signOut function
import { auth } from '../firebase'; 
import { signOut } from 'firebase/auth';


function Header({ user }) {
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            // Use the v9 modular signOut function
            await signOut(auth);
            // Redirect to login
            navigate('/login');
        } catch (error) {
            console.error("Error signing out: ", error);
        }
    };

    return (
        <header className="w-full bg-white text-gray-800 py-4 px-6 flex justify-between items-center shadow-md fixed top-0 left-0 z-50 h-16">
            
            {/* Left Side: Logo/Title (Konditorie HR Portal) */}
            <NavLink to="/" className="text-xl font-bold hover:opacity-80 flex items-center gap-2">
                 <img src="https://placehold.co/40x40/6A4736/FFFFFF?text=K" alt="Logo" className="rounded-full h-8 w-8" />
                Konditorie HR Portal
            </NavLink>
            
            {user ? (
                // Authenticated User UI
                <div className="flex items-center space-x-3">
                    
                    {/* User Name/Email Display (e.g., "Awoke Zumra") */}
                    <div className="flex items-center space-x-2 bg-gray-100/80 border border-gray-200 px-3 py-1.5 rounded-full max-w-xs truncate">
                        <User className="w-5 h-5 shrink-0 text-gray-600" />
                        <span className="text-sm font-medium truncate text-gray-700">
                            {user.displayName || user.email || (user.isAnonymous ? "Guest User" : "User")}
                        </span>
                    </div>
                    
                    {/* Logout Button */}
                    <button
                        onClick={handleLogout}
                        className="bg-red-500 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-red-600 transition flex items-center gap-1.5 font-medium"
                    >
                        <LogOut className="w-4 h-4" />
                        Logout
                    </button>
                </div>
            ) : (
                // Fallback (for safety, though App.jsx should hide this)
                <nav className="space-x-5 text-sm font-medium">
                    <NavLink to="/login" className="hover:underline">Login</NavLink>
                </nav>
            )}
        </header>
    );
}

export default Header;