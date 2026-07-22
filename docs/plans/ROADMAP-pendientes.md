# Roadmap de features pendientes

> Índice de trabajo por hacer, **en orden**. Cada punto tiene (o tendrá) su propio documento de diseño en `docs/plans/`. Se implementan uno a uno, cada uno en su propia rama, sin dañar el progreso ya consolidado en `main`.

## Principio rector (aplica a TODO lo de abajo)

**No dañar el progreso actual.** Los cambios son **aditivos** y guardados tras un flag de config: con la feature desactivada, el motor se comporta EXACTAMENTE como el `main` actual. El gate de regresión (`bookCorpus.test.js`: 0 overflow, texto íntegro) debe seguir verde en libros que no usan la feature.

Estado bueno consolidado (base de todo): tag `toc-sin-huecos-ok-2026-07-21` — TOC sin huecos + proporción contenido↔folio (`floor→round`) activa en `main` y en producción.

---

## Orden de implementación

### 1. Notas al pie de página  ⏳ diseño listo, falta implementar
- **Diseño:** [`footnotes-system-design.md`](./footnotes-system-design.md)
- **Rama:** `feat/footnotes-sistema` (por ahora solo el documento de diseño).
- **Resumen:** notas al pie en la misma página que su marca; reduce el presupuesto SOLO de las páginas con nota. Origen dual (importar de Word + crear/editar/eliminar en la app). Estrategia recomendada: presupuesto por candidato dentro del DP.
- **Primer paso (go/no-go):** test aislado que mida un bloque de notas mock a 8-9pt con `measureHtmlHeight` y confirme que restarlo del `budget` de un candidato produce un corte de página estable.

### 2. Imágenes  🔲 falta diseño + implementación
- **Diseño:** pendiente (crear `images-system-design.md` antes de implementar).
- **Estado actual (verificado):** el motor trata `<img>` como bloque de altura FIJA con default de **4 líneas** si no hay `min-height` (`textLayoutEngine.js:68-77`, `REPLACED_TAGS`). NO lee dimensiones reales, no escala al ancho de columna, y falta el render en el PDF vectorial (`pdfVectorRenderer.js` no dibuja imágenes hoy).
- **Alcance a diseñar:**
  - Medición real: leer intrínsecas (naturalWidth/Height o del `<img>`), escalar al ancho de contenido conservando proporción, medir altura determinística para paginar.
  - Paginación: imagen como bloque que no se parte; si no cabe, va a la página siguiente (o flota según política). Interacción con el presupuesto (y con notas al pie si coinciden).
  - Import: cómo llegan las imágenes de mammoth (¿base64 embebido? enlaces). Almacenamiento (data-URI vs subir a storage).
  - Render: preview (`PageFrame`/`Preview`) y **PDF vectorial** (embeber la imagen en jsPDF).
  - Config: `config.images = { maxWidth, align, caption, ... }`.
  - CRUD en la app: insertar/reemplazar/eliminar/redimensionar, pie de imagen.

### 3. Portada + front/back matter visual  🔲 falta diseño + implementación
- **Estado (verificado):** la portada (`isTitlePage`) **cae al fallback plano** en el PDF vectorial (texto arriba-izquierda), sin layout dedicado centrado. Front matter tiene orden canónico pero no plantillas visuales ricas.
- **Alcance:** `drawTitlePage` dedicado (título/autor centrados, jerarquía), página de copyright, colofón, dedicatoria/epígrafe con formato. Preview + PDF vectorial. (Nota: el TÍTULO del TOC ya replica el estilo de inicio de capítulo — reutilizar ese patrón.)

### 4. Listas y verso/poesía  🔲 falta pulido
- **Estado (verificado):** `<ul>`/`<ol>` y verso (`<br>`) van al **fallback de texto plano** en el PDF vectorial (`pdfVectorRenderer.js`), fuera del alcance de `layoutPageToLines`.
- **Alcance:** dibujar listas con marcador + sangría e interlineado real; verso respetando saltos de línea. Medición ya la maneja `textLayoutEngine` — es render del PDF lo que falta.

### 5. EPUB completo  🔲 falta implementación
- **Estado (verificado):** `exportEpub` (`exporters.js:295`) genera un EPUB 3 **válido pero plano**: sin CSS/estilos, sin imágenes, sin portada, metadata mínima, TOC básico. `exportHtml` igual de básico.
- **Alcance:** aplicar los estilos del libro (CSS embebido), incluir imágenes en el manifest, portada, metadata rica (ISBN, editorial, fecha), TOC navegable con niveles. Los checkboxes de export de `SidebarRight.jsx` (hoy no conectados) deberían controlar qué se exporta.

