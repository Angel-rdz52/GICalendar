// ---------- Utilidades de fecha ----------
const DOW = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

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
let state = { claimedEventos: {}, diariasReclamadas: 0, bendicionActiva: false, bendicionReclamadas: 0 };

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
async function init() {
  const idxResp = await fetch("calendarios/index.json");
  const idx = await idxResp.json();
  const hoy = todayAtMidnight();

  // Solo ocultamos calendarios cuya fecha fin ya pasó Y no es el único disponible
  const vigentes = idx.calendarios.filter(c => !isBefore(parseISO(c.fin), hoy));
  const lista = vigentes.length ? vigentes : idx.calendarios;

  const select = document.getElementById("calendar-select");
  select.innerHTML = "";
  lista.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.archivo;
    opt.textContent = c.nombre;
    select.appendChild(opt);
  });

  select.addEventListener("change", () => cargarCalendario(select.value));
  await cargarCalendario(select.value);
}

async function cargarCalendario(archivo) {
  const resp = await fetch(`calendarios/${archivo}`);
  calendarData = await resp.json();
  state = { claimedEventos: {}, diariasReclamadas: 0, bendicionActiva: false, bendicionReclamadas: 0 };
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
  renderEventos();
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

  const grid = document.createElement("div");
  grid.className = "grid";
  DOW.forEach(d => {
    const el = document.createElement("div");
    el.className = "grid__dow";
    el.textContent = d;
    grid.appendChild(el);
  });

  const primerDia = new Date(year, month, 1);
  const ultimoDia = new Date(year, month + 1, 0);
  const huecosIniciales = mondayIndex(primerDia);

  for (let i = 0; i < huecosIniciales; i++) {
    const vacio = document.createElement("div");
    vacio.className = "day day--empty";
    grid.appendChild(vacio);
  }

  for (let d = 1; d <= ultimoDia.getDate(); d++) {
    const date = new Date(year, month, d);
    grid.appendChild(renderDia(date, rangoIni, rangoFin, hoy));
  }

  wrap.appendChild(grid);
  return wrap;
}

function renderDia(date, rangoIni, rangoFin, hoy) {
  const cell = document.createElement("div");
  const eventosDia = (calendarData.eventos || []).filter(ev =>
    inRange(date, parseISO(ev.inicio), parseISO(ev.fin))
  );
  const esPasado = isBefore(date, hoy);
  const esHoy = isSameDay(date, hoy);
  const fueraDeRango = isBefore(date, rangoIni) || isBefore(rangoFin, date);

  cell.className = "day";
  if (esPasado) cell.classList.add("day--past");
  if (esHoy) cell.classList.add("day--today");
  if (eventosDia.length) cell.classList.add("day--tiene-evento");
  if (fueraDeRango) cell.style.opacity = "0.35";

  const num = document.createElement("span");
  num.className = "day__num";
  num.textContent = date.getDate();
  cell.appendChild(num);

  if (eventosDia.length) {
    const dots = document.createElement("div");
    dots.className = "day__dots";
    eventosDia.slice(0, 4).forEach(ev => {
      const dot = document.createElement("span");
      dot.className = `dot dot--${ev.categoria || "evento"}`;
      dot.title = ev.nombre;
      dots.appendChild(dot);
    });
    cell.appendChild(dots);
  }

  return cell;
}

function renderFuentesDiarias(ini, fin) {
  const totalDias = diffDaysInclusive(ini, fin);
  document.getElementById("dias-totales-label").textContent = `${totalDias} días en esta fase`;

  const diariasInput = document.getElementById("diarias-reclamadas");
  diariasInput.value = state.diariasReclamadas;
  diariasInput.max = totalDias;

  const bendicionCheck = document.getElementById("bendicion-activa");
  const bendicionInput = document.getElementById("bendicion-reclamadas");
  bendicionCheck.checked = state.bendicionActiva;
  bendicionInput.disabled = !state.bendicionActiva;
  bendicionInput.value = state.bendicionReclamadas;
  bendicionInput.max = totalDias;
}

