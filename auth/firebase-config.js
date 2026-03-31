// ============================================================
// CONFIGURACIÓN FIREBASE — completar con tus datos del proyecto
// ============================================================
// 1. Ir a https://console.firebase.google.com
// 2. Crear proyecto (o abrir el existente)
// 3. Ir a "Configuración del proyecto" (ícono ⚙️) > pestaña "General"
// 4. En "Tus apps" hacer clic en el ícono web (</>), registrar la app
// 5. Copiar el objeto firebaseConfig que aparece y pegar abajo
// ============================================================

export const firebaseConfig = {
  apiKey:            "AIzaSyCsbCcfDTKGOqn5CtyrNxXJJos37vKiunU",
  authDomain:        "calcula-tu-maquina.firebaseapp.com",
  projectId:         "calcula-tu-maquina",
  storageBucket:     "calcula-tu-maquina.firebasestorage.app",
  messagingSenderId: "688675914138",
  appId:             "1:688675914138:web:d70f770da85f31c92c7a23",
  measurementId:     "G-F16S9RY138"
};

// ============================================================
// PASOS OBLIGATORIOS EN FIREBASE CONSOLE:
//
// A) Firebase Authentication
//    › Authentication > Sign-in method > Email/Password → HABILITAR
//
// B) Cloud Firestore
//    › Firestore Database > Crear base de datos
//    › Elegir modo "Producción" o "Prueba" según etapa
//    › Reglas recomendadas para producción:
//
//      rules_version = '2';
//      service cloud.firestore {
//        match /databases/{database}/documents {
//          match /usuarios/{uid} {
//            allow read, write: if request.auth != null && request.auth.uid == uid;
//          }
//        }
//      }
// ============================================================
