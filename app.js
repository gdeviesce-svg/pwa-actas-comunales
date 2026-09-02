// VARIABLES GLOBALES Y CONFIGURACIÓN
let CONFIG = {
  geminiApiKey: localStorage.getItem('geminiApiKey') || '',
  appsScriptUrl: localStorage.getItem('appsScriptUrl') || ''
};

let datosExtraidosActuales = null;
let archivoBase64Actual = null;
let chart7TInstance = null;
let chartPartInstance = null;

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', () => {
  if (CONFIG.geminiApiKey) document.getElementById('geminiApiKey').value = CONFIG.geminiApiKey;
  if (CONFIG.appsScriptUrl) document.getElementById('appsScriptUrl').value = CONFIG.appsScriptUrl;
  
  // Registrar Service Worker para PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW reg error:', err));
  }
});

function guardarConfiguracion() {
  CONFIG.geminiApiKey = document.getElementById('geminiApiKey').value.trim();
  CONFIG.appsScriptUrl = document.getElementById('appsScriptUrl').value.trim();
  
  localStorage.setItem('geminiApiKey', CONFIG.geminiApiKey);
  localStorage.setItem('appsScriptUrl', CONFIG.appsScriptUrl);
  
  alert('Configuración guardada correctamente.');
}

function cambiarVista(vista) {
  const btnCargar = document.getElementById('btnNavCargar');
  const btnDash = document.getElementById('btnNavDashboard');
  const vistaC = document.getElementById('vistaCargar');
  const vistaD = document.getElementById('vistaDashboard');

  if (vista === 'cargar') {
    vistaC.classList.remove('hidden');
    vistaD.classList.add('hidden');
    btnCargar.classList.add('bg-indigo-700');
    btnDash.classList.remove('bg-indigo-700');
  } else {
    vistaC.classList.add('hidden');
    vistaD.classList.remove('hidden');
    btnDash.classList.add('bg-indigo-700');
    btnCargar.classList.remove('bg-indigo-700');
    cargarDatosDashboard();
  }
}

// PROCESAMIENTO DE ARCHIVO Y GEMINI AI
async function procesarArchivo(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!CONFIG.geminiApiKey) {
    alert('Por favor configura primero tu Gemini API Key en el panel superior.');
    return;
  }

  mostrarProgreso(true, "Leyendo archivo...", 20);

  try {
    archivoBase64Actual = await convertirBase64(file);
    mostrarProgreso(true, "Analizando documento con Inteligencia Artificial...", 50);

    const respuestaJson = await extraerDatosConGemini(archivoBase64Actual, file.type);
    mostrarProgreso(true, "Cargando formulario de edición...", 90);

    datosExtraidosActuales = respuestaJson;
    poblarFormularioEdicion(respuestaJson);

    mostrarProgreso(false);
    document.getElementById('formEdicion').classList.remove('hidden');

    // Validar duplicado automático
    validarDuplicadoComuna();

  } catch (error) {
    alert('Error al procesar el archivo: ' + error.message);
    mostrarProgreso(false);
  }
}

function convertirBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

async function extraerDatosConGemini(base64Data, mimeType) {
  const cleanBase64 = base64Data.split(',')[1] || base64Data;
  
  const promptText = `Analiza detalladamente esta Acta de Asamblea Comunal y extrae la información requerida estrictamente en el siguiente formato JSON válido:
  {
    "comuna_info": {
      "nombre_comuna": "string",
      "codigo_situr": "string",
      "codigo_com": "string",
      "rif": "string",
      "estado": "string",
      "municipio": "string",
      "parroquia": "string",
      "fecha_asamblea": "YYYY-MM-DD",
      "fecha_consulta": "string"
    },
    "participacion": {
      "total_asistentes": 0,
      "desglose_por_cc": [
        { "consejo_comunal": "string", "cantidad_asistentes": 0 }
      ]
    },
    "modificacion_minuta": {
      "hubo_cambio_proyecto": false,
      "detalle_cambio": "string"
    },
    "proyectos": [
      {
        "numero": 1,
        "transformacion_7t": "T1",
        "nombre": "string",
        "area_atencion": "string",
        "accion": "string",
        "familias_beneficiadas": 0,
        "cc_beneficiados": 0,
        "lugar_ejecucion": "string",
        "es_proyecto_sustituto": false
      }
    ]
  }`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.geminiApiKey}`;

  const body = {
    contents: [{
      parts: [
        { text: promptText },
        { inline_data: { mime_type: mimeType, data: cleanBase64 } }
      ]
    }],
    generationConfig: { response_mime_type: "application/json" }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!data.candidates || !data.candidates[0]) {
    throw new Error("No se obtuvo respuesta válida de Gemini API.");
  }

  const jsonText = data.candidates[0].content.parts[0].text;
  return JSON.parse(jsonText);
}

// POBLAR Y EDITAR FORMULARIO
function poblarFormularioEdicion(data) {
  const info = data.comuna_info || {};
  document.getElementById('edit_nombre_comuna').value = info.nombre_comuna || '';
  document.getElementById('edit_codigo_situr').value = info.codigo_situr || '';
  document.getElementById('edit_codigo_com').value = info.codigo_com || '';
  document.getElementById('edit_rif').value = info.rif || '';
  document.getElementById('edit_estado').value = info.estado || '';
  document.getElementById('edit_municipio').value = info.municipio || '';
  document.getElementById('edit_parroquia').value = info.parroquia || '';
  document.getElementById('edit_fecha_asamblea').value = info.fecha_asamblea || '';

  const minuta = data.modificacion_minuta || {};
  document.getElementById('edit_hubo_cambio').checked = minuta.hubo_cambio_proyecto || false;
  document.getElementById('edit_detalle_cambio').value = minuta.detalle_cambio || '';

  const part = data.participacion || {};
  document.getElementById('edit_total_asistentes').value = part.total_asistentes || 0;

  // Renderizar Participación CC
  const tbodyCC = document.getElementById('tblParticipacionCC');
  tbodyCC.innerHTML = '';
  (part.desglose_por_cc || []).forEach(cc => agregarFilaCC(cc.consejo_comunal, cc.cantidad_asistentes));

  // Renderizar Proyectos
  const contProy = document.getElementById('contenedorProyectos');
  contProy.innerHTML = '';
  (data.proyectos || []).forEach(p => agregarTarjetaProyecto(p));
}

function agregarFilaCC(nombre = '', cantidad = 0) {
  const tbody = document.getElementById('tblParticipacionCC');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="p-1 border"><input type="text" class="w-full p-1 border rounded cc-nombre" value="${nombre}"></td>
    <td class="p-1 border"><input type="number" class="w-full p-1 border rounded cc-cant text-center" value="${cantidad}"></td>
    <td class="p-1 border text-center">
      <button type="button" onclick="this.closest('tr').remove()" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
    </td>
  `;
  tbody.appendChild(tr);
}

