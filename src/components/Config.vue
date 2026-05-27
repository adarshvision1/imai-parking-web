<script setup>
import { computed, ref } from 'vue'
import { useParkingData } from '../composables/useParkingData'

const { state, seedDatabase } = useParkingData()
const loading = ref(false)
const successMsg = ref('')
const errorMsg = ref('')

const activeZone = computed(() => {
  return state.zones.find(z => z.id === state.activeZoneId) || {}
})

const operators = computed(() => {
  return state.customers.filter(c => 
    c.parking_access && c.parking_access.includes(state.activeZoneId)
  )
})

const handleSeed = async () => {
  loading.value = true
  successMsg.value = ''
  errorMsg.value = ''
  try {
    await seedDatabase()
    successMsg.value = '🎉 Success! Your new Firebase project has been seeded with standard demo zones, logs, active parkers, subscription passes, and operators. The dashboard has refreshed!'
  } catch (err) {
    errorMsg.value = `❌ Failed to seed database: ${err.message}. Make sure your Firestore security rules allow writes.`
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="tab-panel">
    <div class="two-col">
      <!-- Hardware / IP settings -->
      <div class="section">
        <div class="section-header">
          <span class="section-title">Hardware Device Integrations</span>
        </div>
        <div class="detail-panel">
          <div class="detail-row">
            <span class="detail-key">Entry LPR Camera IP</span>
            <span class="detail-val mono">{{ activeZone.entry_ip || '--.---.-.--' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-key">Exit LPR Camera IP</span>
            <span class="detail-val mono">{{ activeZone.exit_ip || '--.---.-.--' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-key">Next Bill Sequence</span>
            <span class="detail-val mono">{{ state.lastBillNo + 1 }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-key">Global Zone ID</span>
            <span class="detail-val mono">{{ state.activeZoneId }}</span>
          </div>
        </div>
      </div>

      <!-- Operators access -->
      <div class="section">
        <div class="section-header">
          <span class="section-title">Authorized Station Operators</span>
        </div>
        <div style="overflow-x: auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Operator</th>
                <th>Email (Unique ID)</th>
                <th>Access Privilege</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!operators.length">
                <td colspan="3" class="empty">No authorized operators found for this zone.</td>
              </tr>
              <tr v-for="op in operators" :key="op.id">
                <td class="font-medium">{{ op.name || op.id }}</td>
                <td class="mono" style="color: var(--text-2);">{{ op.email }}</td>
                <td><span class="badge badge-blue">Zone Admin</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Database Initialization / Seeding -->
    <div class="section" style="margin-top: 18px;">
      <div class="section-header">
        <span class="section-title">Database Utility Console</span>
      </div>
      <div class="detail-panel" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
        <div style="flex: 1; min-width: 280px;">
          <h4 style="margin: 0 0 6px 0; color: var(--text-1); font-weight: 600;">Fresh Firebase Project Seeder</h4>
          <p style="margin: 0; font-size: 13px; color: var(--text-2); line-height: 1.5;">
            Connected to a brand new, empty, or freshly-provisioned Firebase project? Click "Seed Database" to instantly populate it with realistic collections, active subscription passes, LPR diagnostic logs, and operator lists.
          </p>
        </div>
        <button 
          @click="handleSeed" 
          class="zone-selector" 
          style="background: rgb(76, 175, 80); color: white; border: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; cursor: pointer; height: auto;"
          :disabled="loading"
        >
          {{ loading ? 'Seeding Database...' : 'Seed Firestore with Demo Data' }}
        </button>
      </div>
      <div v-if="successMsg" style="margin-top: 12px; color: rgb(76, 175, 80); font-size: 13px; font-weight: 500; line-height: 1.4;">
        {{ successMsg }}
      </div>
      <div v-if="errorMsg" style="margin-top: 12px; color: var(--red); font-size: 13px; font-weight: 500; line-height: 1.4;">
        {{ errorMsg }}
      </div>
    </div>
  </section>
</template>
