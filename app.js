import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    orderBy,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Inicialización de Firebase
let db;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    updateFirebaseStatus(true);
} catch (error) {
    console.error("Error al inicializar Firebase:", error);
    updateFirebaseStatus(false, error.message);
}

// Estado Global
const ACCESS_PASSWORD = "Escuela711";
let ausenciasData = [];
let funcionariosPaCount = {};
let activeCardFilter = null;

function updateFirebaseStatus(success, errorMsg = "") {
    const statusDiv = document.getElementById('firebaseStatus');
    if (!statusDiv) return;

    if (success && firebaseConfig.apiKey !== "TU_API_KEY") {
        statusDiv.className = 'flex items-center gap-3 p-4 bg-emerald-50 rounded-lg border border-emerald-100';
        statusDiv.innerHTML = `
            <div class="h-3 w-3 rounded-full bg-emerald-500"></div>
            <p class="text-sm text-emerald-800 font-medium">Conectado a Firebase Cloud Firestore</p>
        `;
    } else if (firebaseConfig.apiKey === "TU_API_KEY") {
        statusDiv.className = 'flex items-center gap-3 p-4 bg-orange-50 rounded-lg border border-orange-100';
        statusDiv.innerHTML = `
            <div class="h-3 w-3 rounded-full bg-orange-400 animate-pulse"></div>
            <p class="text-sm text-orange-800 font-medium">Configuración pendiente: Edita <code class="bg-orange-100 px-1 rounded">firebase-config.js</code></p>
        `;
    } else {
        statusDiv.className = 'flex items-center gap-3 p-4 bg-red-50 rounded-lg border border-red-100';
        statusDiv.innerHTML = `
            <div class="h-3 w-3 rounded-full bg-red-500"></div>
            <p class="text-sm text-red-800 font-medium">Error de conexión: ${errorMsg}</p>
        `;
    }
}

// Inicialización de la App
document.addEventListener('DOMContentLoaded', () => {
    // Sistema de Acceso (Login)
    const overlay = document.getElementById('loginOverlay');
    const loginForm = document.getElementById('loginForm');
    const passwordInput = document.getElementById('loginPassword');
    const errorMsg = document.getElementById('loginError');
    const logoutBtn = document.getElementById('logoutBtn');

    const checkLogin = () => {
        if (localStorage.getItem('app_authenticated') === 'true') {
            overlay.classList.add('hidden');
            if (db && firebaseConfig.apiKey !== "TU_API_KEY") {
                fetchData();
            }
        } else {
            overlay.classList.remove('hidden');
        }
    };

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (passwordInput.value === ACCESS_PASSWORD) {
            localStorage.setItem('app_authenticated', 'true');
            errorMsg.classList.add('hidden');
            checkLogin();
        } else {
            errorMsg.classList.remove('hidden');
            passwordInput.value = '';
            passwordInput.focus();
        }
    });

    logoutBtn.addEventListener('click', () => {
        if (confirm('¿Cerrar sesión?')) {
            localStorage.removeItem('app_authenticated');
            window.location.reload();
        }
    });

    checkLogin();

    // Registro del Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then(reg => {
                console.log('SW registrado con éxito');
            }).catch(err => {
                console.log('Fallo el registro del SW', err);
            });
        });
    }

    // Event Listeners
    document.getElementById('refreshBtn').addEventListener('click', () => {
        const icon = document.querySelector('#refreshBtn i');
        icon.classList.add('fa-spin');
        // onSnapshot se encarga de la actualización, pero esto da feedback visual
        setTimeout(() => icon.classList.remove('fa-spin'), 1000);
    });

    document.getElementById('searchInput').addEventListener('input', renderTable);
    document.getElementById('filterType').addEventListener('change', renderTable);

    // Event Listeners para Cards
    document.getElementById('cardHoy').addEventListener('click', () => setCardFilter('hoy', 'Ausentes Hoy'));
    document.getElementById('cardManana').addEventListener('click', () => setCardFilter('manana', 'Ausentes Mañana'));
    document.getElementById('cardRetornos').addEventListener('click', () => setCardFilter('retornos', 'Retornos Inminentes'));
    document.getElementById('clearCardFilterBtn').addEventListener('click', () => setCardFilter(null, ''));

    // Modal
    const modal = document.getElementById('addRecordModal');
    document.getElementById('addRecordBtn').addEventListener('click', () => {
        resetModalState();
        modal.classList.remove('hidden');
        document.getElementById('formNombre').focus();
    });
    
    document.getElementById('closeModalBtn').addEventListener('click', () => {
        modal.classList.add('hidden');
        document.getElementById('addRecordForm').reset();
        hideFormFeedback();
    });

    document.getElementById('submitRecordBtn').addEventListener('click', submitRecord);

    // Migration Tool Listeners
    const migModal = document.getElementById('migrationModal');
    document.getElementById('openMigrationBtn').addEventListener('click', () => {
        migModal.classList.remove('hidden');
        const savedUrl = localStorage.getItem('ausencias_csv_url');
        if (savedUrl) document.getElementById('migrationCsvUrl').value = savedUrl;
    });
    document.getElementById('closeMigrationBtn').addEventListener('click', () => migModal.classList.add('hidden'));
    document.getElementById('startMigrationBtn').addEventListener('click', startMigration);
});

