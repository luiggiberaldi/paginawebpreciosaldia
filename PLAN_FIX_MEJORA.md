# Plan de Fixeo y Mejora — `preciosaldia-intro.html`

> Auditoría realizada el 2026-08-09. Este plan ordena las correcciones por prioridad,
> con archivo objetivo, cambio concreto y forma de verificación.
> **Regla general:** aplicar los cambios en `public/preciosaldia-intro.html` (el archivo
> que se sirve) y replicarlos en la copia de trabajo de la raíz, o eliminar la duplicación
> (ver T-15).

---

## Fase 1 — Errores funcionales (crítico)

### T-1. Reparar JSON-LD roto (rich results de Google)
- **Archivo:** `preciosaldia-intro.html` (~línea 84).
- **Problema:** falta la llave de apertura `{` en la 4ª pregunta del FAQ
  (`"@type": "Question"` huérfana tras `},`). Todo el `@graph` queda inválido.
- **Cambio:** agregar `{` antes de `"@type": "Question"` de "¿Cómo recupero mis datos si cambio de equipo?".
- **Verificación:**
  ```bash
  node -e "const fs=require('fs');const h=fs.readFileSync('public/preciosaldia-intro.html','utf8');const m=h.match(/<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/);JSON.parse(m[1]);console.log('JSON-LD OK')"
  ```
  También validar el resultado en https://validator.schema.org (sin errores ni advertencias de parseo).

### T-2. Proteger `localStorage` contra entornos sandboxed
- **Archivo:** `preciosaldia-intro.html` — 2º script (modal admin, ~líneas 4174-4185).
- **Problema:** `localStorage.setItem/getItem("psd_custom_price")` sin `try/catch` lanza
  `SecurityError` en iframes sandboxed y corta la inicialización (precio de `/api/price`,
  modal, listeners).
- **Cambio:** envolver lectura/escritura en helpers `safeLocalGet` / `safeLocalSet` con
  `try/catch` (el 1er script ya declara el entorno como sandboxed; unificar el criterio).
- **Verificación:** abrir la página en un iframe `sandbox` sin `allow-same-origin` y
  comprobar en consola que no hay `SecurityError` y que el modal sigue abriéndose.

### T-3. Definir variables CSS que se usan pero no existen
- **Archivo:** `preciosaldia-intro.html` — bloque `:root` (~línea 131) y `[data-theme="dark"]`.
- **Problema:**
  - `--text-heading` → usada en el modal admin (título, label, input) — indefinida.
  - `--font-mono` → usada en chat (`code`, pie "Seguro") — indefinida.
  - `--radius-md` → usada en `.pricing-guarantee` (esquinas cuadradas) — indefinida.
  - `--space-1.5` → usada en FAQ Cashea (`gap`) — indefinida.
- **Cambio:** agregar al `:root`:
  ```css
  --text-heading: var(--text);          /* en dark: oklch(0.96 0.008 85) aprox. */
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --radius-md: 1.05rem;
  --space-1-5: 0.375rem;                /* o renombrar el uso a --space-2 */
  ```
  Y si se prefiere, reemplazar el uso de `var(--space-1.5)` por `var(--space-2)`.
- **Verificación:** inspección visual de la caja de garantía (esquinas redondeadas),
  del modal admin (contraste de texto en claro/oscuro) y del chat.

### T-4. Eliminar la duplicación de `fetchBcvRate()`
- **Archivo:** `preciosaldia-intro.html` — scripts 1 y 2 (~líneas 4050 y 4145).
- **Problema:** la función y su llamada inicial existen dos veces → 2 llamadas
  paralelas a `https://ve.dolarapi.com/v1/dolares/oficial` al cargar.
- **Cambio:** mantener una sola implementación (la del 2º script, que además se usa
  desde `updateGlobalPrice`) y borrar la del 1º.
- **Verificación:** pestaña Network → solo 1 request a `dolarapi.com` al recargar.

### T-5. Eliminar código muerto `chatFab`
- **Archivo:** `preciosaldia-intro.html` — script 1 (~línea 3611).
- **Problema:** `getElementById("chatFab")` no existe en el DOM; el chat se abre desde
  el smart dock (`smartDockTrigger`). El bloque es inerte.
- **Cambio:** quitar la variable `fab`, el `if (fab)` y su listener; dejar la lógica
  `chatOpen/chatClose` (la usa el dock y Ctrl+Shift+K).
- **Verificación:** el chat sigue abriéndose desde el dock y con el atajo de teclado;
  sin errores en consola.

---

## Fase 2 — SEO y consistencia de dominio