### 6. Editor visual página-por-página (WYSIWYG paginado)  🔲 falta diseño + implementación
- **Petición del usuario:** un editor que **muestre los saltos de página** y permita editar el contenido **reflejando la maquetación** (ver y modificar página por página desde el editor, no solo el flujo continuo del Editor tiptap actual).
- **Alcance a diseñar:** cómo enlazar el editor (`Editor.jsx`, tiptap) con el resultado paginado (`paginatedPages`); edición que re-pagina en vivo; marcadores visuales de fin de página; posiblemente edición directa sobre el preview. Es el punto más grande — requiere su propio diseño.

### 7. Buscador dentro del libro  🔲 falta implementación
- **Petición del usuario:** buscar texto dentro del libro (encontrar y saltar a resultados).
- **Alcance:** índice de búsqueda sobre el texto de capítulos/páginas; UI de búsqueda con navegación de resultados (resaltado + ir a página). Relativamente acotado.

### 8. Auditoría de botones del panel (sección por sección)  🔲 revisión
- **Petición del usuario:** revisar que **todos los botones del panel hagan lo que deben**, sección por sección.
- **Alcance:** auditar `SidebarRight.jsx` y demás paneles de config; verificar que cada control esté conectado a su lógica y produzca el efecto esperado. Incluye deuda técnica conocida: checkboxes de export no conectados (`SidebarRight.jsx`), footer links `href="#"`, `flushWrites` retornado pero no usado (`useBookSync.js`). Es revisión + fixes puntuales, no una feature grande.

### 9. Corrector ortográfico con contexto  🔲 falta diseño + implementación
- **Petición del usuario:** corrector basado en palabras Y frases, con **contexto** — que entienda cómo debería funcionar la frase, no solo palabra por palabra (ej. distinguir "haber/a ver", "tuvo/tubo", concordancia, tildes según sentido).
- **Flujo de revisión (requisito del usuario, clave):**
  - **Mostrar todas las deficiencias/errores posibles** en una lista (panel de hallazgos) — el usuario ve el panorama completo antes de decidir.
  - **Aplicar uno por uno** (revisar cada sugerencia individualmente: aceptar / ignorar / editar a mano) **o todas de un jalón** (aplicar todas las de alta confianza en bloque).
  - **Manejo de dudas — NO auto-corregir cuando hay ambigüedad:** cuando el corrector no está seguro (baja confianza / varias opciones válidas según contexto), **deja el error marcado sin cambiarlo** para que el usuario lo corrija a mano. Nunca "corregir a la fuerza". → Implica un **nivel de confianza** por hallazgo: alta = candidata a "aplicar todo"; baja/ambigua = solo se marca, requiere decisión manual.
- **Modelo de hallazgo:** `{ rango, textoOriginal, sugerencias[], confianza: 'alta'|'baja'|'ambigua', tipo: ortografía|gramática|tilde|concordancia, autoAplicable: boolean }`.
- **Alcance a diseñar:**
  - Motor: diccionario español (ortografía léxica) + capa contextual. Opciones a evaluar: (a) LanguageTool (reglas gramaticales + contexto, self-host o API), (b) LLM para sugerencias contextuales sobre fragmentos, (c) híbrido (diccionario local rápido para lo léxico + LLM/reglas para contexto y confianza). La confianza es la que decide auto-aplicable vs manual.
  - UI: subrayado de errores en el editor (`Editor.jsx`/tiptap tiene extensiones para esto) con color según confianza; panel de hallazgos con acciones (aceptar / ignorar / ignorar-en-libro / editar); botón "aplicar todas las de alta confianza"; las ambiguas quedan resaltadas para corrección manual.
  - Alcance de análisis: por capítulo/selección (no todo el libro de golpe si usa LLM, por costo/latencia).
  - Config: idioma, reglas activas, umbral de confianza para auto-aplicar, diccionario personal (nombres propios del libro).
- **Nota:** decidir temprano si va con API externa (LanguageTool/LLM) o local; afecta privacidad, costo y offline.

---

## Cómo retomar

1. Leer el diseño del punto activo en `docs/plans/`.
2. Crear/usar la rama del punto.
3. Hacer primero el test "go/no-go" del punto.
4. Implementar de forma aditiva, tras flag de config.
5. Correr `bookCorpus.test.js` (gate 0 overflow) + tests unitarios antes de desplegar.
6. PR a `main`, tag de respaldo del estado bueno.

## Memoria relacionada
Ver `.claude/.../memory/pdf-vectorial.md` para el historial de decisiones del motor, el TOC y la proporción con el folio.
