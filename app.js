// Constantes y Estado Global
let ausenciasData = [];
let funcionariosPaCount = {};
const csvUrlKey = 'ausencias_csv_url';

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    // Registro del Service Worker para la PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then(reg => {
                console.log('SW registrado con éxito: ', reg.scope);
            }).catch(err => {
                console.log('Fallo el registro del SW: ', err);
            });
        });
    }

    // Configuración Inicial
    const savedUrl = localStorage.getItem(csvUrlKey);
    const urlInput = document.getElementById('csvUrlInput');
    if (savedUrl) {
        urlInput.value = savedUrl;
        fetchData();
    }

    // Event Listeners
    document.getElementById('saveConfigBtn').addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (url) {
            localStorage.setItem(csvUrlKey, url);
            fetchData();
        } else {
            alert('Por favor, ingresa una URL válida.');
        }
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
        const icon = document.querySelector('#refreshBtn i');
        icon.classList.add('fa-spin');
        fetchData();
        setTimeout(() => icon.classList.remove('fa-spin'), 1000);
    });

    document.getElementById('searchInput').addEventListener('input', renderTable);
    document.getElementById('filterType').addEventListener('change', renderTable);
});

// Obtener fecha actual en zona horaria de Chile/Santiago (formato YYYY-MM-DD)
function getChileDateStr(offsetDays = 0) {
    const formatter = new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const now = new Date();
    if (offsetDays !== 0) {
        now.setDate(now.getDate() + offsetDays);
    }
    const parts = formatter.formatToParts(now);
    const dateObj = {};
    parts.forEach(p => dateObj[p.type] = p.value);
    // Asegurar formato YYYY-MM-DD
    return `${dateObj.year}-${dateObj.month}-${dateObj.day}`;
}

// Parsear strings de fecha a formato estándar YYYY-MM-DD para comparaciones
function parseDateString(dateStr) {
    if (!dateStr) return null;
    let parts = dateStr.trim().split(/[-/]/);
    if (parts.length !== 3) return null;
    
    // Si el primer elemento es año (ej: 2026) -> YYYY-MM-DD
    if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else {
        // Asumimos formato DD/MM/YYYY o DD-MM-YYYY
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
}

// Carga y procesamiento de datos mediante PapaParse
function fetchData() {
    const url = localStorage.getItem(csvUrlKey);
    if (!url) {
        document.getElementById('emptyIndicator').classList.remove('hidden');
        return;
    }

    showLoading();

    Papa.parse(url, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            processData(results.data);
            hideLoading();
        },
        error: function(err) {
            console.error("Error al cargar el CSV", err);
            showError("Error al cargar el CSV. Verifica que el enlace corresponda a un CSV público.");
            hideLoading();
        }
    });
}

function processData(data) {
    ausenciasData = [];
    funcionariosPaCount = {};
    const tiposAusencia = new Set();

    data.forEach(row => {
        // Normalizar nombres de columnas eliminando espacios extra
        const cleanRow = {};
        for(let key in row) {
            if(key) {
                cleanRow[key.trim()] = typeof row[key] === 'string' ? row[key].trim() : row[key];
            }
        }

        const funcionario = cleanRow['NOMBRE FUNCIONARIO'] || cleanRow['NOMBRE'] || 'Desconocido';
        const tipoAus = cleanRow['TIPO AUS'] || cleanRow['TIPO'] || '';
        const inicioRaw = cleanRow['FECHA INICIO'] || '';
        const terminoRaw = cleanRow['FECHA TERMINO'] || cleanRow['FECHA TÉRMINO'] || '';
        const numDiasRaw = cleanRow['N° HRS/DÍAS'] || cleanRow['DIAS'] || '0';
        
        let numDias = parseFloat(numDiasRaw.replace(',', '.'));
        if (isNaN(numDias)) numDias = 0;

        const fInicio = parseDateString(inicioRaw);
        const fTermino = parseDateString(terminoRaw);

        // Regla de Negocio: Acumulación de Días de P.A.
        if (tipoAus.toUpperCase() === 'P.A.') {
            funcionariosPaCount[funcionario] = (funcionariosPaCount[funcionario] || 0) + numDias;
        }

        if (tipoAus) tiposAusencia.add(tipoAus.toUpperCase());

        // Validar si la fecha de término es anterior a la de inicio
        const errorFecha = (fInicio && fTermino && fTermino < fInicio);

        if(funcionario !== 'Desconocido' || tipoAus !== '') {
            ausenciasData.push({
                funcionario,
                tipo: tipoAus,
                dias: numDias,
                diasStr: numDiasRaw,
                inicio: fInicio,
                inicioStr: inicioRaw,
                termino: fTermino,
                terminoStr: terminoRaw,
                errorFecha: errorFecha
            });
        }
    });

    updateFilterOptions(tiposAusencia);
    calculateDashboardMetrics();
    renderTable();
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
    
    // Restaurar valor previo si aún existe
    if(Array.from(tipos).includes(currentValue)) {
        select.value = currentValue;
    }
}

