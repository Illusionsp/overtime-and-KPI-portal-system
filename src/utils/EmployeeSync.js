// src/utils/EmployeeSync.js
import { db } from "../firebase";
import { collection, doc, setDoc, onSnapshot, serverTimestamp, writeBatch, deleteDoc } from "firebase/firestore";
import { useEffect } from "react";

const HUB_COLLECTION = "shared_employees";

export const syncEmployee = async ({ id, name, position, salary, branch, department, photo = "" }) => {
  await setDoc(doc(db, HUB_COLLECTION, id), {
    name: name.trim(),
    position: position?.trim() || "",
    salary: salary || 0,
    branch: branch.trim(),
    department: department.trim(),
    photo,
    syncedAt: serverTimestamp(),
  }, { merge: true });
};

export const useEmployeeSync = (onSync) => {
  useEffect(() => {
    const unsub = onSnapshot(collection(db, HUB_COLLECTION), (snap) => {
      const emps = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      onSync(emps);
    });
    return unsub;
  }, [onSync]);
};

export const pushAllToHub = async (employees, branch, department) => {
  const batch = writeBatch(db);
  employees.forEach(emp => {
    batch.set(doc(db, HUB_COLLECTION, emp.id), {
      name: emp.name,
      position: emp.role || "",
      salary: emp.salary || 0,
      branch,
      department,
      photo: emp.photo || "",
      syncedAt: serverTimestamp(),
    }, { merge: true });
  });
  await batch.commit();
  alert("All employees synced to KPI!");
};

export const deleteFromHub = (id) => deleteDoc(doc(db, HUB_COLLECTION, id));