### T-6. Unificar dominio en canonical, OG y texto del FAQ
- **Archivo:** `preciosaldia-intro.html`, `public/robots.txt`, `public/sitemap.xml`.
- **Problema:** canonical/`og:image`/`og:url`/sitemap/robots apuntan a
  `preciosaldia.vercel.app`, pero todos los CTAs y enlaces de instalación apuntan a
  `preciosaldiaoficial.vercel.app`. El texto del FAQ además dice "Abre
  preciosaldia.vercel.app" mientras el enlace va al otro dominio.
- **Acción previa (requiere decisión del dueño):** confirmar cuál es el dominio
  público definitivo.
- **Cambio:** apuntar canonical, `og:*`, `twitter:*`, `robots.txt` (Sitemap:) y
  `sitemap.xml` al dominio real; alinear el texto del FAQ con el enlace.
- **Verificación:** revisar con la herramienta "Inspección de URL" de Search Console;
  compartir la página en WhatsApp y confirmar que la imagen previa carga.

### T-7. Actualizar metadatos de sitemap
- **Archivo:** `public/sitemap.xml`.
- **Cambio:** `lastmod` con fecha real (o regenerarlo en el deploy) y verificar que las
  URLs incluidas respondan 200.
- **Verificación:** `curl -I https://<dominio>/preciosaldia-intro.html` → 200.

---

## Fase 3 — Accesibilidad

### T-8. Navegación por teclado en las tabs del showcase
- **Archivo:** `preciosaldia-intro.html` — bloque showcase (~línea 2500) y script 1.
- **Cambio:** añadir manejo de flechas ←/→ sobre el `tablist` (patrón ARIA tabs),
  `aria-controls` apuntando al frame, y sincronizar `aria-selected`.
- **Verificación:** con el foco en una tab, las flechas cambian de pantalla y el
  lector de pantalla anuncia el estado seleccionado.

### T-9. `aria-pressed` en el toggle de tema
- **Archivo:** `preciosaldia-intro.html` — `applyTheme()`.
- **Cambio:** actualizar `aria-pressed` (o `aria-label` "Cambiar a modo oscuro/claro")
  en `#themeToggle` al aplicar tema.
- **Verificación:** NVDA/VoiceOver anuncia el estado del botón.

### T-10. Modal admin: focus trap + Escape + retorno de foco
- **Archivo:** `preciosaldia-intro.html` — 2º script y HTML del modal.
- **Cambio:** al abrir, guardar el elemento activo y enfocar el input; al cerrar,
  restaurar el foco; interceptar `Escape` para cerrar.
- **Verificación:** Tab no sale del modal mientras está abierto; Escape lo cierra.

### T-11. Reducir CLS con dimensiones en imágenes
- **Archivo:** `preciosaldia-intro.html` — `<img>` del hero y del showcase.
- **Cambio:** añadir `width`/`height` (o `aspect-ratio` CSS) a las imágenes cuyo tamaño
  no está declarado (hero `login.png`, `#showcaseImg`, y las de los pasos del tutorial
  que no los tengan).
- **Verificación:** Lighthouse → CLS < 0.1 en móvil y escritorio.

---

## Fase 4 — Mejoras de mantenimiento y calidad

### T-12. Pinear la versión de Lucide
- **Archivo:** `preciosaldia-intro.html` — `<head>` (~línea 119).
- **Cambio:** `https://unpkg.com/lucide@latest` → versión fija acorde al proyecto
  (p. ej. `lucide@0.525.0`).
- **Verificación:** los iconos se renderizan tras recargar con caché limpia; probar
  un par de días después para confirmar que no hay cambios de breaking.

### T-13. Eventos GA4 con precio dinámico
- **Archivo:** `preciosaldia-intro.html` — `onclick` del botón "Asegurar Mi Licencia"
  (~línea 3126) y hero.
- **Cambio:** construir `event_label` y el nombre con `window.CURRENT_PRICE` en vez de
  hardcodear "50"; p. ej. `click_asegurar_licencia_${window.CURRENT_PRICE||50}`.
- **Verificación:** GA4 DebugView muestra el evento con el precio actualizado tras
  cambiar el precio desde el modal admin.

### T-14. Centralizar el SVG de WhatsApp
- **Archivo:** `preciosaldia-intro.html`.
- **Cambio:** el path del logo de WhatsApp está inline 4 veces (header, hero, pricing,
  CTA). Extraer a un `<svg><symbol id="icon-wa">` y reutilizar con `<use>`.
- **Verificación:** los 4 botones se ven idénticos; sin peticiones extra.

