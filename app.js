// Constantes y Estado Global
let ausenciasData = [];
let funcionariosPaCount = {};
let activeCardFilter = null;
const csvUrlKey = 'ausencias_csv_url';
const scriptUrlKey = 'ausencias_script_url';

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
    const savedScriptUrl = localStorage.getItem(scriptUrlKey);
    const scriptInput = document.getElementById('scriptUrlInput');
    
    if (savedUrl) {
        urlInput.value = savedUrl;
        fetchData();
    }
    if (savedScriptUrl) {
        scriptInput.value = savedScriptUrl;
    }

    // Event Listeners
    document.getElementById('saveConfigBtn').addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (url) {
            localStorage.setItem(csvUrlKey, url);
            fetchData();
        } else {
            alert('Por favor, ingresa una URL de CSV válida.');
        }
    });

    document.getElementById('saveScriptBtn').addEventListener('click', () => {
        const url = scriptInput.value.trim();
        if (url) {
            localStorage.setItem(scriptUrlKey, url);
            alert('URL de Apps Script guardada correctamente.');
        } else {
            alert('Por favor, ingresa una URL de Script válida.');
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

    // Event Listeners para Cards
    document.getElementById('cardHoy').addEventListener('click', () => setCardFilter('hoy', 'Ausentes Hoy'));
    document.getElementById('cardManana').addEventListener('click', () => setCardFilter('manana', 'Ausentes Mañana'));
    document.getElementById('cardRetornos').addEventListener('click', () => setCardFilter('retornos', 'Retornos Inminentes'));
    document.getElementById('clearCardFilterBtn').addEventListener('click', () => setCardFilter(null, ''));

    // Event Listeners Modal Nueva Ausencia
    const modal = document.getElementById('addRecordModal');
    document.getElementById('addRecordBtn').addEventListener('click', () => {
        modal.classList.remove('hidden');
        document.getElementById('formNombre').focus();
    });
    
    document.getElementById('closeModalBtn').addEventListener('click', () => {
        modal.classList.add('hidden');
        document.getElementById('addRecordForm').reset();
        hideFormFeedback();
    });

    document.getElementById('submitRecordBtn').addEventListener('click', submitRecord);
});

function setCardFilter(filterValue, textLabel) {
    activeCardFilter = filterValue;
    const alertBox = document.getElementById('activeFilterAlert');
    const textSpan = document.getElementById('activeFilterText');
    
    if (filterValue) {
        textSpan.innerText = `Mostrando filtro: ${textLabel}`;
        alertBox.classList.remove('hidden');
    } else {
        alertBox.classList.add('hidden');
    }
    
    // Smooth scroll to the table slightly to show the user what happened
    if (filterValue) {
        document.getElementById('activeFilterAlert').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    renderTable();
}

// Funciones del Modal y Envío de Datos
function hideFormFeedback() {
    const feedback = document.getElementById('formFeedback');
    feedback.classList.add('hidden');
    feedback.className = 'hidden rounded-lg p-3 text-sm font-bold text-center mt-4';
}

function showFormFeedback(msg, isError = false) {
    const feedback = document.getElementById('formFeedback');
    feedback.innerText = msg;
    feedback.classList.remove('hidden');
    if (isError) {
        feedback.className = 'rounded-lg p-3 text-sm font-bold text-center mt-4 bg-red-100 text-red-700 border border-red-200';
    } else {
        feedback.className = 'rounded-lg p-3 text-sm font-bold text-center mt-4 bg-blue-100 text-blue-700 border border-blue-200';
    }
}

async function submitRecord() {
    const scriptUrl = localStorage.getItem(scriptUrlKey);
    if (!scriptUrl) {
        showFormFeedback('Error: Primero debes configurar la URL del Google Apps Script en la sección "Fuente de Datos".', true);
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

    // Convertir a formato DD/MM/YYYY para el Excel
    const formatToLocal = (dateStr) => {
        if(!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    };

    const formatToLocalNow = () => {
        const formatter = new Intl.DateTimeFormat('es-CL', {
            timeZone: 'America/Santiago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const parts = formatter.formatToParts(new Date());
        const dateObj = {};
        parts.forEach(p => dateObj[p.type] = p.value);
        return `${dateObj.day}/${dateObj.month}/${dateObj.year}`;
    };

    const payload = {
        fechaRegistro: formatToLocalNow(),
        nombre: document.getElementById('formNombre').value,
        tipo: document.getElementById('formTipo').value,
        dias: document.getElementById('formDias').value,
        inicio: formatToLocal(document.getElementById('formInicio').value),
        termino: formatToLocal(document.getElementById('formTermino').value),
        obs: document.getElementById('formObs').value
    };

    const formData = new URLSearchParams();
    for (const key in payload) {
        formData.append(key, payload[key]);
    }

    try {
        const response = await fetch(scriptUrl, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            btn.innerHTML = '<i class="fas fa-check mr-2"></i> ¡Guardado!';
            btn.classList.replace('bg-emerald-600', 'bg-blue-600');
            
            setTimeout(() => {
                document.getElementById('addRecordModal').classList.add('hidden');
                form.reset();
                hideFormFeedback();
                btn.innerHTML = originalText;
                btn.classList.replace('bg-blue-600', 'bg-emerald-600');
                btn.disabled = false;
                
                // Recargar datos automáticamente
                fetchData();
            }, 1500);
        } else {
            throw new Error(result.message || 'Error desconocido');
        }
    } catch (error) {
        console.error('Error al guardar:', error);
        showFormFeedback('Error de red o permisos al guardar. Asegúrate de haber publicado correctamente el Apps Script.', true);
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

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
        header: false,
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

    if (!data || data.length === 0) {
        showError("El archivo CSV está vacío.");
        return;
    }

    // Buscar fila de encabezados dinámicamente
    let headerRowIndex = -1;
    for (let i = 0; i < data.length; i++) {
        if (data[i].some(cell => typeof cell === 'string' && cell.trim().toUpperCase() === 'NOMBRE FUNCIONARIO')) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) {
        showError("No se encontraron las columnas esperadas (NOMBRE FUNCIONARIO) en el CSV.");
        return;
    }

    const headers = data[headerRowIndex].map(h => typeof h === 'string' ? h.trim().toUpperCase() : '');

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const rowArray = data[i];
        const cleanRow = {};
        
        headers.forEach((header, index) => {
            if (header) {
                cleanRow[header] = rowArray[index] ? String(rowArray[index]).trim() : '';
            }
        });

        const funcionario = cleanRow['NOMBRE FUNCIONARIO'] || cleanRow['NOMBRE'] || 'Desconocido';
        const tipoAus = cleanRow['TIPO AUS'] || cleanRow['TIPO'] || '';
        const inicioRaw = cleanRow['FECHA INICIO'] || '';
        const terminoRaw = cleanRow['FECHA TERMINO'] || cleanRow['FECHA TÉRMINO'] || '';
        const numDiasRaw = cleanRow['N° HRS/DÍAS'] || cleanRow['N° HRS/DIAS'] || cleanRow['DIAS'] || '0';
        
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
    }

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
        
        let matchCard = true;
        if (activeCardFilter) {
            matchCard = false;
            if (!item.errorFecha && item.inicio && item.termino) {
                if (activeCardFilter === 'hoy' && hoyStr >= item.inicio && hoyStr <= item.termino) {
                    matchCard = true;
                } else if (activeCardFilter === 'manana' && mananaStr >= item.inicio && mananaStr <= item.termino) {
                    matchCard = true;
                } else if (activeCardFilter === 'retornos' && item.termino === hoyStr) {
                    matchCard = true;
                }
            }
        }

        return matchSearch && matchFilter && matchCard;
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
