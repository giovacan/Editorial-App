# Arquitectura Fase 2: Firestore CRUD + Dashboard

## 🏗️ Diagrama de Flujo

```
Usuario Login
    ↓
/login → autenticado
    ↓
/books (BooksPage) ← NUEVO
    ↓
[Click "Nuevo Libro" o "Abrir Libro"]
    ↓
/app?bookId={id} (Layout + useBookSync)
    ↓
useBookSync Hook
  ├─ Load: getBook() + getChapters()
  ├─ Subscribe: onSnapshot()
  └─ Write: debounce (1500ms) → Firestore
    ↓
Editor (same as before)
    ↓
[Click "Mis Libros" en Header]
    ↓
/books (regresa al dashboard)
```

---

## 📦 Componentes Principales

### 1. **BooksPage.jsx** (`/books`)

**Responsabilidad:** Dashboard de libros del usuario

```jsx
// Props: ninguno (usa useAuth + getUserBooks)
function BooksPage() {
  const { user } = useAuth();
  const [books, setBooks] = useState([]);

  // Carga libros al montar
  useEffect(() => {
    getUserBooks(user.uid).then(setBooks);
  }, [user]);

  // Crear nuevo libro
  const handleNewBook = async () => {
    const bookId = await createBook(user.uid, initialData);
    navigate(`/app?bookId=${bookId}`);
  };

  // Abrir libro existente
  const handleOpenBook = (bookId) => {
    navigate(`/app?bookId=${bookId}`);
  };

  // Eliminar libro
  const handleDeleteBook = async (bookId) => {
    await deleteBook(bookId);
    setBooks(prev => prev.filter(b => b.id !== bookId));
  };
}
```

**Flujo:**
1. Montar → carga `getUserBooks(uid)` desde Firestore
2. Renderiza tarjetas con cada libro
3. Click libro → `navigate('/app?bookId={id}')`
4. Delete → `deleteBook()` elimina documento + subcollection

---

### 2. **useBookSync.js** Hook

**Responsabilidad:** Sincronizar store ↔ Firestore

```jsx
// En Layout.jsx:
const [searchParams] = useSearchParams();
const bookId = searchParams.get('bookId');

// Inicializa sync automáticamente
const { flushWrites } = useBookSync(bookId);

// Opcionalmente: flush inmediato en botón Guardar
const handleSaveProject = async () => {
  await flushWrites();
  // ... download JSON, etc
};
```

**Qué hace:**

1. **Al montar:**
   ```js
   const [bookData, chaptersData] = await Promise.all([
     getBook(bookId),      // Firestore doc
     getChapters(bookId)   // Subcollection docs
   ]);
   store.loadBook({ ...bookData, chapters: chaptersData });
   ```

2. **Subscripciones en tiempo real:**
   ```js
   // Si otro dispositivo edita, este se actualiza automáticamente
   subscribeToBook(bookId, (updatedBook) => {
     store.setBookData({ title, author, ... });
   });

   subscribeToChapters(bookId, (updatedChapters) => {
     store.loadContent(updatedChapters);
   });
   ```

3. **Writes debounced:**
   ```js
   // Cada vez que bookData cambia:
   useEffect(() => {
     const timeout = setTimeout(async () => {
       await updateBook(bookId, { title, author, ... });
     }, 1500); // Espera 1500ms antes de escribir

     return () => clearTimeout(timeout);
   }, [bookData.title, bookData.author, ...]);
   ```

4. **Flush manual:**
   ```js
   // Cancela debounce, escribe inmediatamente
   const { flushWrites } = useBookSync(bookId);
   flushWrites(); // → Promise que resuelve cuando Firestore responde
   ```

---

### 3. **books.js Service**

**Responsabilidad:** CRUD de Firestore para books y chapters

#### CRUD de Books

```js
// Crear
const bookId = await createBook(uid, {
  title: 'Nuevo Libro',
  author: 'Author Name',
  bookType: 'novela',
  pageFormat: '6x9'
});
// Retorna: string (Firestore doc ID)
// Crea documento en /books/{bookId} con uid del usuario

// Obtener uno
const book = await getBook(bookId);
// Retorna: { id, uid, title, author, chapterCount, wordCount, ... }

// Obtener todos del usuario
const books = await getUserBooks(uid);
// Retorna: Array de libros, ordenado por updatedAt desc

// Actualizar metadata
await updateBook(bookId, {
  title: 'Nuevo Título',
  pageFormat: 'a4'
});

// Eliminar (including chapters subcollection)
await deleteBook(bookId);
```

#### CRUD de Chapters

```js
// Obtener todos
const chapters = await getChapters(bookId);
// Retorna: Array de capítulos ordenado por order

// Guardar bulk (al cargar o hacer bulk update)
await saveChapters(bookId, [
  { id: 'ch1', type: 'chapter', title: 'Cap 1', html: '...', wordCount: 500 },
  { id: 'ch2', type: 'chapter', title: 'Cap 2', html: '...', wordCount: 600 }
]);
// Borra todos los capítulos viejos y escribe nuevos (batch)

// Actualizar uno
await updateChapter(bookId, chapterId, {
  html: '<p>New content</p>',
  wordCount: 750
});

// Eliminar uno
await deleteChapter(bookId, chapterId);
```

