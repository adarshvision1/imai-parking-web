<script setup>
import { computed, ref } from 'vue'
import { useParkingData, tsToStr, computeFee } from '../composables/useParkingData'

const { state } = useParkingData()

const occupiedCount = computed(() => state.spots.filter(s => s.status === 'Occupied').length)
const vacantCount = computed(() => state.spots.filter(s => s.status === 'Vacant').length)
const reservedCount = computed(() => state.spots.filter(s => s.status === 'Reserved').length)
const totalSpots = computed(() => state.spots.length)
const occupancyPct = computed(() => totalSpots.value ? Math.round((occupiedCount.value / totalSpots.value) * 100) : 0)
const activeSubs = computed(() => state.zoneVehicles.filter(v => v.active).length)

const parkedVehicles = computed(() => state.logEntries.filter(e => e.checkin_status))

const formatStay = (ts) => {
  const str = tsToStr(ts);
  if (!str) return '—';
  const diff = Date.now() - new Date(str).getTime();
  if (diff < 0 || isNaN(diff)) return '—';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const formatTime = (ts) => {
  const str = tsToStr(ts);
  if (!str) return '—';
  return new Date(str).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const getFee = (inTime) => {
  const fee = computeFee(inTime, state.pricingConfig);
  if (fee === null) return '—';
  return `₹${fee.toLocaleString('en-IN')}`;
}

const selectSpot = (spot) => {
  state.selectedSpot = spot
}
</script>

<template>
  <section class="tab-panel">
    <!-- Stat KPIs -->
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Total Spaces</div>
        <div class="stat-value">{{ totalSpots }}</div>
        <div class="stat-sub">Floor 1 slots</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Occupied</div>
        <div class="stat-value red">{{ occupiedCount }}</div>
        <div class="stat-sub">{{ occupancyPct }}% Utilisation</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Vacant</div>
        <div class="stat-value green">{{ vacantCount }}</div>
        <div class="stat-sub">Available now</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Reserved</div>
        <div class="stat-value amber">{{ reservedCount }}</div>
        <div class="stat-sub">VIP buffers</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Last Ticket No</div>
        <div class="stat-value blue">{{ state.ticketCounter }}</div>
        <div class="stat-sub">LPR counter</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Passes</div>
        <div class="stat-value purple">{{ activeSubs }}</div>
        <div class="stat-sub">B2B accounts</div>
      </div>
    </div>

    <!-- Spot Grid & Details -->
    <div class="three-col">
      <div class="section">
        <div class="section-header">
          <span class="section-title">Parking Lot Live Grid Map</span>
          <span class="section-meta">
            <span class="badge badge-green">● Vacant</span>&nbsp;
            <span class="badge badge-red">● Occupied</span>&nbsp;
            <span class="badge badge-amber">● Reserved</span>
          </span>
        </div>
        <div class="spot-grid">
          <div v-if="!state.spots.length" class="empty" style="grid-column: 1/-1;">No spaces registered.</div>
          <div 
            v-else
            v-for="spot in state.spots" 
            :key="spot.id"
            class="spot"
            :class="{
              'spot-occupied': spot.status === 'Occupied',
              'spot-reserved': spot.status === 'Reserved',
              'spot-vacant': spot.status === 'Vacant',
              'spot-selected': state.selectedSpot?.id === spot.id
            }"
            @click="selectSpot(spot)"
          >
            <span class="spot-id">{{ spot.spot_id }}</span>
            <span class="spot-type">{{ spot.type || spot.status }}</span>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <span class="section-title">Real-Time Space Detail</span>
        </div>
        <div class="detail-panel">
          <div v-if="!state.selectedSpot" class="empty">Select an occupied or vacant slot on the map grid to view stay parameters.</div>
          <div v-else>
            <div class="detail-row">
              <span class="detail-key">Slot ID</span>
              <span class="detail-val mono">{{ state.selectedSpot.spot_id }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-key">Current Status</span>
              <span class="detail-val">
                <span class="badge" :class="{
                  'badge-red': state.selectedSpot.status === 'Occupied',
                  'badge-green': state.selectedSpot.status === 'Vacant',
                  'badge-amber': state.selectedSpot.status === 'Reserved'
                }">{{ state.selectedSpot.status }}</span>
              </span>
            </div>
            
            <template v-if="state.selectedSpot.status === 'Occupied' && state.selectedSpot.logData">
              <div class="detail-row">
                <span class="detail-key">License Plate</span>
                <span class="detail-val mono" style="font-size: 16px;">{{ state.selectedSpot.logData.vehicle_no }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-key">Vehicle Type</span>
                <span class="detail-val">{{ state.selectedSpot.logData.vehicle_type || 'Unknown' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-key">Check-in Time</span>
                <span class="detail-val">{{ formatTime(state.selectedSpot.logData.timestamp) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-key">Current Stay</span>
                <span class="detail-val">{{ formatStay(state.selectedSpot.logData.timestamp) }}</span>
              </div>
              <div class="detail-row" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border);">
                <span class="detail-key">Live Accrued Fee</span>
                <span class="detail-val" style="font-size: 18px; font-weight: 600; color: var(--red);">
                  {{ getFee(state.selectedSpot.logData.timestamp) }}
                </span>
              </div>
              <div v-if="state.selectedSpot.logData.photo_url" style="margin-top: 12px; border-top: 1px dashed var(--border); padding-top: 12px;">
                <span class="detail-key" style="display: block; margin-bottom: 6px;">LPR Entry Camera Capture</span>
                <a :href="state.selectedSpot.logData.photo_url" target="_blank" title="View Entry Snapshot">
                  <img :src="state.selectedSpot.logData.photo_url" class="img-thumb" style="width: 100%; height: 110px; border-radius: 8px; object-fit: cover;" alt="LPR Recognition" />
                </a>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Currently Parked Table -->
    <div class="section" style="margin-top: 18px;">
      <div class="section-header">
        <span class="section-title">Vehicles Currently Inside Lot</span>
        <span class="badge badge-green">{{ parkedVehicles.length }} Vehicles</span>
      </div>
      <div style="overflow-x: auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>License Plate</th>
              <th>Type</th>
              <th>Check-in Time</th>
              <th>Stay Duration</th>
              <th>Estimated Charge</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!parkedVehicles.length">
              <td colspan="5" style="text-align: center; color: var(--text-2); padding: 32px 0;">No vehicles currently parked.</td>
            </tr>
            <tr v-for="vehicle in parkedVehicles" :key="vehicle.id">
              <td class="mono font-medium">{{ vehicle.vehicle_no }}</td>
              <td><span class="badge badge-blue">{{ vehicle.vehicle_type || '2W' }}</span></td>
              <td>{{ formatTime(vehicle.timestamp) }}</td>
              <td>{{ formatStay(vehicle.timestamp) }}</td>
              <td class="font-medium">{{ getFee(vehicle.timestamp) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
