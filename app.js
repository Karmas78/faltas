import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    doc, 
    updateDoc, 
    deleteDoc, 
    getDocs,
    enableIndexedDbPersistence,
    query, 
    orderBy,
    limit,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// Inicialización de Firebase
let db, auth;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    
    // Habilitar Persistencia Offline de Firestore
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.log("Persistencia falló: múltiples pestañas abiertas");
        } else if (err.code == 'unimplemented') {
            console.log("Persistencia no soportada por el navegador");
        }
    });

    updateFirebaseStatus(true);
} catch (error) {
    console.error("Error al inicializar Firebase:", error);
    updateFirebaseStatus(false, error.message);
}

// Estado Global
let ausenciasData = [];
let typeChartInstance = null;
let monthChartInstance = null;
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
    // Sistema de Acceso (Firebase Auth)
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
        updateCharts(); // Refrescar colores de gráficos
    };

    if (localStorage.getItem('dark_mode') === 'true') {
        document.documentElement.classList.add('dark');
        darkModeBtn.innerHTML = '<i class="fas fa-sun"></i>';
    }

    darkModeBtn.addEventListener('click', toggleDarkMode);

    onAuthStateChanged(auth, (user) => {
        if (user) {
            overlay.classList.add('hidden');
            if (db && firebaseConfig.apiKey !== "TU_API_KEY") {
                fetchData();
            }
        } else {
            overlay.classList.remove('hidden');
            ausenciasData = [];
            renderTable();
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value;
        const password = passwordInput.value;
        
        try {
            await signInWithEmailAndPassword(auth, email, password);
            errorMsg.classList.add('hidden');
        } catch (error) {
            console.error("Error de login:", error);
            errorMsg.classList.remove('hidden');
            passwordInput.value = '';
            passwordInput.focus();
        }
    });

    logoutBtn.addEventListener('click', async () => {
        if (confirm('¿Cerrar sesión?')) {
            try {
                await signOut(auth);
                window.location.reload();
            } catch (error) {
                console.error("Error al cerrar sesión:", error);
            }
        }
    });

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
    document.getElementById('deleteAllBtn').addEventListener('click', deleteAllRecords);
    document.getElementById('exportCsvBtn').addEventListener('click', exportToCSV);

    // Historial Listeners
    const logsModal = document.getElementById('logsModal');
    document.getElementById('viewLogsBtn').addEventListener('click', () => {
        logsModal.classList.remove('hidden');
        fetchLogs();
    });
    
    const closeLogs = () => logsModal.classList.add('hidden');
    document.getElementById('closeLogsBtn').addEventListener('click', closeLogs);
    document.getElementById('closeLogsBtn2').addEventListener('click', closeLogs);

    // Toggle Configuración
    document.getElementById('configToggleBtn').addEventListener('click', () => {
        const section = document.getElementById('configSection');
        if (section) section.classList.toggle('hidden');
    });

    // Resumen Listeners
    const sumModal = document.getElementById('summaryModal');
    document.getElementById('summaryBtn').addEventListener('click', () => {
        sumModal.classList.remove('hidden');
        generateSummary();
    });
    
    const closeSummary = () => sumModal.classList.add('hidden');
    document.getElementById('closeSummaryBtn').addEventListener('click', closeSummary);
    document.getElementById('closeSummaryBtn2').addEventListener('click', closeSummary);
});

let currentEditId = null;

function resetModalState() {
    currentEditId = null;
    document.getElementById('addRecordForm').reset();
    document.getElementById('formCargo').value = '';
    document.getElementById('formAvisaA').value = '';
    document.getElementById('formMedio').value = '';
    document.getElementById('formReemplazo').value = '';
    
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus-circle mr-2"></i> Registrar Nueva Ausencia';
    const btn = document.getElementById('submitRecordBtn');
    btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Guardar en Firebase';
    btn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
    btn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
}

