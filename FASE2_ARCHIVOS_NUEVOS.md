# Fase 2: Archivos Nuevos - Referencia Técnica

## 📁 Servicios

### `src/services/books.js` (181 líneas)

**Funcionalidad:** CRUD completo para books y chapters en Firestore

**Exports:**

#### Book Operations
- `createBook(uid, bookData)` - Crea documento en `/books/{id}`
  - Parámetros: uid (user ID), bookData (title, author, bookType, pageFormat, margins)
  - Retorna: bookId (string - Firestore auto-generated ID)

- `getBook(bookId)` - Obtiene un documento
  - Retorna: { id, uid, title, author, bookType, pageFormat, margins, chapterCount, wordCount, createdAt, updatedAt }

- `updateBook(bookId, updates)` - Actualiza metadata
  - Parámetros: bookId, updates (objeto parcial)
  - Actualiza automáticamente updatedAt

- `deleteBook(bookId)` - Elimina documento + subcollection
  - Usa batch write para eliminar book y todos sus chapters

- `getUserBooks(uid)` - Lista todos los libros del usuario
  - Query: `where('uid', '==', uid) orderBy('updatedAt', 'desc')`
  - Retorna: Array de books

- `subscribeToBook(bookId, callback)` - Real-time listener
  - Retorna: unsubscribe function

#### Chapter Operations
- `getChapters(bookId)` - Obtiene todos los capítulos
  - Query: orderBy('order', 'asc')
  - Retorna: Array de capítulos

- `saveChapters(bookId, chapters)` - Batch write (reemplaza todos)
  - Parámetros: bookId, chapters array
  - Elimina viejos, escribe nuevos, actualiza metadata del book

- `updateChapter(bookId, chapterId, updates)` - Actualiza uno
  - Parámetros: bookId, chapterId, updates

- `deleteChapter(bookId, chapterId)` - Elimina uno

- `subscribeToChapters(bookId, callback)` - Real-time listener
  - Retorna: unsubscribe function

**Notas técnicas:**
- Usa batch writes para operaciones atómicas
- serverTimestamp() automático en createdAt/updatedAt
- Subcollection path: `/books/{bookId}/chapters/{chapterId}`

---

## 🎣 Hooks

### `src/hooks/useBookSync.js` (202 líneas)

**Funcionalidad:** Sincronización bidireccional store ↔ Firestore

**Export:** `useBookSync(bookId)`

**Parámetros:**
- `bookId` (string | null) - El libro a sincronizar

**Retorna:**
```js
{
  flushWrites: () => Promise
}
```

**Comportamiento:**

1. **Montaje:**
   ```js
   // Carga inicial
   const [book, chapters] = await Promise.all([
     getBook(bookId),
     getChapters(bookId)
   ]);
   store.loadBook({ ...book, chapters });
   ```

2. **Suscripciones:**
   ```js
   subscribeToBook(bookId, (updatedBook) => {
     // Actualiza metadata en store
   });
   subscribeToChapters(bookId, (updatedChapters) => {
     // Reemplaza chapters en store
   });
   ```

3. **Debounced Writes:**
   ```js
   // Cuando bookData.title cambia:
   setTimeout(() => {
     updateBook(bookId, { title });
   }, 1500);

   // Cuando bookData.chapters cambia:
   setTimeout(() => {
     saveChapters(bookId, chapters);
   }, 1500);
   ```

4. **Manual Flush:**
   ```js
   const { flushWrites } = useBookSync(bookId);
   await flushWrites(); // Cancela debounce, escribe inmediatamente
   ```

**Cleanup:** Automático al desmontar o cambiar bookId
- Cancela timeouts pendientes
- Unsubscribe de listeners

**Notas técnicas:**
- Usa useRef para refs a unsubscribers
- Usa useRef para refs a timeouts
- isMounted flag para evitar memory leaks
- Cada dependency array cambio = nueva copia del efecto

---

## 📄 Páginas

### `src/pages/BooksPage.jsx` (334 líneas)

**Funcionalidad:** Dashboard de libros (ruta `/books`)

**Props:** Ninguno (usa AuthContext + Firestore)

**Estados:**
- `books` (Array) - Lista de libros del usuario
- `loading` (Boolean) - Cargando del Firestore
- `creating` (Boolean) - Creando nuevo libro
- `error` (String) - Mensaje de error

**Funciones:**

