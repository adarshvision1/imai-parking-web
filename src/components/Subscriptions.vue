<script setup>
import { computed } from 'vue'
import { useParkingData, tsToStr } from '../composables/useParkingData'

const { state } = useParkingData()

const activeSubsCount = computed(() => state.zoneVehicles.filter(v => v.active).length)

const formatDateTime = (ts) => {
  const str = tsToStr(ts);
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
</script>

<template>
  <section class="tab-panel">
    <div class="section">
      <div class="section-header">
        <span class="section-title">B2B Registered Subscribers</span>
        <span class="badge badge-purple">{{ activeSubsCount }} Passes</span>
      </div>
      <div style="overflow-x: auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>License Plate</th>
              <th>Category</th>
              <th>Plan Type</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Amount Paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!state.zoneVehicles.length">
              <td colspan="7" class="empty">No registered subscriptions found.</td>
            </tr>
            <tr v-for="sub in state.zoneVehicles" :key="sub.id">
              <td class="mono font-medium">{{ sub.id }}</td>
              <td><span class="badge badge-amber">{{ sub.category || 'Monthly' }}</span></td>
              <td>{{ sub.plan_type || 'Standard' }}</td>
              <td>{{ formatDateTime(sub.start_date) }}</td>
              <td>{{ formatDateTime(sub.end_date) }}</td>
              <td class="font-medium">₹{{ sub.amount_paid || 0 }}</td>
              <td>
                <span class="badge" :class="sub.active ? 'badge-green' : 'badge-red'">
                  {{ sub.active ? 'Active' : 'Expired' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
