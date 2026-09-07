importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyAwiH8UUMhyQeLoWqQi_oZE5BiL9xB7WpA',
  authDomain: 'ethio-bills.firebaseapp.com',
  projectId: 'ethio-bills',
  storageBucket: 'ethio-bills.firebasestorage.app',
  messagingSenderId: '9136429150',
  appId: '1:9136429150:web:927463a3d1100ca78d7ccf',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Ethio Bill reminder'
  const options = {
    body: payload.notification?.body || 'A bill is due soon.',
    icon: '/favicon.svg',
    data: payload.data || {},
  }
  self.registration.showNotification(title, options)
})