#### Real-time Subscriptions

```js
// Escuchar cambios en el libro
const unsubscribeBook = subscribeToBook(bookId, (book) => {
  console.log('Libro actualizado:', book);
  // Called whenever /books/{bookId} changes on Firestore
});

// Escuchar cambios en capítulos
const unsubscribeChapters = subscribeToChapters(bookId, (chapters) => {
  console.log('Capítulos actualizados:', chapters);
  // Called whenever chapters subcollection changes
});

// Limpiar
unsubscribeBook();
unsubscribeChapters();
```

---

## 🔄 Flujo de Edición Completo

### Paso 1: Usuario abre libro en editor

```
URL: /app?bookId=abc123
    ↓
Layout.jsx monta
    ↓
useBookSync(bookId='abc123') inicia
    ↓
getBook('abc123') + getChapters('abc123')
    ↓
store.loadBook({ title, author, chapters: [...] })
    ↓
Editor renderiza con contenido de Firestore
```

### Paso 2: Usuario edita título

```
User types "Mi Nuevo Título" en input
    ↓
store.setBookData({ title: 'Mi Nuevo Título' })
    ↓
useBookSync detecta cambio (useEffect dependency)
    ↓
setTimeout 1500ms, luego:
    updateBook(bookId, { title: 'Mi Nuevo Título' })
    ↓
Firestore actualiza /books/abc123
```

### Paso 3: Otro usuario (otra pestaña/dispositivo) abre mismo libro

```
URL: /app?bookId=abc123
    ↓
useBookSync inicia subscripciones con onSnapshot()
    ↓
onSnapshot(ref) detects updated title
    ↓
Callback ejecuta: store.setBookData({ title: 'Mi Nuevo Título' })
    ↓
Editor actualiza en tiempo real (sin refrescar página)
```

### Paso 4: Usuario hace click "Guardar"

```
Click "Guardar" en Header
    ↓
handleSaveProject() llama flushWrites()
    ↓
flushWrites():
  - Cancela timeouts pendientes
  - Escribe metadata + chapters inmediatamente
  - Await Promise.all([updateBook(), saveChapters()])
    ↓
Firestore responde
    ↓
Show "Guardado" feedback (opcional)
```

---

## 🔐 Seguridad: Firestore Rules

### Estructura

```
/books/{bookId}
  - Solo lectura si request.auth.uid == resource.data.uid
  - Solo escritura si request.auth.uid == resource.data.uid
  - Solo creación si request.auth.uid == request.resource.data.uid

  /chapters/{chapterId}
    - Solo acceso si owner del libro (uid) == auth.uid
```

### Ejemplos de lo que pasa

| Caso | Result |
|------|--------|
| User A crea libro → `uid = userA` | ✅ Puede leer/escribir |
| User A intenta leer libro de User B | ❌ Permission denied |
| Admin intentadera leer User A's libro | ❌ Permission denied (no es owner) |
| Anónimo intenta crear libro | ❌ Permission denied (no autenticado) |

---

## 📊 Firestore Estructura

### Documento `/books/abc123`

```json
{
  "uid": "user-123",
  "title": "Mi Primer Libro",
  "author": "Juan Pérez",
  "bookType": "novela",
  "pageFormat": "6x9",
  "margins": {
    "top": 0.5,
    "bottom": 0.5,
    "left": 0.75,
    "right": 0.75
  },
  "chapterCount": 2,        // Desnormalizado
  "wordCount": 15000,        // Desnormalizado
  "createdAt": Timestamp,
  "updatedAt": Timestamp
}
```

### Subcollection `/books/abc123/chapters`

```json
// Documento: ch-001
{
  "id": "chapter-1234567890",
  "type": "chapter",
  "title": "Capítulo 1",
  "html": "<p>Contenido del capítulo...</p>",
  "wordCount": 5000,
  "order": 0,
  "updatedAt": Timestamp
}

// Documento: ch-002
{
  "id": "chapter-1234567891",
  "type": "chapter",
  "title": "Capítulo 2",
  "html": "<p>Más contenido...</p>",
  "wordCount": 10000,
  "order": 1,
  "updatedAt": Timestamp
}
```

---

## 🔗 Integración con el Store

### Antes (localStorage)

```js
// Guardar
useEffect(() => {
  localStorage.setItem('book', JSON.stringify(bookData));
}, [bookData]);

// Cargar
useEffect(() => {
  const saved = localStorage.getItem('book');
  if (saved) setBookData(JSON.parse(saved));
}, []);
```

### Ahora (Firestore + localStorage)

```js
// Layout.jsx
const bookId = searchParams.get('bookId');
useBookSync(bookId);  // ← Hook maneja TODO

// useBookSync internamente:
// 1. Carga de Firestore al montar
// 2. Suscripción en tiempo real
// 3. Debounce writes a Firestore
// 4. localStorage sigue funcionando como caché
```