// Exportar funciones al objeto window para que funcionen desde el HTML (onclick)
window.editRecord = function(id, nombre, tipo, dias, inicio, termino, obs, cargo, avisaA, medio, reemplazo) {
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
    document.getElementById('formObs').value = obs;
    document.getElementById('formCargo').value = cargo || '';
    document.getElementById('formAvisaA').value = avisaA || '';
    document.getElementById('formMedio').value = medio || '';
    document.getElementById('formReemplazo').value = reemplazo || '';

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
        
        // Registrar Log
        await addDoc(collection(db, "logs"), {
            usuario: auth.currentUser.email,
            accion: "ELIMINADO",
            funcionario: nombre,
            detalles: `${nombre} (${inicio} al ${termino})`,
            timestamp: serverTimestamp()
        });

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
                
                // Registrar Log de Migración
                await addDoc(collection(db, "logs"), {
                    usuario: auth.currentUser.email,
                    accion: "MIGRACIÓN",
                    funcionario: "SISTEMA",
                    detalles: `Se importaron ${results.data.length} filas desde CSV externo`,
                    timestamp: serverTimestamp()
                });

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
        if (h.includes('FECHA INICIO') || h === 'INICIO' || h.includes('INICIO/TÉRMIN')) colMap.inicio = idx;
        if (h.includes('FECHA TERMINO') || h.includes('FECHA TÉRMINO') || h === 'TERMINO' || h.includes('INICIO/TÉRMIN')) colMap.termino = idx;
        if (h.includes('N° HRS/DÍAS') || h.includes('N° HRS/DIAS') || h === 'DIAS') colMap.dias = idx;
        if (h.includes('OBSERVACIONES') || h === 'OBS') colMap.obs = idx;
        if (h.includes('PERSONA A QUIEN AVISA')) colMap.avisaA = idx;
        if (h.includes('MEDIO POR EL QUE AVISA')) colMap.medio = idx;
        if (h.includes('REEMPLAZO')) colMap.reemplazo = idx;
        if (h.includes('CARGO')) colMap.cargo = idx;
    });

    const statusDiv = document.getElementById('migrationStatus');
    const records = [];

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length < 2) continue;

        const nombre = (row[colMap.nombre] || 'Desconocido').toString().trim();
        const tipo = (row[colMap.tipo] || '').toString().trim();
        const obs = (row[colMap.obs] || '').toString().trim();
        const cargo = colMap.cargo !== undefined ? (row[colMap.cargo] || '').toString().trim() : '';
        const avisaA = colMap.avisaA !== undefined ? (row[colMap.avisaA] || '').toString().trim() : '';
        const medio = colMap.medio !== undefined ? (row[colMap.medio] || '').toString().trim() : '';
        const reemplazo = colMap.reemplazo !== undefined ? (row[colMap.reemplazo] || '').toString().trim() : '';

        let inicio = (row[colMap.inicio] || '').toString().trim();
        let termino = (row[colMap.termino] || '').toString().trim();

        // Manejo especial para columna combinada "FECHA INICIO/TÉRMIN"
        if (colMap.inicio === colMap.termino && inicio.includes('/')) {
            const separator = inicio.includes(' – ') ? ' – ' : (inicio.includes(' - ') ? ' - ' : (inicio.includes(' y ') ? ' y ' : null));
            if (separator) {
                const parts = inicio.split(separator);
                inicio = parts[0].trim();
                termino = parts[1].trim();
                if (!termino.includes('/') && inicio.includes('/')) {
                    const month = inicio.split('/')[1];
                    termino = termino + '/' + month;
                }
            }
        }

        
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

        // Intentar obtener la fecha de registro de la primera columna (row[0])
        const fechaRegistroStr = (row[0] || '').toString().trim();
        let createdAt = serverTimestamp();
        
        if (fechaRegistroStr) {
            const parts = fechaRegistroStr.split(/[-/]/);
            if (parts.length === 3) {
                let d, m, y;
                if (parts[0].length === 4) { // YYYY-MM-DD
                    [y, m, d] = parts;
                } else { // DD-MM-YYYY
                    [d, m, y] = parts;
                }
                const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
                if (!isNaN(dateObj.getTime())) {
                    createdAt = dateObj;
                }
            }
        }

        records.push({
            nombre, tipo, dias, inicio, termino, obs, cargo, avisaA, medio, reemplazo,
            createdAt: createdAt,
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

async function deleteAllRecords() {
    if (!confirm("⚠️ ¿ESTÁS SEGURO?\n\nEsto borrará permanentemente TODOS los registros de ausencias de Firebase. Esta acción no se puede deshacer.")) {
        return;
    }
    
    const confirmName = prompt("Para confirmar, escribe la palabra: BORRAR");
    if (confirmName !== "BORRAR") {
        alert("Confirmación incorrecta. No se borraron los datos.");
        return;
    }

    const statusDiv = document.getElementById('migrationStatus');
    statusDiv.innerText = "Borrando base de datos...";
    statusDiv.className = "rounded-lg p-3 text-sm font-bold text-center mb-4 bg-orange-100 text-orange-700";
    statusDiv.classList.remove('hidden');

    try {
        // En Firestore client-side hay que borrar uno por uno
        const q = query(collection(db, "ausencias"));
        const querySnapshot = await getDocs(q);
        
        const deletePromises = [];
        querySnapshot.forEach((docSnap) => {
            deletePromises.push(deleteDoc(doc(db, "ausencias", docSnap.id)));
        });

        await Promise.all(deletePromises);

        // Registrar Log de Borrado Total
        await addDoc(collection(db, "logs"), {
            usuario: auth.currentUser.email,
            accion: "BORRADO TOTAL",
            funcionario: "SISTEMA",
            detalles: "Se eliminaron todos los registros de la base de datos",
            timestamp: serverTimestamp()
        });

        statusDiv.innerText = "¡Base de datos vaciada con éxito!";
        statusDiv.className = "rounded-lg p-3 text-sm font-bold text-center mb-4 bg-emerald-100 text-emerald-700";
        setTimeout(() => statusDiv.classList.add('hidden'), 3000);
    } catch (err) {
        console.error(err);
        statusDiv.innerText = "Error al borrar: " + err.message;
        statusDiv.className = "rounded-lg p-3 text-sm font-bold text-center mb-4 bg-red-100 text-red-700";
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

    // Obtener valores para validar
    const nombre = document.getElementById('formNombre').value.trim();
    const inicioRaw = document.getElementById('formInicio').value;
    const terminoRaw = document.getElementById('formTermino').value;
    const dias = parseFloat(document.getElementById('formDias').value);

    // --- VALIDACIONES ---
    
    // 1. Validar Nombre
    if (!nombre) {
        showFormFeedback('Error: El nombre del funcionario es obligatorio.', true);
        return;
    }

    // 2. Validar Rango de Fechas
    if (inicioRaw && terminoRaw) {
        const fechaInicio = new Date(inicioRaw + "T12:00:00"); // Noon to avoid TZ issues
        const fechaTermino = new Date(terminoRaw + "T12:00:00");
        if (fechaInicio > fechaTermino) {
            showFormFeedback('Error: La fecha de inicio no puede ser posterior a la fecha de término.', true);
            return;
        }
    }

    // 3. Validar Días/Horas
    if (isNaN(dias) || dias <= 0) {
        showFormFeedback('Error: La cantidad de días/horas debe ser un número mayor a cero.', true);
        return;
    }

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
        tipo: document.getElementById('formTipo').value,
        dias: parseFloat(document.getElementById('formDias').value),
        inicio: formatToLocal(document.getElementById('formInicio').value),
        termino: formatToLocal(document.getElementById('formTermino').value),
        obs: document.getElementById('formObs').value,
        cargo: document.getElementById('formCargo').value,
        avisaA: document.getElementById('formAvisaA').value,
        medio: document.getElementById('formMedio').value,
        reemplazo: document.getElementById('formReemplazo').value,
        updatedAt: serverTimestamp()
    };

    try {
        if (currentEditId) {
            await updateDoc(doc(db, "ausencias", currentEditId), payload);
        } else {
            payload.createdAt = serverTimestamp();
            const newDoc = await addDoc(collection(db, "ausencias"), payload);
        }

        // Registrar Log
        await addDoc(collection(db, "logs"), {
            usuario: auth.currentUser.email,
            accion: currentEditId ? "EDITADO" : "CREADO",
            funcionario: payload.nombre,
            detalles: `${payload.tipo}: ${payload.inicio} al ${payload.termino}`,
            timestamp: serverTimestamp()
        });
        
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
    
    // Eliminamos el orderBy del servidor para evitar que oculte documentos sin updatedAt/createdAt
    const q = query(collection(db, "ausencias"));
    
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

            // Formatear Fecha Registro (createdAt)
            let fRegistroStr = '-';
            if (item.createdAt) {
                const date = item.createdAt.toDate();
                fRegistroStr = date.toLocaleDateString('es-CL');
            } else if (item.updatedAt) {
                const date = item.updatedAt.toDate();
                fRegistroStr = date.toLocaleDateString('es-CL');
            }

            // Acumulación P.A.
            if (item.tipo && item.tipo.toUpperCase() === 'P.A.') {
                funcionariosPaCount[item.nombre] = (funcionariosPaCount[item.nombre] || 0) + (item.dias || 0);
            }

            if (item.tipo) tiposAusencia.add(item.tipo.toUpperCase());
            if (item.nombre) funcionariosSet.add(item.nombre);

            data.push({
                id: id,
                funcionario: item.nombre,
                fechaRegistro: fRegistroStr,
                tipo: item.tipo,
                dias: item.dias,
                diasStr: item.dias.toString(),
                inicio: fInicio,
                inicioStr: item.inicio,
                termino: fTermino,
                terminoStr: item.termino,
                obs: item.obs || '',
                cargo: item.cargo || '',
                avisaA: item.avisaA || '',
                medio: item.medio || '',
                reemplazo: item.reemplazo || '',
                errorFecha: errorFecha
            });
        });

        ausenciasData = data;
        updateFilterOptions(tiposAusencia);
        populateFuncionariosList(funcionariosSet);
        calculateDashboardMetrics();
        updateCharts();
        renderTable();
        hideLoading();
    }, (error) => {
        console.error("Error en onSnapshot:", error);
        showError("Error al conectar con Firestore: " + error.message);
        hideLoading();
    });
}

