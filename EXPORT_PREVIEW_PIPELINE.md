# Editorial App — Pipeline del Preview y Exportación

## Contexto general

App React 19 + TypeScript para maquetar libros tipo KDP (Amazon).
El usuario sube un documento (Word/TXT), configura formato, y la app genera una
paginación fiel a cómo quedaría impreso el libro.

---

## 1. Stack

| Capa | Tecnología |
|---|---|
| UI | React 19, Vite, CSS modules |
| Estado global | Zustand (`useEditorStore.ts`) |
| Medición de texto | Canvas 2D (`textLayoutEngine.js`) — sin DOM layout |
| Build | Vite 7, TypeScript |

---

## 2. Pipeline completo: desde el texto hasta la pantalla

```
Usuario sube DOCX/TXT
       │
       ▼
UploadArea.jsx → chapterDetection.js
  • Detecta capítulos (por H1/H2 o separadores)
  • Genera array: Chapter[] = [{ id, title, html }]
  • Guarda en Zustand: bookData.chapters
       │
       ▼
usePagination.js  (hook React, se ejecuta cada vez que cambia bookData o config)
  │
  ├── Calcula dimensiones: calculateContentDimensions()
  │     pageWidthPx, pageHeightPx, margins, contentHeight (all at previewScale=0.42)
  │
  ├── Crea measureDiv (div hidden en el DOM para fallback de medición)
  │
  ├── Llama a paginateChapters(chapters, layoutCtx, measureDiv, safeConfig)
  │     → Devuelve Page[]
  │
  ├── setPages(result)              ← estado local del hook
  ├── store.setPaginatedPages(result)  ← también en Zustand (para el modal de export)
  └── store.setLayoutDims(dims)        ← dimensiones de layout en Zustand
       │
       ▼
paginateChapters.js  (función pura, ~700 líneas)
  • Para cada capítulo:
    - Coloca el título del capítulo (puede ser página completa, media página, o continuo)
    - Ajusta para que los capítulos empiecen en página derecha (impar)
    - Llena páginas con párrafos (greedy fill)
    - Aplica reglas de huérfanos/viudas (min 2 líneas)
    - Divide párrafos largos con splitParagraphByLines()
  • Aplica fill-pass (rebalanceo): jala contenido de la siguiente página si la actual
    quedó muy vacía
  • Devuelve: Page[] = [{ html, pageNumber, isBlank, isFirstChapterPage, ... }]
       │
       ▼
textLayoutEngine.js  (medición de texto con Canvas)
  • measureHtmlHeight(html, layoutCtx) — Canvas measureText() + greedy line breaking
  • Sin DOM layout: misma medición en Chrome/Firefox/Safari/Edge
       │
       ▼
Preview.jsx  (sidebar derecho, escala 0.42)
  • Lee pages[] de usePagination
  • Renderiza 1 página a la vez
  • Aplica estilos: fontSize, fontFamily, lineHeightPx, margins
  • Agrega header/footer (useHeaderFooter.js)
  • Agrega número de página
  • Magnifier panel para zoom
       │
       ▼
ExportPreviewModal.jsx  (NEW — pantalla completa)
  • Lee paginatedPages + layoutDims de Zustand
  • Calcula cssScale para llenar la pantalla
  • Usa CSS transform:scale() sobre los mismos divs de página (no re-pagina)
  • Modo PDF: doble cara (spread) — página par a la izquierda, impar a la derecha
  • Modo EPUB/HTML: página individual
  • Toggle "Márgenes": muestra guías rojas punteadas en el área de contenido
  • Botón "Descargar": llama a exportPdf() / exportEpub() / exportHtml()
```

---

## 3. Estructura de datos clave

### `Page` (lo que produce paginateChapters):
```ts
{
  html: string;              // HTML del contenido de la página (párrafos ya divididos)
  pageNumber: number;        // Número de página
  isBlank: boolean;          // Página en blanco (entre capítulos)
  chapterTitle: string;      // Título del capítulo actual
  currentSubheader: string;  // Subcabecera actual (para header/footer)
  isFirstChapterPage: bool;  // ¿Primera página del capítulo? (skip header)
  isTitleOnlyPage: bool;     // ¿Solo tiene el título del capítulo?
  isExtraEndPage: bool;      // Página extra al final
  shouldShowPageNumber: bool;
}
```

### `LayoutDims` (dimensiones calculadas al previewScale=0.42):
```ts
{
  contentHeight: number;    // Alto del área de contenido en px (a previewScale)
  contentWidth: number;     // Ancho del área de contenido en px
  lineHeightPx: number;     // Altura de una línea en px
  baseFontSizePx: number;   // Font size base en px
  baseLineHeight: number;   // Ratio de interlineado
  previewScale: number;     // 0.42 (fijo para sidebar)
  gutterValue: number;      // Medianil en pulgadas
}
```

---

## 4. El sistema de Preview (SidebarRight)

