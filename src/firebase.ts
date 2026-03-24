import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, where, getDocs, serverTimestamp, doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export const signIn = () => signInWithPopup(auth, googleProvider);

export interface KnownPerson {
  id?: string;
  name: string;
  description: string;
  uid: string;
  createdAt: any;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  email?: string;
  telegramToken?: string;
  telegramChatId?: string;
  uid: string;
}

export async function savePerson(name: string, description: string) {
  if (!auth.currentUser) throw new Error('User not authenticated');
  
  const personData = {
    name,
    description,
    uid: auth.currentUser.uid,
    createdAt: serverTimestamp(),
  };
  
  return addDoc(collection(db, 'known_people'), personData);
}

export async function updatePerson(id: string, name: string) {
  if (!auth.currentUser) throw new Error('User not authenticated');
  const docRef = doc(db, 'known_people', id);
  return updateDoc(docRef, { name });
}

export async function deletePerson(id: string) {
  if (!auth.currentUser) throw new Error('User not authenticated');
  const docRef = doc(db, 'known_people', id);
  return deleteDoc(docRef);
}

export async function getKnownPeople() {
  if (!auth.currentUser) return [];
  
  const q = query(
    collection(db, 'known_people'),
    where('uid', '==', auth.currentUser.uid)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KnownPerson));
}

export async function saveEmergencyContact(contact: Omit<EmergencyContact, 'uid'>) {
  if (!auth.currentUser) throw new Error('User not authenticated');
  const uid = auth.currentUser.uid;
  return setDoc(doc(db, 'emergency_contacts', uid), { ...contact, uid });
}

export async function getEmergencyContact() {
  if (!auth.currentUser) return null;
  const uid = auth.currentUser.uid;
  const docRef = doc(db, 'emergency_contacts', uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as EmergencyContact;
  }
  return null;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: any;
  uid: string;
}

export async function saveChatMessage(role: 'user' | 'model', text: string) {
  if (!auth.currentUser) return;
  
  const messageData = {
    role,
    text,
    uid: auth.currentUser.uid,
    timestamp: serverTimestamp(),
  };
  
  return addDoc(collection(db, 'conversation_history'), messageData);
}

export async function getConversationHistory(limitCount: number = 10) {
  if (!auth.currentUser) return [];
  
  const q = query(
    collection(db, 'conversation_history'),
    where('uid', '==', auth.currentUser.uid),
    // We'll need an index for this if we want to order by timestamp
    // For now, let's just get the documents and sort them in memory if needed
    // or just use them as is if we don't have many.
  );
  
  const snapshot = await getDocs(q);
  const messages = snapshot.docs.map(doc => doc.data() as ChatMessage);
  
  // Sort by timestamp descending and take the last N
  return messages
    .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
    .slice(0, limitCount)
    .reverse();
}