- `handleNewBook()` - Crea nuevo libro
  - `createBook(uid, initialData)`
  - Navega a `/app?bookId={id}`

- `handleOpenBook(bookId)` - Abre libro existente
  - Navega a `/app?bookId={id}`

- `handleDeleteBook(bookId)` - Elimina libro
  - Confirmación con window.confirm()
  - `deleteBook(bookId)`
  - Actualiza UI inmediatamente

**Estilos:** Inline (sin CSS externo)
- Grid responsive: `minmax(300px, 1fr)`
- Tarjetas con hover effect
- Empty state cuando no hay libros

**Componentes:**
- Header con título + "Nuevo Libro" button
- Grid de tarjetas (cada una es un libro)
- Empty state con call-to-action
- Error message si falla

**Notas técnicas:**
- useAuth() para obtener user.uid
- useNavigate() para navegación
- getUserBooks(uid) solo se llama una vez en useEffect
- e.stopPropagation() en delete para no activar handleOpenBook

---

## 🔌 Contextos (sin cambios de Fase 2, pero importante)

### `src/contexts/AuthContext.jsx` (52 líneas)

**Cambio en Fase 2:** Línea 35
```js
// ANTES (broken):
signInGoogle,

// AHORA (fixed):
signInGoogle: signInWithGoogle,
```

---

## 🔧 Servicios - Modificaciones

### `src/services/auth.js` (88 líneas)

**Cambio:** Ahora crea user documents en Firestore

**Nueva función:**
```js
createOrUpdateUserDoc(user, displayName)
  → Crea/merges /users/{uid} en Firestore
  → Campos: email, displayName, photoURL, subscription, stats, createdAt
  → merge: true para evitar sobrescribir si ya existe
```

**Modificaciones:**
- `signUpWithEmail()` - Ahora llama `createOrUpdateUserDoc(user, displayName)`
- `signInWithGoogle()` - Ahora llama `createOrUpdateUserDoc(user)`

---

## 📦 Store - Modificaciones

### `src/store/useEditorStore.ts`

**Nueva Acción (después de `loadContent`):**
```js
loadBook: (document: Document) => set((state) => ({
  bookData: document,
  editing: {
    ...state.editing,
    activeChapterId: document.chapters[0]?.id || null,
    isDirty: false
  },
  ui: { ...state.ui, showUpload: false, showPreview: true }
}))
```

**Modificación en `newProject()`:**
```js
// ANTES:
bookData: {
  title: '',
  author: '',
  chapters: [],
  // ... sin id
}

// AHORA:
bookData: {
  id: nanoid(),  // ← NUEVO
  title: '',
  author: '',
  chapters: [],
  // ...
}
```

---

## 🛣️ Routing - Modificaciones

### `src/App.jsx`

**Nuevo import:**
```js
import BooksPage from './pages/BooksPage';
```

**Nueva ruta:**
```js
<Route element={<ProtectedRoute />}>
  <Route path="/books" element={<BooksPage />} />  // ← NUEVA
  <Route path="/app" element={<Layout />} />
</Route>
```

**Cambios en defaults:**
```js
// ANTES:
<Route path="/" element={<Navigate to="/app" replace />} />
<Route path="*" element={<Navigate to="/app" replace />} />

// AHORA:
<Route path="/" element={<Navigate to="/books" replace />} />
<Route path="*" element={<Navigate to="/books" replace />} />
```

---

## 🎨 Componentes - Modificaciones

### `src/components/Layout/Layout.jsx`

**Nuevos imports:**
```js
import { useSearchParams } from 'react-router-dom';
import { useBookSync } from '../../hooks/useBookSync';
```

**Nuevo código:**
```js
const [searchParams] = useSearchParams();
const bookId = searchParams.get('bookId');

// Sync with Firestore if bookId is provided
useBookSync(bookId);
```

**Impacto:**
- Si `bookId` en URL → carga desde Firestore
- Si NO hay `bookId` → editor vacío (como antes)
- localStorage sigue funcionando para caché

### `src/components/Header/Header.jsx`

**Nuevo botón (primera línea de nav):**
```js
<button
  className="btn btn-secondary"
  onClick={() => navigate('/books')}
>
  Mis Libros
</button>
```

**Impacto:**
- Desde editor, usuario puede regresar al dashboard
- Ubicado antes de "+ Nuevo" button

---

## 🔒 Configuración - Modificaciones

### `firestore.rules`

