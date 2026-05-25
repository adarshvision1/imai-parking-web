<script setup>
import { computed, ref } from 'vue'
import { useParkingData, tsToStr } from '../composables/useParkingData'

const { state } = useParkingData()
const logFilter = ref('all')

const formatDateTime = (ts) => {
  const str = tsToStr(ts);
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const filteredLogs = computed(() => {
  if (logFilter.value === 'in') return state.logEntries.filter(e => e.checkin_status === true);
  if (logFilter.value === 'out') return state.logEntries.filter(e => e.checkin_status === false);
  return state.logEntries;
})
</script>

<template>
  <section class="tab-panel">
    <div class="section">
      <div class="section-header">
        <div class="filter-bar">
          <select v-model="logFilter" class="zone-selector">
            <option value="all">All LPR Detections</option>
            <option value="in">Active Check-ins Only</option>
            <option value="out">Exits & Departures Only</option>
          </select>
          <span class="count">{{ filteredLogs.length }} records</span>
        </div>
      </div>
      <div style="display: flex; flex-direction: column;">
        <div v-if="!filteredLogs.length" class="empty">No logs found matching the filter.</div>
        <div v-else class="lpr-row" v-for="log in filteredLogs" :key="log.id">
          <div class="lpr-icon" :class="log.checkin_status ? 'lpr-icon-in' : 'lpr-icon-out'">
            {{ log.checkin_status ? 'IN' : 'OUT' }}
          </div>
          <div class="lpr-details">
            <div class="lpr-plate mono">{{ log.vehicle_no }}</div>
            <div class="lpr-meta">
              {{ formatDateTime(log.timestamp) }}
              <span v-if="!log.checkin_status" style="margin-left: 8px; color: var(--green);">
                Paid: ₹{{ log.fee_paid || 0 }}
              </span>
            </div>
            <!-- Snapshot Thumbnails -->
            <div v-if="log.photo_url || log.payment_url" style="margin-top: 8px; display: flex; gap: 8px;">
              <a v-if="log.photo_url" :href="log.photo_url" target="_blank" title="View Entry Snapshot">
                <img :src="log.photo_url" class="img-thumb" style="width: 60px; height: 40px; border-radius: 4px; object-fit: cover;" alt="Entry Snapshot" />
              </a>
              <a v-if="log.payment_url" :href="log.payment_url" target="_blank" title="View Exit Receipt">
                <img :src="log.payment_url" class="img-thumb" style="width: 60px; height: 40px; border-radius: 4px; object-fit: cover;" alt="Exit Receipt" />
              </a>
            </div>
          </div>
          <div class="lpr-type">
            <span class="badge" :class="log.checkin_status ? 'badge-amber' : 'badge-green'">
              {{ log.vehicle_type || '2W' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
