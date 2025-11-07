import React, { useState, useEffect, useCallback } from 'react';
import {
    collection, query, where, doc,
    setDoc, updateDoc, deleteDoc, addDoc,
    onSnapshot,
    Timestamp,
    writeBatch,
    getFirestore,
    setLogLevel,
    getDocs,
    getDoc,
    increment    
} from 'firebase/firestore';
import {
    getAuth,
    // Removed old redundant imports: signInWithCustomToken, onAuthStateChanged, signInAnonymously
} from 'firebase/auth';
import {
    initializeApp,
    getApp,
    getApps
}
from 'firebase/app';
import { Edit, Trash2, Printer, X, Zap } from 'lucide-react';
// CORRECTED IMPORT PATH for the shared context (relative path from src/pages)
import { useAuth } from '../context/AuthContext'; 

// --- CONFIG ---
const firebaseConfig = typeof __firebase_config !== "undefined" ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== "undefined" ? __app_id : "default-app-id";
const initialAuthToken = typeof __initial_auth_token !== "undefined" ? __initial_auth_token : null;
// --- Constants ---
const OT_MULTIPLIERS = {
    "Holiday": 2.5, "Rest Day": 2, "Working Day": 1.5, "Night": 1.75
};
// Default Department for employees created without one
const DEFAULT_DEPARTMENT = "Unassigned";
// --- Firestore Collection Paths (Public Scope) ---
const EMPLOYEES_COLLECTION = `artifacts/${appId}/public/data/employees`;
const BRANCHES_COLLECTION = `artifacts/${appId}/public/data/branches`;
const DEPARTMENTS_COLLECTION = `artifacts/${appId}/public/data/departments`;    
const OT_PROFILE_COLLECTION = `artifacts/${appId}/public/data/overtime_profiles`;
const KPI_SCORECARD_COLLECTION = `artifacts/${appId}/public/data/kpi_scorecards`;
const OT_RECORDS_COLLECTION = `artifacts/${appId}/public/data/ot_records`;
const RECALC_COLLECTION = `artifacts/${appId}/public/data/recalc_requests`;    
const GE_STATUS_CLASSES = {
    Approved: `border-green-500`,
    Disapproved: `border-red-500`,
    Pending: `border-amber-500`,
    // Fallback classes for records with missing status/amount data
    'Data Inconsistent': `border-gray-500`, 
    'No OT Filed': `border-gray-300`,
    'No Status': `border-orange-500`,
};
// KPI Metrics and Ratings
const KPI_METRICS = ["punctuality", "efficiency", "speed", "teamwork"];
const RATINGS = [
    { value: 25, label: "Poor (25%)" },
    { value: 50, label: "Good (50%)" },
    { value: 75, label: "Very Good (75%)" },
    { value: 100, label: "Excellent (100%)" }
];
// Utility to calculate average score
const calculateScore = (metrics) => {
    const vals = KPI_METRICS.map(key => Number(metrics[key] || 0));
    const sum = vals.reduce((a, b) => a + b, 0);
    return sum / vals.length;
};
// --- UTILITY FOR OT AMOUNT CALCULATION (Reusable across components) ---
const calculateOTAmount = (hours, otType, salary) => {
    // Standard Ethiopian monthly working hours (approx 173.33)
    const monthlyHours = 173.33; 
    
    // Safety checks for inputs
    const safeHours = parseFloat(hours) || 0;
    const safeSalary = parseFloat(salary) || 0;
    // FIX: Ensure otType lookup is safe, defaults to Working Day multiplier if type is unknown
    const multiplier = OT_MULTIPLIERS[otType] || 1.5; 
    if (safeSalary <= 0 || safeHours <= 0) return 0;
    
    const hourlyRate = safeSalary / monthlyHours;
    const amount = safeHours * hourlyRate * multiplier;
    
    return amount;
};
// --- END NEW UTILITY ---
// Currency formatter for Ethiopian Birr (ETB)
const formatCurrency = (amount) => {
    let t = Number(amount);
    return isFinite(t) ? new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB', minimumFractionDigits: 2 }).format(t) : '';
};
/**
 * CORE SYNCHRONIZATION LOGIC (SSOT Pattern)
 */