function agregarTarjetaProyecto(p = {}) {
  const cont = document.getElementById('contenedorProyectos');
  const idx = cont.children.length + 1;
  
  const div = document.createElement('div');
  div.className = "p-4 border rounded-lg bg-slate-50 space-y-3 relative tarj-proyecto";
  div.innerHTML = `
    <div class="flex justify-between items-center border-b pb-2">
      <span class="font-bold text-xs text-indigo-800">Proyecto N° ${idx}</span>
      <button type="button" onclick="this.closest('.tarj-proyecto').remove()" class="text-xs text-red-500 hover:underline"><i class="fa-solid fa-trash"></i> Eliminar</button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div class="sm:col-span-2">
        <label class="block text-xs font-semibold text-slate-600">Nombre del Proyecto</label>
        <input type="text" class="w-full p-1.5 border rounded text-xs proy-nombre" value="${p.nombre || ''}">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600">Transformación 7T</label>
        <select class="w-full p-1.5 border rounded text-xs proy-7t">
          <option value="T1" ${p.transformacion_7t === 'T1' ? 'selected' : ''}>T1 - Económica</option>
          <option value="T2" ${p.transformacion_7t === 'T2' ? 'selected' : ''}>T2 - Ind. Plena</option>
          <option value="T3" ${p.transformacion_7t === 'T3' ? 'selected' : ''}>T3 - Paz y Seg.</option>
          <option value="T4" ${p.transformacion_7t === 'T4' ? 'selected' : ''}>T4 - Social</option>
          <option value="T5" ${p.transformacion_7t === 'T5' ? 'selected' : ''}>T5 - Política</option>
          <option value="T6" ${p.transformacion_7t === 'T6' ? 'selected' : ''}>T6 - Ecología</option>
          <option value="T7" ${p.transformacion_7t === 'T7' ? 'selected' : ''}>T7 - Geopolítica</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600">Área de Atención</label>
        <input type="text" class="w-full p-1.5 border rounded text-xs proy-area" value="${p.area_atencion || ''}">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600">Familias Beneficiadas</label>
        <input type="number" class="w-full p-1.5 border rounded text-xs proy-familias" value="${p.familias_beneficiadas || 0}">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600">CC Beneficiados</label>
        <input type="number" class="w-full p-1.5 border rounded text-xs proy-cc" value="${p.cc_beneficiados || 0}">
      </div>
    </div>
  `;
  cont.appendChild(div);
}

