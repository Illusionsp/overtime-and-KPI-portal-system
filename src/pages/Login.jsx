// src/pages/Login.jsx
import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await signInWithEmailAndPassword(auth, email, password);

      const snap = await getDoc(doc(db, 'users', res.user.uid));
      const role = snap.exists() ? snap.data().role : 'viewer';

      if (role === 'approver') navigate('/approver');
      else if (role === 'admin') navigate('/admin');
      else navigate('/dashboard');
    } catch (err) {
      alert(err.message);
    }
  };

  if (user) return (
    <div className="p-6">
      You are already logged in.
      <button className="ml-4 underline text-blue-600"
        onClick={() => {
          if (user.role === 'approver') navigate('/approver');
          else if (user.role === 'admin') navigate('/admin');
          else navigate('/dashboard');
        }}>
        Go to dashboard
      </button>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow w-96">
        <h2 className="text-xl font-semibold mb-4">Sign In</h2>

        <input className="w-full p-2 mb-3 border rounded"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)} />

        <input className="w-full p-2 mb-4 border rounded"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)} />

        <button className="w-full bg-blue-600 text-white p-2 rounded" type="submit">
          Login
        </button>

        {/* ✅ Register Link */}
        <div className="text-center mt-4">
          <p className="text-sm">
            Don’t have an account?{" "}
            <span
              onClick={() => navigate('/register')}
              className="text-blue-600 cursor-pointer underline">
              Register here
            </span>
          </p>
        </div>
      </form>
    </div>
  );
}