```
SidebarRight
  ├── Tab "Vista previa"  → Preview.jsx (visible)
  │                          usePagination() corre aquí
  │                          Escala: 0.42 (sidebar ~220px de ancho)
  │
  └── Tab "Exportar"     → Preview.jsx (montado pero OCULTO con display:none)
                             La paginación sigue corriendo en background
                             Los pages se guardan en Zustand
```

**Por qué siempre está montado:** Si Preview se desmontara al cambiar de tab,
el estado local de `usePagination` se perdería. Al mantenerlo montado (hidden),
el store siempre tiene `paginatedPages` actualizado.

---

## 5. Export modal — cómo escala las páginas

El modal NO re-pagina. En su lugar:

1. Toma las páginas ya paginadas del store (`paginatedPages`)
2. Las páginas están HTML-renderizadas al `previewScale=0.42`
   - Ej. A5: pageWidthPx ≈ 235px, pageHeightPx ≈ 332px
3. Calcula `cssScale` para llenar la pantalla:
   ```js
   // PDF spread (2 páginas):
   cssScale = Math.min(
     (window.innerWidth - 48 - 20) / (pageWidthPx * 2),
     (window.innerHeight - 120) / pageHeightPx
   )
   // EPUB/HTML (1 página):
   cssScale = Math.min(
     (window.innerWidth - 48) / pageWidthPx,
     (window.innerHeight - 120) / pageHeightPx
   )
   ```
4. Aplica `transform: scale(cssScale)` al div de la página
5. Envuelve cada página en un slot con `width/height = pageWPx * cssScale`
   para que el layout sea correcto

**Resultado:** El texto es vectorial → escala perfectamente sin pixelarse.

---

## 6. Exportadores actuales

| Formato | Función | Tecnología | Estado |
|---|---|---|---|
| PDF | `exportPdf()` | `html2pdf.js` (renderiza HTML crudo, no las páginas paginadas) | ⚠️ Básico — no usa el sistema de paginación |
| EPUB | `exportEpub()` | ZIP manual (Uint8Array) + XHTML por capítulo | ⚠️ Básico — sin estilos tipográficos |
| HTML | `exportHtml()` | Blob de texto HTML simple | ⚠️ Básico — sin layout |

**Problema crítico:** Los exportadores actuales generan el archivo desde
`bookData.chapters[].html` (el HTML original), **ignorando** el sistema de
paginación. El PDF exportado NO se parece al preview.

---

## 7. Lo que falta / puede mejorar

### Alta prioridad
1. **PDF fiel:** El exportador PDF debe renderizar las `paginatedPages[]` una por
   una (html2canvas + jsPDF a 300dpi), no el HTML crudo del editor.
2. **Headers/footers en el modal:** El preview del modal no muestra headers
   (título del libro / capítulo) porque `useHeaderFooter` no puede usarse en
   un loop de páginas.
3. **Páginas en blanco:** El spread no renderiza bien las páginas en blanco
   entre capítulos — quedan como slots vacíos sin el fondo blanco de la página.

### Media prioridad
4. **Opciones de exportación conectadas:** Los checkboxes "Tabla de contenidos",
   "Metadatos", "Comprimir EPUB" en SidebarRight no están conectados a nada.
5. **Zoom manual en el modal:** No hay control de zoom manual (solo el automático
   por viewport).
6. **Miniaturas de páginas:** Un panel lateral con thumbnails de todas las páginas
   para saltar directamente.

### Baja prioridad
7. **EPUB con tipografía:** El EPUB debería incluir la hoja de estilos calculada
   (font-family, font-size, line-height, margins) en su CSS.
8. **Modo impresión:** Ver las páginas con el fondo del papel y sombras para
   simular un libro físico.

---

## 8. Archivos clave

```
src/
├── hooks/
│   ├── usePagination.js           ← Orquestador principal (600 líneas)
│   └── useHeaderFooter.js         ← Genera HTML de cabeceras/pies
├── utils/
│   ├── paginateChapters.js        ← Motor puro de paginación (700 líneas)
│   ├── textLayoutEngine.js        ← Medición de texto con Canvas
│   ├── textMeasurer.js            ← calculateContentDimensions(), conversiones
│   ├── kdpStandards.js            ← Estándares KDP: márgenes, gutters, formatos
│   └── fillPassEngine.js          ← Rebalanceo de páginas infra-llenas
├── components/
│   ├── Preview/Preview.jsx        ← Vista previa en sidebar (~290 líneas)
│   ├── ExportPreviewModal/        ← Modal fullscreen (NUEVO)
│   │   ├── ExportPreviewModal.jsx
│   │   └── ExportPreviewModal.css
│   ├── SidebarRight/SidebarRight.jsx ← Tabs preview/export
│   └── Layout/
│       ├── Layout.jsx             ← Raíz del editor, maneja modal
│       └── utils/exporters.js     ← exportPdf, exportEpub, exportHtml
└── store/
    └── useEditorStore.ts          ← Zustand store (bookData, config, paginatedPages)
```
