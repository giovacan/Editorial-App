# Spike de diseño: Sistema de notas al pie de página

> **Tipo:** Revisión/diseño (spike). **Esta rama NO produce código** — solo este documento de diseño y análisis de viabilidad. La implementación real será una rama posterior.

## Context

El motor pagina cada capítulo con un presupuesto vertical **constante** por página (`contentHeight`). Entre la última línea de texto y el folio queda hoy un colchón de ~1 renglón (margen de seguridad, ya optimizado con el fix `floor→round` que quedó activo en `main`). El usuario quiere **notas al pie de página** en esa zona, entre el contenido y el folio.

Requisitos del usuario:
- **Origen dual:** importar notas de Word (via mammoth) **y** crear/editar notas dentro de la app.
- **Colocación estándar editorial:** cada nota va al pie de la **misma página** donde aparece su marca (`<sup>N</sup>`). El motor debe **reducir el contenido** de esa página para que quepan las notas.
- El ajuste contenido↔folio y la proporción correcta **ya están activos** (base de esta feature).

Resultado esperado de este spike: un diseño concreto, con puntos de integración verificados (rutas:línea), que resuelva el riesgo central (dependencia circular presupuesto↔paginación) y quede listo para implementar.

## PRINCIPIO RECTOR (no negociable)

> **No dañar el progreso actual. Solo se adapta una página SI necesita una footnote.**

- Las páginas **sin** marcas de nota deben quedar **byte-idénticas** a como paginan hoy — con toda la mejora de proporción contenido↔folio (`floor→round`, reclamo de header en front-matter) intacta.
- El presupuesto por página solo se reduce **cuando y donde** hay una marca `<sup data-fn>` en el HTML de esa página. Sin nota → `budget` = el de hoy, sin cambios.
- Cambio **aditivo y guardado tras `config.footnotes.enabled`**: con footnotes desactivado (o sin notas en el libro), el motor se comporta EXACTAMENTE como el `main` actual. El gate de regresión (`bookCorpus.test.js`, 0 overflow, texto íntegro) debe seguir verde sin cambios en libros sin notas.

## El problema central: dependencia circular

Colocar una nota en su página reduce el espacio de contenido de esa página → puede empujar la marca de la nota a la página siguiente → la nota se mueve con ella → cambia el presupuesto de dos páginas → repaginación. Clásico acoplamiento layout↔contenido.

### Modelo del motor (verificado)

- `optimalPaginate.js:137-149` — `baseBudget = contentHeight - getDomSlack()`. `contentHeight` viene de `layoutCtx`, **uniforme para todo el capítulo**.
- `optimalPaginate.js:222-223` — `buildCandidates(idx, restHtml, isFirstPage)` calcula `budget = baseBudget + (chapterStartExtra)`. **Cada candidato de página ya conoce su HTML completo** (`acc`, línea 227) antes de fijar su costo.
- El DP construye una tabla de costos donde cada "página-candidata" es un tramo de contenido entre dos cortes; el costo depende del `budget` y del llenado.

### Dos estrategias evaluadas

**A) Presupuesto por candidato dentro del DP (recomendada)**

Como cada candidato ya tiene su HTML, se puede, al generarlo:
1. Detectar las marcas `<sup>`/`<a href="#fn...">` en el HTML de ESE candidato (regex sobre `acc`).
2. Medir la altura del bloque de notas correspondiente a esas marcas (a 8-9pt, ver §medición).
3. Restar esa altura del `budget` de ese candidato: `budget = baseBudget + chExtra − footnoteBlockH(candidato)`.

- **Pros:** resuelve la circularidad de forma **exacta y en una sola pasada** — el DP ya explora todos los cortes posibles y ahora cada corte "sabe" cuánto le cuestan sus notas. La optimalidad se preserva porque el budget sigue siendo función del contenido del candidato (que el DP ya conoce). No hay iteración ni riesgo de no-convergencia.
- **Contras:** más mediciones (una de notas por candidato con marcas). Mitigable con caché por conjunto-de-marcas (igual patrón que `_moduleSplitCache`). Toca el core del DP (`buildCandidates`, `makeSplitCandidate`) — hay que respetar el guard de conservación de texto.
- **Caso límite:** una página cuyo contenido + su bloque de notas no caben ni vacía de otro contenido (muchas notas en un párrafo). Solución: permitir que las notas se **continúen** a la página siguiente (nota partida) o degradar a endnotes esa nota concreta. El DP ya maneja overflow forzado (`allowOverflow`, línea 397).

**B) Segunda pasada de reflow (más simple, no recomendada como única solución)**

Paginar normal (sin notas) → segunda pasada que, por página, reserva la altura de sus notas y reacomoda el contenido que sobra hacia adelante.

