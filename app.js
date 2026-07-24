// ---------- Utilidades de fecha ----------
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

// colores por categoria: version viva (dias de hoy en adelante) y mutada (dias ya pasados)
const CATEGORIA_COLOR = {
  evento:       { viva: "#7EC8E3", muted: "#3E5A66" },
  fijo:         { viva: "#E39FC2", muted: "#6B4652" },
  exploracion:  { viva: "#A78BFA", muted: "#463B66" }
};

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

// ---------- Estado ----------
let calendarData = null;
let state = { claimedEventos: {}, bendicionActiva: false, bendicionDiasRestantes: 0, protosActuales: 0, deseosActuales: 0, ajusteManual: 0 };

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
  state = { claimedEventos: {}, bendicionActiva: false, bendicionDiasRestantes: 0, protosActuales: 0, deseosActuales: 0, ajusteManual: 0 };
  loadState(calendarData.id);
  render();
}

// ---------- Render ----------
function render() {
  const ini = parseISO(calendarData.fechaInicio);
  const fin = parseISO(calendarData.fechaFin);

  document.getElementById("rango-fechas").textContent =
    `${calendarData.version} · ${fmtFecha(ini)} — ${fmtFecha(fin)}`;

  renderGantt(ini, fin);
  bindGanttNav(ini, fin);
  renderFuentesDiarias(ini, fin);
  actualizarTotal();
  bindControlesGlobales(ini, fin);
}

function fmtFecha(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const DIA_PX = 34; // ancho de cada columna de día en el gantt

function renderGantt(ini, fin) {
  const hoy = todayAtMidnight();
  const totalDias = diffDaysInclusive(ini, fin);
  const anchoTotal = totalDias * DIA_PX;

  const scroll = document.getElementById("gantt-scroll");
  scroll.innerHTML = "";
  scroll.style.width = `${anchoTotal}px`;

  // ---- cabecera de dias ----
  const header = document.createElement("div");
  header.className = "gantt-header";
  for (let i = 0; i < totalDias; i++) {
    const fecha = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i);
    const tick = document.createElement("div");
    tick.className = "gantt-day-tick";
    if (isBefore(fecha, hoy)) tick.classList.add("gantt-day-tick--past");
    if (isSameDay(fecha, hoy)) tick.classList.add("gantt-day-tick--today");
    const esInicioDeMes = fecha.getDate() === 1 || i === 0;
    tick.innerHTML = (esInicioDeMes ? `<span class="gantt-day-tick__mes">${MESES[fecha.getMonth()].slice(0,3)}</span>` : "") + fecha.getDate();
    header.appendChild(tick);
  }
  scroll.appendChild(header);

  // ---- filas de eventos, ordenadas por inicio ----
  const rows = document.createElement("div");
  rows.className = "gantt-rows";

  const eventos = (calendarData.eventos || [])
    .filter(ev => ev.cantidad > 0 || ev.nota)
    .map(ev => ({ ev, evIni: parseISO(ev.inicio), evFin: parseISO(ev.fin) }))
    .filter(({ evIni, evFin }) => !isBefore(evFin, ini) && !isBefore(fin, evIni)) // que toquen el rango de la fase
    .sort((a, b) => a.evIni - b.evIni);

  eventos.forEach(({ ev, evIni, evFin }) => {
    const row = document.createElement("div");
    row.className = "gantt-row";

    const clipIni = evIni < ini ? ini : evIni;
    const clipFin = evFin > fin ? fin : evFin;
    const offsetIni = diffDaysInclusive(ini, clipIni) - 1;
    const offsetFin = diffDaysInclusive(ini, clipFin) - 1;

    const bar = document.createElement("div");
    const categoria = ev.categoria || "evento";
    bar.className = "gantt-bar";
    if (state.claimedEventos[ev.id]) bar.classList.add("gantt-bar--claimed");
    bar.style.left = `${offsetIni * DIA_PX}px`;
    bar.style.width = `${(offsetFin - offsetIni + 1) * DIA_PX - 3}px`;
    bar.style.background = degradadoEventoGantt(offsetIni, offsetFin, ini, hoy, categoria);
    bar.innerHTML = `<span class="gantt-bar__nombre">${ev.nombre}</span><span class="gantt-bar__cantidad">◈${ev.cantidad}</span>`;
    bar.title = `${ev.nombre} — ${ev.cantidad} protogemas (tocá para marcar como reclamado)`;

    bar.addEventListener("click", () => {
      state.claimedEventos[ev.id] = !state.claimedEventos[ev.id];
      saveState(calendarData.id);
      renderGantt(ini, fin);
      actualizarTotal();
    });

    row.appendChild(bar);
    rows.appendChild(row);
  });

  scroll.appendChild(rows);

  // ---- linea vertical de "hoy" ----
  if (!isBefore(hoy, ini) && !isBefore(fin, hoy)) {
    const offsetHoy = diffDaysInclusive(ini, hoy) - 1;
    const linea = document.createElement("div");
    linea.className = "gantt-today-line";
    linea.style.left = `${offsetHoy * DIA_PX + DIA_PX / 2}px`;
    linea.style.height = `${32 + eventos.length * 30}px`;
    scroll.appendChild(linea);
  }

  return { totalDias, offsetHoy: !isBefore(hoy, ini) && !isBefore(fin, hoy) ? diffDaysInclusive(ini, hoy) - 1 : 0 };
}

