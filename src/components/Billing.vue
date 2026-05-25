<script setup>
import { computed } from 'vue'
import { useParkingData, tsToStr, computeFee } from '../composables/useParkingData'

const { state } = useParkingData()

const formatTime = (ts) => {
  const str = tsToStr(ts);
  if (!str) return '—';
  return new Date(str).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const formatStay = (inTs, outTs) => {
  const inStr = tsToStr(inTs);
  const outStr = tsToStr(outTs);
  if (!inStr || !outStr) return '—';
  
  const diff = new Date(outStr).getTime() - new Date(inStr).getTime();
  if (diff < 0 || isNaN(diff)) return '—';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Stats computations
const totalCollected = computed(() => {
  const checkouts = state.logEntries.filter(e => e.checkin_status === false && e.fee_paid);
  const total = checkouts.reduce((sum, e) => sum + (Number(e.fee_paid) || 0), 0);
  return `₹${total.toLocaleString('en-IN')}`;
})

const liveDues = computed(() => {
  const parked = state.logEntries.filter(e => e.checkin_status);
  let sum = 0;
  parked.forEach(e => {
    const fee = computeFee(e.timestamp, state.pricingConfig);
    if (fee) sum += fee;
  });
  return `₹${sum.toLocaleString('en-IN')}`;
})

const subRevenue = computed(() => {
  const total = state.zoneVehicles.reduce((sum, v) => sum + (Number(v.amount_paid) || 0), 0);
  return `₹${total.toLocaleString('en-IN')}`;
})

const paidExits = computed(() => {
  return state.logEntries.filter(e => e.checkin_status === false).length;
})

const pricingTiers = computed(() => {
  if (!state.pricingConfig?.timeBlocks) return [];
  return [...state.pricingConfig.timeBlocks].sort((a, b) => (a.upToHours || 0) - (b.upToHours || 0));
})

const checkoutHistory = computed(() => {
  return state.logEntries.filter(e => e.checkin_status === false);
})
</script>

<template>
  <section class="tab-panel">
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Total Revenue Collected</div>
        <div class="stat-value green">{{ totalCollected }}</div>
        <div class="stat-sub">Checkout cash/cards</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Live Estimated Dues</div>
        <div class="stat-value amber">{{ liveDues }}</div>
        <div class="stat-sub">From currently parked</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">B2B Monthly MRR</div>
        <div class="stat-value purple">{{ subRevenue }}</div>
        <div class="stat-sub">Subscription base</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Paid Exits Checked</div>
        <div class="stat-value blue">{{ paidExits }}</div>
        <div class="stat-sub">Device validation logs</div>
      </div>
    </div>

    <div class="two-col">
      <!-- Active Pricing Settings -->
      <div class="section">
        <div class="section-header">
          <span class="section-title">Live Yield Tiers (Pricing Plan)</span>
        </div>
        <div class="pricing-block">
          <div v-if="!pricingTiers.length" class="empty">No pricing rules configured for this zone.</div>
          <template v-else>
            <div class="pricing-row" v-for="(tier, idx) in pricingTiers" :key="idx">
              <span class="pricing-hrs">Up to {{ tier.upToHours }} hours</span>
              <span class="pricing-rate">₹{{ tier.rate }} {{ tier.isFlatRate ? 'Flat' : '/ hr' }}</span>
            </div>
            <div class="pricing-row" v-if="state.pricingConfig.dailyMaxCap" style="border-top: 1px dashed var(--border); margin-top: 8px; padding-top: 12px;">
              <span class="pricing-hrs" style="font-weight: 500; color: var(--text-1);">Daily Maximum Cap</span>
              <span class="pricing-rate" style="color: var(--amber);">₹{{ state.pricingConfig.dailyMaxCap }} max</span>
            </div>
          </template>
        </div>
      </div>

      <!-- checkout list -->
      <div class="section">
        <div class="section-header">
          <span class="section-title">Recent Checkout Payments</span>
        </div>
        <div class="scroll-y" style="max-height: 380px;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Plate</th>
                <th>Exit Time</th>
                <th>Stay</th>
                <th>Method</th>
                <th>Amount Paid</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!checkoutHistory.length">
                <td colspan="5" class="empty">No recent checkout logs found.</td>
              </tr>
              <tr v-for="log in checkoutHistory" :key="log.id">
                <td class="mono font-medium">{{ log.vehicle_no }}</td>
                <td>{{ formatTime(log.timestamp) }}</td>
                <!-- Assuming entry time is available for stay calculation, but in our mocked logs it might just be the exit log -->
                <td>{{ log.in_time ? formatStay(log.in_time, log.timestamp) : '—' }}</td>
                <td><span class="badge" :class="log.payment_method === 'Cash' ? 'badge-green' : 'badge-purple'">{{ log.payment_method || 'Cash' }}</span></td>
                <td class="font-medium" style="color: var(--green);">₹{{ log.fee_paid || 0 }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>
