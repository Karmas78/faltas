// Funciones de Utilidad de UI y Gráficos
let typeChartInstance = null;
let monthChartInstance = null;

export const escapeJS = (str) => {
    if (!str) return "";
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
};

export const getChileDateStr = (offsetDays = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().split('T')[0];
};

export const showLoading = () => document.getElementById('loadingOverlay').classList.remove('hidden');
export const hideLoading = () => document.getElementById('loadingOverlay').classList.add('hidden');

export const updateFirebaseStatus = (isConfigured) => {
    const statusDiv = document.getElementById('firebaseStatus');
    if (statusDiv) {
        if (isConfigured) statusDiv.classList.add('hidden');
        else statusDiv.classList.remove('hidden');
    }
};

export const updateCharts = (ausenciasData) => {
    const typeCtx = document.getElementById('typeChart').getContext('2d');
    const monthCtx = document.getElementById('monthChart').getContext('2d');

    const typeCounts = {};
    const monthCounts = Array(12).fill(0);

    ausenciasData.forEach(item => {
        if (item.tipo) {
            const t = item.tipo.toUpperCase();
            typeCounts[t] = (typeCounts[t] || 0) + 1;
        }
        if (item.inicio) {
            const date = new Date(item.inicio);
            if (date.getFullYear() === 2026) {
                monthCounts[date.getMonth()]++;
            }
        }
    });

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
};

export const renderTable = (data, filterType = null) => {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    
    const filtered = filterType ? data.filter(d => d.tipo === filterType) : data;

    filtered.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors border-b border-gray-100 last:border-0";
        
        const statusHtml = item.errorFecha 
            ? '<span class="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">Error Fecha</span>'
            : '<span class="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full flex items-center gap-1 w-fit"><i class="fas fa-check-circle text-[10px]"></i> Vigente</span>';

        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs mr-3">
                        ${item.funcionario.charAt(0)}
                    </div>
                    <div class="text-sm font-semibold text-slate-800">${item.funcionario}</div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg border border-slate-200">
                    ${item.tipo}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-medium">
                ${item.diasStr}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-xs space-y-1">
                    <div class="text-slate-800 font-medium"><i class="far fa-calendar-alt text-blue-400 mr-1 w-4"></i> ${item.inicioStr || '-'}</div>
                    <div class="text-slate-600"><i class="far fa-calendar-check text-slate-400 mr-1 w-4"></i> ${item.terminoStr || '-'}</div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                ${item.fechaRegistro}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">${statusHtml}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                <button onclick="editRecord('${item.id}', '${escapeJS(item.funcionario)}', '${escapeJS(item.tipo)}', '${item.dias}', '${item.inicioStr}', '${item.terminoStr}', '${escapeJS(item.obs)}')" class="text-blue-500 hover:text-blue-700 bg-blue-50 px-3 py-1 rounded-lg mr-2"><i class="fas fa-edit"></i></button>
                <button onclick="deleteRecord('${item.id}', '${escapeJS(item.funcionario)}', '${item.inicioStr}', '${item.terminoStr}')" class="text-red-500 hover:text-red-700 bg-red-50 px-3 py-1 rounded-lg"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};
