import { 
    monitorAuth, login, logout, listenToRecords, 
    addRecord, updateRecord, deleteRecordById, getAllDocs 
} from "./firebase-core.js";

import { 
    renderTable, updateCharts, showLoading, hideLoading, 
    getChileDateStr, escapeJS 
} from "./ui-utils.js";

// Estado Global
let ausenciasData = [];
let currentEditId = null;
let activeCardFilter = null;

// --- Inicialización y Autenticación ---
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('loginOverlay');
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const errorMsg = document.getElementById('loginError');
    const logoutBtn = document.getElementById('logoutBtn');
    const darkModeBtn = document.getElementById('darkModeBtn');

    // Modo Oscuro
    const toggleDarkMode = () => {
        document.documentElement.classList.toggle('dark');
        const isDark = document.documentElement.classList.contains('dark');
        localStorage.setItem('dark_mode', isDark);
        darkModeBtn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        if (ausenciasData.length > 0) updateCharts(ausenciasData);
    };

    if (localStorage.getItem('dark_mode') === 'true') {
        document.documentElement.classList.add('dark');
        darkModeBtn.innerHTML = '<i class="fas fa-sun"></i>';
    }
    darkModeBtn.addEventListener('click', toggleDarkMode);

    // Monitoreo de Sesión
    monitorAuth((user) => {
        if (user) {
            overlay.classList.add('hidden');
            startSync();
        } else {
            overlay.classList.remove('hidden');
            ausenciasData = [];
            renderTable([]);
        }
    });

    // Login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await login(emailInput.value, passwordInput.value);
            errorMsg.classList.add('hidden');
        } catch (error) {
            errorMsg.classList.remove('hidden');
            passwordInput.value = '';
        }
    });

    // Logout
    logoutBtn.addEventListener('click', async () => {
        if (confirm('¿Cerrar sesión?')) await logout();
    });

    setupEventListeners();
});

function startSync() {
    showLoading();
    listenToRecords((snapshot) => {
        const data = [];
        const tiposAusencia = new Set();
        const funcionariosSet = new Set();
        let paTotal = 0;

        snapshot.forEach((doc) => {
            const item = doc.data();
            const id = doc.id;
            
            // Procesamiento de fechas para UI
            let fRegistroStr = '-';
            if (item.createdAt) fRegistroStr = item.createdAt.toDate().toLocaleDateString('es-CL');

            data.push({
                id,
                funcionario: item.nombre,
                fechaRegistro: fRegistroStr,
                tipo: item.tipo,
                dias: item.dias,
                diasStr: item.dias.toString(),
                inicioStr: item.inicio,
                terminoStr: item.termino,
                obs: item.obs || '',
                errorFecha: (new Date(item.termino) < new Date(item.inicio))
            });

            if (item.tipo) tiposAusencia.add(item.tipo);
            funcionariosSet.add(item.nombre);
            if (item.tipo && item.tipo.toUpperCase() === 'P.A.') paTotal += (item.dias || 0);
        });

        ausenciasData = data;
        updateUI(tiposAusencia, funcionariosSet, paTotal);
        hideLoading();
    });
}

function updateUI(tipos, funcionarios, paTotal) {
    // Actualizar select de filtros
    const filterSelect = document.getElementById('filterTipo');
    const currentFilter = filterSelect.value;
    filterSelect.innerHTML = '<option value="">Todos los tipos</option>';
    Array.from(tipos).sort().forEach(t => {
        filterSelect.innerHTML += `<option value="${t}">${t}</option>`;
    });
    filterSelect.value = currentFilter;

    // Actualizar datalist de nombres
    const datalist = document.getElementById('funcionariosList');
    datalist.innerHTML = '';
    Array.from(funcionarios).sort().forEach(n => {
        datalist.innerHTML += `<option value="${n}">`;
    });

    // Métricas
    document.getElementById('totalAusencias').innerText = ausenciasData.length;
    document.getElementById('totalPA').innerText = paTotal.toFixed(1);
    document.getElementById('totalFuncionarios').innerText = funcionarios.size;

    updateCharts(ausenciasData);
    renderTable(ausenciasData, activeCardFilter);
}

