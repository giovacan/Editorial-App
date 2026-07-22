# Roadmap de features pendientes

> Índice de trabajo por hacer, **priorizado por valor/esfuerzo** y agrupado en fases. Cada punto tiene (o tendrá) su propio documento de diseño en `docs/plans/`. Se implementan uno a uno, cada uno en su propia rama, sin dañar el progreso ya consolidado en `main`.

## Principio rector (aplica a TODO lo de abajo)

**No dañar el progreso actual.** Los cambios son **aditivos** y guardados tras un flag de config: con la feature desactivada, el motor se comporta EXACTAMENTE como el `main` actual. El gate de regresión (`bookCorpus.test.js`: 0 overflow, texto íntegro) debe seguir verde en libros que no usan la feature.

Estado bueno consolidado (base de todo): tag `toc-sin-huecos-ok-2026-07-21` — TOC sin huecos + proporción contenido↔folio (`floor→round`) activa en `main` y en producción.

## Cómo leer las fases

Orden = valor/esfuerzo. **Fase A** primero (ganancias rápidas que mejoran la app ya), luego el **núcleo editorial** (lo que la hace única), después **pulido**, luego las **features grandes**, y el **rediseño al final**. Dentro de cada fase el orden es sugerido, no rígido.

- **Valor:** ⭐ bajo · ⭐⭐ medio · ⭐⭐⭐ alto
- **Esfuerzo:** 🔨 bajo · 🔨🔨 medio · 🔨🔨🔨 alto

---

## FASE A — Quick wins (empezar por aquí)

### A1. Sistema de notificaciones (toasts) + estados carga/error/vacío  ⭐⭐⭐ · 🔨
- **Por qué primero:** hay ~20 `alert()` crudos (export, upload, paginación); reemplazarlos sube mucho la calidad percibida con riesgo casi nulo. Base para el feedback de todo lo demás.
- **Alcance:** toasts no bloqueantes; estados de carga (paginando libro grande), error y vacío consistentes. No toca el motor.

### A2. Buscador dentro del libro  ⭐⭐ · 🔨
- **Alcance:** índice de búsqueda sobre el texto de capítulos/páginas; UI con navegación de resultados (resaltado + ir a página). Acotado, aislado del motor.

### A3. Auditoría de botones del panel (sección por sección)  ⭐⭐ · 🔨
- **Petición del usuario:** revisar que **todos los botones del panel hagan lo que deben**, sección por sección.
- **Alcance:** auditar `SidebarRight.jsx` y demás paneles; verificar que cada control esté conectado a su lógica. Incluye deuda técnica: checkboxes de export no conectados (`SidebarRight.jsx`), footer links `href="#"`, `flushWrites` sin usar (`useBookSync.js`). Revisión + fixes puntuales.

---

## FASE B — Núcleo editorial (el diferenciador)

### B1. Notas al pie de página  ⭐⭐⭐ · 🔨🔨 · ⏳ diseño listo
- **Diseño:** [`footnotes-system-design.md`](./footnotes-system-design.md)
- **Rama:** `feat/footnotes-sistema` (por ahora solo el documento de diseño).
- **Resumen:** notas al pie en la misma página que su marca; reduce el presupuesto SOLO de las páginas con nota. Origen dual (importar de Word + crear/editar/eliminar en la app). Estrategia recomendada: presupuesto por candidato dentro del DP.
- **Primer paso (go/no-go):** test aislado que mida un bloque de notas mock a 8-9pt con `measureHtmlHeight` y confirme que restarlo del `budget` de un candidato produce un corte de página estable.

### B2. Imágenes  ⭐⭐⭐ · 🔨🔨🔨
- **Diseño:** pendiente (`images-system-design.md` antes de implementar).
- **Estado (verificado):** el motor trata `<img>` como bloque de altura FIJA con default de **4 líneas** si no hay `min-height` (`textLayoutEngine.js:68-77`, `REPLACED_TAGS`). NO lee dimensiones reales, no escala, y el PDF vectorial (`pdfVectorRenderer.js`) no dibuja imágenes hoy.
- **Alcance a diseñar:** medición real + escala a ancho de columna; paginación (bloque no divisible); import mammoth (¿base64?); render preview + PDF vectorial (embeber en jsPDF); `config.images`; CRUD (insertar/reemplazar/eliminar/redimensionar + pie de imagen).

### B3. Validaciones pre-publicación KDP  ⭐⭐⭐ · 🔨🔨
- **Por qué:** valor central de una herramienta de self-publishing — evita rechazos de la imprenta. (Va tras imágenes porque la validación de resolución/sangrado las necesita.)
- **Alcance:** márgenes mínimos por nº de páginas (ya hay `getDynamicGutter`), sangrado (bleed), resolución de imágenes (≥300 dpi), cálculo de **lomo/spine** (portada completa), ISBN/editorial/fecha. Panel de "chequeo pre-publicación" que liste problemas antes de exportar.

---

## FASE C — Pulido de maquetación (calidad visible)

### C1. Listas y verso/poesía  ⭐⭐ · 🔨🔨
- **Estado (verificado):** `<ul>`/`<ol>` y verso (`<br>`) van al **fallback de texto plano** en el PDF vectorial. Medición ya la maneja `textLayoutEngine`; falta el render del PDF.
- **Alcance:** dibujar listas con marcador + sangría e interlineado real; verso respetando saltos de línea.