// arma un degradado de corte duro para el gantt: oscurecido antes de hoy, color normal de hoy en adelante
function degradadoEventoGantt(offsetIni, offsetFin, rangoIni, hoy, categoria) {
  const colores = CATEGORIA_COLOR[categoria] || CATEGORIA_COLOR.evento;
  const offsetHoy = diffDaysInclusive(rangoIni, hoy) - 1;

  if (offsetHoy > offsetFin) return colores.muted;   // toda la barra ya paso
  if (offsetHoy <= offsetIni) return colores.viva;   // todavia no empezo a pasar nada

  const totalCols = offsetFin - offsetIni + 1;
  const corte = ((offsetHoy - offsetIni) / totalCols) * 100;
  return `linear-gradient(to right, ${colores.muted} 0%, ${colores.muted} ${corte}%, ${colores.viva} ${corte}%, ${colores.viva} 100%)`;
}

function bindGanttNav(ini, fin) {
  const scroll = document.getElementById("gantt-scroll");
  const wrap = document.getElementById("gantt");
  const label = document.getElementById("gantt-nav-label");
  const btnPrev = document.getElementById("gantt-prev");
  const btnNext = document.getElementById("gantt-next");

  function actualizarLabel() {
    const offsetVisible = Math.round(wrap.scrollLeft / DIA_PX);
    const fecha = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + offsetVisible);
    label.textContent = `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`;
  }

  btnPrev.onclick = () => { wrap.scrollBy({ left: -DIA_PX * 7, behavior: "smooth" }); };
  btnNext.onclick = () => { wrap.scrollBy({ left: DIA_PX * 7, behavior: "smooth" }); };
  wrap.onscroll = actualizarLabel;

  // arrancamos centrados en hoy si esta dentro del rango
  const hoy = todayAtMidnight();
  if (!isBefore(hoy, ini) && !isBefore(fin, hoy)) {
    const offsetHoy = diffDaysInclusive(ini, hoy) - 1;
    wrap.scrollLeft = Math.max(0, offsetHoy * DIA_PX - DIA_PX * 2);
  }
  actualizarLabel();
}