// --- Event Listeners y Modales ---
function setupEventListeners() {
    const modal = document.getElementById('addRecordModal');
    
    document.getElementById('addRecordBtn').addEventListener('click', () => {
        resetModalState();
        modal.classList.remove('hidden');
    });

    document.getElementById('closeModalBtn').addEventListener('click', () => modal.classList.add('hidden'));

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
            if (currentEditId) {
                await updateRecord(currentEditId, payload);
            } else {
                await addRecord(payload);
            }
            modal.classList.add('hidden');
        } catch (error) {
            alert("Error al guardar: " + error.message);
        }
    });

    document.getElementById('filterTipo').addEventListener('change', (e) => {
        renderTable(ausenciasData, e.target.value);
    });

    document.getElementById('exportCsvBtn').addEventListener('click', exportToCSV);
    document.getElementById('refreshBtn').addEventListener('click', () => window.location.reload());
    
    // Migración
    const migModal = document.getElementById('migrationModal');
    document.getElementById('openMigrationBtn').addEventListener('click', () => migModal.classList.remove('hidden'));
    document.getElementById('closeMigrationBtn').addEventListener('click', () => migModal.classList.add('hidden'));
    document.getElementById('startMigrationBtn').addEventListener('click', handleMigration);
    document.getElementById('deleteAllBtn').addEventListener('click', handleClearAll);
}

function resetModalState() {
    currentEditId = null;
    document.getElementById('addRecordForm').reset();
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus-circle mr-2"></i> Registrar Nueva Ausencia';
}

// --- Operaciones Globales (Export/Delete/Migrate) ---
window.editRecord = (id, nombre, tipo, dias, inicio, termino, obs) => {
    currentEditId = id;
    document.getElementById('formNombre').value = nombre;
    document.getElementById('formTipo').value = tipo;
    document.getElementById('formDias').value = dias;
    document.getElementById('formInicio').value = inicio;
    document.getElementById('formTermino').value = termino;
    document.getElementById('formObs').value = obs;
    
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit mr-2"></i> Editar Registro';
    document.getElementById('addRecordModal').classList.remove('hidden');
};

window.deleteRecord = async (id, nombre, inicio, termino) => {
    if (confirm(`¿Eliminar registro de ${nombre} (${inicio} al ${termino})?`)) {
        await deleteRecordById(id);
    }
};

async function handleClearAll() {
    if (confirm("¿Borrar TODO permanentemente?") && prompt("Escribe BORRAR") === "BORRAR") {
        const snapshot = await getAllDocs();
        const promises = [];
        snapshot.forEach(doc => promises.push(deleteRecordById(doc.id)));
        await Promise.all(promises);
        alert("Base de datos vaciada.");
    }
}

function exportToCSV() {
    if (ausenciasData.length === 0) return;
    const headers = ["Funcionario", "Tipo", "Dias", "Inicio", "Termino", "F. Registro", "Obs"];
    const csv = [headers.join(","), ...ausenciasData.map(d => [
        `"${d.funcionario}"`, `"${d.tipo}"`, d.dias, d.inicioStr, d.terminoStr, d.fechaRegistro, `"${d.obs}"`
    ].join(","))].join("\n");
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Backup_${getChileDateStr()}.csv`;
    a.click();
}

async function handleMigration() {
    const url = document.getElementById('migrationUrl').value;
    if (!url) return;
    
    const status = document.getElementById('migrationStatus');
    status.innerText = "Procesando...";
    status.classList.remove('hidden');

    Papa.parse(url, {
        download: true,
        header: true,
        complete: async (results) => {
            const records = results.data.filter(r => r.NOMBRE || r['NOMBRE FUNCIONARIO']).map(r => ({
                nombre: r.NOMBRE || r['NOMBRE FUNCIONARIO'],
                tipo: r.TIPO || r['TIPO AUSENCIA'],
                dias: parseFloat((r['N° DIAS/HRS'] || "0").replace('1/2', '0.5')),
                inicio: r.INICIO || r['FECHA INICIO'],
                termino: r.TERMINO || r['FECHA TERMINO'],
                obs: r.OBSERVACIONES || ''
            }));

            for (const rec of records) await addRecord(rec);
            status.innerText = "Migración completada.";
        }
    });
}
