import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs,
    enableIndexedDbPersistence, query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// --- UTILIDADES DE UI (Integradas para evitar fallos de carga) ---
const escapeJS = (str) => str ? str.replace(/'/g, "\\'").replace(/"/g, '\\"') : "";
const getChileDateStr = () => new Date().toISOString().split('T')[0];
const showLoading = () => document.getElementById('loadingOverlay').classList.remove('hidden');
const hideLoading = () => document.getElementById('loadingOverlay').classList.add('hidden');

let typeChartInstance = null;
let monthChartInstance = null;

// --- ESTADO GLOBAL ---
let db, auth;
let ausenciasData = [];
let currentEditId = null;

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey === "TU_API_KEY") {
            throw new Error("La configuración en firebase-config.js está incompleta o tiene el valor por defecto.");
        }

        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        enableIndexedDbPersistence(db).catch(err => console.warn("Offline off:", err.code));
        
        setupAuthListeners();
        setupEventListeners();
    } catch (error) {
        console.error("Error crítico de inicio:", error);
        alert("⚠️ ERROR DE CONFIGURACIÓN:\n\n" + error.message + "\n\nPor favor, verifica el archivo firebase-config.js");
        document.getElementById('firebaseStatus').classList.remove('hidden');
    }
});

function setupAuthListeners() {
    const overlay = document.getElementById('loginOverlay');
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const errorMsg = document.getElementById('loginError');
    const loginBtn = loginForm.querySelector('button[type="submit"]');

    onAuthStateChanged(auth, (user) => {
        if (user) {
            overlay.classList.add('hidden');
            document.getElementById('firebaseStatus').classList.add('hidden');
            startSync();
        } else {
            overlay.classList.remove('hidden');
            ausenciasData = [];
            renderTable([]);
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Verificando...';
        
        try {
            await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
            errorMsg.classList.add('hidden');
        } catch (error) {
            console.error("Error Auth:", error.code);
            errorMsg.classList.remove('hidden');
            if (error.code === 'auth/operation-not-allowed') {
                errorMsg.innerHTML = "Método de login desactivado en Firebase.";
            } else if (error.code === 'auth/network-request-failed') {
                errorMsg.innerHTML = "Sin conexión a internet o bloqueo de red.";
            } else {
                errorMsg.innerHTML = "Correo o contraseña incorrectos.";
            }
        } finally {
            loginBtn.disabled = false;
            loginBtn.innerHTML = 'Entrar <i class="fas fa-arrow-right ml-2"></i>';
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        if (confirm('¿Cerrar sesión?')) signOut(auth);
    });

    // Dark Mode
    const darkModeBtn = document.getElementById('darkModeBtn');
    const toggleDarkMode = () => {
        document.documentElement.classList.toggle('dark');
        const isDark = document.documentElement.classList.contains('dark');
        localStorage.setItem('dark_mode', isDark);
        darkModeBtn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        if (ausenciasData.length > 0) updateCharts();
    };
    if (localStorage.getItem('dark_mode') === 'true') {
        document.documentElement.classList.add('dark');
        darkModeBtn.innerHTML = '<i class="fas fa-sun"></i>';
    }
    darkModeBtn.addEventListener('click', toggleDarkMode);
}

function startSync() {
    showLoading();
    // Quitamos el orderBy del servidor para evitar que oculte documentos sin el campo createdAt
    const q = query(collection(db, "ausencias"));
    onSnapshot(q, (snapshot) => {
        const data = [];
        let paTotal = 0;
        const tipos = new Set();
        const funcionarios = new Set();

        snapshot.forEach((doc) => {
            const item = doc.data();
            let fReg = '-';
            let sortTimestamp = 0;

            if (item.createdAt) {
                const date = item.createdAt.toDate();
                fReg = date.toLocaleDateString('es-CL');
                sortTimestamp = date.getTime();
            }

            data.push({
                id: doc.id,
                funcionario: item.nombre,
                tipo: item.tipo,
                dias: item.dias,
                inicioStr: item.inicio,
                terminoStr: item.termino,
                fechaRegistro: fReg,
                sortTimestamp: sortTimestamp,
                obs: item.obs || '',
                errorFecha: (new Date(item.termino) < new Date(item.inicio))
            });

            if (item.tipo) tipos.add(item.tipo);
            funcionarios.add(item.nombre);
            if (item.tipo?.toUpperCase() === 'P.A.') paTotal += (item.dias || 0);
        });

        // Ordenar en el cliente por timestamp descendente
        data.sort((a, b) => b.sortTimestamp - a.sortTimestamp);

        ausenciasData = data;
        updateDashboard(tipos, funcionarios, paTotal);
        renderTable(data);
        updateCharts();
        hideLoading();
    }, (error) => {
        console.error("Error de Firestore:", error);
        hideLoading();
        if (error.code === 'permission-denied') {
            alert("⚠️ Error de Permisos: Revisa las Reglas de Firestore en tu consola de Firebase.");
        }
    });
}

function updateDashboard(tipos, funcionarios, paTotal) {
    document.getElementById('totalAusencias').innerText = ausenciasData.length;
    document.getElementById('totalPA').innerText = paTotal.toFixed(1);
    document.getElementById('totalFuncionarios').innerText = funcionarios.size;

    const filterSelect = document.getElementById('filterType');
    const current = filterSelect.value;
    filterSelect.innerHTML = '<option value="">Todos los tipos</option>';
    Array.from(tipos).sort().forEach(t => filterSelect.innerHTML += `<option value="${t}">${t}</option>`);
    filterSelect.value = current;

    const datalist = document.getElementById('funcionariosList');
    datalist.innerHTML = '';
    Array.from(funcionarios).sort().forEach(n => datalist.innerHTML += `<option value="${n}">`);
}

function renderTable(data) {
    const filterSelect = document.getElementById('filterType');
    const filter = filterSelect ? filterSelect.value : "";
    const tbody = document.getElementById('dataTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const filtered = filter ? data.filter(d => d.tipo === filter) : data;

    filtered.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-b border-gray-100 dark:border-slate-700 last:border-0";
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs mr-3">${item.funcionario.charAt(0)}</div>
                    <div class="text-sm font-semibold">${item.funcionario}</div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap"><span class="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-xs font-bold rounded-lg">${item.tipo}</span></td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${item.dias}</td>
            <td class="px-6 py-4 whitespace-nowrap text-xs">
                <div>${item.inicioStr}</div>
                <div class="text-slate-400">${item.terminoStr}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-xs text-slate-500">${item.fechaRegistro}</td>
            <td class="px-6 py-4 whitespace-nowrap">${item.errorFecha ? '<span class="text-red-500 text-xs font-bold">Error Fecha</span>' : '<span class="text-emerald-500 text-xs font-bold">Vigente</span>'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <button onclick="editRecord('${item.id}', '${escapeJS(item.funcionario)}', '${escapeJS(item.tipo)}', '${item.dias}', '${item.inicioStr}', '${item.terminoStr}', '${escapeJS(item.obs)}')" class="text-blue-500 mr-2"><i class="fas fa-edit"></i></button>
                <button onclick="deleteRecord('${item.id}', '${escapeJS(item.funcionario)}', '${item.inicioStr}', '${item.terminoStr}')" class="text-red-500"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateCharts() {
    const typeCounts = {};
    const monthCounts = Array(12).fill(0);

    ausenciasData.forEach(item => {
        if (item.tipo) typeCounts[item.tipo] = (typeCounts[item.tipo] || 0) + 1;
        const d = new Date(item.inicioStr);
        if (d.getFullYear() === 2026) monthCounts[d.getMonth()]++;
    });

    if (typeChartInstance) typeChartInstance.destroy();
    typeChartInstance = new Chart(document.getElementById('typeChart'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(typeCounts),
            datasets: [{ data: Object.values(typeCounts), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'] }]
        },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    if (monthChartInstance) monthChartInstance.destroy();
    monthChartInstance = new Chart(document.getElementById('monthChart'), {
        type: 'bar',
        data: {
            labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
            datasets: [{ label: 'Ausencias', data: monthCounts, backgroundColor: '#3b82f6' }]
        },
        options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
}

function setupEventListeners() {
    document.getElementById('addRecordBtn').addEventListener('click', () => {
        currentEditId = null;
        document.getElementById('addRecordForm').reset();
        document.getElementById('addRecordModal').classList.remove('hidden');
    });
    document.getElementById('closeModalBtn').addEventListener('click', () => document.getElementById('addRecordModal').classList.add('hidden'));
    
    document.getElementById('addRecordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            nombre: document.getElementById('formNombre').value,
            tipo: document.getElementById('formTipo').value,
            dias: parseFloat(document.getElementById('formDias').value),
            inicio: document.getElementById('formInicio').value,
            termino: document.getElementById('formTermino').value,
            obs: document.getElementById('formObs').value
        };
        try {
            if (currentEditId) await updateDoc(doc(db, "ausencias", currentEditId), payload);
            else await addDoc(collection(db, "ausencias"), { ...payload, createdAt: serverTimestamp() });
            document.getElementById('addRecordModal').classList.add('hidden');
        } catch (err) { alert("Error: " + err.message); }
    });

    document.getElementById('filterType').addEventListener('change', () => renderTable(ausenciasData));
    document.getElementById('exportCsvBtn').addEventListener('click', exportToCSV);
    document.getElementById('refreshBtn').addEventListener('click', () => window.location.reload());
    
    // Migración
    document.getElementById('openMigrationBtn').addEventListener('click', () => document.getElementById('migrationModal').classList.remove('hidden'));
    document.getElementById('closeMigrationBtn').addEventListener('click', () => document.getElementById('migrationModal').classList.add('hidden'));
    document.getElementById('startMigrationBtn').addEventListener('click', handleMigration);
    document.getElementById('deleteAllBtn').addEventListener('click', async () => {
        if (confirm("¿Borrar TODO?") && prompt("Escribe BORRAR") === "BORRAR") {
            const snap = await getDocs(collection(db, "ausencias"));
            for (const d of snap.docs) {
                await deleteDoc(doc(db, "ausencias", d.id));
            }
        }
    });
}

// --- Globales para HTML ---
window.editRecord = (id, nombre, tipo, dias, inicio, termino, obs) => {
    currentEditId = id;
    document.getElementById('formNombre').value = nombre;
    document.getElementById('formTipo').value = tipo;
    document.getElementById('formDias').value = dias;
    document.getElementById('formInicio').value = inicio;
    document.getElementById('formTermino').value = termino;
    document.getElementById('formObs').value = obs;
    document.getElementById('addRecordModal').classList.remove('hidden');
};

window.deleteRecord = async (id, nombre) => {
    if (confirm(`¿Borrar registro de ${nombre}?`)) await deleteDoc(doc(db, "ausencias", id));
};

function exportToCSV() {
    const headers = ["Funcionario", "Tipo", "Dias", "Inicio", "Termino", "Obs"];
    const csv = [headers.join(","), ...ausenciasData.map(d => [d.funcionario, d.tipo, d.dias, d.inicioStr, d.terminoStr, d.obs].join(","))].join("\n");
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `Backup_${getChileDateStr()}.csv`;
    a.click();
}

async function handleMigration() {
    const urlInput = document.getElementById('migrationCsvUrl');
    const url = urlInput ? urlInput.value : "";
    if (!url) return;
    
    const status = document.getElementById('migrationStatus');
    status.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Procesando...';
    status.classList.remove('hidden');

    Papa.parse(url, {
        download: true, header: true,
        complete: async (res) => {
            let count = 0;
            for (const r of res.data) {
                if (r.NOMBRE || r['NOMBRE FUNCIONARIO']) {
                    await addDoc(collection(db, "ausencias"), {
                        nombre: r.NOMBRE || r['NOMBRE FUNCIONARIO'],
                        tipo: r.TIPO || r['TIPO AUSENCIA'],
                        dias: parseFloat((r['N° DIAS/HRS'] || "0").replace('1/2', '0.5')),
                        inicio: r.INICIO || r['FECHA INICIO'],
                        termino: r.TERMINO || r['FECHA TERMINO'],
                        createdAt: serverTimestamp()
                    });
                    count++;
                }
            }
            status.innerHTML = `<i class="fas fa-check-circle mr-2"></i> Migrados ${count} registros.`;
        }
    });
}