const syncEmployeeAcrossPortals = async (employeeData, db, masterDocId, userId) => {
    if (!db) throw new Error("Database not initialized for sync.");
    const batch = writeBatch(db);
    const normalizedBranch = (employeeData.branch || '').trim();
    const department = employeeData.department ? employeeData.department.trim() : DEFAULT_DEPARTMENT;    
    
    
    // 0. --- CRITICAL FIX: Ensure the department entry exists and is visible for KPI Dashboard navigation ---
    if (department === DEFAULT_DEPARTMENT) {
        const deptId = `${normalizedBranch}-${DEFAULT_DEPARTMENT}-auto`;
        const deptRef = doc(db, DEPARTMENTS_COLLECTION, deptId);
        const deptSnap = await getDoc(deptRef);
        if (!deptSnap.exists()) {
            batch.set(deptRef, {
                branch: normalizedBranch,
                title: DEFAULT_DEPARTMENT,
                avgScore: 0,    
                employeeCount: 1,    
                createdAt: Timestamp.now()
            }, { merge: true });
        }    
    }
    // 1. --- Write Master Record (SSOT) ---
    const masterDocRef = doc(db, EMPLOYEES_COLLECTION, masterDocId);
    batch.set(masterDocRef, {
        ...employeeData,
        branch: normalizedBranch,
        department: department,    
        updatedAt: Timestamp.now(),
        createdBy: employeeData.createdBy || userId,
        isActive: true,
    }, { merge: true });
    // 2. --- Synchronization Trigger: Overtime Portal Initialization/Update ---
    const overtimeDocRef = doc(db, OT_PROFILE_COLLECTION, masterDocId);
    batch.set(overtimeDocRef, {
        employeeId: masterDocId,
        employeeName: employeeData.name,
        branch: normalizedBranch,
        department: department,    
        standardHoursPerWeek: employeeData.standardHoursPerWeek ?? 40,
        currentOTHours: 0,
        status: 'OT Tracking Ready',
        lastUpdated: Timestamp.now(),
    }, { merge: true });
    // 3. --- Synchronization Trigger: KPI Portal Initialization/Update ---
    // If updating employee details, ensure KPI document is updated with new name/branch/dept
    const metrics = employeeData.metrics ?? { punctuality: 50, efficiency: 50, speed: 50, teamwork: 50 };
    const score = calculateScore(metrics);
    const kpiDocRef = doc(db, KPI_SCORECARD_COLLECTION, masterDocId);
    batch.set(kpiDocRef, {
        employeeId: masterDocId,
        employeeName: employeeData.name,
        branch: normalizedBranch,
        department: department,    
        jobRole: employeeData.role,
        score: score, // Recalculate score based on existing/default metrics
        metrics: metrics,
        assignmentDate: Timestamp.now(),
        updatedAt: Timestamp.now(),
    }, { merge: true });
    await batch.commit();
};
// 🎯 REUSABLE MODAL COMPONENTS --------------------------------------------------------------------------------
// A generic Modal component
function Modal({ show, title, onClose, children }) {
    if (!show) return null;
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-2xl relative">
                <button onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-gray-900 p-2 rounded-full hover:bg-gray-100 transition">
                    <X size={20} />
                </button>
                <h3 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">{title}</h3>
                {children}
            </div>
        </div>
    );
}
// A simple confirmation modal used for delete actions
function ConfirmationModal({ show, title, message, onConfirm, onCancel }) {
    return (
        <Modal show={show} title={title} onClose={onCancel}>
            <p className="text-gray-600 mb-6">{message}</p>
            <div className="flex justify-end gap-3">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                >
                    Cancel
                </button>
                <button
                    onClick={onConfirm}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                    Confirm Delete
                </button>
            </div>
        </Modal>
    );
}
// Modal for adding a new branch
function AddBranchModal({ show, onClose, onAdd }) {
    const [branchName, setBranchName] = useState('');
    const handleSubmit = () => {
        if (branchName.trim()) {
            onAdd(branchName.trim());
            setBranchName('');
        }
    };
    return (
        <Modal show={show} title="Add New Branch Location" onClose={onClose}>
            <input
                type="text"
                placeholder="Branch Name (e.g., Summit)"
                className="input w-full mb-4 p-3 border border-gray-300 rounded-lg focus:ring-amber-500 focus:border-amber-500"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            <div className="flex justify-end gap-3 mt-4">
                <button
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={!branchName.trim()}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition"
                >
                    Add Branch
                </button>
            </div>
        </Modal>
    );
}
// Modal for editing an employee's main data
function EditEmployeeModal({ show, employee, branches, onClose, onSubmit }) {
    const safeEmployee = employee || {};
    const [name, setName] = useState(safeEmployee.name || '');
    const [role, setRole] = useState(safeEmployee.role || '');
    const [salary, setSalary] = useState(safeEmployee.salary || 0);
    const [branch, setBranch] = useState(safeEmployee.branch || '');
    useEffect(() => {
        if (employee) {
            setName(employee.name || '');
            setRole(employee.role || '');
            setSalary(employee.salary || 0);
            setBranch(employee.branch || '');
        }
    }, [employee]);
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!employee || !employee.id) return;
        onSubmit(employee.id, {
            name: name.trim(),
            role: role.trim(),
            salary: parseFloat(salary),
            branch: branch.trim(),
            department: employee.department,
            metrics: employee.metrics // Preserve metrics when updating master data
        });
        onClose();
    };
    if (!employee) return null;
    return (
        <Modal show={show} title={`Edit ${employee.name}'s Details`} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Full Name</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} required className="input w-full p-2 border rounded-lg" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Role</label>
                    <input type="text" value={role} onChange={e => setRole(e.target.value)} required className="input w-full p-2 border rounded-lg" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Salary (ETB)</label>
                    <input type="number" step="0.01" value={salary} onChange={e => setSalary(e.target.value)} required className="input w-full p-2 border rounded-lg" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Branch</label>
                    <select value={branch} onChange={e => setBranch(e.target.value)} required className="input w-full p-2 border rounded-lg">
                        <option value="" disabled={!branch}>Select Branch</option>    
                        {branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                    </select>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">Cancel</button>
                    <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Changes</button>
                </div>
            </form>
        </Modal>
    );
}
// NEW MODAL: Update KPI Metrics
function UpdateKpiModal({ show, employee, onClose, onSubmit }) {
    const currentMetrics = employee?.metrics || { punctuality: 50, efficiency: 50, speed: 50, teamwork: 50 };
    const [metrics, setMetrics] = useState(currentMetrics);
    useEffect(() => {
        if (employee) {
            setMetrics(employee.metrics || { punctuality: 50, efficiency: 50, speed: 50, teamwork: 50 });
        }
    }, [employee]);
    
    // Recalculate live score
    const liveScore = calculateScore(metrics).toFixed(1);
    const handleMetricChange = (e) => {
        const { name, value } = e.target;
        setMetrics(p => ({ ...p, [name]: Number(value) }));
    };
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!employee || !employee.id) return;
        onSubmit(employee.id, metrics);
        onClose();
    };
    
    if (!employee) return null;
    return (
        <Modal show={show} title={`Update KPI Metrics for ${employee.name}`} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-indigo-50 p-3 rounded-lg flex justify-between items-center font-bold text-gray-800">
                    <span>New Average Score:</span>
                    <span className="text-2xl text-indigo-700">{liveScore}%</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    {KPI_METRICS.map(key => (
                        <div key={key}>
                            <label className="block text-sm font-medium text-gray-700 capitalize">{key.replace(/([A-Z])/g, ' $1')}</label>
                            <select name={key} value={metrics[key]} onChange={handleMetricChange} required className="input w-full p-2 border rounded-lg">
                                {RATINGS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">Cancel</button>
                    <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Save KPI Scores</button>
                </div>
            </form>
        </Modal>
    );
}
// Generate Report Modal    
function GenerateReportModal({ show, branches, departments, onClose, onGenerate }) {
    // Determine default month (YYYY-MM format)
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    // State now defaults to 'All Time' for the month
    const [month, setMonth] = useState('All Time');
    const [branch, setBranch] = useState('All Branches');
    const [department, setDepartment] = useState('All Departments');
    const handleGenerate = () => {
        // Pass the state values (which includes 'All Time' or a specific date)
        onGenerate({ month, branch, department });
    };
    // Prepare options
    const branchOptions = [{ id: 'all', name: 'All Branches' }, ...branches];
    const departmentOptions = ['All Departments', ...departments];
    // Aligning the layout with the image concept
    return (
        <Modal show={show} title="Generate Report" onClose={onClose}>
            <div className="grid grid-cols-3 gap-4 items-end">
                {/* 1. Month Filter - Now a select for flexibility */}
                <div className="col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                    <select
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="input w-full p-2 border border-gray-300 rounded-lg focus:ring-amber-500 focus:border-amber-500"
                    >
                        {/* Option 1: All Time (No filter) */}
                        <option value="All Time">All Time (No Date Filter)</option>
                        {/* Option 2: Specific Month (Default to current month for ease of use) */}
                        <option value={currentMonth}>{currentMonth} (Current Month)</option>
                        {/* Note: In a real app, you might dynamically generate a list of all historical months */}
                    </select>
                </div>
                {/* 2. Branch Filter */}
                <div className="col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                    <select
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        className="input w-full p-2 border border-gray-300 rounded-lg focus:ring-amber-500 focus:border-amber-500"
                    >
                        {branchOptions.map(b => (
                            <option key={b.name} value={b.name}>{b.name}</option>
                        ))}
                    </select>
                </div>
                {/* 3. Department Filter */}
                <div className="col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                    <select
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="input w-full p-2 border border-gray-300 rounded-lg focus:ring-amber-500 focus:border-amber-500"
                    >
                        {departmentOptions.map(d => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </select>
                </div>
                {/* 4. Generate Button */}
                <div className="col-span-1 mt-4">
                    <button
                        onClick={handleGenerate}
                        className="w-full px-6 py-2 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition shadow-md"
                    >
                        Generate
                    </button>
                </div>
                {/* 5. Close Button */}
                <div className="col-span-1 mt-4">
                    <button
                        onClick={onClose}
                        className="w-full px-6 py-2 bg-gray-300 text-gray-800 rounded-lg font-semibold hover:bg-gray-400 transition shadow-md"
                    >
                        Close
                    </button>
                </div>
            </div>
        </Modal>
    );
}
// --- NEW COMPONENT: Report View ---
function OvertimeReportView({ allEmployees, records, filters, onBack, onPrint, DEFAULT_DEPARTMENT, formatCurrency }) {
    
    // 1. Create a map of employee salaries for quick lookup
    const employeeSalaryMap = new Map(allEmployees.map(e => [e.id, e.salary || 0]));
    // Filter the master list of employees first
    const filteredEmployees = allEmployees.filter(emp => {
        // Branch Filter
        const branchMatch = filters.branch === 'All Branches' || emp.branch === filters.branch;
        // Department Filter
        const employeeDepartment = (emp.department ? emp.department.trim() : DEFAULT_DEPARTMENT);
        const filterDepartment = filters.department.trim();
        const departmentMatch = filterDepartment === 'All Departments' || employeeDepartment === filterDepartment;
        return branchMatch && departmentMatch;
    });
    // 2. Map employees to their relevant OT records for the selected filters
    const reportData = filteredEmployees.flatMap(emp => {
        const employeeRecords = records.filter(record => {
            // Check 1: Must belong to the employee
            if (record.employeeId !== emp.id) return false; 
            // Check 2: Date Filtering (Removed strict matching, only filter if not 'All Time')
            const recordMonth = record.date ? record.date.substring(0, 7) : '';
            if (filters.month !== 'All Time' && filters.month && recordMonth !== filters.month) {
                return false;
            }
            
            // If we reach here, it matches employee, branch, department, AND date (if selected)
            return true;
        }).map(record => {
            // Data Reconciliation / Repair
            let amount = record.amount;
            const salary = employeeSalaryMap.get(record.employeeId) || 0;
            
            // Recalculate amount if missing, invalid, or zero (for old records)
            if (typeof amount !== 'number' || isNaN(amount) || amount === 0) {
                amount = calculateOTAmount(record.hours, record.otType, salary);
            }
            
            // Ensure status defaults to a displayable string if missing
            const status = record.status || (amount > 0 ? 'Data Inconsistent' : 'No Status');
            
            return { ...record, amount, status };
        });
        if (employeeRecords.length > 0) {
            // Employee has matching OT records, return them.
            return employeeRecords;
        } else if (filters.branch !== 'All Branches' || filters.department !== 'All Departments' || filters.month !== 'All Time') {
            // If filters are specific and no records found, show a placeholder row.
            return [{
                id: emp.id,
                isPlaceholder: true, 
                date: '-',
                branch: emp.branch,
                employeeName: emp.name,
                department: emp.department || DEFAULT_DEPARTMENT,
                otType: 'N/A',
                hours: 0,
                amount: 0,
                status: 'No OT Filed'
            }];
        }
        return []; // If filters are wide open and there are no records, just skip the placeholder
    }).sort((a, b) => {
        // Sort first by employee name, then by date (if date is available)
        if (a.employeeName !== b.employeeName) {
            return a.employeeName.localeCompare(b.employeeName);
        }
        // Handle '-' for date placeholders
        if (a.date === '-') return 1;
        if (b.date === '-') return -1;
        return new Date(b.date) - new Date(a.date);
    });
    const totalPayout = reportData.reduce((sum, r) => sum + (r.amount || 0), 0);
    const generatedDate = new Date().toLocaleDateString();
    
    // Determine displayed month string
    const displayMonth = filters.month === 'All Time' ? 'All Time' : (filters.month || 'Current Month');
    return (
        <div className="min-h-screen p-4 md:p-8 bg-gray-100 font-sans report-view">
            <style jsx="true">{`
                /* Print Styles to hide everything except the report content */
                @media print {
                    body > div:not(.report-view) {
                        display: none;
                    }
                    .report-view {
                        margin: 0;
                        padding: 0;
                        min-height: auto;
                        background: none;
                    }
                    .report-controls {
                        display: none;
                    }
                    .print-table th, .print-table td {
                        border: 1px solid #000;
                    }
                    .placeholder-row {
                        background-color: #f9f9f9;
                    }
                }
            `}</style>
            <div className="max-w-6xl mx-auto bg-white p-8 rounded-xl shadow-2xl">
                
                <h1 className="text-4xl font-extrabold text-gray-800 mb-2">
                    Konditorie Cafe & Cake PLC &mdash; Scoped Overtime Report
                </h1>
                
                {/* Report Metadata */}
                <div className="text-sm text-gray-600 mb-6 border-b pb-4">
                    <p className="font-semibold text-base mb-1">
                        Month: <span className="text-amber-700">{displayMonth}</span>    
                        &bull; Branch: <span className="text-amber-700">{filters.branch}</span>    
                        &bull; Dept: <span className="text-amber-700">{filters.department}</span>
                    </p>
                    <p>Generated: {generatedDate}</p>
                    <p className="mt-2 text-lg font-bold text-green-700">Total Estimated Payout: {formatCurrency(totalPayout)}</p>
                </div>
                {/* Report Controls (Hidden in Print) */}
                <div className="report-controls flex gap-4 mb-6">
                    <button    
                        onClick={onPrint}
                        className="flex items-center gap-2 px-6 py-2 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition shadow-md"
                    >
                        <Printer size={18} /> Print Report
                    </button>
                    <button    
                        onClick={onBack}
                        className="flex items-center gap-2 px-6 py-2 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600 transition shadow-md"
                    >
                        <X size={18} /> Close
                    </button>
                </div>
                {/* Report Table */}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 print-table border border-gray-300">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dept</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {reportData.length > 0 ? (
                                reportData.map((record, index) => (
                                    <tr    
                                        key={record.id + '-' + index}    
                                        className={record.isPlaceholder ? 'placeholder-row text-gray-500' : 'text-gray-900'}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{record.date}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.branch}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{record.employeeName}</td>    
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.department || DEFAULT_DEPARTMENT}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.otType}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold">{record.hours}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right">{formatCurrency(record.amount)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                record.status === 'Approved' ? 'bg-green-100 text-green-800' :    
                                                record.status === 'Disapproved' ? 'bg-red-100 text-red-800' :    
                                                record.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 
                                                record.status === 'No OT Filed' ? 'bg-gray-200 text-gray-500' : 'bg-orange-100 text-orange-800'
                                            }`}>
                                                {record.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="8" className="px-6 py-10 text-center text-lg text-gray-500">No employees or records found matching the selected filters.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
// --------------------------------------------------------------------------------
export default function AdminDashboard() {
    // --- Secure Auth State from Context ---
    const { user: authUser, loading: authLoading } = useAuth();
    const currentUserId = authUser?.uid;
    const isAdmin = authUser?.role === 'admin';
    const isApprover = authUser?.role === 'approver';
    const isViewer = authUser?.role === 'viewer';

    // --- State (DB Instances & Data) ---
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null); 
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedBranch, setSelectedBranch] = useState(null);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [allEmployees, setAllEmployees] = useState([]);    
    const [allOtRecords, setAllOtRecords] = useState([]);    
    const [records, setRecords] = useState([]); 
    const [branches, setBranches] = useState([]);
    const [departments, setDepartments] = useState([]);    
    const [message, setMessage] = useState(null);
    // --- Report State ---
    const [isReportView, setIsReportView] = useState(false); 
    const [reportFilters, setReportFilters] = useState({}); 
    // --- Modal State ---
    const [showAddBranchModal, setShowAddBranchModal] = useState(false);
    const [editingBranch, setEditingBranch] = useState(null);
    const [showReportModal, setShowReportModal] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(null);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [editingKpi, setEditingKpi] = useState(null);    
    // --- Form State (Controlled Inputs) ---
    const [otDate, setOtDate] = useState('');
    const [otHours, setOtHours] = useState('');
    const [otType, setOtType] = useState('Working Day');
    const [otDescription, setOtDescription] = useState('');
    
    const showMessage = useCallback((msg) => {
        setMessage(msg);
        setTimeout(() => setMessage(null), 3000);
    }, []);

    // --- Firebase Initialization (Only setting DB/Auth instances) ---
    useEffect(() => {
        try {
            const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
            const authInst = getAuth(app);
            const dbInst = getFirestore(app);
            setLogLevel("Debug");
            setDb(dbInst);
            setAuth(authInst);
            // Relying on AuthProvider for sign-in status, just confirm DB is ready.
            setIsAuthReady(true);
        } catch (e) {
            console.error("Firebase init error", e);
        }
    }, []); 

    // --- Data Fetching (Listeners) ---
    
    // 1. Fetch Branches - (Unchanged, relies only on DB instance)
    useEffect(() => {
        if (!isAuthReady || !db) return; 
        setLoading(true);
        const branchesRef = collection(db, BRANCHES_COLLECTION);
        const unsubscribe = onSnapshot(branchesRef, (snapshot) => {
            const fetchedDocs = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().title || doc.data().name }));    
            
            const uniqueBranches = fetchedDocs
                .filter(doc => (doc.name || '').trim())
                .map(doc => ({ id: doc.id, name: doc.name.trim() }))
                .filter((v, i, a) => a.findIndex(t => (t.name === v.name)) === i)    
                .sort((a, b) => a.name.localeCompare(b.name));
            setBranches(uniqueBranches);
            setLoading(false);
        }, (error) => {
            console.error("Failed to load branches:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [isAuthReady, db]);

    // 2. Fetch Departments (Unchanged)
    useEffect(() => {
        if (!isAuthReady || !db) return; 
        const departmentsRef = collection(db, DEPARTMENTS_COLLECTION);
        const unsubscribe = onSnapshot(departmentsRef, (snapshot) => {
            const fetchedDepts = snapshot.docs.map(doc => doc.data());
            const uniqueDepartments = Array.from(new Set(fetchedDepts.map(d => d.title)))
                .filter(title => title);
            setDepartments(uniqueDepartments.sort());
        }, (error) => {
            console.error("Failed to load departments:", error);
        });
        return () => unsubscribe();
    }, [isAuthReady, db]);

    // 3. Fetch ALL Employee Master Records (Unchanged)
    useEffect(() => {
        if (!isAuthReady || !db) return;
        const allEmployeesRef = collection(db, EMPLOYEES_COLLECTION);
        const unsubscribe = onSnapshot(allEmployeesRef, (snapshot) => {
            const employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllEmployees(employees);
        }, (error) => {
            console.error("Failed to load all employees for reporting:", error);
        });
        return () => unsubscribe();
    }, [isAuthReady, db]);

    // 4. Fetch ALL Overtime Records (Unchanged)
    useEffect(() => {
        if (!isAuthReady || !db) return; 
        const allRecordsRef = collection(db, OT_RECORDS_COLLECTION);
        const unsubscribe = onSnapshot(allRecordsRef, (snapshot) => {
            const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllOtRecords(records);
        }, (error) => {
            console.error("Failed to load all OT records for reporting:", error);
        });
        return () => unsubscribe();
    }, [isAuthReady, db]);

    // 5. Fetch Employees for the selected branch (Master Data - local view) (Unchanged)
    const fetchEmployeesByBranch = useCallback(() => {
        if (!selectedBranch || !db) return;
        setLoading(true);
        const normalizedBranch = selectedBranch.trim();
        const employeesRef = query(collection(db, EMPLOYEES_COLLECTION), where('branch', '==', normalizedBranch));
        return onSnapshot(employeesRef, async (snapshot) => {
            const fetchedEmployees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Fetch KPI metrics for each employee
            const employeesWithMetrics = await Promise.all(fetchedEmployees.map(async (emp) => {
                try {
                    if (!emp.branch) return { ...emp, metrics: { punctuality: 50, efficiency: 50, speed: 50, teamwork: 50 } };
                    const kpiSnap = await getDoc(doc(db, KPI_SCORECARD_COLLECTION, emp.id));
                    return {
                        ...emp,
                        metrics: kpiSnap.exists() ? kpiSnap.data().metrics : { punctuality: 50, efficiency: 50, speed: 50, teamwork: 50 },
                    };
                } catch (e) {
                    console.error("Error fetching KPI for employee", emp.id, e);
                    return { ...emp, metrics: { punctuality: 50, efficiency: 50, speed: 50, teamwork: 50 } };
                }
            }));
            setEmployees(employeesWithMetrics);
            setLoading(false);
        }, (error) => {
            console.error("Failed to load employees:", error);
            showMessage(`Error loading employees: ${error.message}`);
            setLoading(false);
        });
    }, [selectedBranch, db, showMessage]);

    useEffect(() => {
        let unsubscribe;
        if (selectedBranch && isAuthReady && db) {
            unsubscribe = fetchEmployeesByBranch();
        }
        return () => unsubscribe && unsubscribe();
    }, [selectedBranch, fetchEmployeesByBranch, isAuthReady, db]);


    // 6. Fetch Overtime Records for the selected employee (specific, filtered list)
    useEffect(() => {
        if (!selectedEmployee?.id || !db || authLoading) {
            setRecords([]);
            return;
        }
        
        const employeeSalary = selectedEmployee.salary;
        const baseQuery = collection(db, OT_RECORDS_COLLECTION);
        let recordsRefQuery;
        
        // --- ROLE-BASED FILTERING LOGIC ---
        if (isAdmin || isApprover) {
            // Admin and Approver see ALL records for the selected employee
            recordsRefQuery = query(baseQuery, where('employeeId', '==', selectedEmployee.id));
        } else if (isViewer) {
            // Viewer only sees records submitted by them for this employee
            recordsRefQuery = query(
                baseQuery,
                where('employeeId', '==', selectedEmployee.id),
                where('submittedBy', '==', currentUserId)
            );
        } else {
             setRecords([]);
             return;
        }
        
        const unsubscribe = onSnapshot(recordsRefQuery, (snapshot) => {
            
            const recordsWithCalculatedAmount = snapshot.docs.map(doc => {
                const data = doc.data();
                
                let amount = data.amount;
                // FIX: If amount is missing or invalid, recalculate it for display
                if (typeof amount !== 'number' || isNaN(amount) || amount === 0) {
                    amount = calculateOTAmount(data.hours, data.otType, employeeSalary);
                }
                const status = data.status || (amount > 0 ? 'Data Inconsistent' : 'No Status');
                return { id: doc.id, ...data, amount, status };
            });
            setRecords(recordsWithCalculatedAmount);
        }, (error) => {
            console.error("Failed to load records:", error);
            showMessage(`Error loading records: ${error.message}`);
        });
        return () => unsubscribe();
    // FIX: Add all necessary auth/role dependencies
    }, [selectedEmployee, db, authLoading, currentUserId, isAdmin, isApprover, isViewer, showMessage]);


    // --- CRUD Handlers ---
    
    // BRANCH CRUD (Remains restricted by isAdmin from secure context)
    const handleAddBranch = useCallback(async (name) => {
        if (!isAdmin || !db) { showMessage('Only administrators can add branches.'); return; }
        try {
            await addDoc(collection(db, BRANCHES_COLLECTION), {
                title: name.trim(),
                avgScore: 0,    
                employeeCount: 0,
                createdAt: Timestamp.now()
            });
            showMessage(`Branch '${name.trim()}' added successfully.`);
        } catch (error) {
            console.error("ADD BRANCH FAILED:", error);
            showMessage(`Failed to add branch: ${error.message}. Check browser console for security rule errors.`);
        } finally {
            setShowAddBranchModal(false);
        }
    }, [isAdmin, db, showMessage]);

    const handleEditBranchSubmit = useCallback(async (branchId, newName) => {
        if (!isAdmin || !newName.trim() || !db) { showMessage('Invalid name or permissions.'); return; }
        try {
            const docRef = doc(db, BRANCHES_COLLECTION, branchId);
            await updateDoc(docRef, { title: newName.trim() });    
            showMessage(`Branch renamed to ${newName.trim()}. Note: Associated records may need a manual sync.`);
        } catch (error) {
            console.error("RENAME FAILED:", error);
            showMessage(`Failed to rename branch: ${error.message}. Check browser console for security rule errors.`);
        } finally {
            setEditingBranch(null);
        }
    }, [isAdmin, db, showMessage]);

    const handleDeleteBranchConfirmed = useCallback(async (branchDocId, branchName) => {
        if (!isAdmin || !db) { showMessage('Only administrators can delete branches.'); return; }
        try {
            const branchRef = doc(db, BRANCHES_COLLECTION, branchDocId);
            await deleteDoc(branchRef);
            
            showMessage(`Branch ${branchName} deleted successfully. Attempting to clean up related documents...`);
            const collectionsToClean = [
                EMPLOYEES_COLLECTION,    
                OT_PROFILE_COLLECTION,    
                KPI_SCORECARD_COLLECTION,    
                OT_RECORDS_COLLECTION,    
                DEPARTMENTS_COLLECTION    
            ];
            
            const batch = writeBatch(db);
            
            for (const colName of collectionsToClean) {
                const q = query(collection(db, colName), where("branch", "==", branchName));
                const snap = await getDocs(q);    
                
                if (snap.docs.length > 0) {
                    console.log(`Found ${snap.docs.length} documents in ${colName} to delete.`);
                    snap.docs.forEach(d => {
                        batch.delete(d.ref);
                    });
                }
            }
            
            await batch.commit();
            showMessage(`Branch ${branchName} and its related employee/record data deleted successfully.`);
            setSelectedBranch(null);    
        } catch (error) {
            console.error("DELETE FAILED:", error);
            showMessage(`Failed to delete branch: ${error.message}. Check browser console for security rule errors.`);
        } finally {
            setShowConfirmModal(null);
        }
    }, [isAdmin, db, showMessage]);

    // EMPLOYEE CRUD (Remains restricted by isAdmin from secure context)
    const handleAddEmployee = useCallback(async (e) => {
        e.preventDefault();
        const form = e.target;
        const name = form['emp-name'].value.trim();
        const role = form['emp-role'].value.trim();
        const salary = parseFloat(form['emp-salary'].value);
        if (!selectedBranch || !name || !role || isNaN(salary) || salary <= 0 || !db) {
            showMessage(`Please fill all fields and ensure DB is ready.`);
            return;
        }
        if (!isAdmin || !currentUserId) { // Use currentUserId
            showMessage(`Only administrators can add employees.`);
            return;
        }
        const newEmployeeId = crypto.randomUUID();
        const newEmployeeData = {
            name, role, salary, branch: selectedBranch.trim(), createdBy: currentUserId, standardHoursPerWeek: 40,
            metrics: { punctuality: 50, efficiency: 50, speed: 50, teamwork: 50 } // Default metrics
        };
        try {
            await syncEmployeeAcrossPortals(newEmployeeData, db, newEmployeeId, currentUserId);
            form.reset();
            showMessage('Employee added and synced across portals successfully.');
        } catch (error) {
            console.error("ADD EMPLOYEE & SYNC FAILED:", error);
            showMessage(`Failed to add employee: ${error.message}. Check browser console for security rule errors.`);
        }
    }, [isAdmin, db, selectedBranch, currentUserId, showMessage]);

    const handleEditEmployeeSubmit = useCallback(async (employeeId, updatedFields) => {
        if (!isAdmin || !db) { showMessage('Only administrators can edit employees.'); return; }
        const existingEmployee = employees.find(e => e.id === employeeId);
        if (!existingEmployee) {
            showMessage('Error: Existing employee data not found.');
            return;
        }
        const employeeData = {
            ...existingEmployee,
            ...updatedFields,
        };
        try {
            await syncEmployeeAcrossPortals(employeeData, db, employeeId, currentUserId);
            showMessage(`Employee ${updatedFields.name} updated and synced.`);
            setEditingEmployee(null);
        } catch (error) {
            console.error("EDIT EMPLOYEE & SYNC FAILED:", error);
            showMessage(`Failed to edit employee: ${error.message}. Check browser console for security rule errors.`);
        }
    }, [isAdmin, db, employees, currentUserId, showMessage]);

    // KPI Update Handler (Remains restricted by isAdmin from secure context)
    const handleUpdateKpiMetrics = useCallback(async (employeeId, updatedMetrics) => {
        if (!isAdmin || !db) { showMessage('Only administrators can update KPI metrics.'); return; }
        const employee = employees.find(e => e.id === employeeId);
        if (!employee) { showMessage('Error: Employee not found.'); return; }
        const newScore = calculateScore(updatedMetrics);
        try {
            // 1. Update the KPI Scorecard document
            await updateDoc(doc(db, KPI_SCORECARD_COLLECTION, employeeId), {
                metrics: updatedMetrics,
                score: newScore,
                updatedAt: Timestamp.now()
            });
            // 2. Trigger Recalc    
             await addDoc(collection(db, RECALC_COLLECTION), {
                branch: employee.branch,
                department: employee.department || DEFAULT_DEPARTMENT,
                timestamp: Timestamp.now(),
                type: 'KPI_UPDATE'
            });
            showMessage(`KPI metrics for ${employee.name} updated successfully. New Score: ${newScore.toFixed(1)}%.`);
        } catch (error) {
            console.error("UPDATE KPI FAILED:", error);
            showMessage(`Failed to update KPI: ${error.message}. Check browser console for security rule errors.`);
        } finally {
            setEditingKpi(null);
        }
    }, [isAdmin, db, employees, showMessage]);

    const executeDeleteEmployee = useCallback(async (employeeId, employeeName) => {
        if (!isAdmin || !db) { showMessage('Only administrators can delete employees.'); return; }
        const batch = writeBatch(db);
        let branch = '';
        let department = '';
        try {
            // 0. GET EMPLOYEE LOCATION BEFORE DELETING MASTER RECORD
            const empDoc = await getDoc(doc(db, EMPLOYEES_COLLECTION, employeeId));
            if (empDoc.exists()) {
                branch = empDoc.data().branch;
                department = empDoc.data().department || DEFAULT_DEPARTMENT;
            } else {
                const kpiDoc = await getDoc(doc(db, KPI_SCORECARD_COLLECTION, employeeId));
                if (kpiDoc.exists()) {
                    branch = kpiDoc.data().branch;
                    department = kpiDoc.data().department || DEFAULT_DEPARTMENT;
                }
            }
            
            // 1. Delete all associated records
            batch.delete(doc(db, EMPLOYEES_COLLECTION, employeeId));
            batch.delete(doc(db, OT_PROFILE_COLLECTION, employeeId));
            batch.delete(doc(db, KPI_SCORECARD_COLLECTION, employeeId));
            
            const otRecordsQuery = query(collection(db, OT_RECORDS_COLLECTION), where("employeeId", "==", employeeId));
            const otSnap = await getDocs(otRecordsQuery);
            otSnap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            
            // 2. TRIGGER AGGREGATE COUNT DECREMENT    
            if (branch && department) {
                let deptId;
                if (department === DEFAULT_DEPARTMENT) {
                    deptId = `${branch}-${DEFAULT_DEPARTMENT}-auto`;
                } else {
                    const deptQuery = query(collection(db, DEPARTMENTS_COLLECTION), where('branch', '==', branch), where('title', '==', department));
                    const deptSnap = await getDocs(deptQuery);
                    deptId = deptSnap.docs[0]?.id;
                }
                if (deptId) {
                    const deptRef = doc(db, DEPARTMENTS_COLLECTION, deptId);
                    const currentDeptSnap = await getDoc(deptRef);
                    if (currentDeptSnap.exists() && currentDeptSnap.data().employeeCount > 0) {
                        await updateDoc(deptRef, {
                            employeeCount: increment(-1),
                            updatedAt: Timestamp.now()
                        });
                    }
                }
                
                // 3. TRIGGER KPI SCORE RECALCULATION    
                await addDoc(collection(db, RECALC_COLLECTION), {
                    branch: branch,
                    department: department,
                    timestamp: Timestamp.now(),
                    type: 'DELETION_RECALC'
                });
            }
            showMessage(`Employee ${employeeName} and all linked data deleted.`);
            if (selectedEmployee?.id === employeeId) {
                setSelectedEmployee(null);
            }
        } catch (error) {
            console.error("DELETE EMPLOYEE FAILED:", error);
            showMessage(`Failed to delete employee: ${error.message}. Check browser console for security rule errors.`);
        } finally {
            setShowConfirmModal(null);
        }
    }, [isAdmin, db, selectedEmployee, showMessage]);

    // OVERTIME CRUD
    const handleClearForm = useCallback(() => {
        setOtDate(''); setOtHours(''); setOtType('Working Day'); setOtDescription('');
    }, []);

    const handleSubmitOT = useCallback(async (e) => {
        e.preventDefault();
        const employeeData = selectedEmployee;
        if (!employeeData?.salary || !db) { showMessage('Employee salary is missing or DB not ready.'); return; }
        if (!currentUserId) { showMessage('You must be logged in to submit overtime.'); return; } // Use currentUserId
        if (!otDate || !otHours || !otDescription) { showMessage('Please fill all form fields.'); return; }
        const hours = parseFloat(otHours);
        if (hours <= 0 || isNaN(hours)) {
             showMessage('Hours must be a positive number.');
            return;
        }
        // Use the new utility to calculate amount
        const amount = calculateOTAmount(hours, otType, employeeData.salary);
        try {
            await addDoc(collection(db, OT_RECORDS_COLLECTION), {
                branch: selectedBranch.trim(), employeeId: employeeData.id, employeeName: employeeData.name,
                date: otDate, hours: hours, otType: otType, description: otDescription.trim(),
                status: 'Pending', amount, submittedBy: currentUserId, timestamp: Timestamp.now() // Use currentUserId
            });
            handleClearForm();
            showMessage('Overtime submitted successfully.');
        } catch (error) {
            console.error("SUBMIT OT FAILED:", error);
            showMessage(`Failed to submit overtime: ${error.message}`);
        }
    }, [db, selectedEmployee, currentUserId, otDate, otHours, otDescription, otType, selectedBranch, showMessage, handleClearForm]);

    const handleUpdateOTStatus = useCallback(async (recordId, newStatus) => {
        // CRUCIAL: Only Approvers can approve/disapprove (as defined by the user's requirements and Firestore rules).
        if (!isApprover || !db) { 
            showMessage(`Only Approvers have permission to ${newStatus.toLowerCase()} OT.`); 
            return; 
        }
        
        const comment = "Status updated via dashboard action.";
        console.log(`OT Record ${recordId} status changing to ${newStatus} with comment: ${comment}`);
        try {
            await updateDoc(doc(db, OT_RECORDS_COLLECTION, recordId), {
                status: newStatus,
                managerComment: comment,
                approvedBy: currentUserId, // Use currentUserId
                approvalTimestamp: Timestamp.now()
            });
            showMessage(`OT marked as ${newStatus}.`);
        } catch (error) {
            showMessage(`Failed to update OT status: ${error.message}`);
        }
    }, [isApprover, db, currentUserId, showMessage]);

    const handleDeleteOTRecordConfirmed = useCallback(async (recordId) => {
        // NOTE: Admin has delete permissions via Firestore Rules, so this check is valid.
        if (!isAdmin || !db) {
            showMessage('Only admins can delete OT records.');
            return;
        }
        try {
            await deleteDoc(doc(db, OT_RECORDS_COLLECTION, recordId));
            showMessage('Overtime record deleted.');
        } catch (error) {
            console.error("DELETE OT RECORD FAILED:", error);
            showMessage(`Failed to delete overtime record: ${error.message}. Check browser console for security rule errors.`);
        } finally {
            setShowConfirmModal(null);
        }
    }, [isAdmin, db, showMessage]);

    const handlePrintReport = () => { window.print(); };

    // Report Generation Logic (Remains restricted by isAdmin from secure context)
    const handleGenerateReport = (filters) => {
        if (!isAdmin) { showMessage('Only administrators can generate reports.'); return; }
        
        setShowReportModal(false); 
        setReportFilters(filters);  
        setSelectedBranch(null);    
        setSelectedEmployee(null);  
        setIsReportView(true);      
        showMessage(`Report view generated for filters: ${filters.branch}, ${filters.department}, ${filters.month}.`);
    };

    // --- RENDER LOGIC ---
    if (!isAuthReady || authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-xl font-bold text-amber-700 animate-pulse">
                    Connecting to Employee Data...
                </div>
            </div>
        );
    }
    
    // Report View Renders first if active
    if (isReportView) {
        return (
            <OvertimeReportView    
                allEmployees={allEmployees} 
                records={allOtRecords}    
                filters={reportFilters}    
                onBack={() => setIsReportView(false)}    
                onPrint={handlePrintReport}    
                DEFAULT_DEPARTMENT={DEFAULT_DEPARTMENT}
                formatCurrency={formatCurrency}
            />
        );
    }
    if (!selectedBranch) {
        // --- Branch Selection View ---
        return (
            <div className="min-h-screen p-4 md:p-8 bg-gray-100 font-sans">
                {message && <div className="toast bg-amber-600 text-white p-3 rounded-xl fixed bottom-4 right-4 z-50 shadow-xl font-semibold">{message}</div>}
                <div className="flex justify-between items-center mb-6 border-b pb-3">
                    <h3 className="text-3xl font-extrabold text-gray-800">Branch Selection</h3>
                    <div className="flex gap-3">
                        <button
                            onClick={() => isAdmin ? setShowReportModal(true) : showMessage("Only administrators can generate reports.")}
                            className="flex items-center gap-1 px-4 py-2 bg-gray-700 text-white rounded-xl font-semibold shadow-md hover:bg-gray-800 transition"
                        >
                            <Printer size={16} /> Reports
                        </button>
                        {/* Only Admin can add branches */}
                        {isAdmin && <button onClick={() => setShowAddBranchModal(true)} className="px-4 py-2 bg-[#8c5d4f] text-white rounded-xl font-semibold shadow-md hover:bg-[#7a4f45] transition">+ Add Branch</button>}
                    </div>
                </div>
                {loading ? <p className="text-center py-10 text-lg text-amber-700">Loading branches...</p> : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {branches.map(branch => (
                            <div key={branch.id} className="relative group">
                                {editingBranch === branch.id ? (
                                    <input
                                        type="text"
                                        defaultValue={branch.name}
                                        onBlur={(e) => handleEditBranchSubmit(branch.id, e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleEditBranchSubmit(branch.id, e.target.value)}
                                        autoFocus
                                        className="w-full p-4 border-2 border-amber-600 rounded-xl shadow-lg font-bold text-center"
                                    />
                                ) : (
                                    <button
                                        onClick={() => setSelectedBranch(branch.name)}
                                        className="w-full bg-white rounded-xl shadow-lg p-8 text-center font-extrabold text-xl text-gray-700 hover:text-white hover:bg-amber-600 transition-all border-b-4 border-amber-300 hover:border-amber-800"
                                    >
                                        {branch.name}
                                    </button>
                                )}
                                {/* Only Admin sees edit/delete controls */}
                                {isAdmin && editingBranch !== branch.id && (
                                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setEditingBranch(branch.id); }}
                                            className="bg-amber-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-md hover:bg-amber-600"
                                            title="Edit Branch Name"
                                        >
                                            <Edit size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowConfirmModal({
                                                    type: 'deleteBranch',
                                                    payload: { id: branch.id, name: branch.name }
                                                });
                                            }}
                                            className="bg-red-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-md hover:bg-red-600"
                                            title="Delete Branch"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                        {branches.length === 0 && <p className="text-center text-gray-500 col-span-full">No branches found. Please add one.</p>}
                    </div>
                )}
                {/* Modals */}
                <GenerateReportModal
                    show={showReportModal}
                    branches={branches}
                    departments={departments}    
                    onClose={() => setShowReportModal(false)}
                    onGenerate={handleGenerateReport}    
                />
                <AddBranchModal
                    show={showAddBranchModal}
                    onClose={() => setShowAddBranchModal(false)}
                    onAdd={handleAddBranch}
                />
                {showConfirmModal?.type === 'deleteBranch' && (
                    <ConfirmationModal
                        show={true}
                        title={`Delete Branch: ${showConfirmModal.payload.name}`}
                        message={`WARNING: Deleting the branch will also delete ALL associated employee master records, KPI scorecards, OT profiles, and OT records. This cannot be undone.`}
                        onConfirm={() => handleDeleteBranchConfirmed(showConfirmModal.payload.id, showConfirmModal.payload.name)}
                        onCancel={() => setShowConfirmModal(null)}
                    />
                )}
            </div>
        );
    }
    if (selectedEmployee) {
        // --- Employee Overtime View ---
        const { salary, name, role } = selectedEmployee;
        const totalAmount = records
            .filter(r => r.status === 'Approved')
            .reduce((sum, r) => sum + (r.amount || 0), 0);
        return (
            <div className="min-h-screen p-4 md:p-8 bg-gray-100 font-sans">
                {message && <div className="toast bg-amber-600 text-white p-3 rounded-xl fixed bottom-4 right-4 z-50 shadow-xl font-semibold">{message}</div>}
                <button onClick={() => setSelectedEmployee(null)} className="mb-4 text-gray-600 hover:text-amber-700 flex items-center gap-1 transition">
                    &larr; Back to {selectedBranch} Employees
                </button>
                <div className="bg-white p-6 rounded-xl shadow-xl border-t-8 border-amber-600 mb-8">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-3xl font-extrabold text-[#8c5d4f]">{name}</h3>
                            <p className="text-lg font-medium text-gray-600">{role} | Salary: {formatCurrency(salary)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-gray-500">Total Approved OT Payout</p>
                            <p className="text-2xl font-extrabold text-green-600">{formatCurrency(totalAmount)}</p>
                        </div>
                    </div>
                    <p className="text-sm text-gray-500">Employee ID: <span className="font-mono text-xs text-gray-700">{selectedEmployee.id}</span></p>
                </div>
                {/* OT SUBMISSION FORM */}
                <form onSubmit={handleSubmitOT} className="bg-white p-6 rounded-xl shadow mb-8 border border-gray-200">
                    <h4 className="text-xl font-bold mb-4 text-gray-800">Submit New Overtime Request</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        {/* 1. Date */}
                        <div className="col-span-1">
                            <label className="block text-xs font-medium text-gray-700">Date</label>
                            <input type="date" name="ot-date" required className="input w-full p-2 border rounded-lg"
                                value={otDate} onChange={(e) => setOtDate(e.target.value)} />
                        </div>
                        {/* 2. Hours */}
                        <div className="col-span-1">
                            <label className="block text-xs font-medium text-gray-700">Hours</label>
                            <input type="number" step="0.1" name="ot-hours" placeholder="4.0" required className="input w-full p-2 border rounded-lg"
                                value={otHours} onChange={(e) => setOtHours(e.target.value)} />
                        </div>
                        {/* 3. OT Type */}
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-xs font-medium text-gray-700">Type</label>
                            <select name="ot-type" required className="input w-full p-2 border rounded-lg"
                                value={otType} onChange={(e) => setOtType(e.target.value)}>
                                {Object.keys(OT_MULTIPLIERS).map(e => <option key={e} value={e}>{e} (x{OT_MULTIPLIERS[e]})</option>)}
                            </select>
                        </div>
                        {/* 4. Submission Button */}
                        <div className="col-span-2 md:col-span-1 flex items-end">
                            <button type="submit" className="bg-amber-600 text-white w-full py-2 rounded-lg font-semibold hover:bg-amber-700 disabled:bg-gray-400" disabled={!salary}>
                                Submit OT
                            </button>
                        </div>
                    </div>
                    <textarea name="ot-description" rows="2" placeholder="Reason for overtime / description of work done" required className="input w-full mb-4 p-2 border rounded-lg"
                        value={otDescription} onChange={(e) => setOtDescription(e.target.value)} />
                </form>
                {/* Records List */}
                <div className="space-y-4">
                    <h4 className="text-xl font-bold text-gray-800 border-b pb-2">Overtime Records ({records.length})</h4>
                    {records.length === 0 && <p className="text-center text-gray-500 mt-8">No records found for this employee.</p>}
                    {records.sort((a, b) => new Date(b.date) - new Date(a.date)).map(e => (
                        <div key={e.id} className={`bg-white p-4 rounded-xl shadow border-l-8 ${GE_STATUS_CLASSES[e.status] || 'border-gray-500'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <p className="font-bold text-gray-900">{e.date} &mdash; {e.hours} hrs @ {e.otType}</p>
                                    <p className="text-amber-800 font-semibold text-sm mt-1">Estimated Payout: {formatCurrency(e.amount?.toFixed(2))}</p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                    e.status === 'Approved' ? 'bg-green-100 text-green-800' : 
                                    e.status === 'Disapproved' ? 'bg-red-100 text-red-800' : 
                                    e.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 
                                    'bg-orange-100 text-orange-800'
                                }`}>
                                    {e.status}
                                </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{e.description}</p>
                            
                            {/* Admin/Approver Actions Panel */}
                            {(isAdmin || isApprover) && (
                                <div className="mt-3 border-t pt-3 flex flex-wrap gap-2">
                                    <p className="w-full block text-xs text-gray-500 mb-1">Manager Comment: {e.managerComment || 'N/A'}</p>
                                    
                                    {e.status === 'Pending' && (
                                        <>
                                            {/* Approver can click; Admin sees it disabled */}
                                            <button 
                                                onClick={() => handleUpdateOTStatus(e.id, 'Approved')} 
                                                disabled={isAdmin} // Disabled if Admin
                                                className={`flex-1 py-1.5 rounded-lg text-sm transition ${
                                                    isAdmin ? 'bg-gray-400 text-white cursor-not-allowed' : 
                                                    'bg-green-600 text-white hover:bg-green-700'
                                                }`}
                                            >
                                                Approve {isAdmin && ' (Admin: Disabled)'}
                                            </button>
                                            <button 
                                                onClick={() => handleUpdateOTStatus(e.id, 'Disapproved')} 
                                                disabled={isAdmin} // Disabled if Admin
                                                className={`flex-1 py-1.5 rounded-lg text-sm transition ${
                                                    isAdmin ? 'bg-gray-400 text-white cursor-not-allowed' : 
                                                    'bg-red-600 text-white hover:bg-red-700'
                                                }`}
                                            >
                                                Disapprove {isAdmin && ' (Admin: Disabled)'}
                                            </button>
                                        </>
                                    )}
                                    {/* Only full admins can delete records entirely */}
                                    {isAdmin && (
                                        <button
                                            onClick={() => setShowConfirmModal({
                                                type: 'deleteOTRecord',
                                                payload: { id: e.id }
                                            })}
                                            className="bg-gray-200 text-gray-700 py-1.5 rounded-lg px-3 text-sm hover:bg-gray-300"
                                            title="Delete Record"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                {showConfirmModal?.type === 'deleteOTRecord' && (
                    <ConfirmationModal
                        show={true}
                        title="Delete Overtime Record"
                        message="Are you sure you want to permanently delete this overtime record? This action cannot be undone."
                        onConfirm={() => handleDeleteOTRecordConfirmed(showConfirmModal.payload.id)}
                        onCancel={() => setShowConfirmModal(null)}
                    />
                )}
            </div>
        );
    }
    // --- Branch Employee List View ---
    return (
        <div className="min-h-screen p-4 md:p-8 bg-gray-100 font-sans">
            {message && <div className="toast bg-amber-600 text-white p-3 rounded-xl fixed bottom-4 right-4 z-50 shadow-xl font-semibold">{message}</div>}
            <button onClick={() => setSelectedBranch(null)} className="mb-4 text-gray-600 hover:text-amber-700 flex items-center gap-1 transition">
                &larr; Back to Branches
            </button>
            <h3 className="text-3xl mb-6 font-extrabold text-gray-800">Employees at {selectedBranch}</h3>
            {/* Add Employee Form */}
            <div className="bg-white p-4 rounded-xl shadow mb-6 border border-gray-200">
                <form onSubmit={handleAddEmployee} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    <input name="emp-name" placeholder="Full name" required className="input p-2.5 border rounded-lg" />
                    <input name="emp-role" placeholder="Role" required className="input p-2.5 border rounded-lg" />
                    <input name="emp-salary" type="number" step="0.01" placeholder="Salary (ETB)" required className="input p-2.5 border rounded-lg col-span-2 md:col-span-1" />
                    <button type="submit" className="bg-green-600 text-white py-2.5 rounded-lg font-semibold hover:bg-green-700 col-span-2 md:col-span-1 lg:col-span-2" disabled={!isAdmin}>+ Add Employee</button>
                </form>
            </div>
            {loading ? <p className="text-center py-10 text-lg text-amber-700">Loading employees...</p> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {employees.map(e => (
                        <div key={e.id} className="bg-white p-4 rounded-xl shadow border-l-4 border-amber-600 flex justify-between items-center transition-all hover:bg-amber-50">
                            <div className="flex-1 cursor-pointer" onClick={() => setSelectedEmployee(e)}>
                                <p className="font-bold text-gray-900 truncate">{e.name}</p>
                                <p className="text-sm text-gray-600">{e.role}</p>
                                <p className="text-xs text-gray-500 italic">Dept: {e.department || DEFAULT_DEPARTMENT}</p>    
                                {e.salary && <p className="text-xs font-semibold text-amber-700">{formatCurrency(e.salary)}</p>}
                                <p className="text-xs font-semibold text-indigo-700 mt-1">KPI Score: {calculateScore(e.metrics).toFixed(1)}%</p>
                            </div>
                            {isAdmin && (
                                <div className="flex flex-col gap-2 ml-4">
                                    <button
                                        onClick={t => { t.stopPropagation(); setEditingKpi(e); }}
                                        className="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-2 py-1 rounded-lg font-medium flex items-center gap-1"
                                        title="Update KPI Metrics"
                                    >
                                        <Zap size={14} /> KPI
                                    </button>
                                    <button
                                        onClick={t => { t.stopPropagation(); setEditingEmployee(e); }}
                                        className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded-lg font-medium flex items-center gap-1"
                                        title="Edit Employee Details"
                                    >
                                        <Edit size={14} /> Details
                                    </button>
                                    <button
                                        onClick={t => {
                                            t.stopPropagation();
                                            setShowConfirmModal({
                                                type: 'deleteEmployee',
                                                payload: { id: e.id, name: e.name }
                                            });
                                        }}
                                        className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded-lg font-medium flex items-center gap-1"
                                        title="Delete Employee"
                                    >
                                        <Trash2 size={14} /> Delete
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                    {employees.length === 0 && <p className="text-center text-gray-500 col-span-full py-10">No employees found in this branch. Use the form above to add one!</p>}
                </div>
            )}
            {/* Edit Employee Modal */}
            <EditEmployeeModal
                show={!!editingEmployee}
                employee={editingEmployee}
                branches={branches}
                onClose={() => setEditingEmployee(null)}
                onSubmit={handleEditEmployeeSubmit}
            />
            {/* KPI Update Modal */}
            <UpdateKpiModal
                show={!!editingKpi}
                employee={editingKpi}
                onClose={() => setEditingKpi(null)}
                onSubmit={handleUpdateKpiMetrics}
            />
            {/* Employee Delete Confirmation Modal */}
            {showConfirmModal?.type === 'deleteEmployee' && (
                <ConfirmationModal
                    show={true}
                    title={`Delete Employee: ${showConfirmModal.payload.name}`}
                    message="WARNING: Deleting this employee will remove their master record, KPI scorecard, Overtime profile, and all associated OT records. This cannot be undone."
                    onConfirm={() => executeDeleteEmployee(showConfirmModal.payload.id, showConfirmModal.payload.name)}
                    onCancel={() => setShowConfirmModal(null)}
                />
            )}
        </div>
    );
}