// OneSignal Web Push wiring (Sahar 16.09). Central place that:
// 1. Initializes the SDK once, at app start, with the App ID from env.
// 2. Prompts the signed-in user for browser notification permission (once
//    they've explicitly opted in via Settings, not on every page load -
//    unsolicited permission prompts get auto-dismissed by browsers and
//    train users to click "block").
// 3. Tags the OneSignal subscription with our internal user id
//    (login/logout) so an edge function can target a specific rep by
//    external_id when sending a push, instead of broadcasting to everyone.
//
// If VITE_ONESIGNAL_APP_ID isn't set (local dev without a configured
// OneSignal app), every function here is a safe no-op - the rest of the
// app must not crash or block on push being unavailable.
import OneSignal from 'react-onesignal'

const APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID
let initPromise = null

export function isPushConfigured() {
  return !!APP_ID
}

export function initPush() {
  if (!APP_ID) return Promise.resolve(false)
  if (initPromise) return initPromise
  initPromise = OneSignal.init({
    appId: APP_ID,
    allowLocalhostAsSecureOrigin: true,
    serviceWorkerPath: '/OneSignalSDKWorker.js',
    notifyButton: { enable: false }, // we drive opt-in from Settings, not OneSignal's own bell widget
  }).then(() => true).catch(err => {
    console.error('[push] OneSignal init failed', err)
    return false
  })
  return initPromise
}

// Called after a successful login (and on app boot if already signed in) so
// a push sent to this user's external id reaches this browser/device.
export async function linkPushIdentity(userId) {
  if (!APP_ID || !userId) return
  await initPush()
  try {
    await OneSignal.login(userId)
  } catch (err) {
    console.error('[push] login (tagging) failed', err)
  }
}

// Called on sign-out so a shared/kiosk browser doesn't keep receiving push
// meant for the previous user.
export async function unlinkPushIdentity() {
  if (!APP_ID) return
  try {
    await OneSignal.logout()
  } catch (err) {
    console.error('[push] logout failed', err)
  }
}

// Explicit opt-in trigger for the Settings screen's toggle. Returns the
// resulting permission state so the UI can reflect it immediately.
export async function requestPushPermission() {
  if (!APP_ID) return 'unsupported'
  await initPush()
  try {
    await OneSignal.Notifications.requestPermission()
    return OneSignal.Notifications.permission ? 'granted' : 'denied'
  } catch (err) {
    console.error('[push] permission request failed', err)
    return 'denied'
  }
}

export function currentPushPermission() {
  if (!APP_ID) return 'unsupported'
  try {
    return OneSignal.Notifications.permission ? 'granted' : 'default'
  } catch {
    return 'default'
  }
}