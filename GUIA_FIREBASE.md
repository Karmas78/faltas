# Guía de Configuración: Firebase v2.0.0

Has migrado la aplicación de Google Sheets a **Firebase Cloud Firestore**. Esto significa que ahora los datos son mucho más rápidos, se sincronizan en tiempo real y no dependen de scripts externos complejos.

## Pasos para activar la nueva versión:

### 1. Crear el proyecto en Firebase
1. Ve a [Firebase Console](https://console.firebase.google.com/).
2. Haz clic en **"Agregar proyecto"** y dale un nombre (ej. `Faltas-PWA`).
3. (Opcional) Puedes desactivar Google Analytics para este proyecto.
4. Haz clic en el icono de **Web (`</>`)** para registrar tu aplicación.
5. Copia el objeto `firebaseConfig` que te darán.

### 2. Configurar las credenciales en el código
1. Abre el archivo `firebase-config.js` en tu editor.
2. Pega los valores que copiaste en el paso anterior.
3. Guarda el archivo.

### 3. Activar Firestore Database
1. En el menú lateral de Firebase, ve a **Compilación** > **Firestore Database**.
2. Haz clic en **"Crear base de datos"**.
3. Elige una ubicación (ej. `southamerica-east1` para Chile/Santiago).
4. Elige **"Comenzar en modo de prueba"** (esto permite leer/escribir durante 30 días mientras configuras).
5. Haz clic en **Habilitar**.

### 4. (Opcional) Reglas de Seguridad
Para que tu app funcione de forma permanente y segura, ve a la pestaña **Reglas** en Firestore y asegúrate de que se vea así:
```javascript
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // Cambiar a 'if request.auth != null' si añades login
    }
  }
}
```

## ¿Cómo volver atrás?
Si prefieres la versión anterior con Google Sheets, solo tienes que cambiar de rama en GitHub:
1. Ve a tu repositorio.
2. En el selector de ramas, elige **`main`**.
3. La rama **`firebase-version`** es la que contiene estos cambios nuevos.

## Datos en GitHub
He subido esta nueva versión a una rama separada llamada `firebase-version` en tu cuenta de GitHub. Los datos ahora viven en la nube de Google Firebase en lugar de una hoja de cálculo local.
