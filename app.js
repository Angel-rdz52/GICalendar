// ---------- Utilidades de fecha ----------
const DOW = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

// colores por categoria: version viva (dias de hoy en adelante) y mutada (dias ya pasados)
const CATEGORIA_COLOR = {
  evento:       { viva: "#7EC8E3", muted: "#3E5A66" },
  fijo:         { viva: "#E39FC2", muted: "#6B4652" },
  exploracion:  { viva: "#A78BFA", muted: "#463B66" }
};

// arma un degradado de corte duro: oscurecido en los dias ya pasados de esta barra, color normal de hoy en adelante
function degradadoEvento(diasSemana, colIni, colFin, hoy, categoria) {
  const colores = CATEGORIA_COLOR[categoria] || CATEGORIA_COLOR.evento;
  const totalCols = colFin - colIni + 1;

  let colHoyOEnAdelante = -1;
  for (let c = colIni; c <= colFin; c++) {
    const d = diasSemana[c];
    if (d && !isBefore(d, hoy)) { colHoyOEnAdelante = c; break; }
  }

  if (colHoyOEnAdelante === -1) {
    // toda la porcion de esta semana ya paso
    return colores.muted;
  }
  if (colHoyOEnAdelante === colIni) {
    // todavia no empezo a pasar nada de esta porcion
    return colores.viva;
  }

  const corte = ((colHoyOEnAdelante - colIni) / totalCols) * 100;
  return `linear-gradient(to right, ${colores.muted} 0%, ${colores.muted} ${corte}%, ${colores.viva} ${corte}%, ${colores.viva} 100%)`;
}

function parseISO(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayAtMidnight() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isBefore(a, b) { return a.getTime() < b.getTime(); }
function inRange(day, ini, fin) { return !isBefore(day, ini) && !isBefore(fin, day); }
function diffDaysInclusive(ini, fin) {
  return Math.round((fin - ini) / 86400000) + 1;
}
// lunes=0 ... domingo=6
function mondayIndex(date) { return (date.getDay() + 6) % 7; }

// ---------- Estado ----------
let calendarData = null;
let state = { claimedEventos: {}, diariasReclamadas: 0, bendicionActiva: false, bendicionDiasRestantes: 0, protosActuales: 0, deseosActuales: 0 };

function storageKey(calId) { return `genshin-protos::${calId}`; }

function loadState(calId) {
  try {
    const raw = localStorage.getItem(storageKey(calId));
    if (raw) state = Object.assign(state, JSON.parse(raw));
  } catch (e) { console.warn("No se pudo leer localStorage", e); }
}
function saveState(calId) {
  try { localStorage.setItem(storageKey(calId), JSON.stringify(state)); }
  catch (e) { console.warn("No se pudo guardar en localStorage", e); }
}

// ---------- Carga de calendarios ----------
async function fetchJSON(url) {
  let resp;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw new Error(`No se pudo conectar para pedir "${url}" (¿servidor caído o ruta mal escrita?)`);
  }
  if (!resp.ok) {
    throw new Error(`"${url}" respondió ${resp.status} ${resp.statusText} — revisá que el archivo exista exactamente en esa ruta`);
  }
  try {
    return await resp.json();
  } catch (e) {
    throw new Error(`"${url}" no es un JSON válido (¿archivo corrupto o vino HTML de error en vez de JSON?)`);
  }
}

async function init() {
  const actual = await fetchJSON("calendario-actual.json");

  let siguiente = null;
  try {
    siguiente = await fetchJSON("calendario-siguiente.json");
  } catch (e) {
    console.warn("No se pudo leer calendario-siguiente.json (opcional):", e.message);
  }

  const select = document.getElementById("calendar-select");
  select.innerHTML = "";

  const optActual = document.createElement("option");
  optActual.value = "calendario-actual.json";
  optActual.textContent = actual.version || "Fase actual";
  select.appendChild(optActual);

  if (siguiente) {
    const optSig = document.createElement("option");
    if (siguiente.estado === "disponible") {
      optSig.value = "calendario-siguiente.json";
      optSig.textContent = siguiente.version || "Próxima fase";
    } else {
      optSig.value = "";
      optSig.disabled = true;
      optSig.textContent = `${siguiente.version || "Próxima fase"} (en proceso)`;
    }
    select.appendChild(optSig);
  }

  select.addEventListener("change", () => {
    if (select.value) cargarCalendario(select.value);
  });
  await cargarCalendario("calendario-actual.json");
}