async function fetchLogs() {
    const tbody = document.getElementById('logsTableBody');
    const loader = document.getElementById('logsLoading');
    
    tbody.innerHTML = '';
    loader.classList.remove('hidden');

    try {
        const q = query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(50));
        const querySnapshot = await getDocs(q);
        
        loader.classList.add('hidden');
        
        if (querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400 italic">No hay movimientos registrados aún.</td></tr>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const log = doc.data();
            const date = log.timestamp ? log.timestamp.toDate() : new Date();
            const dateStr = date.toLocaleString('es-CL', { 
                day: '2-digit', month: '2-digit', year: 'numeric', 
                hour: '2-digit', minute: '2-digit' 
            });

            let badgeColor = "bg-blue-100 text-blue-700";
            if (log.accion === "EDITADO") badgeColor = "bg-amber-100 text-amber-700";
            if (log.accion === "ELIMINADO") badgeColor = "bg-red-100 text-red-700";
            if (log.accion === "CREADO") badgeColor = "bg-emerald-100 text-emerald-700";

            const row = document.createElement('tr');
            row.className = "hover:bg-slate-50 transition-colors";
            row.innerHTML = `
                <td class="px-4 py-3 text-xs font-medium text-slate-500">${dateStr}</td>
                <td class="px-4 py-3 text-xs font-bold text-slate-700">${log.usuario || 'Anónimo'}</td>
                <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badgeColor}">
                        ${log.accion}
                    </span>
                </td>
                <td class="px-4 py-3">
                    <p class="text-xs font-bold text-slate-800">${log.funcionario || ''}</p>
                    <p class="text-[10px] text-slate-500">${log.detalles || ''}</p>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error("Error al obtener logs:", error);
        loader.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-red-500 font-bold">Error al cargar historial: ${error.message}</td></tr>`;
    }
}

