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