### C2. Portada + front/back matter visual  ⭐⭐ · 🔨🔨
- **Estado (verificado):** la portada (`isTitlePage`) **cae al fallback plano** en el PDF vectorial. Front matter tiene orden canónico pero sin plantillas visuales ricas.
- **Alcance:** `drawTitlePage` dedicado (título/autor centrados), copyright, colofón, dedicatoria/epígrafe. Preview + PDF vectorial. Reutilizar el patrón del título del TOC (ya replica el estilo de inicio de capítulo).

### C3. Separadores de escena / narrativa  ⭐ · 🔨
- **Alcance:** guiones/separadores (`* * *`, `⁂`, línea centrada), saltos de sección en el capítulo — comunes en novela. Estilo configurable; bloque no divisible.

### C4. EPUB completo  ⭐⭐ · 🔨🔨
- **Estado (verificado):** `exportEpub` (`exporters.js:295`) es EPUB 3 **válido pero plano**: sin CSS, sin imágenes, sin portada, metadata mínima. `exportHtml` igual.
- **Alcance:** CSS embebido con los estilos del libro, imágenes en el manifest, portada, metadata rica (ISBN/editorial/fecha), TOC navegable con niveles. Conectar los checkboxes de export de `SidebarRight.jsx`. (Va tras imágenes y portada porque los reutiliza.)

---

## FASE D — Features grandes (alto valor, alto esfuerzo)

### D1. Corrector ortográfico con contexto  ⭐⭐⭐ · 🔨🔨🔨
- **Petición del usuario:** corrector basado en palabras Y frases con **contexto** (haber/a ver, tildes según sentido, concordancia).
- **Flujo de revisión (requisito clave):**
  - Mostrar **todas** las deficiencias en una lista (panel de hallazgos) antes de decidir.
  - Aplicar **uno por uno** (aceptar / ignorar / editar a mano) **o todas de un jalón** (las de alta confianza en bloque).
  - **NO auto-corregir cuando hay duda:** baja confianza / ambigüedad → se deja marcado para corrección manual, nunca a la fuerza. → **nivel de confianza** por hallazgo (alta = auto-aplicable; baja/ambigua = manual).
- **Modelo de hallazgo:** `{ rango, textoOriginal, sugerencias[], confianza: 'alta'|'baja'|'ambigua', tipo, autoAplicable }`.
- **Alcance a diseñar:** motor (LanguageTool vs LLM vs híbrido — la confianza decide auto vs manual); UI de subrayado por confianza en `Editor.jsx`/tiptap + panel de hallazgos; análisis por capítulo/selección; config (idioma, umbral de confianza, diccionario personal). Decidir API externa vs local temprano (privacidad/costo/offline).

### D2. Versiones / historial del libro  ⭐⭐ · 🔨🔨
- **Alcance:** snapshots del libro (contenido + config) para deshacer cambios grandes (borrado de capítulo, cambio masivo de config) o volver atrás. Más allá del undo/redo de tiptap. Almacenamiento: Firestore subcolección vs local.

### D3. Gestión de capítulos  ⭐⭐ · 🔨🔨
- **Alcance:** reordenar (drag), mover, **dividir** y **fusionar** capítulos a mano (hoy la detección es automática al importar). Afecta `SidebarLeft`/`StructureTab` y el store `chapters`. Re-numeración + re-paginación consecuentes. (Se beneficia de tener versiones/historial por si el usuario se equivoca.)

### D4. Editor visual página-por-página (WYSIWYG paginado)  ⭐⭐⭐ · 🔨🔨🔨
- **Petición del usuario:** editor que **muestre los saltos de página** y edite **reflejando la maquetación** (página por página, no solo el flujo continuo actual).
- **Alcance a diseñar:** enlazar `Editor.jsx` (tiptap) con `paginatedPages`; edición que re-pagina en vivo; marcadores de fin de página; posible edición directa sobre el preview. El punto más grande de esta fase — requiere su propio diseño y se apoya en footnotes/imágenes ya hechas.

---

## FASE E — Cierre: accesibilidad + rediseño (AL FINAL)

### E1. Accesibilidad (a11y)  ⭐⭐ · 🔨🔨
- **Estado:** muy pocos `aria-`/`role` en los paneles; teclado y contraste sin auditar.
- **Nota:** se hace **junto con E2** para no auditar dos veces la UI clásica.

### E2. Rediseño de interfaz (UI nueva)  ⭐⭐⭐ · 🔨🔨🔨
- **Decisión del usuario:** la interfaz ACTUAL queda como **"clásica"** (se mantiene para quien la quiera). Se construye **una nueva**:
  - **Minimalista** con **animaciones** (framer-motion).
  - **Mobile-first** — el responsive se resuelve aquí de raíz, NO parcheando la clásica.
  - **Configuración por pasos (wizard/onboarding)** para no abrumar.
- **Por qué al final:** rediseñar sobre funcionalidad ya estable. Coexiste con la clásica (selector de interfaz). Implica design system / tokens.

---

## Cómo retomar

1. Leer el diseño del punto activo en `docs/plans/`.
2. Crear/usar la rama del punto.
3. Hacer primero el test "go/no-go" del punto (cuando aplique).
4. Implementar de forma aditiva, tras flag de config.
5. Correr `bookCorpus.test.js` (gate 0 overflow) + tests unitarios antes de desplegar.
6. PR a `main`, tag de respaldo del estado bueno.

## Memoria relacionada
Ver `.claude/.../memory/pdf-vectorial.md` para el historial de decisiones del motor, el TOC y la proporción con el folio.