function renderEventos() {
  const cont = document.getElementById("eventos-lista");
  cont.querySelectorAll(".evento-row").forEach(n => n.remove());

  (calendarData.eventos || []).forEach(ev => {
    const row = document.createElement("label");
    row.className = `evento-row evento-row--${ev.categoria || "evento"}`;
    if (state.claimedEventos[ev.id]) row.classList.add("evento-row--claimed");

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = !!state.claimedEventos[ev.id];
    check.addEventListener("change", () => {
      state.claimedEventos[ev.id] = check.checked;
      row.classList.toggle("evento-row--claimed", check.checked);
      saveState(calendarData.id);
      actualizarTotal();
    });

    const info = document.createElement("div");
    info.style.flex = "1";
    const nombre = document.createElement("div");
    nombre.className = "evento-row__nombre";
    nombre.textContent = ev.nombre;
    const fechas = document.createElement("div");
    fechas.className = "evento-row__fechas";
    fechas.textContent = `${fmtFecha(parseISO(ev.inicio))} – ${fmtFecha(parseISO(ev.fin))}` + (ev.nota ? ` · ${ev.nota}` : "");
    info.appendChild(nombre);
    info.appendChild(fechas);

    const cantidad = document.createElement("div");
    cantidad.className = "evento-row__cantidad";
    cantidad.textContent = `◈ ${ev.cantidad}`;

    row.appendChild(check);
    row.appendChild(info);
    row.appendChild(cantidad);
    cont.appendChild(row);
  });
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
  const bendicionInput = document.getElementById("bendicion-reclamadas");
  bendicionCheck.onchange = () => {
    state.bendicionActiva = bendicionCheck.checked;
    bendicionInput.disabled = !state.bendicionActiva;
    saveState(calendarData.id);
    actualizarTotal();
  };
  bendicionInput.oninput = () => {
    state.bendicionReclamadas = clamp(Number(bendicionInput.value) || 0, 0, totalDias);
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

  let potencialBendicion = 0, yaReclamadaBendicion = 0;
  if (state.bendicionActiva) {
    potencialBendicion = calendarData.fuentesDiarias.bendicionLunar.cantidad * totalDias;
    yaReclamadaBendicion = calendarData.fuentesDiarias.bendicionLunar.cantidad * state.bendicionReclamadas;
  }

  const eventos = calendarData.eventos || [];
  const potencialEventos = eventos.reduce((acc, ev) => acc + ev.cantidad, 0);
  const yaReclamadosEventos = eventos.reduce((acc, ev) => acc + (state.claimedEventos[ev.id] ? ev.cantidad : 0), 0);

  const potencialTotal = potencialDiarias + potencialBendicion + potencialEventos;
  const yaReclamado = yaReclamadasDiarias + yaReclamadaBendicion + yaReclamadosEventos;
  const total = Math.max(0, potencialTotal - yaReclamado);

  const deseos = Math.floor(total / 160);
  const resto = total % 160;

  document.getElementById("total-protos").textContent = total.toLocaleString("es");
  document.getElementById("total-deseos").textContent = deseos;
  document.getElementById("resto-protos").textContent = resto > 0 ? `(sobran ${resto} ◈ para el próximo deseo)` : "";
}

// ---------- Barra flotante: se retrae al subir, aparece al bajar ----------
(function setupBarraFlotante() {
  let lastY = window.scrollY;
  const barra = document.getElementById("barra-flotante");
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    if (y > lastY && y > 80) barra.classList.add("oculta");
    else barra.classList.remove("oculta");
    lastY = y;
  }, { passive: true });
})();

init().catch(err => {
  console.error(err);
  document.getElementById("app").innerHTML =
    `<p style="color:#E39FC2">Error cargando el calendario. Si abriste el archivo con doble clic, corré un servidor local (ej: <code>php -S localhost:8000</code>) y entrá por http://localhost:8000</p>`;
});