function renderFuentesDiarias(ini, fin) {
  const diasRestantes = diasRestantesDesdeHoy(fin);
  document.getElementById("dias-restantes-diarias").textContent =
    `${diasRestantes} días × 60 ≈ ${diasRestantes * 60} ◈`;

  const bendicionCheck = document.getElementById("bendicion-activa");
  const bendicionDiasInput = document.getElementById("bendicion-dias-restantes");
  bendicionCheck.checked = state.bendicionActiva;
  bendicionDiasInput.value = state.bendicionDiasRestantes;

  document.getElementById("protos-actuales").value = state.protosActuales;
  document.getElementById("protos-actuales-mini").value = state.protosActuales;
  document.getElementById("deseos-actuales").value = state.deseosActuales;
  document.getElementById("deseos-actuales-mini").value = state.deseosActuales;
}

// dias que quedan desde hoy hasta fin (inclusive), 0 si la fase ya termino
function diasRestantesDesdeHoy(fin) {
  const hoy = todayAtMidnight();
  if (isBefore(fin, hoy)) return 0;
  return diffDaysInclusive(hoy, fin);
}

// cuenta cuantos reinicios de tienda mensual (dia 1) quedan entre hoy y fin, inclusive
function contarReiniciosTienda(fin) {
  const hoy = todayAtMidnight();
  if (isBefore(fin, hoy)) return 0;
  let cursor = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  if (hoy.getDate() > 1) cursor = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1); // el de este mes ya paso
  let count = 0;
  while (!isBefore(fin, cursor)) {
    count++;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return count;
}