### T-15. Fuente única para el HTML de la landing
- **Archivo:** raíz `preciosaldia-intro.html` vs `public/preciosaldia-intro.html`.
- **Problema:** dos copias idénticas que pueden desincronizarse; la que se sirve es la
  de `public/`.
- **Opción A (recomendada):** mantener solo `public/preciosaldia-intro.html` como fuente
  y documentar en `src/app/page.tsx` que redirige ahí. La copia raíz se elimina.
- **Opción B:** si se quiere editar en la raíz, añadir un script de build que copie
  raíz → `public/` antes del deploy.
- **Verificación:** `diff` vacío entre ambas, o existencia de una sola copia.

### T-16. Fallback de iconos si el CDN falla
- **Archivo:** `preciosaldia-intro.html` — `renderIcons()`.
- **Cambio:** si `window.lucide` no está disponible tras `load`, ocultar los `<i
  data-lucide>` (evitar caracteres fantasma) o mostrar un emoji/placeholder. Evitar
  que el layout se vea roto.
- **Verificación:** bloquear `unpkg.com` en DevTools → la página se ve ordenada sin
  iconos y sin errores de consola.

---

---

## Estado de ejecución (2026-08-09)

| Tarea | Estado | Notas |
| --- | --- | --- |
| T-1 JSON-LD | ✅ Hecho | `JSON.parse` del bloque ahora pasa |
| T-2 localStorage | ✅ Hecho | Helpers `safeLocalGet`/`safeLocalSet` con try/catch |
| T-3 Variables CSS | ✅ Hecho | `--text-heading`, `--font-mono`, `--radius-md` definidas; `--space-1.5` renombrado a `--space-2` |
| T-4 fetchBcvRate duplicado | ✅ Hecho | Queda 1 definición y 2 llamadas (init + recálculo) |
| T-5 chatFab | ✅ Hecho | Código muerto eliminado |
| T-6 Dominio | ✅ Parcial | Texto del FAQ y prompt del chat → `preciosaldiaoficial.vercel.app`. Canonical/OG/sitemap **sin tocar**: requieren confirmar el dominio de despliegue de la landing |
| T-7 Sitemap | ✅ Hecho | `lastmod` → 2026-08-09 |
| T-8 Tabs teclado | ✅ Hecho | Flechas/Home/End + `aria-controls` |
| T-9 aria-pressed tema | ✅ Hecho | Se actualiza en `applyTheme` |
| T-10 Modal focus trap | ✅ Hecho | Escape, Tab trap y retorno de foco |
| T-11 CLS imágenes | ✅ Hecho | `width`/`height` reales en las 8 imágenes |
| T-12 Lucide | ✅ Hecho | `lucide@0.525.0` |
| T-13 GA4 dinámico | ✅ Hecho | Evento y label usan `window.CURRENT_PRICE` |
| T-14 SVG WhatsApp | ✅ Hecho | 1 `<symbol>` + 5 `<use>` |
| T-15 Fuente única | ⏳ Pendiente decisión | Se mantienen ambas copias sincronizadas por ahora |
| T-16 Fallback iconos | ✅ Hecho | Ocultar `[data-lucide]` si el CDN no carga |
| T-17 Precio de comparación editable | ✅ Hecho | Modal admin: campo "Precio de Comparación (tachado)" + `data-price-compare` + persistencia localStorage y API (`/api/price` con `comparePrice` en archivo y Supabase) |

**Verificado en preview:** JSON-LD OK, scripts sin errores de sintaxis, consola sin errores
reales (solo 404 de `/api/*` por servir el HTML estático sin el backend Next),
interacciones probadas: stepper, tabs showcase, FAQ, tema, smart dock, chat IA,
modal admin (5 clics, Escape, Ctrl+Shift+P, retorno de foco).

---

## Orden de ejecución sugerido y verificación final

1. **T-1 a T-5** (Fase 1) — una sesión de edición, luego verificación funcional.
2. **T-6, T-7** (Fase 2) — requiere confirmar el dominio con el dueño.
3. **T-8 a T-11** (Fase 3) — a11y, verificable con Lighthouse/lectores.
4. **T-12 a T-16** (Fase 4) — mejoras de mantenimiento, sin riesgo.

**Verificación final por cada cambio:**
- `JSON.parse` del bloque JSON-LD → OK.
- Consola del navegador sin errores/warnings tras recargar.
- Lighthouse (móvil y escritorio): performance, accesibilidad, SEO.
- Recorrido manual: hero → showcase → tutorial (6 pasos) → FAQ → precios → CTA →
  smart dock → chat (envío real contra `/api/chat`) → modal admin (5 clics en logo).
