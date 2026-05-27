<script setup>
import { onMounted, ref } from 'vue'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from './firebase'
import { useParkingData } from './composables/useParkingData'
import Overview from './components/Overview.vue'
import Simulator from './components/Simulator.vue'

const { state, initAuth } = useParkingData()
const activeTab = ref('dashboard')

const email    = ref('')
const password = ref('')
const errMsg   = ref('')
const busy     = ref(false)

onMounted(() => initAuth())

const signIn = async () => {
  if (!email.value || !password.value) { errMsg.value = 'Please enter your email and password.'; return }
  busy.value = true; errMsg.value = ''
  try {
    await signInWithEmailAndPassword(auth, email.value, password.value)
  } catch (e) {
    errMsg.value = ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(e.code)
      ? 'Invalid email or password.'
      : 'Sign-in failed. Please try again.'
  } finally { busy.value = false }
}
</script>

<template>
  <div id="app">

    <!-- Auth loading -->
    <div v-if="state.authLoading" class="loading-screen">
      <div class="spinner"></div>
      <span>Verifying session…</span>
    </div>

    <!-- Login (accounts managed via Firebase console) -->
    <div v-else-if="!state.user" class="login-screen">
      <div class="login-card">
        <div class="login-brand">IMAI Parking</div>
        <div class="login-subtitle">Parking Management Dashboard</div>
        <form @submit.prevent="signIn" style="text-align:left">
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input id="auth-email" v-model="email" type="email" class="form-input"
              placeholder="you@example.com" autocomplete="email" required />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input id="auth-password" v-model="password" type="password" class="form-input"
              placeholder="••••••••" autocomplete="current-password" required />
          </div>
          <button id="auth-submit" type="submit" class="submit-btn" :disabled="busy">
            {{ busy ? 'Signing in…' : 'Sign In' }}
          </button>
        </form>
        <div v-if="errMsg" class="auth-error-banner">{{ errMsg }}</div>
      </div>
    </div>

    <!-- Main dashboard -->
    <div v-else>
      <header class="topbar">
        <div class="topbar-left">
          <span class="topbar-brand">IMAI Parking</span>
          <select class="zone-selector" v-model="state.activeZoneId">
            <option v-for="z in state.zones" :key="z.id" :value="z.id">{{ z.name || z.id }}</option>
          </select>
        </div>
        <div class="topbar-right">
          <div class="nav-tabs" style="display:flex; gap:16px;">
            <button class="nav-tab" :class="{active: activeTab === 'dashboard'}" @click="activeTab = 'dashboard'">Dashboard</button>
            <button class="nav-tab" :class="{active: activeTab === 'simulator'}" @click="activeTab = 'simulator'">Simulator (Test)</button>
          </div>
          <span class="live-dot"></span>
          <span>{{ state.dataLoading ? 'Syncing…' : 'Live' }}</span>
          <span style="color:var(--border)">|</span>
          <span>{{ state.user?.email }}</span>
          <button id="signout-btn" class="signout-btn" @click="signOut(auth)">Sign Out</button>
        </div>
      </header>

      <main class="main">
        <Overview v-show="activeTab === 'dashboard'" />
        <Simulator v-show="activeTab === 'simulator'" />
      </main>
    </div>

  </div>
</template>
