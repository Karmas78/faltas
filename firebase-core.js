import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    doc, 
    updateDoc, 
    deleteDoc, 
    getDocs,
    enableIndexedDbPersistence,
    query, 
    orderBy,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// Inicialización de Firebase
let db, auth;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    
    enableIndexedDbPersistence(db).catch((err) => {
        console.warn("Persistencia Offline no disponible:", err.code);
    });
} catch (error) {
    console.error("Error al inicializar Firebase:", error);
}

// Funciones de Autenticación
export const monitorAuth = (callback) => onAuthStateChanged(auth, callback);
export const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);

// Funciones de Datos (Firestore)
export const listenToRecords = (callback) => {
    if (!db) return;
    const q = query(collection(db, "ausencias"), orderBy("createdAt", "desc"));
    return onSnapshot(q, callback);
};

export const addRecord = (payload) => {
    return addDoc(collection(db, "ausencias"), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
};

export const updateRecord = (id, payload) => {
    const docRef = doc(db, "ausencias", id);
    return updateDoc(docRef, {
        ...payload,
        updatedAt: serverTimestamp()
    });
};

export const deleteRecordById = (id) => {
    return deleteDoc(doc(db, "ausencias", id));
};

export const getAllDocs = () => getDocs(collection(db, "ausencias"));

export { db, auth };