// --- Funciones de Procesamiento, UI y Análisis ---

function updateCharts() {
    const typeCtx = document.getElementById('typeChart').getContext('2d');
    const monthCtx = document.getElementById('monthChart').getContext('2d');

    // Datos para Tipos
    const typeCounts = {};
    ausenciasData.forEach(item => {
        if (item.tipo) {
            const t = item.tipo.toUpperCase();
            typeCounts[t] = (typeCounts[t] || 0) + 1;
        }
    });

    // Datos para Meses (solo 2026)
    const monthCounts = Array(12).fill(0);
    ausenciasData.forEach(item => {
        if (item.inicio) {
            const date = new Date(item.inicio);
            if (date.getFullYear() === 2026) {
                monthCounts[date.getMonth()]++;
            }
        }
    });

    // Chart de Tipos (Doughnut)
    if (typeChartInstance) typeChartInstance.destroy();
    typeChartInstance = new Chart(typeCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(typeCounts),
            datasets: [{
                data: Object.values(typeCounts),
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });

    // Chart de Meses (Bar)
    if (monthChartInstance) monthChartInstance.destroy();
    monthChartInstance = new Chart(monthCtx, {
        type: 'bar',
        data: {
            labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
            datasets: [{
                label: 'N° Ausencias',
                data: monthCounts,
                backgroundColor: '#3b82f6',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            plugins: { legend: { display: false } }
        }
    });
}

function exportToCSV() {
    if (ausenciasData.length === 0) {
        alert("No hay datos para exportar.");
        return;
    }

    const headers = ["Funcionario", "Tipo", "Dias", "Inicio", "Termino", "Fecha Aviso", "Observaciones"];
    const rows = ausenciasData.map(item => [
        `"${item.funcionario}"`,
        `"${item.tipo}"`,
        item.dias,
        `"${item.inicioStr}"`,
        `"${item.terminoStr}"`,
        `"${item.fechaAviso || ''}"`,
        `"${item.obs.replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", `Backup_Ausencias_${getChileDateStr()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function parseDateString(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    let parts = dateStr.trim().split(/[-/]/);
    if (parts.length < 2) return null;
    
    // Si falta el año, asumimos 2026 (según contexto de la hoja)
    if (parts.length === 2) {
        parts.push("2026");
    }

    if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else {
        // Asumimos formato D/M/Y
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
    animateValue('countTotal', ausenciasData.length);
}

function renderTable() {
    const tbody = document.getElementById('dataTableBody');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filterType = document.getElementById('filterType').value;
    const hoyStr = getChileDateStr(0);
    const mananaStr = getChileDateStr(1);

    tbody.innerHTML = '';
    console.log(`Renderizando tabla: ${ausenciasData.length} registros totales.`);

    let filteredData = ausenciasData.filter(item => {
        const nombre = (item.funcionario || '').toLowerCase();
        const tipo = (item.tipo || '').toUpperCase();

        const matchSearch = nombre.includes(searchTerm);
        const matchFilter = filterType === '' || tipo === filterType;
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
        const funcionarioVal = item.funcionario || 'Sin Nombre';
        const avatarInitial = funcionarioVal.charAt(0).toUpperCase();

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
            <td class="px-4 py-3 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="flex-shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-700 font-bold shadow-sm border border-blue-200 text-xs">${avatarInitial}</div>
                    <div class="ml-3">
                        <div class="text-sm font-semibold text-slate-800 flex items-center gap-2">${item.funcionario} ${limitReached ? `<i class="fas fa-exclamation-triangle text-red-500 animate-pulse"></i>` : ''}</div>
                        <div class="text-[10px] text-slate-500 font-medium">${item.cargo || 'Sin cargo'}</div>
                    </div>
                </div>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <div class="flex flex-col">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 w-fit">${item.tipo || 'N/A'}</span>
                    <span class="text-xs text-slate-600 font-bold mt-1">${item.diasStr} días/hrs</span>
                </div>
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-[11px]">
                <div class="flex flex-col gap-0.5">
                    <div class="text-slate-600"><i class="far fa-calendar-alt text-slate-400 mr-1"></i> ${item.inicioStr || '-'}</div>
                    <div class="text-slate-600"><i class="far fa-calendar-check text-slate-400 mr-1"></i> ${item.terminoStr || '-'}</div>
                </div>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <div class="flex flex-col">
                    <div class="text-[11px] font-bold text-slate-700"><i class="fas fa-user-tie text-slate-400 mr-1"></i> ${item.avisaA || '-'}</div>
                    <div class="text-[10px] text-slate-500 italic">${item.medio || '-'}</div>
                </div>
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-[11px] text-slate-600">
                ${item.reemplazo || '-'}
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-[10px] text-slate-500">
                ${item.fechaRegistro}
            </td>
            <td class="px-4 py-3 whitespace-nowrap">${statusHtml}</td>
            <td class="sticky-right px-4 py-3 whitespace-nowrap text-center text-sm font-medium">
                <div class="flex items-center justify-center gap-1">
                    <button onclick="editRecord('${item.id}', '${escapeJS(item.funcionario)}', '${escapeJS(item.tipo)}', '${item.dias}', '${item.inicioStr}', '${item.terminoStr}', '${escapeJS(item.obs)}', '${escapeJS(item.cargo)}', '${escapeJS(item.avisaA)}', '${escapeJS(item.medio)}', '${escapeJS(item.reemplazo)}')" class="text-blue-500 hover:text-blue-700 bg-blue-50 p-1.5 rounded-lg transition-colors"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteRecord('${item.id}', '${escapeJS(item.funcionario)}', '${item.inicioStr}', '${item.terminoStr}')" class="text-red-500 hover:text-red-700 bg-red-50 p-1.5 rounded-lg transition-colors"><i class="fas fa-trash-alt"></i></button>
                </div>
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

function generateSummary() {
    const summaryBody = document.getElementById('summaryTableBody');
    const summaryHead = document.getElementById('summaryTableHead');
    
    if (!summaryBody || !summaryHead) return;

    // 1. Obtener todos los tipos únicos presentes en los datos
    const tiposSet = new Set();
    ausenciasData.forEach(item => {
        if (item.tipo) tiposSet.add(item.tipo.toUpperCase().trim());
    });
    const tiposArray = Array.from(tiposSet).sort();

    // 2. Generar Cabecera Dinámica
    summaryHead.innerHTML = `
        <th class="sticky top-0 z-20 bg-slate-100 dark:bg-slate-700 px-4 py-3 text-left text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider shadow-sm">Funcionario</th>
        <th class="sticky top-0 z-20 bg-amber-50 dark:bg-amber-900/40 px-4 py-3 text-center text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider shadow-sm">Total Días</th>
        ${tiposArray.map(t => `<th class="sticky top-0 z-20 bg-slate-100 dark:bg-slate-700 px-4 py-3 text-center text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider shadow-sm">${t}</th>`).join('')}
    `;

    // 3. Agrupar datos por funcionario
    const summaryData = {};
    ausenciasData.forEach(item => {
        const name = item.funcionario || 'Desconocido';
        const tipo = (item.tipo || 'OTROS').toUpperCase().trim();
        const dias = parseFloat(item.dias) || 0;

        if (!summaryData[name]) {
            summaryData[name] = { total: 0, tipos: {} };
            tiposArray.forEach(t => summaryData[name].tipos[t] = 0);
        }

        summaryData[name].total += dias;
        summaryData[name].tipos[tipo] = (summaryData[name].tipos[tipo] || 0) + dias;
    });

    // 4. Renderizar Filas
    summaryBody.innerHTML = '';
    const sortedNames = Object.keys(summaryData).sort();
    
    if (sortedNames.length === 0) {
        summaryBody.innerHTML = `<tr><td colspan="${tiposArray.length + 2}" class="px-4 py-8 text-center text-slate-400 italic">No hay datos suficientes para generar el resumen.</td></tr>`;
        return;
    }

    sortedNames.forEach(name => {
        const data = summaryData[name];
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors";
        tr.innerHTML = `
            <td class="px-4 py-3 text-xs font-bold text-slate-700">${name}</td>
            <td class="px-4 py-3 text-sm font-extrabold text-center text-amber-800 bg-amber-50/50">${data.total.toFixed(1).replace('.0', '')}</td>
            ${tiposArray.map(t => {
                const val = data.tipos[t] || 0;
                return `<td class="px-4 py-3 text-xs text-center ${val > 0 ? 'text-slate-800 font-medium' : 'text-slate-300'}">${val > 0 ? val.toFixed(1).replace('.0', '') : '-'}</td>`;
            }).join('')}
        `;
        summaryBody.appendChild(tr);
    });
}
