// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // includes role, name, email, uid
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const ref = doc(db, 'users', firebaseUser.uid);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            setUser({ uid: firebaseUser.uid, email: firebaseUser.email, ...snap.data() });
          } else {
            // If no user doc, default to viewer (useful for public register fallback)
            setUser({ uid: firebaseUser.uid, email: firebaseUser.email, role: 'viewer' });
          }
        } catch (err) {
          console.error("Failed to read user doc:", err);
          setUser({ uid: firebaseUser.uid, email: firebaseUser.email, role: 'viewer' });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