function calculateDashboardMetrics() {
    const hoyStr = getChileDateStr(0);
    const mananaStr = getChileDateStr(1);

    const ausentesHoySet = new Set();
    const ausentesMananaSet = new Set();
    const retornosSet = new Set();

    ausenciasData.forEach(item => {
        if (!item.inicio || !item.termino || item.errorFecha) return;

        // Regla: Ausentes Hoy
        if (hoyStr >= item.inicio && hoyStr <= item.termino) {
            ausentesHoySet.add(item.funcionario);
        }

        // Regla: Ausentes Mañana
        if (mananaStr >= item.inicio && mananaStr <= item.termino) {
            ausentesMananaSet.add(item.funcionario);
        }

        // Regla: Retornos Inminentes (el término es HOY, retornan el próximo día hábil)
        if (item.termino === hoyStr) {
            retornosSet.add(item.funcionario);
        }
    });

    // Animación simple de contadores
    animateValue('countHoy', ausentesHoySet.size);
    animateValue('countManana', ausentesMananaSet.size);
    animateValue('countRetornos', retornosSet.size);
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
        return matchSearch && matchFilter;
    });

    if (filteredData.length === 0 && ausenciasData.length > 0) {
        document.getElementById('emptyIndicator').classList.remove('hidden');
    } else {
        document.getElementById('emptyIndicator').classList.add('hidden');
    }

    // Ordenar: Errores primero, luego por fecha de inicio más reciente
    filteredData.sort((a, b) => {
        if (a.errorFecha && !b.errorFecha) return -1;
        if (!a.errorFecha && b.errorFecha) return 1;
        if (a.inicio && b.inicio) return a.inicio > b.inicio ? -1 : 1;
        return 0;
    });

    filteredData.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors duration-150 ease-in-out';
        
        // Verificación P.A. > 6 días
        const paCount = funcionariosPaCount[item.funcionario] || 0;
        const limitReached = paCount > 6;
        
        const avatarInitial = item.funcionario.charAt(0).toUpperCase();

        const nombreHtml = `
            <div class="flex items-center">
                <div class="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-700 font-bold shadow-sm border border-blue-200">
                    ${avatarInitial}
                </div>
                <div class="ml-4">
                    <div class="text-sm font-semibold text-slate-800 flex items-center gap-2">
                        ${item.funcionario}
                        ${limitReached ? `<i class="fas fa-exclamation-triangle text-red-500 animate-pulse" title="¡Alerta! Acumula ${paCount} días de P.A."></i>` : ''}
                    </div>
                    ${limitReached 
                        ? `<div class="text-xs font-bold text-red-600 bg-red-50 inline-block px-2 py-0.5 rounded mt-1 border border-red-100">Límite P.A. Excedido (${paCount} días)</div>` 
                        : `<div class="text-xs text-slate-500 mt-0.5">${paCount > 0 ? paCount + ' días P.A.' : 'Sin registro P.A.'}</div>`
                    }
                </div>
            </div>`;

        // Determinar Estado
        let statusHtml = '';
        if (item.errorFecha) {
            statusHtml = `<span class="px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full bg-red-100 text-red-700 border border-red-200 shadow-sm"><i class="fas fa-bug mr-1.5 mt-0.5"></i> Fechas Inválidas</span>`;
            tr.classList.add('bg-red-50/30');
        } else if (item.inicio && item.termino) {
            if (hoyStr >= item.inicio && hoyStr <= item.termino) {
                statusHtml = `<span class="px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full bg-red-500 text-white shadow-sm"><i class="fas fa-user-times mr-1.5 mt-0.5"></i> Ausente Hoy</span>`;
            } else if (mananaStr >= item.inicio && mananaStr <= item.termino) {
                statusHtml = `<span class="px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full bg-orange-100 text-orange-700 border border-orange-200 shadow-sm">Ausente Mañana</span>`;
            } else if (hoyStr > item.termino) {
                statusHtml = `<span class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200">Finalizado</span>`;
            } else if (hoyStr < item.inicio) {
                 statusHtml = `<span class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200 shadow-sm">Programado</span>`;
            }
        } else {
            statusHtml = `<span class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-500">Incompleto</span>`;
        }

        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                ${nombreHtml}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-bold bg-slate-100 text-slate-700 border border-slate-200 shadow-sm">
                    ${item.tipo || 'N/A'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-medium">
                ${item.diasStr || '-'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                <div class="flex flex-col gap-1">
                    <div class="text-slate-600"><i class="far fa-calendar-alt text-slate-400 mr-1 w-4"></i> <span class="font-medium">${item.inicioStr || '-'}</span></div>
                    <div class="${item.errorFecha ? 'text-red-600 font-bold' : 'text-slate-600'}"><i class="far fa-calendar-check text-slate-400 mr-1 w-4"></i> <span class="font-medium">${item.terminoStr || '-'}</span></div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${statusHtml}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Utilidades UI
function showLoading() {
    document.getElementById('loadingIndicator').classList.remove('hidden');
    document.getElementById('errorIndicator').classList.add('hidden');
    document.getElementById('emptyIndicator').classList.add('hidden');
    document.getElementById('dataTableBody').innerHTML = '';
}

function hideLoading() {
    document.getElementById('loadingIndicator').classList.add('hidden');
}

function showError(msg) {
    const errEl = document.getElementById('errorIndicator');
    errEl.classList.remove('hidden');
    document.getElementById('errorMessage').innerText = msg;
    document.getElementById('dataTableBody').innerHTML = '';
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
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end;
        }
    };
    window.requestAnimationFrame(step);
}
