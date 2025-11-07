// src/pages/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import Sidebar from '../components/Sidebar';
import AddUserModal from '../components/AddUserModal';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  const loadUsers = async () => {
    const snap = await getDocs(collection(db, 'users'));
    setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const loadBranches = async () => {
    const snap = await getDocs(collection(db, 'branches'));
    setBranches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    loadUsers();
    loadBranches();
  }, []);

  const handleUpdate = async (id, role, branchId) => {
    if (!branchId) branchId = "";

    // ✅ Auto-create new branch if not in list
    const exists = branches.some(b => b.id === branchId);
    if (!exists && branchId !== "") {
      await setDoc(doc(db, "branches", branchId), { name: branchId });
      await loadBranches();
    }

    await updateDoc(doc(db, 'users', id), { role, branchId });
    alert("✅ Updated successfully");
    loadUsers();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this user?")) return;
    await deleteDoc(doc(db, 'users', id));
    alert("🗑️ User removed");
    loadUsers();
  };

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <Sidebar />

      {/* ✅ Sidebar width fix */}
      <main className="flex-1 p-6 ml-64">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <button
            onClick={() => setOpen(true)}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            Add User
          </button>
        </div>

        <div className="bg-white rounded shadow p-4 overflow-x-auto">
          <table className="w-full text-left min-w-max">
            <thead>
              <tr className="text-sm font-medium border-b">
                <th className="p-2">Name</th>
                <th className="p-2">Email</th>
                <th className="p-2">Role</th>
                <th className="p-2">Branch</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>

            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t">
                  <td className="p-2">{u.name || "-"}</td>
                  <td className="p-2">{u.email}</td>

                  {/* ✅ Editable Role */}
                  <td className="p-2">
                    <select
                      defaultValue={u.role}
                      onChange={(e) => (u.role = e.target.value)}
                      className="border p-1 rounded"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="employee">Employee</option>
                      <option value="approver">Approver</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>

                  {/* ✅ Editable Branch input */}
                  <td className="p-2">
                    <input
                      defaultValue={u.branchId || ""}
                      onChange={(e) => (u.branchId = e.target.value)}
                      placeholder="Enter or choose"
                      list="branchOptions"
                      className="border p-1 rounded w-full"
                    />

                    <datalist id="branchOptions">
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </datalist>
                  </td>

                  {/* ✅ Save + Delete */}
                  <td className="p-2 space-x-2">
                    <button
                      className="bg-blue-600 text-white px-3 py-1 rounded"
                      onClick={() => handleUpdate(u.id, u.role, u.branchId)}
                    >
                      Save
                    </button>

                    <button
                      className="bg-red-600 text-white px-3 py-1 rounded"
                      onClick={() => handleDelete(u.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>

          </table>
        </div>

        <AddUserModal open={open} onClose={() => setOpen(false)} currentUser={user} />
      </main>
    </div>
  );
}
