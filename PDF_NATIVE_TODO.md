# PDF Native Renderer — Pendientes

## Estado actual (commit 96220fd)
- ✅ Sangría de párrafos funciona (text-indent em)
- ✅ Parser CSS: em, pt, px, mm + margin shorthand
- ✅ Headings leen font-size inline
- ✅ Justify con última línea left-aligned
- ✅ Headers (left/center/right) + línea separadora
- ✅ Números de página

## Problemas conocidos (pendiente revisar)

### 1. Formateo general "igual que antes"
El texto aparece pero sin la apariencia visual del preview. Posibles causas:
- `font-family` mapeado a `times`/`helvetica` cuando el libro usa otra fuente → **cargar fuente TTF real**
- Tamaños de heading incorrectos (verificar con libro real)
- Espaciado entre elementos (marginTop/Bottom) podría no coincidir con preview

### 2. Fuentes personalizadas no embebidas
`mapFont()` mapea Garamond → times, Lato → helvetica, etc.
Para que el PDF tenga la fuente correcta hay que:
```js
// Cargar TTF desde public/fonts/ o Google Fonts API
const buf = await fetch('/fonts/Lato-Regular.ttf').then(r => r.arrayBuffer());
doc.addFileToVFS('Lato-Regular.ttf', arrayBufferToBase64(buf));
doc.addFont('Lato-Regular.ttf', 'Lato', 'normal');
doc.setFont('Lato', 'normal');
```

### 3. Inline bold/italic en párrafos
`extractText()` concatena texto plano — pierde `<strong>`, `<em>`.
Para soportarlo hay que implementar text runs con cambio de fuente mid-line.

### 4. Imágenes en contenido
No se renderizan (se ignoran). Requiere `doc.addImage()` con la URL.

### 5. Listas (ul/ol)
Se extraen como texto plano sin bullets ni numeración.

## Alternativa: volver a html2canvas como fallback
El archivo `exporters.js` conserva `exportPdf` (html2canvas) que funcionaba bien.
Si el native renderer no se puede hacer funcionar correctamente, se puede reactivar
cambiando el import en `ExportPreviewModal.jsx`:
```js
// Reactivar html2canvas:
import { exportPdf } from '../Layout/utils/exporters';
// y llamar: await exportPdf(safeBookData, safeConfig, paginatedPages, pdfDims, onProgress, 'print');
```