- **Pros:** no toca el DP; aislado.
- **Contras:** puede **no converger** — reacomodar empuja marcas entre páginas, cambiando qué notas caen dónde, requiriendo re-reflow (potencialmente oscilante). En libros densos en notas es frágil. Es esencialmente lo que el `fill-pass` legacy hacía y que el motor DP vino a reemplazar por no converger.

### Recomendación

**Estrategia A** (presupuesto por candidato en el DP) para el caso general, con un **fallback controlado** para notas que no caben: continuar la nota en la página siguiente (comportamiento InDesign) o, si se desactiva la continuación, degradar esa nota a endnote. La estrategia B queda descartada como mecanismo principal por el riesgo de no-convergencia (lección del fill-pass legacy).

## Puntos de integración (verificados con rutas:línea)

| # | Área | Archivo | Punto |
|---|------|---------|-------|
| 1 | Presupuesto/DP | `src/utils/pagination/optimalPaginate.js:149,222-223` | Restar `footnoteBlockH(candidato)` del `budget` por candidato |
| 2 | Elementos | `src/utils/pagination/paginateChapters.js:~820-890` | Cada `element.html` preserva `<sup>`/`<a>` — detectables por regex; añadir `element.footnoteRefs` |
| 3 | Medición | `src/utils/textLayoutEngine.js` `measureHtmlHeight(html, ctx)` | Medir notas a 8-9pt: envolver en `font-size:75%` o pasar `ctx` con `baseFontSizePx*0.666` |
| 4 | Import Word | `src/components/UploadArea/UploadArea.jsx:54` + `contentParser.js` | mammoth emite `<sup><a href="#ftnN">` + `<div id="ftnN">…` al final; **separar** notas del cuerpo en un mapa `refId→html` |
| 5 | Render preview | `src/components/PageFrame/PageFrame.jsx:222-233` y `Preview.jsx` (~370) | Inyectar bloque de notas (filete + notas) **entre** el content box y el folio |
| 6 | Render PDF | `src/components/Layout/utils/pdfVectorRenderer.js` | Dibujar filete + notas a fontSize reducido tras el cuerpo, arriba del folio |
| 7 | Config | `src/config/layout.js` `DEFAULT_CONFIG` | Nuevo `footnotes: { enabled, fontSize, lineHeight, separatorWidth, separatorStyle, marginAbove, marginBelow, continuation }` |
| 8 | Objeto Page | `optimalPaginate.js:~638-654` (`pushPage`) | Añadir `page.footnotes: Array<{index, html, refId}>` + `footnoteHeightPx` |
| 9 | Numeración | nuevo módulo | Renumerado global/por-capítulo de marcas y notas (Word trae ids arbitrarios); re-secuenciar tras insertar/eliminar |
| 10 | Detección | `contentParser.js` + nuevo `footnotes.js` | Detectar marcas existentes al importar/cargar: `<sup>`, `<a href="#fn/#ftn/#_ftnref>`, notas nativas de Word/HTML. Normalizar a un solo formato |
| 11 | Gestión en app (CRUD) | editor / SidebarRight / panel de notas | UI para **insertar**, **editar** y **eliminar/quitar** notas; listar las notas detectadas del capítulo |

## Modelo de datos propuesto

- **Mapa de notas por capítulo:** `Map<refId, { index, html }>` extraído en la importación (§4) y aumentable desde la UI de la app (§10). Se pasa al motor vía `layoutCtx.footnotes` o `chapter.footnotes`.
- **Marca en el cuerpo:** `<sup data-fn="refId">N</sup>` (normalizada desde mammoth y desde la app, para un solo formato de detección).
- **Página:** `page.footnotes = [{ index, html, refId, continued? }]` — las notas cuyas marcas caen en esa página (o su continuación).
- **Medición cacheada:** `footnoteBlockH(refIds[])` con caché por conjunto de refIds (patrón `_moduleSplitCache`).

## Ciclo de vida de las notas en la app (detectar / crear / editar / eliminar)

Las notas son datos editables del libro, no solo markup incrustado. Se gestionan como un **mapa de notas por capítulo** que vive en el store (junto a `chapters`) y se sincroniza con las marcas del cuerpo.

### Detectar (importación y carga)
- **Al importar de Word (mammoth):** reconocer los patrones que emite (`<sup><a href="#ftnN">`, `<div id="ftnN">…` al final, y las variantes `#_ftnrefN`/`#footnote-N`). Extraer cada nota a `Map<refId,{index,html}>` y dejar en el cuerpo una marca normalizada `<sup data-fn="refId">N</sup>`.
- **Al cargar un libro existente / pegar HTML:** el mismo detector corre sobre el HTML del capítulo, para que notas ya presentes (de una importación anterior o de otra fuente) se reconozcan y aparezcan en el panel. Módulo nuevo `src/utils/footnotes.js` con `detectFootnotes(html) → { cleanHtml, notes }`, reutilizado por `contentParser.js` y por la carga.
- **Idempotencia:** detectar una marca ya normalizada (`data-fn`) no la vuelve a envolver (evita duplicar, como el guard `nameHint` del importador).

