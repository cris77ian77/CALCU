// ============================================================
// auth.js — Lógica de autenticación y Firestore
// Dependencias: Firebase 10.x via CDN (importadas en auth.html)
// ============================================================

import { firebaseConfig } from './firebase-config.js';
import { initializeApp }             from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
         signOut, onAuthStateChanged, sendPasswordResetEmail }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// ── Inicializar Firebase ──────────────────────────────────────
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Provincias argentinas ─────────────────────────────────────
export const PROVINCIAS = [
  'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut',
  'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy',
  'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén',
  'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz',
  'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'
];

// ── Perfiles disponibles ──────────────────────────────────────
export const PERFILES = [
  { value: 'consumo_propio',    label: 'Consumo propio' },
  { value: 'venta_negocio',     label: 'Venta en negocio' },
  { value: 'distribucion_hielo',label: 'Distribución de hielo' }
];

// ── Validación CUIT (Argentina) ───────────────────────────────
export function validarCuit(cuit) {
  if (!cuit) return true; // campo opcional
  const limpio = cuit.replace(/\D/g, '');
  if (limpio.length !== 11) return false;
  const mult  = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma  = mult.reduce((acc, m, i) => acc + m * parseInt(limpio[i]), 0);
  const resto = suma % 11;
  const dv    = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return dv === parseInt(limpio[10]);
}

// ── Formatear CUIT mientras se escribe (XX-XXXXXXXX-X) ───────
export function formatearCuit(valor) {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2)  return d;
  if (d.length <= 10) return `${d.slice(0,2)}-${d.slice(2)}`;
  return `${d.slice(0,2)}-${d.slice(2,10)}-${d.slice(10)}`;
}

// ── Registro ─────────────────────────────────────────────────
export async function registrar({ nombre, apellido, email, telefono,
                                   provincia, cuit, perfil, password, utm = {} }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid  = cred.user.uid;
  await setDoc(doc(db, 'usuarios', uid), {
    nombre, apellido, email, telefono, provincia,
    cuit:    cuit || null,
    perfil,
    utm,
    creadoEn: new Date().toISOString()
  });
  return cred.user;
}

// ── Login ─────────────────────────────────────────────────────
export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

// ── Cerrar sesión ─────────────────────────────────────────────
export async function cerrarSesion() {
  await signOut(auth);
}

// ── Recuperar contraseña ──────────────────────────────────────
export async function recuperarPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

// ── Obtener datos de usuario desde Firestore ──────────────────
export async function obtenerDatosUsuario(uid) {
  const snap = await getDoc(doc(db, 'usuarios', uid));
  return snap.exists() ? snap.data() : null;
}

// ── Verificar si el usuario tiene perfil completo ─────────────
export async function tienePerfil(uid) {
  try {
    const snap = await getDoc(doc(db, 'usuarios', uid));
    if (!snap.exists()) return false;
    const d = snap.data();
    return !!(d.nombre && d.perfil);
  } catch(_) { return true; } // si no se puede leer, dejamos pasar
}

// ── Completar perfil de un usuario ya autenticado ─────────────
export async function completarPerfil(uid, email, datos) {
  await setDoc(doc(db, 'usuarios', uid), {
    email,
    ...datos,
    creadoEn: new Date().toISOString(),
  }, { merge: true }); // merge: true preserva campos existentes (ej: rol)
}

// ── Observador de estado de sesión ────────────────────────────
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
