// src/utils/demoStorage.js
const LS_KEYS = {
  employees: 'kop_employees',
  otRecords: 'kop_ot_records',
  kpi: 'kop_kpi',
  hidden: 'kop_hidden',
};

export const lsLoad = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};

export const lsSave = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
};