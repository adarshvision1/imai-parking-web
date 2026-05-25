<script setup>
import { computed } from 'vue'
import { useParkingData } from '../composables/useParkingData'

const { state } = useParkingData()

const activeZone = computed(() => {
  return state.zones.find(z => z.id === state.activeZoneId) || {}
})

const operators = computed(() => {
  return state.customers.filter(c => 
    c.parking_access && c.parking_access.includes(state.activeZoneId)
  )
})
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
  </section>
</template>
