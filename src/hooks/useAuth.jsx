// src/hooks/useAuth.jsx
import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        if (snap.exists()) {
          setUser({ uid: firebaseUser.uid, email: firebaseUser.email, ...snap.data() });
        } else {
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            role: "viewer",
            approved: false
          });
        }
      } catch (err) {
        console.error("useAuth error:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const logout = () => signOut(auth);

  return { user, loading, logout };
}
