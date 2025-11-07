// src/pages/Register.jsx
import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, 'users', res.user.uid), {
        name,
        email,
        role: 'viewer',
        createdAt: new Date().toISOString(),
      });

      alert('Registered successfully!');
      navigate('/dashboard');
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={handleRegister} className="bg-white p-6 rounded shadow w-96">
        <h2 className="text-xl font-semibold mb-4">Register (Public)</h2>

        <input className="w-full p-2 mb-2 border rounded"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)} />

        <input className="w-full p-2 mb-2 border rounded"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)} />

        <input className="w-full p-2 mb-4 border rounded"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)} />

        <button className="w-full bg-green-600 text-white p-2 rounded" type="submit">
          Register
        </button>

        {/* ✅ Login Link */}
        <div className="text-center mt-4">
          <p className="text-sm">
            Already have an account?{" "}
            <span
              className="text-blue-600 cursor-pointer underline"
              onClick={() => navigate('/')}>
              Login
            </span>
          </p>
        </div>
      </form>
    </div>
  );
}