let currentEditId = null;

function resetModalState() {
    currentEditId = null;
    document.getElementById('addRecordForm').reset();
    
    // Fecha de aviso por defecto: Hoy
    document.getElementById('formFechaAviso').value = getChileDateStr(0);

    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus-circle mr-2"></i> Registrar Nueva Ausencia';
    const btn = document.getElementById('submitRecordBtn');
    btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Guardar en Firebase';
    btn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
    btn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
}

// Exportar funciones al objeto window para que funcionen desde el HTML (onclick)
window.editRecord = function(id, nombre, tipo, dias, inicio, termino, obs, fechaAviso) {
    const formatDateForInput = (dateStr) => {
        if (!dateStr) return '';
        // Firestore guarda ISO o strings, normalizamos
        let parts = dateStr.trim().split(/[-/]/);
        if (parts.length === 3) {
            if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
            return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
        }
        return '';
    };

    document.getElementById('formNombre').value = nombre;
    document.getElementById('formTipo').value = tipo;
    document.getElementById('formDias').value = dias.toString().replace(',', '.');
    document.getElementById('formInicio').value = formatDateForInput(inicio);
    document.getElementById('formTermino').value = formatDateForInput(termino);
    document.getElementById('formFechaAviso').value = formatDateForInput(fechaAviso);
    document.getElementById('formObs').value = obs;

    currentEditId = id;

    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit mr-2"></i> Editar Ausencia';
    const btn = document.getElementById('submitRecordBtn');
    btn.innerHTML = '<i class="fas fa-save mr-2"></i> Actualizar en Firebase';
    btn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
    btn.classList.add('bg-blue-600', 'hover:bg-blue-700');

    document.getElementById('addRecordModal').classList.remove('hidden');
};

window.deleteRecord = async function(id, nombre, inicio, termino) {
    if (!confirm(`¿Estás seguro de borrar el registro de:\n${nombre}\nDel ${inicio} al ${termino}?`)) {
        return;
    }

    showLoading();
    try {
        await deleteDoc(doc(db, "ausencias", id));
        // No es necesario llamar a fetchData, onSnapshot lo hará
    } catch (error) {
        console.error("Error al borrar:", error);
        alert("Error al borrar: " + error.message);
        hideLoading();
    }
};

function setCardFilter(filterValue, textLabel) {
    activeCardFilter = filterValue;
    const alertBox = document.getElementById('activeFilterAlert');
    const textSpan = document.getElementById('activeFilterText');
    
    if (filterValue) {
        textSpan.innerText = `Mostrando filtro: ${textLabel}`;
        alertBox.classList.remove('hidden');
        alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        alertBox.classList.add('hidden');
    }
    renderTable();
}