**localStorage sigue siendo útil para:**
- Offline mode (si Firestore write falla)
- Caché local rápido
- Fallback si Firestore está down

---

## 🎯 Casos de Uso

### Caso 1: Crear Nuevo Libro

```
1. BooksPage → Click "Nuevo Libro"
2. createBook(uid, {title, author, ...})
3. Firebase genera auto ID: 'abc123'
4. Navega a /app?bookId=abc123
5. useBookSync carga documento vacío
6. Editor listo para editar
```

### Caso 2: Editar Título

```
1. Editor: input title → onChange → store.setBookData({title})
2. useBookSync detecta cambio en 1500ms
3. updateBook(bookId, {title}) → Firestore
4. Otros dispositivos (onSnapshot) actualizan automáticamente
5. localStorage también se actualiza
```

### Caso 3: Agregar Capítulo

```
1. Editor: Click "+ Capítulo"
2. store.addChapter() → nuevo chapter en array
3. useBookSync en 1500ms:
   - saveChapters(bookId, chapters) → reemplaza todos en Firestore
   - Actualiza chapterCount y wordCount desnormalizados
4. Dashboard muestra "2 capítulos" automáticamente
```

### Caso 4: Sincronización Multi-dispositivo

```
Dispositivo A:                    Dispositivo B:
Abre /app?bookId=abc123         Abre /app?bookId=abc123
↓                                ↓
useBookSync + onSnapshot         useBookSync + onSnapshot
↓                                ↓
(edita título)                   onSnapshot detects change
↓                                ↓
1500ms debounce                  updateBook() en Firestore
↓                                ↓
updateBook() → Firestore         callback ejecuta
↓                                ↓
onSnapshot detects change        store.setBookData()
↓                                ↓
callback ejecuta                 UI actualiza automáticamente
↓
store.setBookData()
↓
UI actualiza automáticamente
```

---

## 💾 localStorage vs Firestore

| Aspecto | localStorage | Firestore |
|---------|---|---|
| **Velocidad** | Instant | 50-200ms |
| **Sincronización** | Manual | Automática (onSnapshot) |
| **Offline** | ✅ Funciona | ❌ Falla (pero caché ayuda) |
| **Multi-dispositivo** | ❌ No | ✅ Sí |
| **Límite** | ~5-10MB | Ilimitado (1MB/doc) |
| **Persistencia** | Navegador | Permanente |

**Estrategia actual:**
- Firestore: Fuente de verdad
- localStorage: Caché offline + fallback

---

## ⚡ Performance

### Debounce 1500ms

**Por qué?**
- Evita excesivas escrituras en Firestore
- Agrupa cambios del usuario (típicamente edita durante segundos)
- 1 escritura en lugar de 20 por segundo

**Ejemplo:**
```
User types: "Mi libro"
  M → updateBook immediately? NO
  i → updateBook immediately? NO
  (space)
  l → updateBook immediately? NO
  i → updateBook immediately? NO
  b → updateBook immediately? NO
  r → updateBook immediately? NO
  o → updateBook immediately? NO
[1500ms sin cambios]
  → updateBook('Mi libro') × 1
```

### Subcollection Strategy

**Por qué separar chapters?**

```
Opción 1: Capítulos en documento principal
/books/abc123 = {
  title: "...",
  chapters: [
    { html: "<p>10,000 palabras...</p>" },
    { html: "<p>15,000 palabras...</p>" },
    ...
  ]
}
❌ Rápidamente supera 1MB limit

Opción 2: Capítulos en subcollection
/books/abc123 = { title: "..." }
/books/abc123/chapters/ch1 = { html: "..." }
/books/abc123/chapters/ch2 = { html: "..." }
✅ Sin límite de tamaño
✅ Escrituras granulares
✅ Mejor escalabilidad
```

---

## 🐛 Debugging

### Ver cambios en Firestore

```
Firebase Console → Firestore Database
  → books/{bookId}
    → See metadata
  → books/{bookId}/chapters
    → See all chapters
  → Real-time listener indicator (blue dot)
```

### Ver logs en consola

```js
// En useBookSync.js, descomenta para debug:
console.log('Loading book:', bookData);
console.log('Syncing to Firestore:', updates);
console.log('Real-time update:', snapshot);
```

### Network tab

```
DevTools → Network
  Filter: "firestore"
  → Ver requests a Firestore
  → Timing de debounce
  → Bytes guardados
```

---

## 📋 Checklist para Desarrollo

- [ ] Entiendo flujo: BooksPage → `/app?bookId` → useBookSync
- [ ] Entiendo CRUD: createBook, getBook, updateBook, deleteBook
- [ ] Entiendo sync: debounce 1500ms, onSnapshot, flushWrites
- [ ] Entiendo seguridad: Firestore Rules (owner-only)
- [ ] He visto estructura: /books/{id}, /books/{id}/chapters/{id}
- [ ] He probado: crear, editar, eliminar, multi-dispositivo
- [ ] He revisado: localStorage sigue siendo caché, no eliminado

---

**Próximo: Fase 3 (Stripe Integration)**

Una vez que este arquitectura esté probada, agregaremos validaciones de límites según plan y pagos.
