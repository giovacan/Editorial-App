# Fase 2: Configuración de Firestore Rules y Testing

## 🚀 Pasos para Activar Fase 2

### 1. Actualizar Firestore Rules

**Importante:** Las reglas de Fase 1 necesitan ser actualizadas para incluir las nuevas reglas de `/books`.

En **Firebase Console → Firestore Database → Rules**:

1. Reemplaza el contenido actual con el contenido de `firestore.rules` (en la raíz del proyecto)
2. **IMPORTANTE:** Cambiar `'TU_EMAIL_ADMIN'` a tu email real (3 ubicaciones)
3. Click "Publish"

El contenido debe incluir:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // system/config: solo admin
    match /system/{document=**} {
      allow read, write: if request.auth != null
        && request.auth.token.email == 'TU_EMAIL_ADMIN';
    }

    // users/{uid}: lectura propia o admin, escritura solo admin
    match /users/{userId} {
      allow read: if request.auth.uid == userId
        || (request.auth != null && request.auth.token.email == 'TU_EMAIL_ADMIN');
      allow write: if request.auth != null && request.auth.token.email == 'TU_EMAIL_ADMIN';
    }

    // books/{bookId}: solo el dueño (uid) puede leer/escribir
    match /books/{bookId} {
      allow read: if request.auth != null
        && request.auth.uid == resource.data.uid;
      allow write: if request.auth != null
        && request.auth.uid == resource.data.uid;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.uid;

      // chapters/{chapterId}: solo el dueño del libro
      match /chapters/{chapterId} {
        allow read, write: if request.auth != null
          && request.auth.uid == get(/databases/$(database)/documents/books/$(bookId)).data.uid;
      }
    }

    // Deny all other access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### 2. Verificar .env.local

El archivo `.env.local` debe tener valores correctos de Fase 1:

```
VITE_FIREBASE_API_KEY=xxxxx
VITE_FIREBASE_AUTH_DOMAIN=xxxxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=xxxxx
VITE_FIREBASE_STORAGE_BUCKET=xxxxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=xxxxx
VITE_FIREBASE_APP_ID=xxxxx
VITE_ADMIN_EMAIL=tu@email.com
```

---

## 🧪 Testing Fase 2

### 1. Iniciar dev server

```bash
npm run dev
```

Debería compilar sin errores.

### 2. Test: Crear Nuevo Libro

1. Abrir http://localhost:5173
2. Redirige a `/login` ✓
3. Click "Regístrate aquí"
4. Rellenar formulario (nombre, email, password)
5. Click "Registrarse"
6. **Esperado:** Redirige a `/books` (dashboard)
7. **Esperado:** Dashboard vacío con mensaje "No tienes libros aún"

### 3. Test: Nuevo Libro

1. Click "Nuevo Libro"
2. **Esperado:** Redirige a `/app?bookId={id}`
3. **Esperado:** Editor abre con libro vacío
4. Verificar en **Firebase Console → Firestore**:
   - Navegar a `books` → debe haber nuevo documento con `uid` del usuario

### 4. Test: Editar Contenido

1. En el editor, escribir título "Mi Primer Libro"
2. Agregar un capítulo con algo de contenido
3. Esperar 2 segundos (debounce)
4. Verificar en **Firebase Console → Firestore**:
   - `/books/{bookId}` debe tener `title: "Mi Primer Libro"`
   - `/books/{bookId}/chapters` debe tener 1 capítulo con contenido HTML

### 5. Test: Real-time Sync

1. Abrir el mismo libro en **dos tabs diferentes**
2. En tab 1, cambiar título a "Libro Editado"
3. Esperar 2 segundos
4. En tab 2, el título debería actualizar automáticamente (real-time listener)

### 6. Test: Volver al Dashboard

1. Click "Mis Libros" en Header
2. **Esperado:** Navega a `/books`
3. **Esperado:** Aparece tarjeta del libro creado con:
   - Título: "Libro Editado"
   - 1 capítulo
   - Palabras contadas correctamente

### 7. Test: Eliminar Libro

1. En dashboard, click botón "✕" en tarjeta del libro
2. Confirmación: "¿Estás seguro...?"
3. Click confirmar
4. **Esperado:** Libro desaparece del dashboard
5. Verificar en Firestore: documento `/books/{bookId}` fue eliminado

### 8. Test: Google Sign-in (opcional)

1. Logout (click avatar en Header → "Cerrar sesión")
2. Ir a `/login`
3. Click "Continuar con Google"
4. Seleccionar cuenta de Google
5. **Esperado:** Redirige a `/books`
6. Verificar en Firestore: `/users/{uid}` creado con datos del Google account

---

## ⚠️ Troubleshooting

### "Permission denied" al crear/editar libro

**Causa:** Firestore Rules no están publicadas correctamente.

**Fix:**
1. Firebase Console → Firestore Database → Rules
2. Verificar que `'TU_EMAIL_ADMIN'` está reemplazado con email real
3. Click "Publish"
4. Esperar 30-60 segundos
5. Recargar app en navegador

### No aparece libro en Firestore después de editar

**Causa:** Debounce aún no ejecutó, o hay error en consola.

**Fix:**
1. Abrir DevTools (F12) → Console
2. Ver si hay errores "Error syncing chapters to Firestore" o similar
3. Si dice "Permission denied": problem es Firestore Rules (ver arriba)
4. Si error es red: verificar que Firebase está accesible

### Editor no carga contenido desde Firestore

**Causa:** `bookId` no está siendo pasado correctamente o hook no se monta.

**Fix:**
1. Verificar URL en navegador: `http://localhost:5173/app?bookId=xxx`
2. Abrir DevTools → Console
3. No debería haber errores
4. Verificar en Application → Local Storage → `editorial-app-storage` tiene contenido
5. Si sigue sin funcionar: recargar página completa (Ctrl+Shift+R)

---

## 📝 Cambios desde Fase 1

Fase 2 agrega:

| Aspecto | Fase 1 | Fase 2 |
|--------|--------|--------|
| **Libros** | 1 libro (localStorage) | Múltiples libros (Firestore) |
| **Rutas** | `/app` (editor) | `/books` (dashboard) + `/app?bookId={id}` (editor) |
| **BD** | localStorage | Firestore (/books collection) |
| **User Docs** | No | Sí, creado al registrarse |
| **Real-time** | No | Sí, onSnapshot listeners |
| **Sync** | localStorage | Firestore (debounced 1500ms) |

---

## ✅ Checklist Final

Antes de pasar a Fase 3:

- [ ] Firestore Rules actualizadas y publicadas
- [ ] `npm run dev` compila sin errores
- [ ] Puedo registrar usuario nuevo
- [ ] Dashboard (`/books`) funciona
- [ ] Puedo crear nuevo libro (aparece en Firestore)
- [ ] Editor carga libro desde Firestore
- [ ] Real-time sync funciona (cambios en dos tabs se sincronizan)
- [ ] Puedo editar contenido y aparece en Firestore (debounce)
- [ ] Puedo eliminar libro
- [ ] Firestore tiene documentos en `/books` y `/users`

---

## 🎯 Próximo Paso: Fase 3 (Stripe)

Una vez que Fase 2 esté funcionando, la Fase 3 agregará:
- Validación de límites según plan (maxBooks, maxExports)
- Integración de Stripe para pagos
- Cloud Functions para webhooks
- Restricciones dinámicas según subscription

---

**¿Listo para Fase 3? Contáctame cuando Fase 2 esté 100% funcional.**