function hideFormFeedback() {
    const feedback = document.getElementById('formFeedback');
    feedback.classList.add('hidden');
}

function showFormFeedback(msg, isError = false) {
    const feedback = document.getElementById('formFeedback');
    feedback.innerText = msg;
    feedback.classList.remove('hidden');
    feedback.className = isError 
        ? 'rounded-lg p-3 text-sm font-bold text-center mt-4 bg-red-100 text-red-700 border border-red-200'
        : 'rounded-lg p-3 text-sm font-bold text-center mt-4 bg-blue-100 text-blue-700 border border-blue-200';
}

async function startMigration() {
    const url = document.getElementById('migrationCsvUrl').value.trim();
    if (!url) {
        alert("Por favor, ingresa una URL de CSV.");
        return;
    }

    const statusDiv = document.getElementById('migrationStatus');
    const startBtn = document.getElementById('startMigrationBtn');
    
    statusDiv.innerText = "Cargando datos...";
    statusDiv.className = "rounded-lg p-3 text-sm font-bold text-center mb-4 bg-blue-100 text-blue-700";
    statusDiv.classList.remove('hidden');
    startBtn.disabled = true;

    Papa.parse(url, {
        download: true,
        header: false,
        skipEmptyLines: true,
        complete: async function(results) {
            try {
                await processAndUploadMigration(results.data);
                statusDiv.innerText = "¡Migración completada con éxito!";
                statusDiv.className = "rounded-lg p-3 text-sm font-bold text-center mb-4 bg-emerald-100 text-emerald-700";
                setTimeout(() => {
                    document.getElementById('migrationModal').classList.add('hidden');
                    startBtn.disabled = false;
                }, 2000);
            } catch (err) {
                console.error(err);
                statusDiv.innerText = "Error en la migración: " + err.message;
                statusDiv.className = "rounded-lg p-3 text-sm font-bold text-center mb-4 bg-red-100 text-red-700";
                startBtn.disabled = false;
            }
        },
        error: function(err) {
            statusDiv.innerText = "Error al descargar el CSV.";
            statusDiv.className = "rounded-lg p-3 text-sm font-bold text-center mb-4 bg-red-100 text-red-700";
            startBtn.disabled = false;
        }
    });
}

async function processAndUploadMigration(data) {
    let headerRowIndex = -1;
    for (let i = 0; i < data.length; i++) {
        if (data[i].some(cell => typeof cell === 'string' && cell.trim().toUpperCase() === 'NOMBRE FUNCIONARIO')) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) throw new Error("Formato de CSV no reconocido (Falta 'NOMBRE FUNCIONARIO')");

    const headers = data[headerRowIndex].map(h => typeof h === 'string' ? h.trim().toUpperCase() : '');
    const colMap = {};
    headers.forEach((h, idx) => {
        if (h.includes('FECHA REGISTRO') || h.includes('FECHA AVISO')) colMap.fechaAviso = idx;
        if (h.includes('NOMBRE FUNCIONARIO') || h === 'NOMBRE') colMap.nombre = idx;
        if (h.includes('TIPO AUS') || h === 'TIPO') colMap.tipo = idx;
        if (h.includes('FECHA INICIO') || h === 'INICIO') colMap.inicio = idx;
        if (h.includes('FECHA TERMINO') || h.includes('FECHA TÉRMINO') || h === 'TERMINO') colMap.termino = idx;
        if (h.includes('N° HRS/DÍAS') || h.includes('N° HRS/DIAS') || h === 'DIAS') colMap.dias = idx;
        if (h.includes('OBSERVACIONES') || h === 'OBS') colMap.obs = idx;
    });

    const statusDiv = document.getElementById('migrationStatus');
    const records = [];

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length < 2) continue;

        const nombre = (row[colMap.nombre] || 'Desconocido').toString().trim();
        const fechaAviso = (row[colMap.fechaAviso] || '').toString().trim();
        const tipo = (row[colMap.tipo] || '').toString().trim();
        const inicio = (row[colMap.inicio] || '').toString().trim();
        const termino = (row[colMap.termino] || '').toString().trim();
        const obs = (row[colMap.obs] || '').toString().trim();
        
        let diasRaw = (row[colMap.dias] || '0').toString().trim();
        // Manejar fracciones como 1/2 o 1/4
        let dias = 0;
        if (diasRaw.includes('/')) {
            const [num, den] = diasRaw.split('/');
            dias = parseFloat(num) / parseFloat(den);
        } else {
            dias = parseFloat(diasRaw.replace(',', '.'));
        }
        if (isNaN(dias)) dias = 0;

        if (nombre === 'Desconocido' && tipo === '') continue;

        records.push({
            nombre, fechaAviso, tipo, dias, inicio, termino, obs,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    }

    // Subir a Firestore por lotes (batches) de 500 (límite de Firebase)
    const batchLimit = 450;
    for (let i = 0; i < records.length; i += batchLimit) {
        statusDiv.innerText = `Subiendo registros... (${i} de ${records.length})`;
        const chunk = records.slice(i, i + batchLimit);
        const uploadPromises = chunk.map(rec => addDoc(collection(db, "ausencias"), rec));
        await Promise.all(uploadPromises);
    }
}

