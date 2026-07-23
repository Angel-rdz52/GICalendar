# Calculadora de Protogemas — Fase 1 (testing)

## Estructura
```
genshin-protogemas/
├── index.html
├── css/style.css
├── js/app.js
└── calendarios/
    ├── index.json              ← lista de calendarios disponibles
    └── luna-viii-fase2.json    ← datos de una fase (ejemplo con tus capturas)
```

## Cómo probarlo en tu PC
Como usa `fetch()` para leer los JSON, **no funciona con doble clic** (bloqueo CORS de `file://`).
Con PHP ya instalado, corré desde la carpeta `genshin-protogemas`:

```
php -S localhost:8000
```

Y abrí `http://localhost:8000` en el navegador.

## Cómo subirlo a GitHub Pages
1. Subí toda la carpeta `genshin-protogemas` (contenido, no la carpeta contenedora) a la raíz del repo, o a una subcarpeta si vas a activar Pages desde ahí.
2. Activá GitHub Pages apuntando a esa rama/carpeta.
3. Listo — ahí el `fetch()` de los JSON funciona sin ningún ajuste porque se sirve por https.

## Cómo agregar la siguiente versión (sin tocar HTML/JS/CSS)
1. Copiá `calendarios/luna-viii-fase2.json` → `calendarios/luna-ix-fase1.json` (o el nombre que quieras).
2. Editá dentro: `id`, `version`, `fechaInicio`, `fechaFin`, y el array `eventos` (nombre, categoría, cantidad, inicio, fin).
3. Agregá la entrada correspondiente en `calendarios/index.json`.
4. La app automáticamente:
   - Muestra ambos calendarios en el selector mientras el actual no haya vencido (`fechaFin` >= hoy).
   - Guarda el progreso de cada calendario por separado en `localStorage` (usando su `id`), así no se pisan entre versiones.

### Campos del JSON de cada calendario
| Campo | Qué es |
|---|---|
| `fechaInicio` / `fechaFin` | ventana total de la fase (define el rango del calendario) |
| `fuentesDiarias.diarias.cantidad` | protogemas por comisión diaria (normalmente 60) |
| `fuentesDiarias.bendicionLunar.cantidad` | protogemas si tenés Bendición Lunar activa (normalmente 90) |
| `eventos[]` | cada evento con protogemas: `id` único, `nombre`, `categoria` (`evento` / `fijo` / `exploracion`), `cantidad`, `inicio`, `fin` |
| `nota` (opcional en un evento) | por si la cantidad todavía no está confirmada en la vista previa oficial |

## Qué falta para fase 2 (mejoras ya conversadas, no incluidas todavía)
- Barras de evento que **cruzan visualmente los días** en la grilla (por ahora cada día solo muestra puntos de color por evento activo, más simple de testear primero).
- Selector explícito para ver "calendario actual" vs "próximo" lado a lado.
- Exportar/importar el progreso en JSON.
- Editor visual de eventos (en vez de editar el JSON a mano).

## Sobre los datos de ejemplo
Los montos de `luna-viii-fase2.json` los tomé de tus capturas donde estaban visibles (ej. Festival Fontinal 1060, Conflagración 450, etc). El evento "Crecida de líneas ley" quedó en 0 porque no vi la cantidad confirmada — editalo cuando la confirmes in-game.

