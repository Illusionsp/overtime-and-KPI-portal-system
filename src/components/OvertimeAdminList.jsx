// src/components/OvertimeAdminList.jsx
import React, { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";


export default function OvertimeAdminList() {
  const { user, loading } = useAuth();
  const [records, setRecords] = useState([]);

  useEffect(() => {
    // listen to overtime collection
    const q = query(collection(db, "overtime"));
    const unsub = onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      setRecords(arr);
    });
    return () => unsub();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Not signed in</div>;

  const approveRecord = async (rec) => {
    // Only owner of that record can approve it
    if (user.role !== "owner" || user.uid !== rec.ownerId) {
      alert("Only the owner can approve this record");
      return;
    }
    await updateDoc(doc(db, "overtime", rec.id), { status: "Approved", approvedAt: new Date() });
  };

  return (
    <div className="space-y-4 p-4">
      {records.map(r => (
        <div key={r.id} className="border p-3 rounded flex justify-between items-center">
          <div>
            <div><strong>{r.employeeName}</strong> — {r.hours}h — {r.status}</div>
            <div className="text-sm text-gray-600">{r.date}</div>
            <div className="text-sm text-gray-600">ownerId: {r.ownerId}</div>
          </div>
          <div>
            {r.status !== "Approved" && user.role === "owner" && user.uid === r.ownerId && (
              <button onClick={() => approveRecord(r)} className="px-3 py-1 bg-amber-700 text-white rounded">Approve</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
