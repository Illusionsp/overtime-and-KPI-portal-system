import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { X, Trash2, ChevronRight, Edit, Printer } from "lucide-react";
import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  getDocs,
  writeBatch,
  Timestamp,
  setLogLevel
} from "firebase/firestore";

/* --------- CONFIG (same as your project env) ---------- */
// Global variables provided by the environment
const firebaseConfig = typeof __firebase_config !== "undefined" ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== "undefined" ? __app_id : "default-app-id";
const initialAuthToken = typeof __initial_auth_token !== "undefined" ? __initial_auth_token : null;

/* ---------- Utilities ---------- */
const RATINGS = [
  { value: 25, label: "Poor (25%)" },
  { value: 50, label: "Good (50%)" },
  { value: 75, label: "Very Good (75%)" },
  { value: 100, label: "Excellent (100%)" }
];

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

// Simple Markdown to HTML converter for report display
function markdownToHtml(markdown) {
    let html = markdown
        .replace(/^###\s*(.*)$/gm, '<h4 class="text-xl font-semibold mt-4 mb-2">$1</h4>')
        .replace(/^##\s*(.*)$/gm, '<h3 class="text-2xl font-bold mt-6 mb-3 border-b pb-1">$1</h3>')
        .replace(/^#\s*(.*)$/gm, '<h2 class="text-3xl font-extrabold mb-4">$1</h2>')
        .replace(/^\*\s*(.*)$/gm, '<li class="ml-4 list-disc">$1</li>');

    // Convert ul
    html = html.replace(/(<li>.*?<\/li>)/gs, '<ul class="pl-4 list-disc space-y-1">$1</ul>');
    html = html.replace(/<\/ul>[\s\n]*<ul>/gs, '');

    // Convert bold 
    html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

    // Convert horizontal rules
    html = html.replace(/^---\s*$/gm, '<hr class="my-4 border-gray-300">');

    // Basic table support
    const lines = html.split('\n');
    let inTable = false;
    let tableHtml = '';
    const outputLines = [];

    lines.forEach(line => {
        if (line.trim().startsWith('|') && line.includes(':---')) {
            if (!inTable) {
                inTable = true;
                tableHtml = '<div class="overflow-x-auto"><table class="min-w-full divide-y divide-gray-300 border border-gray-200 rounded-lg"><thead><tr class="bg-gray-100">';
                // Assuming the line before the separator line is the header
                const headerLine = lines[outputLines.length - 1]; 
                const headers = headerLine.split('|').slice(1, -1).map(h => `<th class="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">${h.trim()}</th>`).join('');
                tableHtml += headers + '</tr></thead><tbody>';
                outputLines.pop(); 
            }
        } else if (inTable && line.trim().startsWith('|') && !line.includes('---')) {
            const cells = line.split('|').slice(1, -1).map(c => `<td class="px-4 py-2 whitespace-nowrap text-sm text-gray-700">${c.trim()}</td>`).join('');
            tableHtml += `<tr class="odd:bg-white even:bg-gray-50">${cells}</tr>`;
        } else if (inTable && !line.trim().startsWith('|')) {
            tableHtml += '</tbody></table></div>';
            outputLines.push(tableHtml);
            inTable = false;
            tableHtml = '';
            outputLines.push(line);
        } else {
            outputLines.push(line);
        }
    });
    
    if (inTable) {
        tableHtml += '</tbody></table></div>';
        outputLines.push(tableHtml);
    }

    return outputLines.join('\n').replace(/\n\n/g, '<p class="mt-2">').replace(/\n/g, '<br/>');
}


/* ---------- Modal & Card (unchanged visual parts) ---------- */
const Modal = ({ show, onClose, title, children, large = false }) => {
  if (!show) return null;
  const maxWidthClass = large ? 'max-w-4xl' : 'max-w-lg';
  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/50 z-[9990] flex items-center justify-center p-4 print-hide">
      <div className={`bg-white rounded-xl p-6 w-[95%] ${maxWidthClass} relative shadow-2xl`}>
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition">
          <X size={20} />
        </button>
        <h3 className="text-xl font-bold mb-4 text-gray-800 border-b pb-2">{title}</h3>
        <div className="text-gray-900">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const KpiCard = ({ title, employeeCount, score = 0, status, onNavigate, onDelete, onEdit, isAdmin }) => {
  let scoreColor = "text-red-500";
  let tagColor = "bg-red-100 text-red-600 border border-red-300";
  let progressClass = "w-0 bg-red-500";
  let scoreDisplay = Number(score).toFixed(1);

  if (score > 0) {
    if (score < 50) {
      scoreColor = "text-red-500";
      tagColor = "bg-red-100 text-red-600 border border-red-300";
      progressClass = "w-1/4 bg-red-500";
    } else if (score >= 50 && score < 75) {
      scoreColor = "text-yellow-600";
      tagColor = "bg-yellow-100 text-yellow-700 border border-yellow-300";
      progressClass = "w-1/2 bg-yellow-500";
    } else if (score >= 75 && score < 90) {
      scoreColor = "text-blue-600";
      tagColor = "bg-blue-100 text-blue-700 border border-blue-300";
      progressClass = "w-3/4 bg-blue-500";
    } else if (score >= 90) {
      scoreColor = "text-green-600";
      tagColor = "bg-green-100 text-green-700 border border-green-300";
      progressClass = "w-full bg-green-500";
    }
  } else {
    // Score is 0 or N/A
    scoreDisplay = "N/A";
    scoreColor = "text-gray-400";
    tagColor = "bg-gray-100 text-gray-500 border border-gray-300";
    progressClass = "w-0 bg-gray-400";
  }

  return (
    <article className="bg-white rounded-xl shadow-lg p-5 border border-gray-100 flex flex-col justify-between transition-all hover:shadow-xl transform hover:-translate-y-0.5">
      <div>
        <div className="flex justify-between items-start mb-1">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <div className="flex items-center gap-2">
            {isAdmin && onEdit && (
              <button onClick={onEdit} className="text-gray-400 hover:text-blue-600 p-1 rounded-full hover:bg-blue-50 transition" title={`Edit ${title}`}>
                <Edit size={16} />
              </button>
            )}
            {isAdmin && onDelete && (
              <button onClick={onDelete} className="text-gray-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50 transition" title={`Delete ${title}`}>
                <Trash2 size={16} />
              </button>
            )}
            {onNavigate && (
              <button onClick={onNavigate} className="text-indigo-500 hover:text-indigo-700 p-1 rounded-full hover:bg-indigo-50 transition" title={`View ${title} Details`}>
                <ChevronRight size={18} />
              </button>
            )}
          </div>
        </div>

        <p className="text-sm text-gray-500 mb-4">{employeeCount ?? 0} Employees Tracked</p>
        <div className="flex justify-between items-end">
          <span className={`text-4xl font-extrabold ${scoreColor}`}>{scoreDisplay}</span>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full shadow-sm ${tagColor}`}>
            {score > 0 ? "Aggregate Score" : "No Data"}
          </span>
        </div>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2 mt-4 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ease-in-out ${progressClass}`} style={{ width: `${score}%` }}></div>
      </div>
    </article>
  );
};

/* ---------- MAIN Component ---------- */
export default function KPIDashboard() {
  const [page, setPage] = useState({ name: "branches" });
  const [isAdmin] = useState(true);

  // firebase instances
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // data
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [scorecards, setScorecards] = useState([]);

  // Report generation state
  const [reportContent, setReportContent] = useState(null);
  const [reportScope, setReportScope] = useState('all'); // 'all' or specific branch title

  // modal & form
  const [modalData, setModalData] = useState({ type: null, payload: null });
  const [formData, setFormData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // collection paths (public data scope for a collaborative dashboard)
  const branchesColPath = `artifacts/${appId}/public/data/branches`;
  const departmentsColPath = `artifacts/${appId}/public/data/departments`;
  const employeesColPath = `artifacts/${appId}/public/data/employees`; 
  const scorecardsColPath = `artifacts/${appId}/public/data/kpi_scorecards`;
  const otProfilesColPath = `artifacts/${appId}/public/data/overtime_profiles`;


  /* ---------- Firebase init + auth ---------- */
  useEffect(() => {
    try {
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      const authInst = getAuth(app);
      const dbInst = getFirestore(app);
      setDb(dbInst);
      setAuth(authInst);
      setLogLevel("Debug");

      const unsub = onAuthStateChanged(authInst, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(authInst, initialAuthToken);
            } else {
              await signInAnonymously(authInst);
            }
          } catch (err) {
            console.error("Auth error:", err);
          }
        }
      });
      return () => unsub();
    } catch (e) {
      console.error("Firebase init error", e);
    }
  }, []);

  /* ---------- Real-time listeners ---------- */
  useEffect(() => {
    if (!db || !isAuthReady) return; 
    const bQuery = query(collection(db, branchesColPath));
    const dQuery = query(collection(db, departmentsColPath));
    const eQuery = query(collection(db, employeesColPath));
    const sQuery = query(collection(db, scorecardsColPath));

    const unsubBranches = onSnapshot(bQuery, (snap) => setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const unsubDepartments = onSnapshot(dQuery, (snap) => setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const unsubEmployees = onSnapshot(eQuery, (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const unsubScorecards = onSnapshot(sQuery, (snap) => setScorecards(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));

    return () => {
      unsubBranches(); unsubDepartments(); unsubEmployees(); unsubScorecards();
    };
  }, [db, isAuthReady]); 

  /* ---------- Recalc helper: department & branch ---------- */
  const recalcDeptAndBranch = async (branchName, departmentName) => {
    if (!db) return;
    
    // Normalize names to prevent query mismatch bugs
    const normalizedBranchName = branchName.trim();
    const normalizedDepartmentName = departmentName.trim();

    try {
      // 1. Department Recalc
      const deptQuery = query(
        collection(db, scorecardsColPath), 
        where("branch", "==", normalizedBranchName), 
        where("department", "==", normalizedDepartmentName)
      );
      const deptSnap = await getDocs(deptQuery);
      const deptScores = deptSnap.docs.map(d => d.data().score ?? 0);
      const deptAvg = deptScores.length ? average(deptScores) : 0;
      const deptEmployeeCount = new Set(deptSnap.docs.map(d => d.data().employeeId)).size; 

      const matchingDept = departments.find(d => d.title === normalizedDepartmentName && d.branch === normalizedBranchName);
      if (matchingDept?.id) {
        await updateDoc(doc(db, departmentsColPath, matchingDept.id), { avgScore: deptAvg, employeeCount: deptEmployeeCount, updatedAt: Timestamp.now() });
      }

      // 2. Branch Recalc
      // Branch Avg Score: calculated from all employee scorecards in the branch
      const branchQuery = query(collection(db, scorecardsColPath), where("branch", "==", normalizedBranchName));
      const branchSnap = await getDocs(branchQuery);
      const branchAvg = branchSnap.docs.map(d => d.data().score ?? 0).length ? average(branchSnap.docs.map(d => d.data().score ?? 0)) : 0;
      
      // Branch Employee Count: calculated by summing the EmployeeCount fields of all departments in that branch
      const departmentSnapsForBranch = await getDocs(query(collection(db, departmentsColPath), where("branch", "==", normalizedBranchName)));
      let branchEmployeeCount = 0;
      departmentSnapsForBranch.docs.forEach(doc => {
          branchEmployeeCount += doc.data().employeeCount || 0;
      });

      const matchingBranch = branches.find(b => b.title === normalizedBranchName);
      if (matchingBranch?.id) {
        await updateDoc(doc(db, branchesColPath, matchingBranch.id), { avgScore: branchAvg, employeeCount: branchEmployeeCount, updatedAt: Timestamp.now() });
      }
    } catch (err) {
      console.error("recalcDeptAndBranch error:", err);
    }
  };

  /* ---------- Score calculation ---------- */
  const calculateFinalScore = (metrics = {}) => {
    const vals = [
      Number(metrics.punctuality || 0),
      Number(metrics.efficiency || 0),
      Number(metrics.speed || 0),
      Number(metrics.teamwork || 0)
    ].filter(v => typeof v === "number");
    return vals.length ? average(vals) : 0;
  };

  /* ---------- SSOT sync helper ---------- */
  const syncEmployeeAcrossPortals = async (employeeId, employeeData, options = { recalc: true }) => {
    if (!db) throw new Error("DB not ready");
    const batch = writeBatch(db);
    
    const normalizedData = {
      ...employeeData,
      branch: employeeData.branch.trim(),
      department: employeeData.department.trim(),
    }
    
    try {
      const empRef = doc(db, employeesColPath, employeeId);
      
      batch.set(empRef, { ...normalizedData, updatedAt: Timestamp.now() }, { merge: true });

      const metrics = normalizedData.metrics ?? { punctuality: 50, efficiency: 50, speed: 50, teamwork: 50 };
      const finalScore = calculateFinalScore(metrics);
      const kpiRef = doc(db, scorecardsColPath, employeeId);
      batch.set(kpiRef, {
        employeeId,
        employeeName: normalizedData.name,
        branch: normalizedData.branch,
        department: normalizedData.department,
        metrics,
        score: finalScore,
        assignmentDate: Timestamp.now()
      }, { merge: true });

      const otRef = doc(db, otProfilesColPath, employeeId);
      batch.set(otRef, {
        employeeId,
        employeeName: normalizedData.name,
        branch: normalizedData.branch,
        department: normalizedData.department,
        standardHoursPerWeek: normalizedData.standardHoursPerWeek ?? 40,
        currentOTHours: 0,
        status: 'OT Tracking Ready',
        lastUpdated: Timestamp.now()
      }, { merge: true });

      await batch.commit();

      if (options.recalc && normalizedData.branch && normalizedData.department) {
        await recalcDeptAndBranch(normalizedData.branch, normalizedData.department);
      }
    } catch (err) {
      console.error("syncEmployeeAcrossPortals error:", err);
      throw err;
    }
  };

  /* ---------- Handlers: Employee CRUD ---------- */
  const handleAddEmployee = async (payload) => {
    if (!db) return;
    setIsSubmitting(true);
    try {
      const newId = crypto.randomUUID();

      const empDoc = {
        name: payload.name,
        title: payload.title,
        branch: payload.branch,
        department: payload.department,
        createdBy: userId ?? null,
        createdAt: Timestamp.now(),
        metrics: payload.metrics
      };

      await syncEmployeeAcrossPortals(newId, empDoc, { recalc: true });
    } catch (err) {
      console.error("handleAddEmployee:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditEmployee = async (employeeId, updated) => {
    if (!db) return;
    setIsSubmitting(true);
    try {
      const currentEmp = employees.find(e => e.id === employeeId) || {};

      const updatedEmployee = {
        ...currentEmp, 
        name: updated.name,
        title: updated.title,
        branch: updated.branch,
        department: updated.department,
        metrics: updated.metrics
      };
      
      await syncEmployeeAcrossPortals(employeeId, updatedEmployee, { recalc: true });
      
      const oldBranch = currentEmp.branch ? currentEmp.branch.trim() : null;
      const oldDepartment = currentEmp.department ? currentEmp.department.trim() : null;
      const newBranch = updated.branch.trim();
      const newDepartment = updated.department.trim();

      if (
        oldBranch && oldDepartment && 
        (oldBranch !== newBranch || oldDepartment !== newDepartment)
      ) {
        await recalcDeptAndBranch(oldBranch, oldDepartment);
      }

    } catch (err) {
      console.error("handleEditEmployee:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEmployee = async (employeeObj) => {
    if (!db) return;
    try {
      const batch = writeBatch(db);
      
      batch.delete(doc(db, employeesColPath, employeeObj.id));
      batch.delete(doc(db, scorecardsColPath, employeeObj.id));
      batch.delete(doc(db, otProfilesColPath, employeeObj.id));
      
      await batch.commit();

      const branchName = employeeObj.branch;
      const deptName = employeeObj.department;
      if (branchName && deptName) await recalcDeptAndBranch(branchName, deptName);
      
    } catch (err) {
      console.error("handleDeleteEmployee error:", err);
    }
  };


  /* ---------- Handlers: Branch CRUD ---------- */
  const handleEditBranch = async (branchId, newTitle) => {
    if (!db) return;
    setIsSubmitting(true);
    try {
      const oldBranch = branches.find(b => b.id === branchId);
      const oldTitle = oldBranch?.title;
      const normalizedNewTitle = newTitle.trim();

      if (!oldTitle || oldTitle === normalizedNewTitle) return;

      const batch = writeBatch(db);
      
      // 1. Update the Branch record itself
      batch.update(doc(db, branchesColPath, branchId), { title: normalizedNewTitle, updatedAt: Timestamp.now() });

      // 2. Update ALL associated Departments (cascading update)
      const deptQuery = query(collection(db, departmentsColPath), where("branch", "==", oldTitle));
      const deptSnap = await getDocs(deptQuery);
      deptSnap.docs.forEach(d => {
        batch.update(d.ref, { branch: normalizedNewTitle });
      });

      // 3. Update ALL associated Employee records (cascading update)
      const itemQueries = [employeesColPath, scorecardsColPath, otProfilesColPath].map(col => 
        query(collection(db, col), where("branch", "==", oldTitle))
      );
      
      for (const q of itemQueries) {
          const snap = await getDocs(q);
          snap.docs.forEach(d => batch.update(d.ref, { branch: normalizedNewTitle }));
      }

      await batch.commit();
      setPage({ name: "branches" }); // Navigate back to main view

    } catch (err) {
      console.error("handleEditBranch error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBranch = async (branchObj) => {
    if (!db) return;
    const branchTitle = branchObj.title.trim();
    
    // NOTE: This client-side cascading delete operation can be slow on large datasets.
    try {
      const batch = writeBatch(db);

      // 1. Get and delete associated Departments
      const deptQuery = query(collection(db, departmentsColPath), where("branch", "==", branchTitle));
      const deptSnap = await getDocs(deptQuery);
      deptSnap.docs.forEach(d => batch.delete(d.ref));

      // 2. Get and delete associated Employee records (Master, Scorecards, OT)
      const itemQueries = [employeesColPath, scorecardsColPath, otProfilesColPath].map(col => 
        query(collection(db, col), where("branch", "==", branchTitle))
      );
      
      for (const q of itemQueries) {
          const snap = await getDocs(q);
          snap.docs.forEach(d => batch.delete(d.ref));
      }

      // 3. Delete the Branch record itself
      batch.delete(doc(db, branchesColPath, branchObj.id));

      await batch.commit();
      setPage({ name: "branches" }); // Navigate back to main view

    } catch (err) {
      console.error("handleDeleteBranch error:", err);
    }
  };


  /* ---------- Handlers: Department CRUD ---------- */
  const handleEditDepartment = async (deptId, branchTitle, newTitle) => {
    if (!db) return;
    setIsSubmitting(true);
    try {
      const oldDept = departments.find(d => d.id === deptId);
      const oldTitle = oldDept?.title;
      const normalizedNewTitle = newTitle.trim();

      if (!oldTitle || oldTitle === normalizedNewTitle) return;

      const batch = writeBatch(db);

      // 1. Update the Department record itself
      batch.update(doc(db, departmentsColPath, deptId), { title: normalizedNewTitle, updatedAt: Timestamp.now() });

      // 2. Update ALL associated Employee records (cascading update)
      const itemQueries = [employeesColPath, scorecardsColPath, otProfilesColPath].map(col => 
        query(collection(db, col), where("branch", "==", branchTitle), where("department", "==", oldTitle))
      );

      for (const q of itemQueries) {
          const snap = await getDocs(q);
          snap.docs.forEach(d => batch.update(d.ref, { department: normalizedNewTitle }));
      }

      await batch.commit();

      // Recalculate scores and counts for both old and new department names (to clear old stats)
      await recalcDeptAndBranch(branchTitle, normalizedNewTitle);
      await recalcDeptAndBranch(branchTitle, oldTitle); 

      setPage({ name: "departments", branch: branchTitle }); // Navigate back
    } catch (err) {
      console.error("handleEditDepartment error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDepartment = async (deptObj) => {
    if (!db) return;
    const branchTitle = deptObj.branch.trim();
    const deptTitle = deptObj.title.trim();
    
    try {
      const batch = writeBatch(db);

      // 1. Get and delete associated Employee records (Master, Scorecards, OT)
      const itemQueries = [employeesColPath, scorecardsColPath, otProfilesColPath].map(col => 
        query(collection(db, col), where("branch", "==", branchTitle), where("department", "==", deptTitle))
      );
      
      for (const q of itemQueries) {
          const snap = await getDocs(q);
          snap.docs.forEach(d => batch.delete(d.ref));
      }

      // 2. Delete the Department record itself
      batch.delete(doc(db, departmentsColPath, deptObj.id));

      await batch.commit();

      // 3. Recalculate the parent Branch to update its count and score (it will find 0 employees for the deleted department)
      await recalcDeptAndBranch(branchTitle, deptTitle);

      setPage({ name: "departments", branch: branchTitle }); // Navigate back to department view
    } catch (err) {
      console.error("handleDeleteDepartment error:", err);
    }
  };


  /* ---------- Report Generation ---------- */
  const handleGenerateReport = (scope) => {
    // This function sets the state and opens the new modal, 
    // replacing the previous modal (selectReportScope).
    setReportScope(scope);
    const content = generatePerformanceReport(scope);
    setReportContent(content);
    openModal("viewReport");
  };

  const generatePerformanceReport = (scope) => {
    
    const scopeBranches = scope === 'all' ? branches : branches.filter(b => b.title === scope);
    const scopeDepartments = scope === 'all' ? departments : departments.filter(d => d.branch === scope);
    const scopeEmployees = scope === 'all' ? employees : employees.filter(e => e.branch === scope);
    const scopeScorecards = scopeEmployees.map(emp => scorecards.find(sc => sc.employeeId === emp.id)).filter(sc => sc);
    
    if (scopeBranches.length === 0) {
      return "No data available to generate a report for this scope. Please add branches, departments, and employees.";
    }

    const reportTitle = scope === 'all' ? "Company KPI Performance Report" : `${scope} Branch KPI Performance Report`;
    let report = `# ${reportTitle} (${new Date().toLocaleDateString()})\n\n`;
    report += `## Executive Summary\n`;
    
    const overallAvgScore = average(scopeScorecards.map(sc => sc.score || 0));
    const totalEmployees = scopeEmployees.length; // Use length of filtered employees for scope-accurate total
    
    report += `* **Scope:** ${scope === 'all' ? 'All Branches' : scope}\n`;
    report += `* **Total Employees Tracked:** ${totalEmployees}\n`;
    report += `* **Overall Average KPI Score:** **${overallAvgScore.toFixed(1)}%**\n\n`;
    report += `---\n\n`;

    report += `## Detailed Branch Breakdown\n\n`;

    scopeBranches.forEach(branch => {
      report += `### 🏢 Branch: ${branch.title} (${branch.avgScore.toFixed(1)}%)\n`;
      report += `* Employees: ${branch.employeeCount}\n`;

      const relevantDepartments = scopeDepartments.filter(d => d.branch === branch.title);
      
      if (relevantDepartments.length > 0) {
        report += `#### Departments in ${branch.title}\n`;
        relevantDepartments.forEach(dept => {
          report += `* **${dept.title}**: ${dept.avgScore.toFixed(1)}% (${dept.employeeCount} staff)\n`;
        });
      } else {
        report += `* No departments recorded for this branch.\n`;
      }
      report += `\n`;
    });
    
    report += `---\n\n`;
    report += `## Top 5 / Bottom 5 Employees (By KPI Score)\n\n`;
    
    // Combine employees and scorecards, then sort
    const employeeData = scopeEmployees.map(emp => {
        const sc = scopeScorecards.find(s => s.employeeId === emp.id);
        const metrics = sc?.metrics || {};
        const score = sc?.score || 0;
        return {
            name: emp.name,
            score: score,
            branch: emp.branch,
            department: emp.department,
            metrics // Include all individual metrics
        };
    }).sort((a, b) => b.score - a.score); // Sort descending

    if (employeeData.length > 0) {
        report += `| Rank | Employee | Score | Branch | Department |\n`;
        report += `| :---: | :--- | :---: | :--- | :--- |\n`;

        const top5 = employeeData.slice(0, 5);
        const bottom5 = employeeData.slice(-5).filter(e => !top5.includes(e) && e.score < top5[0].score).reverse();

        report += `**Top 5 Performers:**\n`;
        top5.forEach((e, index) => {
            report += `| ${index + 1} | ${e.name} | **${e.score.toFixed(1)}%** | ${e.branch} | ${e.department} |\n`;
        });
        
        if (bottom5.length > 0 && bottom5.length < employeeData.length) {
            report += `\n**Bottom ${bottom5.length} Performers:**\n`;
            bottom5.forEach((e, index) => {
                report += `| ${employeeData.length - bottom5.length + index + 1} | ${e.name} | ${e.score.toFixed(1)}% | ${e.branch} | ${e.department} |\n`;
            });
        }
        
        report += `\n\n## Complete Employee Score Register\n\n`;
        report += `| Name | Score | Punctuality | Efficiency | Speed | Teamwork | Branch | Department |\n`;
        report += `| :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- |\n`;
        
        // Output all employees for the complete register
        employeeData.forEach(e => {
            report += `| ${e.name} | **${e.score.toFixed(1)}%** | ${e.metrics.punctuality ?? '-'}% | ${e.metrics.efficiency ?? '-'}% | ${e.metrics.speed ?? '-'}% | ${e.metrics.teamwork ?? '-'}% | ${e.branch} | ${e.department} |\n`;
        });
        
    } else {
        report += "No employee score data available in this scope.\n";
    }

    report += `---\n\n`;
    report += `*Report scope: ${scope === 'all' ? 'All Branches' : scope} | Generated by KPI Dashboard on ${new Date().toLocaleString()}.*`;

    return report;
  };

  /* ---------- Print Handler ---------- */
  const handlePrintReport = () => {
    // 1. Temporarily add a class to the modal portal root for targeted printing.
    const modalRoot = document.querySelector('.fixed.inset-0.bg-black\\/50');
    if (modalRoot) {
      modalRoot.classList.add('printable-report-container');
    }
    
    // 2. Trigger the native browser print dialog (where the user selects "Save as PDF")
    window.print();
    
    // 3. Clean up the class after a short delay (for print dialog to start)
    setTimeout(() => {
        if (modalRoot) {
            modalRoot.classList.remove('printable-report-container');
        }
    }, 500);
  };


  /* ---------- Modal helpers (UI) ---------- */
  const openModal = (type, payload = {}) => {
    setModalData({ type, payload });
    if (type === "addEmployee" || type === "addBranch" || type === "addDepartment") {
        setFormData(p => ({ 
            ...p, 
            branchName: payload.title || payload.branch || "", 
            deptName: payload.department || "",
            // Employee metrics defaults for add
            punctuality: 50,
            efficiency: 50,
            speed: 50,
            teamwork: 50,
        }));
    } else if (type === "editBranch") {
        setFormData({ id: payload.id, newTitle: payload.title });
    } else if (type === "editDepartment") {
        setFormData({ id: payload.id, branch: payload.branch, newTitle: payload.title });
    } else if (type === "editEmployee") {
        const emp = payload;
        const sc = scorecards.find(s => s.employeeId === emp.id);
        setFormData({
            id: emp.id,
            name: emp.name,
            title: emp.title,
            branch: emp.branch,
            department: emp.department,
            punctuality: sc?.metrics?.punctuality ?? 50,
            efficiency: sc?.metrics?.efficiency ?? 50,
            speed: sc?.metrics?.speed ?? 50,
            teamwork: sc?.metrics?.teamwork ?? 50
        });
    } else if (type === "selectReportScope") {
        setFormData({ reportScope: 'all' });
    } else {
      setFormData({});
    }
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (!modalData.type || !db) return;
    setIsSubmitting(true);
    
    let shouldClose = true;

    try {
      if (modalData.type === "addEmployee" || modalData.type === "editEmployee") {
        const payload = {
          name: formData.name,
          title: formData.title,
          branch: formData.branch,
          department: formData.department,
          metrics: {
            punctuality: Number(formData.punctuality),
            efficiency: Number(formData.efficiency),
            speed: Number(formData.speed),
            teamwork: Number(formData.teamwork)
          }
        };

        // Validation
        if (!payload.name || !payload.branch || !payload.department) {
            console.error("Validation Error: Name, Branch, and Department are required.");
            setIsSubmitting(false);
            return; 
        }

        modalData.type === "addEmployee" ? await handleAddEmployee(payload) : await handleEditEmployee(formData.id, payload);
        
      } else if (modalData.type === "addBranch") {
        await addDoc(collection(db, branchesColPath), { title: formData.branchName.trim(), avgScore: 0, employeeCount: 0, createdAt: Timestamp.now() });
      } else if (modalData.type === "editBranch") {
        await handleEditBranch(formData.id, formData.newTitle);
      } else if (modalData.type === "addDepartment") {
        const branchContext = modalData.payload?.branch; 
        if (!branchContext) throw new Error("Branch context missing for new department.");
        await addDoc(collection(db, departmentsColPath), { 
          branch: branchContext.trim(), 
          title: formData.deptName.trim(), 
          avgScore: 0, 
          employeeCount: 0, 
          createdAt: Timestamp.now() 
        });
      } else if (modalData.type === "editDepartment") {
        await handleEditDepartment(formData.id, formData.branch, formData.newTitle);
      } else if (modalData.type === "selectReportScope") {
          // *** FIX HERE: Handle the report generation and modal opening directly ***
          handleGenerateReport(formData.reportScope);
          shouldClose = false; // Prevent the default closeModal outside the try/finally block
      }
      
    } catch (err) {
      console.error("modal submit error", err);
    } finally {
        setIsSubmitting(false);
        if (shouldClose) {
             closeModal();
        }
    }
  };
  
  const closeModal = () => {
    setModalData({ type: null, payload: null });
    setFormData({});
    setIsSubmitting(false);
  };
  
  const onFormChange = (e) => {
    const { name, value } = e.target;
    const val = ["punctuality", "efficiency", "speed", "teamwork"].includes(name) ? Number(value) : value;
    setFormData(p => ({ ...p, [name]: val }));
  };


  /* ---------- Pages (branch/department/employee UI) ---------- */
  const BranchOverview = () => {
    return (
      <section>
        <div className="flex justify-between items-center mb-6 border-b pb-3">
          <h2 className="text-3xl font-extrabold text-gray-800">Branch Performance Overview</h2>
          <div className="flex gap-3">
            <button onClick={() => openModal("selectReportScope")} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition shadow-md">
              Generate Report
            </button>
            {isAdmin && <button onClick={() => openModal("addBranch")} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold transition shadow-md">+ Add Branch</button>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {branches.map(b => (
            <KpiCard
              key={b.id}
              title={b.title}
              employeeCount={b.employeeCount ?? 0}
              score={b.avgScore ?? 0}
              status={b.avgScore ? undefined : "N/A"}
              onNavigate={() => setPage({ name: "departments", branch: b.title })}
              onDelete={() => openModal("deleteBranch", b)}
              onEdit={() => openModal("editBranch", b)}
              isAdmin={isAdmin}
            />
          ))}
        </div>
       {branches.length === 0 && <p className="text-gray-500 text-center py-10">No branches found. Please add a new branch to get started.</p>}
      </section>
    );
  };

  const DepartmentScores = ({ branch }) => {
    const relevant = departments.filter(d => d.branch === branch);
    return (
      <section>
        <div className="flex justify-between items-center mb-6 border-b pb-3">
          <div className="flex items-center gap-4">
            <button onClick={() => setPage({ name: "branches" })} className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition text-sm">
                <span className="text-lg">🏢</span> Branches
            </button>
            <h2 className="text-3xl font-extrabold text-gray-800">{branch} Departments</h2>
          </div>
          {isAdmin && <button onClick={() => openModal("addDepartment", { branch })} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold transition shadow-md">+ Add Department</button>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {relevant.map(d => (
            <KpiCard
              key={d.id}
              title={d.title}
              employeeCount={d.employeeCount ?? 0}
              score={d.avgScore ?? 0}
              status={d.avgScore ? undefined : "N/A"}
              onNavigate={() => setPage({ name: "employees", branch, department: d.title })}
              onDelete={() => openModal("deleteDepartment", d)}
              onEdit={() => openModal("editDepartment", d)}
              isAdmin={isAdmin}
            />
          ))}
        </div>
        {relevant.length === 0 && <p className="text-gray-500 text-center py-10">No departments found in this branch. Please add one.</p>}
      </section>
    );
  };

  const EmployeeList = ({ branch, department }) => {
    const relevant = employees.filter(e => e.branch === branch && e.department === department);
    return (
      <section>
        <div className="flex justify-between items-center mb-6 border-b pb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setPage({ name: "branches" })} className="flex items-center gap-2 px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-md font-medium text-sm transition">
                <span className="text-lg">🏢</span> Branches
            </button>
             <ChevronRight size={18} className="text-gray-500" />
            <button onClick={() => setPage({ name: "departments", branch })} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-md font-medium text-sm transition">
                {branch}
            </button>
            <ChevronRight size={18} className="text-gray-500" />
            <h2 className="text-2xl font-extrabold text-gray-800">{department} Employees</h2>
          </div>
          {isAdmin && <button onClick={() => openModal("addEmployee", { branch, department })} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold transition shadow-md">+ Add Employee</button>}
        </div>

        <div className="flex flex-col gap-3">
          {relevant.map(emp => {
            const sc = scorecards.find(s => s.employeeId === emp.id);
            const score = sc?.score ?? 0;
            const metrics = sc?.metrics ?? {};
            return (
              <div key={emp.id} className="bg-white rounded-xl p-5 shadow-lg border border-gray-100 flex justify-between items-center transition-all hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <h4 className="text-lg font-bold text-gray-900 truncate">{emp.name} <span className="text-sm font-normal text-gray-500">({emp.title})</span></h4>
                  <p className="text-xs text-gray-600 mt-1 space-x-2">
                    <span className="font-medium">Punctuality: <span className="font-normal text-indigo-600">{metrics.punctuality ?? "-"}%</span></span>
                    <span className="font-medium">Efficiency: <span className="font-normal text-indigo-600">{metrics.efficiency ?? "-"}%</span></span>
                    <span className="font-medium">Speed: <span className="font-normal text-indigo-600">{metrics.speed ?? "-"}%</span></span>
                    <span className="font-medium">Teamwork: <span className="font-normal text-indigo-600">{metrics.teamwork ?? "-"}%</span></span>
                  </p>
                </div>
                <div className="flex items-center gap-4 ml-4">
                  <div className={`text-3xl font-extrabold ${score >= 75 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                    {Number(score).toFixed(1)}%
                  </div>
                  {isAdmin && (
                    <>
                      <button onClick={() => openModal("editEmployee", emp)} className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg font-medium transition shadow">Edit</button>
                      <button onClick={() => handleDeleteEmployee(emp)} className="text-gray-400 hover:text-red-600 p-1 rounded-full transition" title="Delete Employee"><Trash2 size={20} /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {relevant.length === 0 && <p className="text-gray-500 text-center py-10">No employees found in the **{department}** department.</p>}
        </div>
      </section>
    );
  };

  /* ---------- Modal Renderer ---------- */
  const renderModal = () => {
    const { type, payload } = modalData;
    if (!type) return null;

    if (type === "selectReportScope") {
        return (
            <Modal show onClose={closeModal} title="Select Report Scope">
                <form onSubmit={handleModalSubmit}>
                    <div className="mb-4">
                        <label htmlFor="reportScope" className="block text-sm font-medium text-gray-700 mb-1">Which scope would you like to report on?</label>
                        <select id="reportScope" name="reportScope" value={formData.reportScope || 'all'} onChange={onFormChange}
                            className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" required>
                            <option value="all">All Branches (Company-Wide)</option>
                            {branches.map(b => <option key={b.id} value={b.title}>{b.title} Branch</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={closeModal} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
                            {isSubmitting ? "Generating..." : "Generate Report"}
                        </button>
                    </div>
                </form>
            </Modal>
        );
    }

    if (type === "viewReport") {

        return (
            // Note: The 'printable-report-container' class is used in the <style> block below
            // to target this specific modal for print media styling.
            <Modal show onClose={closeModal} title="KPI Performance Report" large={true}>
                <div className="bg-gray-50 p-4 rounded-lg max-h-[70vh] overflow-y-auto border border-gray-200">
                    {/* Render the markdown content */}
                    <div className="prose max-w-none text-gray-800 report-content" dangerouslySetInnerHTML={{ __html: markdownToHtml(reportContent) }}></div>
                </div>
                <div className="flex justify-end mt-4 gap-3 print-hide-button">
                    <button onClick={handlePrintReport} className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium">
                        <Printer size={16} /> Print / Save as PDF
                    </button>
                    <button onClick={closeModal} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition">Close</button>
                </div>
            </Modal>
        );
    }

    if (type === "addBranch" || type === "editBranch") {
        const isEdit = type === "editBranch";
        return (
            <Modal show onClose={closeModal} title={isEdit ? "Rename Branch" : "Add New Branch Location"}>
                <form onSubmit={handleModalSubmit}>
                    <div className="mb-4">
                        <label htmlFor="branchName" className="block text-sm font-medium text-gray-700 mb-1">{isEdit ? "New Branch Name" : "Branch Name"}</label>
                        <input id="branchName" name={isEdit ? "newTitle" : "branchName"} 
                            value={isEdit ? formData.newTitle || "" : formData.branchName || ""} 
                            onChange={onFormChange}
                            className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" required />
                    </div>
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={closeModal} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
                            {isSubmitting ? "Saving..." : (isEdit ? "Save Rename" : "Save Branch")}
                        </button>
                    </div>
                </form>
            </Modal>
        );
    }
    
    if (type === "deleteBranch") {
        return (
            <Modal show onClose={closeModal} title="Confirm Branch Deletion">
                <p className="text-red-700 bg-red-50 p-3 rounded-lg border border-red-200 mb-4">
                    <span className="font-bold">WARNING:</span> Deleting the **{payload.title}** branch will permanently delete all associated departments and employee records! This cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={closeModal} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition">Cancel</button>
                    <button type="button" onClick={() => { handleDeleteBranch(payload); closeModal(); }} disabled={isSubmitting} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50">
                        {isSubmitting ? "Deleting..." : "Confirm Delete"}
                    </button>
                </div>
            </Modal>
        );
    }

    if (type === "addDepartment" || type === "editDepartment") {
        const isEdit = type === "editDepartment";
        const branchContext = payload?.branch ?? formData.branch ?? "Selected Branch";

        return (
            <Modal show onClose={closeModal} title={isEdit ? "Rename Department" : `Add Department to: ${branchContext}`}>
                <form onSubmit={handleModalSubmit}>
                    <p className="text-sm text-gray-600 mb-3">{isEdit ? `Renaming department in **${branchContext}**.` : `Adding new department within **${branchContext}** branch.`}</p>
                    <div className="mb-4">
                        <label htmlFor="deptName" className="block text-sm font-medium text-gray-700 mb-1">{isEdit ? "New Department Name" : "Department Name"}</label>
                        <input id="deptName" name={isEdit ? "newTitle" : "deptName"} 
                            value={isEdit ? formData.newTitle || "" : formData.deptName || ""} 
                            onChange={onFormChange}
                            className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" required />
                    </div>
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={closeModal} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50">
                            {isSubmitting ? "Saving..." : (isEdit ? "Save Rename" : "Save Department")}
                        </button>
                    </div>
                </form>
            </Modal>
        );
    }
    
    if (type === "deleteDepartment") {
        return (
            <Modal show onClose={closeModal} title="Confirm Department Deletion">
                <p className="text-red-700 bg-red-50 p-3 rounded-lg border border-red-200 mb-4">
                    <span className="font-bold">WARNING:</span> Deleting the **{payload.title}** department will permanently delete all associated employee records.
                </p>
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={closeModal} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition">Cancel</button>
                    <button type="button" onClick={() => { handleDeleteDepartment(payload); closeModal(); }} disabled={isSubmitting} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50">
                        {isSubmitting ? "Deleting..." : "Confirm Delete"}
                    </button>
                </div>
            </Modal>
        );
    }
    
    // Fallthrough for Employee Modals
    if (type === "addEmployee" || type === "editEmployee") {
      const isEdit = type === "editEmployee";
      return (
        <Modal show onClose={closeModal} title={isEdit ? "Edit Employee Performance" : "Add New Employee"}>
          {/* ... (Employee Form UI - unchanged) ... */}
          <form onSubmit={handleModalSubmit}>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input name="name" value={formData.name || ""} onChange={onFormChange} className="w-full border border-gray-300 px-3 py-2 rounded-lg" required />
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
              <input name="title" value={formData.title || ""} onChange={onFormChange} className="w-full border border-gray-300 px-3 py-2 rounded-lg" required />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                    <select name="branch" value={formData.branch || ""} onChange={onFormChange} className="w-full border border-gray-300 px-3 py-2 rounded-lg" required>
                      <option value="">Select branch</option>
                      {branches.map((b) => <option key={b.id} value={b.title}>{b.title}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                    <select name="department" value={formData.department || ""} onChange={onFormChange} className="w-full border border-gray-300 px-3 py-2 rounded-lg" required>
                      <option value="">Select department</option>
                      {departments.filter(d => d.branch === (formData.branch || page.branch)).map(d => <option key={d.id} value={d.title}>{d.title}</option>)}
                    </select>
                </div>
            </div>
            
            <h4 className="font-semibold text-gray-800 border-t pt-3 mb-3">KPI Metrics (Performance Ratings)</h4>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Punctuality</label>
                <select name="punctuality" value={formData.punctuality} onChange={onFormChange} className="w-full border border-gray-300 px-3 py-2 rounded-lg">
                  {RATINGS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Efficiency</label>
                <select name="efficiency" value={formData.efficiency} onChange={onFormChange} className="w-full border border-gray-300 px-3 py-2 rounded-lg">
                  {RATINGS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Completion Speed</label>
                <select name="speed" value={formData.speed} onChange={onFormChange} className="w-full border border-gray-300 px-3 py-2 rounded-lg">
                  {RATINGS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teamwork & Communication</label>
                <select name="teamwork" value={formData.teamwork} onChange={onFormChange} className="w-full border border-gray-300 px-3 py-2 rounded-lg">
                  {RATINGS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t pt-4">
              <button type="button" onClick={closeModal} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
                {isSubmitting ? "Saving..." : (isEdit ? "Save Changes" : "Add Employee")}
              </button>
            </div>
          </form>
        </Modal>
      );
    }

    return null;
  };

  /* ---------- Main render ---------- */
  if (!isAuthReady) {
    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <div className="text-lg font-medium text-gray-600 animate-pulse">Loading dashboard...</div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 font-sans">
        {/*
          CRITICAL: Print-specific CSS to hide everything except the modal content
          when the print dialog is active. This allows the user to save the report
          as a PDF via the browser's native print function.
        */}
        <style dangerouslySetInnerHTML={{__html: `
            @media print {
                /* Hide the main dashboard container */
                body > #root > div {
                    display: none !important;
                }
                
                /* Target the modal backdrop element (where print-hide is removed) */
                .fixed.inset-0.bg-black\\/50 {
                    position: static !important;
                    display: block !important;
                    background: none !important;
                    box-shadow: none !important;
                    min-height: auto;
                    width: 100%;
                }
                
                /* Target the inner modal white box */
                .fixed.inset-0.bg-black\\/50 > div {
                    max-width: none !important;
                    width: 100% !important;
                    box-shadow: none !important;
                    padding: 0;
                    margin: 0;
                    border: none;
                    background: white; /* Ensure white background for PDF */
                }
                
                /* Hide modal chrome (close button, action buttons) */
                .fixed.inset-0.bg-black\\/50 .absolute,
                .fixed.inset-0.bg-black\\/50 .print-hide-button {
                    display: none !important;
                }
                
                /* Ensure content is properly padded and readable */
                .report-content {
                    margin: 0;
                    padding: 20px;
                }
            }
        `}} />
      <main className="max-w-7xl mx-auto">
        {page.name === "branches" && <BranchOverview />}
        {page.name === "departments" && <DepartmentScores branch={page.branch} />}
        {page.name === "employees" && <EmployeeList branch={page.branch} department={page.department} />}

        {renderModal()}
      </main>
    </div>
  );
}