async function submitRecord() {
    if (!db) {
        showFormFeedback('Error: Firebase no está configurado correctamente.', true);
        return;
    }

    const form = document.getElementById('addRecordForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const btn = document.getElementById('submitRecordBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';
    btn.disabled = true;

    // Normalizar fechas a DD/MM/YYYY para compatibilidad visual con la v1
    const formatToLocal = (dateStr) => {
        if(!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    };

    const payload = {
        nombre: document.getElementById('formNombre').value,
        fechaAviso: formatToLocal(document.getElementById('formFechaAviso').value),
        tipo: document.getElementById('formTipo').value,
        dias: parseFloat(document.getElementById('formDias').value),
        inicio: formatToLocal(document.getElementById('formInicio').value),
        termino: formatToLocal(document.getElementById('formTermino').value),
        obs: document.getElementById('formObs').value,
        updatedAt: serverTimestamp()
    };

    try {
        if (currentEditId) {
            await updateDoc(doc(db, "ausencias", currentEditId), payload);
        } else {
            payload.createdAt = serverTimestamp();
            await addDoc(collection(db, "ausencias"), payload);
        }
        
        btn.innerHTML = '<i class="fas fa-check mr-2"></i> ¡Guardado!';
        setTimeout(() => {
            document.getElementById('addRecordModal').classList.add('hidden');
            resetModalState();
            hideFormFeedback();
            btn.disabled = false;
        }, 1000);

    } catch (error) {
        console.error('Error al guardar:', error);
        showFormFeedback('Error: ' + error.message, true);
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Sincronización en tiempo real con Firestore
function fetchData() {
    showLoading();
    
    const q = query(collection(db, "ausencias"), orderBy("updatedAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        const data = [];
        const tiposAusencia = new Set();
        const funcionariosSet = new Set();
        funcionariosPaCount = {};

        snapshot.forEach((doc) => {
            const item = doc.data();
            const id = doc.id;
            
            const fInicio = parseDateString(item.inicio);
            const fTermino = parseDateString(item.termino);
            const errorFecha = (fInicio && fTermino && fTermino < fInicio);

            // Acumulación P.A.
            if (item.tipo && item.tipo.toUpperCase() === 'P.A.') {
                funcionariosPaCount[item.nombre] = (funcionariosPaCount[item.nombre] || 0) + (item.dias || 0);
            }

            if (item.tipo) tiposAusencia.add(item.tipo.toUpperCase());
            if (item.nombre) funcionariosSet.add(item.nombre);

            data.push({
                id: id,
                funcionario: item.nombre,
                fechaAviso: item.fechaAviso,
                tipo: item.tipo,
                dias: item.dias,
                diasStr: item.dias.toString(),
                inicio: fInicio,
                inicioStr: item.inicio,
                termino: fTermino,
                terminoStr: item.termino,
                obs: item.obs,
                errorFecha: errorFecha
            });
        });

        ausenciasData = data;
        updateFilterOptions(tiposAusencia);
        populateFuncionariosList(funcionariosSet);
        calculateDashboardMetrics();
        renderTable();
        hideLoading();
    }, (error) => {
        console.error("Error en onSnapshot:", error);
        showError("Error al conectar con Firestore: " + error.message);
        hideLoading();
    });
}

// --- Funciones de Procesamiento y UI (Mantenidas de la v1) ---

function parseDateString(dateStr) {
    if (!dateStr) return null;
    let parts = dateStr.trim().split(/[-/]/);
    if (parts.length !== 3) return null;
    if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
}

function getChileDateStr(offsetDays = 0) {
    const formatter = new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const now = new Date();
    if (offsetDays !== 0) now.setDate(now.getDate() + offsetDays);
    const parts = formatter.formatToParts(now);
    const dateObj = {};
    parts.forEach(p => dateObj[p.type] = p.value);
    return `${dateObj.year}-${dateObj.month}-${dateObj.day}`;
}

function populateFuncionariosList(funcionarios) {
    const list = document.getElementById('funcionariosList');
    if (!list) return;
    list.innerHTML = '';
    Array.from(funcionarios).sort().forEach(func => {
        const option = document.createElement('option');
        option.value = func;
        list.appendChild(option);
    });
}

function updateFilterOptions(tipos) {
    const select = document.getElementById('filterType');
    const currentValue = select.value;
    select.innerHTML = '<option value="">Todos los tipos</option>';
    Array.from(tipos).sort().forEach(tipo => {
        const option = document.createElement('option');
        option.value = tipo;
        option.textContent = tipo;
        select.appendChild(option);
    });
    if(Array.from(tipos).includes(currentValue)) select.value = currentValue;
}

function calculateDashboardMetrics() {
    const hoyStr = getChileDateStr(0);
    const mananaStr = getChileDateStr(1);
    const ausentesHoy = new Set();
    const ausentesManana = new Set();
    const retornos = new Set();

    ausenciasData.forEach(item => {
        if (!item.inicio || !item.termino || item.errorFecha) return;
        if (hoyStr >= item.inicio && hoyStr <= item.termino) ausentesHoy.add(item.funcionario);
        if (mananaStr >= item.inicio && mananaStr <= item.termino) ausentesManana.add(item.funcionario);
        if (item.termino === hoyStr) retornos.add(item.funcionario);
    });

    animateValue('countHoy', ausentesHoy.size);
    animateValue('countManana', ausentesManana.size);
    animateValue('countRetornos', retornos.size);
}

function renderTable() {
    const tbody = document.getElementById('dataTableBody');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filterType = document.getElementById('filterType').value;
    const hoyStr = getChileDateStr(0);
    const mananaStr = getChileDateStr(1);

    tbody.innerHTML = '';
    let filteredData = ausenciasData.filter(item => {
        const matchSearch = item.funcionario.toLowerCase().includes(searchTerm);
        const matchFilter = filterType === '' || item.tipo.toUpperCase() === filterType;
        let matchCard = true;
        if (activeCardFilter) {
            matchCard = false;
            if (!item.errorFecha && item.inicio && item.termino) {
                if (activeCardFilter === 'hoy' && hoyStr >= item.inicio && hoyStr <= item.termino) matchCard = true;
                else if (activeCardFilter === 'manana' && mananaStr >= item.inicio && mananaStr <= item.termino) matchCard = true;
                else if (activeCardFilter === 'retornos' && item.termino === hoyStr) matchCard = true;
            }
        }
        return matchSearch && matchFilter && matchCard;
    });

    if (filteredData.length === 0 && ausenciasData.length > 0) {
        document.getElementById('emptyIndicator').classList.remove('hidden');
    } else {
        document.getElementById('emptyIndicator').classList.add('hidden');
    }

    filteredData.sort((a, b) => {
        if (a.errorFecha && !b.errorFecha) return -1;
        if (!a.errorFecha && b.errorFecha) return 1;
        if (a.inicio && b.inicio) return a.inicio > b.inicio ? -1 : 1;
        return 0;
    });

    filteredData.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors duration-150 ease-in-out';
        const paCount = funcionariosPaCount[item.funcionario] || 0;
        const limitReached = paCount > 6;
        const avatarInitial = item.funcionario.charAt(0).toUpperCase();

        let statusHtml = '';
        if (item.errorFecha) {
            statusHtml = `<span class="px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full bg-red-100 text-red-700 border border-red-200 shadow-sm"><i class="fas fa-bug mr-1.5 mt-0.5"></i> Fechas Inválidas</span>`;
            tr.classList.add('bg-red-50/30');
        } else if (item.inicio && item.termino) {
            if (hoyStr >= item.inicio && hoyStr <= item.termino) statusHtml = `<span class="px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full bg-red-500 text-white shadow-sm"><i class="fas fa-user-times mr-1.5 mt-0.5"></i> Ausente Hoy</span>`;
            else if (mananaStr >= item.inicio && mananaStr <= item.termino) statusHtml = `<span class="px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full bg-orange-100 text-orange-700 border border-orange-200 shadow-sm">Ausente Mañana</span>`;
            else if (hoyStr > item.termino) statusHtml = `<span class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200">Finalizado</span>`;
            else statusHtml = `<span class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200 shadow-sm">Programado</span>`;
        }

        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-700 font-bold shadow-sm border border-blue-200">${avatarInitial}</div>
                    <div class="ml-4">
                        <div class="text-sm font-semibold text-slate-800 flex items-center gap-2">${item.funcionario} ${limitReached ? `<i class="fas fa-exclamation-triangle text-red-500 animate-pulse"></i>` : ''}</div>
                        <div class="text-xs text-slate-500">${paCount > 0 ? paCount + ' días P.A.' : 'Sin registro P.A.'}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap"><span class="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-bold bg-slate-100 text-slate-700 border border-slate-200">${item.tipo || 'N/A'}</span></td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-medium">${item.diasStr || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                <div class="flex flex-col gap-1">
                    <div class="text-slate-600"><i class="far fa-calendar-alt text-slate-400 mr-1 w-4"></i> ${item.inicioStr || '-'}</div>
                    <div class="text-slate-600"><i class="far fa-calendar-check text-slate-400 mr-1 w-4"></i> ${item.terminoStr || '-'}</div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-medium">
                ${item.fechaAviso || '-'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">${statusHtml}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                <button onclick="editRecord('${item.id}', '${escapeJS(item.funcionario)}', '${escapeJS(item.tipo)}', '${item.dias}', '${item.inicioStr}', '${item.terminoStr}', '${escapeJS(item.obs)}', '${item.fechaAviso}')" class="text-blue-500 hover:text-blue-700 bg-blue-50 px-3 py-1 rounded-lg mr-2"><i class="fas fa-edit"></i></button>
                <button onclick="deleteRecord('${item.id}', '${escapeJS(item.funcionario)}', '${item.inicioStr}', '${item.terminoStr}')" class="text-red-500 hover:text-red-700 bg-red-50 px-3 py-1 rounded-lg"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function showLoading() {
    document.getElementById('loadingIndicator').classList.remove('hidden');
    document.getElementById('dataTableBody').innerHTML = '';
}

function hideLoading() {
    document.getElementById('loadingIndicator').classList.add('hidden');
}

function showError(msg) {
    const errEl = document.getElementById('errorIndicator');
    errEl.classList.remove('hidden');
    document.getElementById('errorMessage').innerText = msg;
}

function animateValue(id, end) {
    const obj = document.getElementById(id);
    const start = parseInt(obj.innerText) || 0;
    if (start === end) return;
    let duration = 500;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) window.requestAnimationFrame(step);
        else obj.innerHTML = end;
    };
    window.requestAnimationFrame(step);
}

function escapeJS(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}