function bindControlesGlobales(ini, fin) {
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
  const protosInputMini = document.getElementById("protos-actuales-mini");
  protosInput.oninput = () => {
    state.protosActuales = Math.max(0, Number(protosInput.value) || 0);
    protosInputMini.value = state.protosActuales;
    saveState(calendarData.id);
    actualizarTotal();
  };
  protosInputMini.oninput = () => {
    state.protosActuales = Math.max(0, Number(protosInputMini.value) || 0);
    protosInput.value = state.protosActuales;
    saveState(calendarData.id);
    actualizarTotal();
  };

  const deseosInput = document.getElementById("deseos-actuales");
  const deseosInputMini = document.getElementById("deseos-actuales-mini");
  deseosInput.oninput = () => {
    state.deseosActuales = Math.max(0, Number(deseosInput.value) || 0);
    deseosInputMini.value = state.deseosActuales;
    saveState(calendarData.id);
    actualizarTotal();
  };
  deseosInputMini.oninput = () => {
    state.deseosActuales = Math.max(0, Number(deseosInputMini.value) || 0);
    deseosInput.value = state.deseosActuales;
    saveState(calendarData.id);
    actualizarTotal();
  };

  document.getElementById("toggle-ya-tengo").onclick = (e) => {
    e.stopPropagation();
    document.getElementById("ya-tengo-inline").classList.toggle("ya-tengo-inline--oculto");
  };

  // ---- panel de desglose ----
  const toggleBtn = document.getElementById("barra-flotante-toggle");
  const panel = document.getElementById("desglose-panel");
  const chevron = document.getElementById("barra-flotante-chevron");
  toggleBtn.onclick = () => {
    const abierto = panel.classList.toggle("desglose-panel--oculto") === false;
    chevron.classList.toggle("barra-flotante__chevron--abierto", abierto);
  };

  const ajusteInput = document.getElementById("ajuste-manual");
  ajusteInput.value = state.ajusteManual;
  ajusteInput.onclick = (e) => e.stopPropagation();
  ajusteInput.oninput = () => {
    state.ajusteManual = Number(ajusteInput.value) || 0;
    saveState(calendarData.id);
    actualizarTotal();
  };

  document.getElementById("ajuste-menos").onclick = (e) => {
    e.stopPropagation();
    state.ajusteManual = (state.ajusteManual || 0) - 10;
    ajusteInput.value = state.ajusteManual;
    saveState(calendarData.id);
    actualizarTotal();
  };
  document.getElementById("ajuste-mas").onclick = (e) => {
    e.stopPropagation();
    state.ajusteManual = (state.ajusteManual || 0) + 10;
    ajusteInput.value = state.ajusteManual;
    saveState(calendarData.id);
    actualizarTotal();
  };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function actualizarTotal() {
  const fin = parseISO(calendarData.fechaFin);
  const diasRestantes = diasRestantesDesdeHoy(fin);

  const aporteDiarias = calendarData.fuentesDiarias.diarias.cantidad * diasRestantes;

  // la Bendición Lunar ya representa "lo que falta" directamente en días restantes, no hay nada que restarle
  const aporteBendicion = state.bendicionActiva
    ? calendarData.fuentesDiarias.bendicionLunar.cantidad * (state.bendicionDiasRestantes || 0)
    : 0;

  const eventos = calendarData.eventos || [];
  const potencialEventos = eventos.reduce((acc, ev) => acc + ev.cantidad, 0);
  const yaReclamadosEventos = eventos.reduce((acc, ev) => acc + (state.claimedEventos[ev.id] ? ev.cantidad : 0), 0);
  const aporteEventos = Math.max(0, potencialEventos - yaReclamadosEventos);

  const ajuste = state.ajusteManual || 0;

  // protogemas "puras": todo lo que se convierte a deseos dividiendo por 160
  const protosYaTengo = state.protosActuales || 0;
  const totalProtogemas = Math.max(0, aporteDiarias + aporteEventos + aporteBendicion + protosYaTengo + ajuste);

  // deseos "puros": no pasan por la conversion de protogemas, se suman directo
  const reinicios = contarReiniciosTienda(fin);
  const deseosTiendaEntrelazados = reinicios * 5;
  const deseosTiendaNormales = reinicios * 5; // banner estandar, informativo aparte
  const deseosYaTengo = state.deseosActuales || 0;

  const deseosDerivados = Math.floor(totalProtogemas / 160);
  const restoProtogemas = totalProtogemas % 160;
  const deseosTotal = deseosDerivados + deseosYaTengo + deseosTiendaEntrelazados;

  document.getElementById("total-protos").textContent = totalProtogemas.toLocaleString("es");
  document.getElementById("total-deseos").textContent = deseosTotal;
  document.getElementById("resto-protos").textContent = restoProtogemas > 0 ? `(sobran ${restoProtogemas} ◈ de las convertibles, + ${deseosYaTengo + deseosTiendaEntrelazados} deseos puros)` : (deseosYaTengo + deseosTiendaEntrelazados > 0 ? `(incluye ${deseosYaTengo + deseosTiendaEntrelazados} deseos puros)` : "");

  // ---- desglose ----
  const fmt = n => `${n >= 0 ? "" : "−"}◈${Math.abs(n).toLocaleString("es")}`;
  document.getElementById("desglose-diarias").textContent = fmt(aporteDiarias);
  document.getElementById("desglose-bendicion").textContent = fmt(aporteBendicion);
  document.getElementById("desglose-eventos").textContent = fmt(aporteEventos);
  document.getElementById("desglose-ya-tengo").textContent = `${fmt(protosYaTengo)} + ${deseosYaTengo} deseos`;
  document.getElementById("desglose-tienda-entrelazados").textContent = `+${deseosTiendaEntrelazados} deseos (${reinicios} reinicio${reinicios === 1 ? "" : "s"})`;
  document.getElementById("desglose-tienda-normales").textContent = `+${deseosTiendaNormales} deseos`;
  document.getElementById("desglose-total").textContent = `${fmt(totalProtogemas)} ≈ ${deseosTotal} deseos`;
}

init().catch(err => {
  console.error(err);
  document.getElementById("app").innerHTML =
    `<p style="color:#E39FC2"><strong>Error:</strong> ${err.message}</p>
     <p style="color:#A9B0D6;font-size:0.85rem">Si abriste el archivo con doble clic (file://), corré un servidor local (ej: <code>php -S localhost:8000</code>) y entrá por http://localhost:8000. La estructura de carpetas (css/, js/, calendarios/) tiene que mantenerse tal cual — son parte de las rutas que usa la página.</p>`;
});