async function cargarCalendario(archivo) {
  calendarData = await fetchJSON(archivo);
  state = { claimedEventos: {}, diariasReclamadas: 0, bendicionActiva: false, bendicionDiasRestantes: 0, protosActuales: 0, deseosActuales: 0 };
  loadState(calendarData.id);
  render();
}

// ---------- Render ----------
function render() {
  const ini = parseISO(calendarData.fechaInicio);
  const fin = parseISO(calendarData.fechaFin);

  document.getElementById("rango-fechas").textContent =
    `${calendarData.version} · ${fmtFecha(ini)} — ${fmtFecha(fin)}`;

  renderMeses(ini, fin);
  renderFuentesDiarias(ini, fin);
  actualizarTotal();
  bindControlesGlobales(ini, fin);
}

function fmtFecha(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function renderMeses(ini, fin) {
  const cont = document.getElementById("meses");
  cont.innerHTML = "";
  const hoy = todayAtMidnight();

  let cursor = new Date(ini.getFullYear(), ini.getMonth(), 1);
  const finMes = new Date(fin.getFullYear(), fin.getMonth(), 1);

  while (cursor <= finMes) {
    cont.appendChild(renderMes(cursor.getFullYear(), cursor.getMonth(), ini, fin, hoy));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
}

function renderMes(year, month, rangoIni, rangoFin, hoy) {
  const wrap = document.createElement("div");
  wrap.className = "mes";

  const titulo = document.createElement("div");
  titulo.className = "mes__titulo";
  titulo.textContent = `${MESES[month]} ${year}`;
  wrap.appendChild(titulo);

  const dow = document.createElement("div");
  dow.className = "grid grid--dow";
  DOW.forEach(d => {
    const el = document.createElement("div");
    el.className = "grid__dow";
    el.textContent = d;
    dow.appendChild(el);
  });
  wrap.appendChild(dow);

  const primerDia = new Date(year, month, 1);
  const ultimoDia = new Date(year, month + 1, 0);

  // armamos la grilla de fechas del mes en semanas de 7 (lunes a domingo)
  const dias = [];
  const huecosIniciales = mondayIndex(primerDia);
  for (let i = 0; i < huecosIniciales; i++) dias.push(null);
  for (let d = 1; d <= ultimoDia.getDate(); d++) dias.push(new Date(year, month, d));
  while (dias.length % 7 !== 0) dias.push(null);

  for (let i = 0; i < dias.length; i += 7) {
    wrap.appendChild(renderSemana(dias.slice(i, i + 7), rangoIni, rangoFin, hoy));
  }

  return wrap;
}

function renderSemana(diasSemana, rangoIni, rangoFin, hoy) {
  const semana = document.createElement("div");
  semana.className = "semana";

  // fila de numeros de dia
  diasSemana.forEach((date, col) => {
    const cell = document.createElement("div");
    cell.className = "day";
    cell.style.gridColumn = String(col + 1);
    cell.style.gridRow = "1";

    if (!date) {
      cell.classList.add("day--empty");
    } else {
      const esPasado = isBefore(date, hoy);
      const esHoy = isSameDay(date, hoy);
      const fueraDeRango = isBefore(date, rangoIni) || isBefore(rangoFin, date);
      if (esPasado) cell.classList.add("day--past");
      if (esHoy) cell.classList.add("day--today");
      if (fueraDeRango) cell.style.opacity = "0.35";
      const num = document.createElement("span");
      num.className = "day__num";
      num.textContent = date.getDate();
      cell.appendChild(num);
    }
    semana.appendChild(cell);
  });

  // eventos que tocan esta semana, ordenados por inicio y duracion
  const primerDiaSemana = diasSemana.find(d => d);
  const ultimoDiaSemana = [...diasSemana].reverse().find(d => d);
  if (!primerDiaSemana) return semana;

  const eventosSemana = (calendarData.eventos || [])
    .filter(ev => ev.cantidad > 0 || ev.nota) // se muestran igual eventos con cantidad 0 si tienen nota, para recordar completarlos
    .map(ev => ({ ev, ini: parseISO(ev.inicio), fin: parseISO(ev.fin) }))
    .filter(({ ini, fin }) => inRange(primerDiaSemana, ini, fin) || inRange(ultimoDiaSemana, ini, fin) || (isBefore(ini, primerDiaSemana) && isBefore(ultimoDiaSemana, fin)) || inRange(ini, primerDiaSemana, ultimoDiaSemana))
    .sort((a, b) => a.ini - b.ini || (b.fin - b.ini) - (a.fin - a.ini));

  // asignar "carriles" (lanes) para que no se superpongan visualmente
  const lanes = []; // cada lane guarda la ultima columna ocupada
  eventosSemana.forEach(item => {
    const colIni = diasSemana.findIndex(d => d && !isBefore(d, item.ini) && !isBefore(item.fin, d));
    let colFin = colIni;
    diasSemana.forEach((d, idx) => { if (d && inRange(d, item.ini, item.fin)) colFin = idx; });
    if (colIni === -1) return;

    let laneIdx = lanes.findIndex(occupiedUntil => occupiedUntil < colIni);
    if (laneIdx === -1) { laneIdx = lanes.length; lanes.push(-1); }
    lanes[laneIdx] = colFin;

    const bar = document.createElement("div");
    const categoria = item.ev.categoria || "evento";
    bar.className = "evento-bar";
    if (state.claimedEventos[item.ev.id]) bar.classList.add("evento-bar--claimed");

    bar.style.background = degradadoEvento(diasSemana, colIni, colFin, hoy, categoria);

    bar.style.gridColumn = `${colIni + 1} / ${colFin + 2}`;
    bar.style.gridRow = String(laneIdx + 2);

    bar.innerHTML = `<span class="evento-bar__nombre">${item.ev.nombre}</span><span class="evento-bar__cantidad">◈${item.ev.cantidad}</span>`;
    bar.title = `${item.ev.nombre} — ${item.ev.cantidad} protogemas (tocá para marcar como reclamado)`;

    bar.addEventListener("click", () => {
      state.claimedEventos[item.ev.id] = !state.claimedEventos[item.ev.id];
      saveState(calendarData.id);
      renderMeses(parseISO(calendarData.fechaInicio), parseISO(calendarData.fechaFin));
      actualizarTotal();
    });

    semana.appendChild(bar);
  });

  const filas = 1 + Math.max(1, lanes.length);
  semana.style.gridTemplateRows = `auto repeat(${Math.max(1, lanes.length)}, 22px)`;

  return semana;
}

function renderFuentesDiarias(ini, fin) {
  const totalDias = diffDaysInclusive(ini, fin);
  document.getElementById("dias-totales-label").textContent = `${totalDias} días en esta fase`;

  const diariasInput = document.getElementById("diarias-reclamadas");
  diariasInput.value = state.diariasReclamadas;
  diariasInput.max = totalDias;

  const bendicionCheck = document.getElementById("bendicion-activa");
  const bendicionDiasInput = document.getElementById("bendicion-dias-restantes");
  bendicionCheck.checked = state.bendicionActiva;
  bendicionDiasInput.value = state.bendicionDiasRestantes;

  document.getElementById("protos-actuales").value = state.protosActuales;
  document.getElementById("deseos-actuales").value = state.deseosActuales;
}

function bindControlesGlobales(ini, fin) {
  const totalDias = diffDaysInclusive(ini, fin);

  const diariasInput = document.getElementById("diarias-reclamadas");
  diariasInput.oninput = () => {
    state.diariasReclamadas = clamp(Number(diariasInput.value) || 0, 0, totalDias);
    saveState(calendarData.id);
    actualizarTotal();
  };

  const bendicionCheck = document.getElementById("bendicion-activa");
  const bendicionDiasInput = document.getElementById("bendicion-dias-restantes");
  const btnEditar = document.getElementById("btn-editar-bendicion");
  const btnRenovar = document.getElementById("btn-renovar-bendicion");

  function pedirDiasRestantes(valorActual) {
    const resp = prompt("¿Cuántos días de Bendición Lunar te quedan?", valorActual);
    if (resp === null) return null; // cancelado
    const n = Math.max(0, Math.round(Number(resp)) || 0);
    return n;
  }

  bendicionCheck.onchange = () => {
    state.bendicionActiva = bendicionCheck.checked;
    if (state.bendicionActiva && !state.bendicionDiasRestantes) {
      const n = pedirDiasRestantes(30);
      if (n !== null) state.bendicionDiasRestantes = n;
    }
    bendicionDiasInput.value = state.bendicionDiasRestantes;
    saveState(calendarData.id);
    actualizarTotal();
  };

  btnEditar.onclick = () => {
    const n = pedirDiasRestantes(state.bendicionDiasRestantes);
    if (n === null) return;
    state.bendicionDiasRestantes = n;
    bendicionDiasInput.value = n;
    saveState(calendarData.id);
    actualizarTotal();
  };

  btnRenovar.onclick = () => {
    state.bendicionDiasRestantes = (state.bendicionDiasRestantes || 0) + 30;
    bendicionDiasInput.value = state.bendicionDiasRestantes;
    saveState(calendarData.id);
    actualizarTotal();
  };

  const protosInput = document.getElementById("protos-actuales");
  protosInput.oninput = () => {
    state.protosActuales = Math.max(0, Number(protosInput.value) || 0);
    saveState(calendarData.id);
    actualizarTotal();
  };

  const deseosInput = document.getElementById("deseos-actuales");
  deseosInput.oninput = () => {
    state.deseosActuales = Math.max(0, Number(deseosInput.value) || 0);
    saveState(calendarData.id);
    actualizarTotal();
  };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function actualizarTotal() {
  const ini = parseISO(calendarData.fechaInicio);
  const fin = parseISO(calendarData.fechaFin);
  const totalDias = diffDaysInclusive(ini, fin);

  const potencialDiarias = calendarData.fuentesDiarias.diarias.cantidad * totalDias;
  const yaReclamadasDiarias = calendarData.fuentesDiarias.diarias.cantidad * state.diariasReclamadas;

  // la Bendición Lunar ya representa "lo que falta" directamente en días restantes, no hay nada que restarle
  const aporteBendicion = state.bendicionActiva
    ? calendarData.fuentesDiarias.bendicionLunar.cantidad * (state.bendicionDiasRestantes || 0)
    : 0;

  const eventos = calendarData.eventos || [];
  const potencialEventos = eventos.reduce((acc, ev) => acc + ev.cantidad, 0);
  const yaReclamadosEventos = eventos.reduce((acc, ev) => acc + (state.claimedEventos[ev.id] ? ev.cantidad : 0), 0);

  const potencialTotal = potencialDiarias + potencialEventos;
  const yaReclamado = yaReclamadasDiarias + yaReclamadosEventos;
  const restanteVersion = Math.max(0, potencialTotal - yaReclamado) + aporteBendicion;

  const yaTengo = (state.protosActuales || 0) + (state.deseosActuales || 0) * 160;
  const total = restanteVersion + yaTengo;

  const deseos = Math.floor(total / 160);
  const resto = total % 160;

  document.getElementById("total-protos").textContent = total.toLocaleString("es");
  document.getElementById("total-deseos").textContent = deseos;
  document.getElementById("resto-protos").textContent = resto > 0 ? `(sobran ${resto} ◈ para el próximo deseo)` : "";
}

init().catch(err => {
  console.error(err);
  document.getElementById("app").innerHTML =
    `<p style="color:#E39FC2"><strong>Error:</strong> ${err.message}</p>
     <p style="color:#A9B0D6;font-size:0.85rem">Si abriste el archivo con doble clic (file://), corré un servidor local (ej: <code>php -S localhost:8000</code>) y entrá por http://localhost:8000. La estructura de carpetas (css/, js/, calendarios/) tiene que mantenerse tal cual — son parte de las rutas que usa la página.</p>`;
});

