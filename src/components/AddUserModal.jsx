// src/components/AddUserModal.jsx
import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

export default function AddUserModal({ open, onClose, currentUser }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('Password123!');
  const [role, setRole] = useState('viewer');
  const [branchId, setBranchId] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!currentUser || currentUser.role === 'viewer') {
      return alert('Only admin or approver can create users.');
    }

    setLoading(true);
    try {
      // ✅ Create AUTH account
      const { user } = await createUserWithEmailAndPassword(auth, email, password);

      // ✅ Create Firestore user document
      await setDoc(doc(db, "users", user.uid), {
        name,
        email,
        role,
        branchId: branchId || null,
        createdAt: Date.now()
      });

      alert('User created successfully!');
      onClose();

    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40">
      <form onSubmit={handleCreate} className="bg-white p-6 rounded w-96">
        <h3 className="text-lg font-semibold mb-3">Create User</h3>

        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
          className="w-full p-2 mb-2 border rounded" />

        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
          className="w-full p-2 mb-2 border rounded" />

        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password"
          placeholder="Password" className="w-full p-2 mb-2 border rounded" />

        <select value={role} onChange={(e) => setRole(e.target.value)}
          className="w-full p-2 mb-2 border rounded">
          <option value="admin">admin</option>
          <option value="approver">approver</option>
          <option value="viewer">viewer</option>
        </select>

        <input value={branchId} onChange={(e) => setBranchId(e.target.value)}
          placeholder="BranchId (optional)" className="w-full p-2 mb-4 border rounded" />

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1 border rounded">Cancel</button>
          <button type="submit" disabled={loading} className="px-3 py-1 bg-blue-600 text-white rounded">
            {loading ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