// VALIDACIÓN DE DUPLICADOS EN GOOGLE SHEETS
async function validarDuplicadoComuna() {
  if (!CONFIG.appsScriptUrl) return;

  const codigoSitur = document.getElementById('edit_codigo_situr').value;
  const fechaAsamblea = document.getElementById('edit_fecha_asamblea').value;

  if (!codigoSitur || !fechaAsamblea) return;

  try {
    const response = await fetch(CONFIG.appsScriptUrl, {
      method: 'POST',
      body: JSON.stringify({
        accion: 'VERIFICAR',
        comuna_info: { codigo_situr: codigoSitur, fecha_asamblea: fechaAsamblea }
      })
    });

    const res = await response.json();
    const badge = document.getElementById('badgeDuplicado');

    if (res.duplicado && res.duplicado.existe) {
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (err) {
    console.error("Error al verificar duplicado:", err);
  }
}

// GUARDAR DATOS EN BACKEND (SHEETS + DRIVE)
async function guardarActaEnBD() {
  if (!CONFIG.appsScriptUrl) {
    alert("Ingresa la URL del Web App de Apps Script.");
    return;
  }

  // Recopilar datos desde la interfaz
  const payloadGuardar = {
    accion: 'GUARDAR',
    data: {
      archivo_pdf_base64: archivoBase64Actual,
      comuna_info: {
        nombre_comuna: document.getElementById('edit_nombre_comuna').value,
        codigo_situr: document.getElementById('edit_codigo_situr').value,
        codigo_com: document.getElementById('edit_codigo_com').value,
        rif: document.getElementById('edit_rif').value,
        estado: document.getElementById('edit_estado').value,
        municipio: document.getElementById('edit_municipio').value,
        parroquia: document.getElementById('edit_parroquia').value,
        fecha_asamblea: document.getElementById('edit_fecha_asamblea').value
      },
      modificacion_minuta: {
        hubo_cambio_proyecto: document.getElementById('edit_hubo_cambio').checked,
        detalle_cambio: document.getElementById('edit_detalle_cambio').value
      },
      participacion: {
        total_asistentes: parseInt(document.getElementById('edit_total_asistentes').value) || 0,
        desglose_por_cc: Array.from(document.querySelectorAll('#tblParticipacionCC tr')).map(row => ({
          consejo_comunal: row.querySelector('.cc-nombre').value,
          cantidad_asistentes: parseInt(row.querySelector('.cc-cant').value) || 0
        }))
      },
      proyectos: Array.from(document.querySelectorAll('.tarj-proyecto')).map((card, idx) => ({
        numero: idx + 1,
        nombre: card.querySelector('.proy-nombre').value,
        transformacion_7t: card.querySelector('.proy-7t').value,
        area_atencion: card.querySelector('.proy-area').value,
        familias_beneficiadas: parseInt(card.querySelector('.proy-familias').value) || 0,
        cc_beneficiados: parseInt(card.querySelector('.proy-cc').value) || 0
      }))
    }
  };

  const btn = document.getElementById('btnGuardarBD');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando...`;

  try {
    const res = await fetch(CONFIG.appsScriptUrl, {
      method: 'POST',
      body: JSON.stringify(payloadGuardar)
    });

    const resultado = await res.json();

    if (resultado.status === 'SUCCESS') {
      alert('✅ Acta guardada exitosamente con PDF respaldado en Drive.');
      document.getElementById('formEdicion').classList.add('hidden');
    } else {
      alert('Error al guardar: ' + resultado.mensaje);
    }
  } catch (err) {
    alert('Error enviando datos: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Confirmar y Guardar en BD + Drive`;
  }
}

// FUNCIONES DASHBOARD Y GRÁFICOS
function cargarDatosDashboard() {
  // Simulador de datos o consulta vía Apps Script (Get)
  document.getElementById('kpiTotalActas').innerText = "1";
  document.getElementById('kpiTotalProyectos').innerText = "7";
  document.getElementById('kpiTotalFamilias').innerText = "4,583";
  document.getElementById('kpiTasaCambio').innerText = "14.2%";

  renderizarGraficos();
}

function renderizarGraficos() {
  // Chart 1: Proyectos 7T
  const ctx1 = document.getElementById('chart7T').getContext('2d');
  if (chart7TInstance) chart7TInstance.destroy();

  chart7TInstance = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: ['T1 Econ.', 'T2 Plena', 'T3 Paz', 'T4 Social', 'T5 Polít.', 'T6 Ecol.', 'T7 Geo.'],
      datasets: [{
        label: 'Proyectos Postulados',
        data: [1, 0, 0, 5, 0, 0, 1],
        backgroundColor: '#4f46e5'
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  // Chart 2: Participación
  const ctx2 = document.getElementById('chartParticipacion').getContext('2d');
  if (chartPartInstance) chartPartInstance.destroy();

  chartPartInstance = new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels: ['Mi Jardín I', 'Los Acacios', 'Mi Jardín V', 'Otros'],
      datasets: [{
        data: [120, 85, 94, 150],
        backgroundColor: ['#1e3a8a', '#0d9488', '#d97706', '#64748b']
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function mostrarProgreso(vis, txt, pct) {
  const el = document.getElementById('progresoCarga');
  if (vis) {
    el.classList.remove('hidden');
    document.getElementById('txtEstadoProgreso').innerText = txt;
    document.getElementById('txtPorcentajeProgreso').innerText = pct + '%';
    document.getElementById('barProgreso').style.width = pct + '%';
  } else {
    el.classList.add('hidden');
  }
}

function cancelarEdicion() {
  document.getElementById('formEdicion').classList.add('hidden');
  archivoBase64Actual = null;
}