**Nueva sección:**
```rules
match /books/{bookId} {
  allow read: if request.auth != null
    && request.auth.uid == resource.data.uid;
  allow write: if request.auth != null
    && request.auth.uid == resource.data.uid;
  allow create: if request.auth != null
    && request.auth.uid == request.resource.data.uid;

  match /chapters/{chapterId} {
    allow read, write: if request.auth != null
      && request.auth.uid == get(/databases/$(database)/documents/books/$(bookId)).data.uid;
  }
}
```

**Impacto:**
- Solo owner del libro puede leer/escribir
- Chapters heredan permisos del libro padre
- Validación de uid en create

---

## 📊 Resumen de Cambios por Archivo

| Archivo | Tipo | Líneas | Cambio |
|---------|------|--------|--------|
| `src/services/books.js` | NEW | 181 | CRUD Firestore |
| `src/hooks/useBookSync.js` | NEW | 202 | Sync bidireccional |
| `src/pages/BooksPage.jsx` | NEW | 334 | Dashboard |
| `src/services/auth.js` | MOD | +30 | User doc creation |
| `src/store/useEditorStore.ts` | MOD | +20 | loadBook() + id |
| `src/components/Layout/Layout.jsx` | MOD | +5 | useBookSync hook |
| `src/components/Header/Header.jsx` | MOD | +4 | "Mis Libros" button |
| `src/App.jsx` | MOD | +8 | /books route |
| `src/contexts/AuthContext.jsx` | MOD | +1 | signInGoogle fix |
| `firestore.rules` | MOD | +15 | /books rules |

**Total:** 3 NEW files + 7 MOD files = 10 changed files

---

## 🧪 Testing por Archivo

### Para testear `books.js`:
```js
import * as booksService from './services/books';

// Test create
const id = await booksService.createBook('user123', {
  title: 'Test Book'
});
console.log('Created:', id);

// Test read
const book = await booksService.getBook(id);
console.log('Read:', book);

// Test update
await booksService.updateBook(id, { title: 'Updated' });

// Test get all
const books = await booksService.getUserBooks('user123');
console.log('User books:', books);

// Test delete
await booksService.deleteBook(id);
```

### Para testear `useBookSync`:
```js
// En componente que usa Layout
const bookId = 'abc123';

// Hook automáticamente:
// 1. Carga de Firestore
// 2. Se suscribe a cambios
// 3. Escribe debounced

// Editor edita → 1500ms → Firestore actualiza
// Otro dispositivo → onSnapshot → UI actualiza
```

### Para testear `BooksPage`:
```js
// Navega a /books
// Debería mostrar libros cargados
// Click "Nuevo Libro" → URL cambia a /app?bookId=...
// Click libro → URL cambia a /app?bookId=...
// Click eliminar → confirma → desaparece
```

---

## 🔍 Puntos de Integración

### 1. BooksPage → useBookSync
```
BooksPage navega: navigate('/app?bookId={id}')
    ↓
Layout.jsx monta
    ↓
useBookSync(bookId) inicia
    ↓
loadBook() carga desde Firestore
```

### 2. Editor → Firestore writes
```
store.setBookData() (user edita)
    ↓
useBookSync detecta en useEffect
    ↓
debounce 1500ms
    ↓
updateBook() o saveChapters()
    ↓
Firestore actualiza
```

### 3. Real-time sync
```
User A edita
    ↓
updateBook() → Firestore
    ↓
User B's subscribeToBook() detects
    ↓
callback → store.setBookData()
    ↓
UI actualiza automáticamente
```

---

## 📝 Notas de Desarrollo

### Si necesitas cambiar debounce time:
```js
// En useBookSync.js, busca:
setTimeout(async () => {
  await updateBook(bookId, { ...updates });
}, 1500);  // ← Cambiar este número (en ms)
```

### Si necesitas agregar más fields a book:
```js
// 1. Actualiza firebaseConfig (Fase 1 setup)
// 2. En createBook() agrega field
// 3. En updateBook() acepta field
// 4. En useBookSync() agrega a dependency array
// 5. En firestore.rules valida si es necesario
```

### Si necesitas cambiar estructura de chapters:
```js
// Cambia campo en Chapter interface (src/types/index.ts)
// Actualiza saveChapters() para mapear correctamente
// Actualiza firestore.rules si hay validaciones
```

---

**Fin de Referencia Técnica - Fase 2 Completada ✅**
