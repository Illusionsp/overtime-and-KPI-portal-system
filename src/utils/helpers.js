// src/utils/helpers.js

// ✅ Format Ethiopian Currency (ETB)
export const formatETB = (value) => {
  const num = Number(value);
  if (!isFinite(num)) return "ETB 0.00";

  return new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency: "ETB",
    minimumFractionDigits: 2,
  }).format(num);
};

// ✅ Format Dates (works with Firestore Timestamps too)
export const formatDate = (input) => {
  if (!input) return "-";

  const date =
    input.toDate?.() instanceof Date
      ? input.toDate() // Firestore Timestamp → JS Date
      : new Date(input); // Normal date string

  if (isNaN(date.getTime())) return "-";

  return date.toISOString().split("T")[0];
};

// ✅ Capitalize first letter of words
export const capitalize = (text = "") =>
  text
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

// ✅ Safely convert to number
export const toNumber = (value) => {
  const num = parseFloat(value);
  return isFinite(num) ? num : 0;
};

// ✅ Status badge style helper
export const getStatusColor = (status) => {
  if (!status) return "bg-gray-400 text-white";

  switch (status.toLowerCase()) {
    case "approved":
      return "bg-green-500 text-white";
    case "pending":
      return "bg-yellow-500 text-white";
    case "rejected":
      return "bg-red-500 text-white";
    default:
      return "bg-gray-500 text-white";
  }
};