### Insertar (crear en la app)
- Seleccionar texto en el editor → acción "Añadir nota" → inserta `<sup data-fn="newId">N</sup>` en el punto del cursor y crea la entrada en el mapa con contenido vacío para editar.
- Renumerar (§9) por orden de aparición de las marcas en el cuerpo.

### Editar
- Panel de notas del capítulo (lista de `{N, texto}`) editable; o clic en la marca del preview abre el editor de esa nota. Cambiar el texto invalida el fingerprint → repagina (la altura del bloque pudo cambiar).

### Eliminar / quitar
- **Quitar una nota:** eliminar su marca `<sup data-fn>` del cuerpo **y** su entrada del mapa; renumerar el resto. (Quitar solo la marca dejaría una nota huérfana; quitar solo la nota dejaría una marca colgada — la operación es atómica sobre ambos.)
- **Quitar todas las notas del capítulo/libro:** acción masiva (útil tras una importación con notas no deseadas) — limpia marcas + mapa.
- **Degradar a texto:** opción de convertir una nota en texto inline entre paréntesis (sin marca ni pie), para casos donde no se quiere nota al pie.

### Consistencia marca↔nota (invariantes)
- Toda marca `data-fn` en el cuerpo tiene una entrada en el mapa; toda entrada del mapa tiene su marca. Un validador (similar a `useParagraphValidation`) reporta huérfanas.
- La numeración visible siempre deriva del **orden de las marcas en el cuerpo**, no del id — insertar/eliminar/reordenar re-secuencia automáticamente.

## Configuración (`config.footnotes`)

```
footnotes: {
  enabled: true,
  fontSize: 8,            // pt (nota ~8-9pt)
  lineHeight: 1.4,        // unitless
  separatorWidth: 1.5,    // in (filete parcial estilo Chicago/Tschichold)
  separatorStyle: 'solid',
  separatorColor: '#000',
  marginAbove: 0.6,       // em, aire entre última línea de texto y el filete
  marginBelow: 0.3,       // em, aire entre notas y folio
  numbering: 'per-chapter' | 'per-book',
  continuation: true      // permite partir una nota larga a la página siguiente
}
```
Sigue el patrón de `config.chapterTitle` / `config.header` (sub-objeto con defaults en `DEFAULT_CONFIG`, `layout.js`).

## Fingerprint / caché

`config.footnotes` (o su hash) debe entrar en el `configFingerprint` de `paginateChapters.js:244-249` para que cambiar el tamaño/estilo de nota invalide el caché y repagine (mismo mecanismo que ya invalida con `contentHeight`).

## Riesgos y decisiones abiertas para la implementación

1. **Notas que no caben** → continuación (partir nota) vs degradar a endnote. Recomendado: continuación (config `continuation`).
2. **Varias marcas en un mismo párrafo partido** → al partir el párrafo, cada mitad lleva sus marcas; la medición de notas debe seguir a la mitad correcta.
3. **Coste de medición** → caché por conjunto de refIds; medir solo candidatos con marcas.
4. **Numeración** → renumerar en importación (ids de Word son opacos); re-secuenciar tras insertar/editar/eliminar por orden de aparición de las marcas.
5. **Interacción con chapter-start / TOC / front-matter** → esas páginas normalmente no llevan notas; el bloque de notas se salta ahí (como el header).
6. **CRUD atómico** → insertar/eliminar debe tocar marca (cuerpo) **y** entrada (mapa) juntas; un validador detecta huérfanas (marca sin nota o nota sin marca).
7. **Detección idempotente** → correr el detector sobre HTML ya normalizado (`data-fn`) no debe re-envolver ni duplicar.

## Verification (del spike)

Este spike **no ejecuta código**. La validación es de diseño:
- Los 10 puntos de integración están confirmados contra el código real (rutas:línea arriba, verificados por exploración del repo y agente Explore).
- La estrategia A encaja en el DP existente sin romper su modelo (el budget ya es por candidato; el candidato ya conoce su HTML).
- **Antes de implementar** (rama futura), el primer paso de validación técnica será un test aislado que: (a) mida un bloque de notas mock a 8-9pt con `measureHtmlHeight`, (b) confirme que restarlo del `budget` de un candidato produce un corte de página distinto y estable. Ese test es el "go/no-go" de la estrategia A.

## Fuera de alcance de este spike

- Cualquier cambio de código (esta rama queda solo con el documento).
- La UI de gestión de notas (detectar/insertar/editar/eliminar) se **diseña** aquí pero se **implementa** en la rama de implementación.
- Endnotes (notas al final de capítulo/libro) — solo se mencionan como fallback.
