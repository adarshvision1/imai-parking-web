<script setup>
import { onMounted, ref, watch } from 'vue'
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import { auth } from './firebase'
import { useParkingData } from './composables/useParkingData'

// Import Components
import Overview from './components/Overview.vue'
import Billing from './components/Billing.vue'
import Logs from './components/Logs.vue'
import Subscriptions from './components/Subscriptions.vue'
import Config from './components/Config.vue'

const { state, initAuth } = useParkingData()

const activeTab = ref('overview')
const authError = ref('')
const isAuthenticating = ref(false)

onMounted(() => {
  initAuth()
})

const doSignIn = async () => {
  isAuthenticating.value = true
  authError.value = ''
  try {
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
  } catch (err) {
    console.error("Sign-in error:", err)
    authError.value = err.message || 'Google Authentication failed. Please try again.'
  } finally {
    isAuthenticating.value = false
  }
}

const doSignOut = async () => {
  try {
    await signOut(auth)
  } catch (err) {
    console.error("Sign-out error:", err)
  }
}
</script>

<template>
  <div id="app-container">
    
    <!-- 1. AUTH LOADING SCREEN -->
    <div v-if="state.authLoading" class="loading-screen">
      <div class="spinner"></div>
      <span>Verifying Secure Access State...</span>
    </div>

    <!-- 2. LOGIN SCREEN -->
    <div v-else-if="!state.user" class="login-screen">
      <div class="login-card">
        <div class="login-brand">IMAI Parking</div>
        <div class="login-subtitle">B2B SaaS Business Dashboard</div>
        <p style="color: var(--text-2); font-size: 13px; margin-bottom: 24px">
          Sign in with your Google account to securely access your real-device parking monitoring databases.
        </p>
        <button class="login-btn" :disabled="isAuthenticating" @click="doSignIn">
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          <span>{{ isAuthenticating ? 'Authenticating Securely...' : 'Sign in with Google' }}</span>
        </button>
        <div v-if="authError" style="margin-top: 16px; color: var(--red); font-size: 12px;">
          {{ authError }}
        </div>
      </div>
    </div>

    <!-- 3. MAIN DASHBOARD CONTENT -->
    <div v-else id="dashboard-wrapper">
      
      <!-- TOP BAR -->
      <header class="topbar">
        <div class="topbar-left">
          <span class="topbar-brand">IMAI Parking</span>
          <select class="zone-selector" v-model="state.activeZoneId">
            <option v-for="z in state.zones" :key="z.id" :value="z.id">
              {{ z.name || z.id }}
            </option>
          </select>
        </div>
        <div class="topbar-right">
          <span class="live-dot" :class="{ loading: state.dataLoading }"></span>
          <span>{{ state.dataLoading ? 'Syncing…' : 'Live' }}</span>
          <span style="color: var(--border)">|</span>
          <span style="font-size: 12px; color: var(--text-2)">{{ state.user?.email }}</span>
          <button class="signout-btn" title="Sign Out" @click="doSignOut">↗</button>
        </div>
      </header>

      <!-- NAVIGATION TABS -->
      <nav class="nav-tabs">
        <div class="nav-tab" :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">Overview</div>
        <div class="nav-tab" :class="{ active: activeTab === 'billing' }" @click="activeTab = 'billing'">₹ Billing</div>
        <div class="nav-tab" :class="{ active: activeTab === 'logs' }" @click="activeTab = 'logs'">Entry / Exit Log</div>
        <div class="nav-tab" :class="{ active: activeTab === 'subscriptions' }" @click="activeTab = 'subscriptions'">Subscriptions</div>
        <div class="nav-tab" :class="{ active: activeTab === 'config' }" @click="activeTab = 'config'">Zone Config</div>
      </nav>

      <!-- DATA LOADING BAR -->
      <div v-if="state.dataLoading" class="loading-screen" style="position: absolute; top: 120px; z-index: 50; height: calc(100vh - 120px); background: rgba(255,255,255,0.7);">
        <div class="spinner"></div>
        <span>Syncing with LPR logs...</span>
      </div>

      <!-- MAIN CONTAINER -->
      <main class="main">
        <Overview v-if="activeTab === 'overview'" />
        <Billing v-if="activeTab === 'billing'" />
        <Logs v-if="activeTab === 'logs'" />
        <Subscriptions v-if="activeTab === 'subscriptions'" />
        <Config v-if="activeTab === 'config'" />
      </main>

    </div>
  </div>
</template>
