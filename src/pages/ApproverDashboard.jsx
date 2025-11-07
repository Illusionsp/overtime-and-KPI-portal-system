// src/pages/ApproverDashboard.jsx
import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../context/AuthContext";

export default function ApproverDashboard() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);

  const loadRequests = async () => {
    if (!user) return;

    let q;
    if (!user.branchId || user.branchId.trim() === "") {
      console.warn("⚠️ No branch assigned → loading ALL pending requests");
      q = query(
        collection(db, "overtimeRequests"),
        where("status", "==", "pending")
      );
    } else {
      console.log("✅ Branch found → filtering requests");
      q = query(
        collection(db, "overtimeRequests"),
        where("branchId", "==", user.branchId),
        where("status", "==", "pending")
      );
    }

    const snap = await getDocs(q);
    setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    loadRequests();
  }, [user]);

  const handleDecision = async (id, status) => {
    await updateDoc(doc(db, "overtimeRequests", id), { status });
    alert(`✅ Request ${status}`);
    loadRequests();
  };

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <Sidebar />

      {/* ✅ Fixed Layout */}
      <main className="flex-1 p-6 ml-64">
        <h1 className="text-2xl font-bold mb-6">Overtime Approvals</h1>

        <div className="bg-white p-4 rounded shadow overflow-x-auto">
          {requests.length === 0 ? (
            <p className="text-gray-500">✅ No pending overtime requests</p>
          ) : (
            <table className="w-full text-left min-w-max">
              <thead>
                <tr className="text-sm font-medium border-b">
                  <th className="p-2">Employee</th>
                  <th className="p-2">Hours</th>
                  <th className="p-2">Date</th>
                  <th className="p-2">Reason</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>

              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{r.userName || r.userId}</td>
                    <td className="p-2">{r.hours}</td>
                    <td className="p-2">
                      {r.date?.toDate
                        ? r.date.toDate().toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="p-2">{r.reason || "-"}</td>

                    <td className="p-2 space-x-2">
                      <button
                        className="bg-green-600 text-white px-3 py-1 rounded"
                        onClick={() => handleDecision(r.id, "approved")}
                      >
                        Approve
                      </button>

                      <button
                        className="bg-red-600 text-white px-3 py-1 rounded"
                        onClick={() => handleDecision(r.id, "rejected")}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

            </table>
          )}
        </div>
      </main>
    </div>
  );
}
