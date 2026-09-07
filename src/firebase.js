import { getAnalytics, isSupported } from 'firebase/analytics'
import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, isSupported as messagingIsSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: 'AIzaSyAwiH8UUMhyQeLoWqQi_oZE5BiL9xB7WpA',
  authDomain: 'ethio-bills.firebaseapp.com',
  projectId: 'ethio-bills',
  storageBucket: 'ethio-bills.firebasestorage.app',
  messagingSenderId: '9136429150',
  appId: '1:9136429150:web:927463a3d1100ca78d7ccf',
  measurementId: 'G-7HKH6N32MK',
}

export const app = initializeApp(firebaseConfig)
export const analytics = isSupported().then((supported) => supported ? getAnalytics(app) : null)

export async function enablePushNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return { status: 'unsupported' }
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey) return { status: 'missing-vapid-key' }
  if (!(await messagingIsSupported())) return { status: 'unsupported' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { status: permission }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration })
  return { status: token ? 'enabled' : 'unavailable', token }
}
