# B2 — Imágenes: diseño (PR1 = motor + render)

## Context

Roadmap Fase B2. Hoy las imágenes están rotas de raíz: una `<img>` (sin texto) **se descarta antes de paginar** (`paginateChapters.js:799` filtra por `textContent.trim() || tag==='HR'`); si llegara, el motor le da **altura fija de 4 líneas** (`textLayoutEngine.js:68-77`, sin medir su tamaño real); el **PDF vectorial no la dibuja** (cae al fallback de texto); y el preview la muestra cruda sin escalar (falta `max-width:100%`).

**B2-PR1 (este):** que las imágenes **de Word** se preserven, se **midan a su tamaño real escalado al ancho de columna**, se **paginen como bloque no divisible**, y se **dibujen** en preview y PDF — **con las imágenes embebidas (data-URI)** que ya trae Word. Sin UI de insertar/redimensionar y **sin Firebase Storage** (ambos son PR aparte). Como el motor/render funcionan igual con data-URI o URL, mover a Storage después no los toca.

**Decisiones del usuario:** Storage → **PR separado** (B2-PR2 o B2-PR3). PR1 usa data-URI embebido; se avisa por toast si el libro se vuelve pesado para localStorage.

**Principio rector:** aditivo. Un libro sin imágenes pagina idéntico (el filtro solo se amplía para preservar `<img>`; nada más cambia). Gate: `bookCorpus.test.js` debe seguir 2/2.

## Modelo de datos

Cada imagen del cuerpo es un bloque `<img>` con **dimensiones precomputadas** en atributos, para que el motor (worker, sin DOM) mida de forma determinista:
```
<img src="<url|data-uri>" data-w="1200" data-h="800" alt="…">
```
`data-w`/`data-h` = dimensiones intrínsecas en px (o el aspect-ratio). El motor escala al ancho de columna conservando proporción.

## Piezas (PR1)

### 1. Precomputar dimensiones al importar — `UploadArea.jsx` (~L54) + helper nuevo `utils/images.js`
- Tras `mammoth.convertToHtml`, antes de pasar el HTML a `parseHtmlContent`: recorrer las `<img>`, cargar cada una con `new Image()` (main thread), obtener `naturalWidth/Height`, e inyectar `data-w`/`data-h` en el tag. Helper `precomputeImageDims(html) → Promise<html>` en `utils/images.js`.
- Si una imagen no carga, se le da una proporción por defecto (4:3) para no romper.

### 2. Preservar `<img>` en la paginación — `paginateChapters.js:799`
- Ampliar el filtro: `el.textContent.trim() || el.tag === 'HR' || el.tag === 'IMG'` (y `FIGURE` si aplica). **Único cambio de comportamiento**, y solo afecta a docs con imágenes.

### 3. Medición real — `textLayoutEngine.js:68-77` (`calculateElementHeight`, rama REPLACED_TAGS)
- Para IMG: leer `data-w`/`data-h` (o `width`/`height` del style). Escalar: `renderW = min(intrinsicW, contentWidth × maxWidthFrac)`, `renderH = renderW × (intrinsicH / intrinsicW)`, respetando `config.images.maxHeight` (tope, p.ej. 85% de la página). Altura del bloque = `marginTop + renderH + marginBottom`. Determinista (sin DOM).
- Fallback actual (4 líneas) se mantiene solo si faltan dimensiones.

### 4. Paginación como bloque no divisible — `optimalPaginate.js`
- Ya trata bloques como atómicos; una imagen que no cabe pasa a la página siguiente. Reutilizar `allowOverflow` para el caso patológico (imagen más alta que una página → se permite el overflow controlado, o se escala al alto máximo). Sin cambios grandes: la imagen es un elemento con su `height` medido.

### 5. Render preview — `PageFrame.jsx` / `Preview.jsx` (+ CSS)
- CSS global en el content box: `.pf-content img, .preview-content img { max-width:100%; height:auto; display:block; margin:… }` para que la imagen se escale al ancho de columna (coincide con la medición). Alineación desde `config.images.align`.

### 6. Render PDF vectorial — `pdfVectorRenderer.js` (`drawPassthrough`, ~L804, antes de la rama TABLE)
- Rama `if (tag === 'IMG')`: extraer `src` (data-URI o URL), derivar formato (`PNG`/`JPEG` del prefijo), calcular `w/h` en mm (mismo escalado que la medición), `doc.addImage(src, format, xMm, yMm, wMm, hMm)`. Avanzar por la altura medida por el motor (como las tablas). jsPDF acepta data-URIs directamente; para URLs de Storage, pre-cargar a data-URI antes de exportar (fetch→base64, patrón ya usado para las fuentes Gelasio).

### 7. Config — `store/useEditorStore.ts` + `config/layout.js`
- `images: { maxWidthFrac: 0.9, maxHeightFrac: 0.85, align: 'center', caption: false }`. Incluir en el `configFingerprint` (`paginateChapters.js`, bump versión) para repaginar al cambiar tamaños.

### 8. Storage (subida) — FUERA de PR1 (PR aparte)
- Firebase Storage **no está integrado** hoy (solo el bucket configurado en `firebase.js:20`). En un PR posterior: `services/images.js` con `uploadImage(bookId, blob) → url`, subir al importar/insertar (si hay login) y reemplazar el `src` por la URL, con fallback a data-URI. **PR1 no lo toca** — usa data-URI embebido, y si el libro pesa mucho para localStorage se avisa por toast.

## Ficheros (PR1)

- **Nuevo:** `utils/images.js` (precompute dims + escalado compartido) · `utils/images.test.js`.
- **Motor:** `paginateChapters.js` (filtro + fingerprint), `textLayoutEngine.js` (medición IMG).
- **Import:** `UploadArea.jsx` (precompute dims al importar).
- **Render:** `PageFrame.jsx`/`Preview.jsx` (+CSS), `pdfVectorRenderer.js` (addImage).
- **Config:** `store/useEditorStore.ts`, `config/layout.js`.

## Verification

1. **Unit:** `images.test.js` — escalado (ancho columna, tope de alto, proporción conservada) puro; medición de altura de una `<img data-w data-h>` con `measureHtmlHeight` (monótona con el tamaño). 
2. **Regresión (CRÍTICO):** `bookCorpus.test.js` → **2/2** (libros sin imágenes = idéntico; el filtro ampliado no cambia nada sin `<img>`).
3. **Motor con imagen:** test que pagina un capítulo con una `<img data-w data-h>` y verifica: la imagen NO se descarta, su altura escala con `data-w/h` y `contentWidth`, y una imagen grande cae a la página siguiente (no overflow de texto).
4. **Visual (app):** importar un `.docx` con imágenes → verlas escaladas al ancho en preview y en el PDF vectorial, paginadas sin solaparse.

## Fuera de alcance (PR2)

- UI de insertar/reemplazar/eliminar/redimensionar imágenes + pie de imagen (caption).
- Validación de resolución (≥300 dpi) — eso es B3 (KDP).
