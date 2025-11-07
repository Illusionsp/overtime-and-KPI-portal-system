// src/components/EmployeeOvertimeWrapper.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import OvertimePortal from "./OvertimePortal";


export default function EmployeeOvertimeWrapper() {
  const { employeeId } = useParams();
  const [employee, setEmployee] = useState(null);

  useEffect(() => {
    if (!employeeId) return;

    (async () => {
      const snap = await getDoc(doc(db, "employees", employeeId));
      if (snap.exists()) {
        setEmployee({ id: snap.id, ...snap.data() });
      }
    })();
  }, [employeeId]);

  if (!employee) return <p>Loading employee...</p>;

  return <OvertimePortal employee={employee} />;
}
