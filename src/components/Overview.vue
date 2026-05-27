<script setup>
/**
 * Overview.vue — Unified Dashboard
 *
 * Layout:
 *   Top row: 2-column grid
 *     Left column:  3 KPI stat cards (Total Revenue, Total Log Entries, Ticket Counter)
 *     Right column: Daily Revenue stacked bar chart
 *   Middle:  Currently Inside table
 *   Bottom:  Entry & Exit Logs (with date range, search, filters, gallery/list toggle, CSV export)
 *
 * All KPI stats are computed from the DATE-FILTERED dataset so they stay in sync
 * with the From/To date controls.
 */
import { computed, ref } from 'vue'
import { useParkingData, tsToStr, tsToMs, computeFee } from '../composables/useParkingData'

const { state } = useParkingData()

// ── Date range filter state ──────────────────────────────
const fromDate = ref('')
const toDate   = ref('')

// ── Date-filtered base dataset (KPIs + chart derive from this) ─
const dateFiltered = computed(() => {
  let list = state.logEntries
  if (fromDate.value) {
    const fromMs = new Date(fromDate.value).getTime()
    list = list.filter(e => tsToMs(e.timestamp) >= fromMs)
  }
  if (toDate.value) {
    // Include the entire "to" day (end of day)
    const toMs = new Date(toDate.value).getTime() + 86400000 - 1
    list = list.filter(e => tsToMs(e.timestamp) <= toMs)
  }
  return list
})

// ── Logs View & filter state ──────────────────────────────
const viewMode    = ref('list')
const dirFilter   = ref('all')
const payFilter   = ref('all')
const statePrefix = ref('all')
const searchQuery = ref('')

const filteredBaseLogs = computed(() => {
  let list = [...dateFiltered.value]

  if (dirFilter.value === 'in')  list = list.filter(e =>  e.checkin_status)
  if (dirFilter.value === 'out') list = list.filter(e => !e.checkin_status)

  if (payFilter.value !== 'all')
    list = list.filter(e => !e.checkin_status && e.paymentMethod === payFilter.value)

  if (statePrefix.value !== 'all')
    list = list.filter(e => e.vehicle_no?.toUpperCase().startsWith(statePrefix.value))

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toUpperCase()
    list = list.filter(e =>
      (e.vehicle_no?.toUpperCase().includes(q))     ||
      (e.ticket_no?.toUpperCase().includes(q))      ||
      (e.paymentMethod?.toUpperCase().includes(q))  ||
      (e.notes?.toUpperCase().includes(q))          ||
      (e.phone_number?.toUpperCase().includes(q))
    )
  }
  return list
})

// ── Core splits (from fully filtered data) ────────────────
const inside    = computed(() => filteredBaseLogs.value.filter(e =>  e.checkin_status))
const checkouts = computed(() => filteredBaseLogs.value.filter(e => !e.checkin_status))
const total     = computed(() => filteredBaseLogs.value.length)
const allCheckouts = computed(() => state.logEntries.filter(e => !e.checkin_status))

// ── Today's KPIs ─────────────────────────────────────────
const todayLogs = computed(() => {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const endOfDay = startOfDay + 86400000 - 1
  return filteredBaseLogs.value.filter(e => {
    const ms = tsToMs(e.timestamp)
    return ms >= startOfDay && ms <= endOfDay
  })
})
const todayInside = computed(() => todayLogs.value.filter(e => e.checkin_status))
const todayCheckouts = computed(() => todayLogs.value.filter(e => !e.checkin_status))

const totalRevenue = computed(() =>
  todayCheckouts.value.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
)
const liveDues = computed(() => {
  const now = Date.now()
  return todayInside.value.reduce((sum, log) => {
    const f = computeFee(log.timestamp, state.pricingConfig)
    return sum + (f || 0)
  }, 0)
})

const inCount  = computed(() => todayInside.value.length)
const outCount = computed(() => todayCheckouts.value.length)
const todayTotal = computed(() => todayLogs.value.length)

// ── Daily revenue stacked bar ────────────────────────────
const METHODS = [
  { key: 'Cash',        color: '#4caf50' },
  { key: 'Credit Card', color: '#2563eb' },
  { key: 'UPI',         color: '#7c3aed' },
  { key: 'Debit Card',  color: '#f59e0b' },
  { key: 'Other',       color: '#94a3b8' },
]

const chartViewMode = ref('daily')

const chartData = computed(() => {
  const groups = {}
  const now = new Date()
  
  // 1. Initialize placeholders based on view mode to maintain proportions
  if (chartViewMode.value === 'daily') {
    // Show last 7 days and next 7 days for a 14-day padded frame
    for (let i = -7; i <= 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
      const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
      groups[label] = { date: label, total: 0, bd: { Cash:0,'Credit Card':0,UPI:0,'Debit Card':0,Other:0 }, _ts: d.getTime() }
    }
  } else if (chartViewMode.value === 'monthly') {
    // Show all 12 months of current year
    for (let m = 0; m < 12; m++) {
      const d = new Date(now.getFullYear(), m, 1)
      const label = d.toLocaleDateString([], { month: 'short', year: 'numeric' })
      groups[label] = { date: label, total: 0, bd: { Cash:0,'Credit Card':0,UPI:0,'Debit Card':0,Other:0 }, _ts: d.getTime() }
    }
  } else if (chartViewMode.value === 'yearly') {
    // Show previous 2 years, current year, and next 2 years
    const currentYear = now.getFullYear()
    for (let y = currentYear - 2; y <= currentYear + 2; y++) {
      const label = y.toString()
      groups[label] = { date: label, total: 0, bd: { Cash:0,'Credit Card':0,UPI:0,'Debit Card':0,Other:0 }, _ts: new Date(y, 0, 1).getTime() }
    }
  }

  // 2. Aggregate actual data (Unlinked from filters)
  allCheckouts.value.forEach(log => {
    const str = tsToStr(log.checkOutTime); if (!str) return
    const d = new Date(str)
    
    let label = ''
    if (chartViewMode.value === 'daily') {
      label = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    } else if (chartViewMode.value === 'monthly') {
      label = d.toLocaleDateString([], { month: 'short', year: 'numeric' })
    } else if (chartViewMode.value === 'yearly') {
      label = d.getFullYear().toString()
    }
    
    const amount = parseFloat(log.amount) || 0
    const method = log.paymentMethod || 'Other'
    if (!groups[label]) groups[label] = { date: label, total: 0, bd: { Cash:0,'Credit Card':0,UPI:0,'Debit Card':0,Other:0 }, _ts: d.getTime() }
    groups[label].total += amount
    if (groups[label].bd[method] !== undefined) groups[label].bd[method] += amount
    else groups[label].bd.Other += amount
  })
  
  // Sort the groups chronologically
  return Object.values(groups).sort((a, b) => a._ts - b._ts)
})

const maxDaily = computed(() => {
  const vals = chartData.value.map(d => d.total)
  return vals.length ? Math.max(...vals, 100) : 100
})

const ringPct = computed(() => {
  const tot = todayTotal.value
  return tot > 0 ? (outCount.value / tot) * 100 : 0
})
const ringOffset = computed(() => {
  const c = 2 * Math.PI * 40
  return c - (ringPct.value / 100) * c
})

const hoveredDay = ref(null)
const tooltipPos = ref({ x: 0, y: 0 })

const handleBarHover = (e, day) => {
  hoveredDay.value = day
  tooltipPos.value = { x: e.clientX + 15, y: e.clientY - 10 }
}
const handleBarMove = (e) => {
  if (hoveredDay.value) {
    tooltipPos.value = { x: e.clientX + 15, y: e.clientY - 10 }
  }
}
const handleBarLeave = () => {
  hoveredDay.value = null
}


const paymentMethods = computed(() => {
  const s = new Set()
  dateFiltered.value.forEach(e => { if (!e.checkin_status && e.paymentMethod) s.add(e.paymentMethod) })
  return Array.from(s).sort()
})

const platePrefixes = computed(() => {
  const s = new Set()
  dateFiltered.value.forEach(e => {
    if (e.vehicle_no?.length >= 2) s.add(e.vehicle_no.slice(0, 2).toUpperCase())
  })
  return Array.from(s).sort()
})

// ── Pre-computed inside vehicles with fees ────────────────
const insideWithFee = computed(() => {
  const now = Date.now()
  return inside.value.map(v => {
    const f = computeFee(v.timestamp, state.pricingConfig)
    const feeVal = f === null ? 0 : f

    const s = tsToStr(v.timestamp)
    let formattedEntryTime = '—'
    let entryTimeMs = 0
    if (s) {
      const d = new Date(s)
      entryTimeMs = d.getTime()
      formattedEntryTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    let formattedStay = '—'
    if (entryTimeMs) {
      const d = now - entryTimeMs
      if (d >= 0) {
        const h = Math.floor(d / 3600000), m = Math.floor((d % 3600000) / 60000)
        formattedStay = h > 0 ? `${h}h ${m}m` : `${m}m`
      }
    }

    return {
      ...v,
      fee: feeVal,
      formattedEntryTime,
      formattedStay,
      formattedFee: f === null ? '—' : `₹${f.toLocaleString('en-IN')}`
    }
  })
})


// ── Pre-computed formatted log rows ───────────
const processedLogs = computed(() => {
  const now = Date.now()
  return filteredBaseLogs.value.map(log => {
    const isCheckin = log.checkin_status

    const strIn = tsToStr(log.timestamp)
    let formattedEntryTime = '—'
    let entryTimeMs = 0
    if (strIn) {
      const d = new Date(strIn)
      entryTimeMs = d.getTime()
      formattedEntryTime = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' +
                           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    let formattedExitTime = '—'
    if (!isCheckin && log.checkOutTime) {
      const strOut = tsToStr(log.checkOutTime)
      if (strOut) {
        formattedExitTime = new Date(strOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    }

    let duration = '—'
    if (isCheckin && entryTimeMs) {
      const d = now - entryTimeMs
      if (d >= 0) {
        const h = Math.floor(d / 3600000), m = Math.floor((d % 3600000) / 60000)
        duration = h > 0 ? `${h}h ${m}m` : `${m}m`
      }
    } else if (!isCheckin && entryTimeMs && log.checkOutTime) {
      const strOut = tsToStr(log.checkOutTime)
      if (strOut) {
        const d = new Date(strOut).getTime() - entryTimeMs
        if (d >= 0) {
          const h = Math.floor(d / 3600000), m = Math.floor((d % 3600000) / 60000)
          duration = h > 0 ? `${h}h ${m}m` : `${m}m`
        }
      }
    }

    let feeStr = '—'
    if (isCheckin) {
      const f = computeFee(log.timestamp, state.pricingConfig)
      feeStr = f === null ? '—' : `₹${f.toLocaleString('en-IN')}`
    } else {
      feeStr = log.amount ? `₹${parseFloat(log.amount).toLocaleString('en-IN')}` : '—'
    }

    let formattedDate = '—'
    if (strIn) {
      formattedDate = new Date(strIn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    }

    return {
      ...log,
      formattedEntryTime,
      formattedExitTime,
      duration,
      feeStr,
      formattedDate
    }
  })
})

// ── Pagination ───────────────────────────────────────────
const currentPage = ref(1)
const itemsPerPage = 10

const totalPages = computed(() => Math.ceil(processedLogs.value.length / itemsPerPage))

const paginatedLogs = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  return processedLogs.value.slice(start, start + itemsPerPage)
})

const nextPage = () => { if (currentPage.value < totalPages.value) currentPage.value++ }
const prevPage = () => { if (currentPage.value > 1) currentPage.value-- }

import { watch } from 'vue'
watch([searchQuery, fromDate, toDate, dirFilter, statePrefix, payFilter], () => {
  currentPage.value = 1
})

// ── CSV Export ───────────────────────────────────────────
const exportCSV = () => {
  const rows = [
    ['Status','Plate','Ticket No','Phone Number','Check-in Time','Exit Time','Duration','Payment Method','Amount','Notes']
  ]
  processedLogs.value.forEach(log => {
    rows.push([
      log.checkin_status ? 'IN' : 'OUT',
      log.vehicle_no || '',
      log.ticket_no || '',
      log.phone_number || '',
      log.formattedEntryTime,
      log.formattedExitTime,
      log.duration,
      log.paymentMethod || '',
      log.feeStr,
      log.notes || '',
    ])
  })
  const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), {
    href: url, download: `imai-logs-${new Date().toISOString().slice(0,10)}.csv`
  })
  a.click(); URL.revokeObjectURL(url)
}

const clearDateRange = () => { fromDate.value = ''; toDate.value = '' }

const fmtRupee = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`
</script>

<template>
  <div class="tab-panel">

    <!-- Global Floating Tooltip -->
    <div v-if="hoveredDay" class="floating-tooltip" :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }">
      <div class="tooltip-date" style="font-size:14px; margin-bottom:8px; color:#fff; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:6px;">{{ hoveredDay.date }}</div>
      <template v-for="m in METHODS" :key="m.key">
        <div v-if="hoveredDay.bd[m.key] > 0" class="tooltip-row" style="color:rgba(255,255,255,0.9); padding:2px 0;">
          <span>{{ m.key }}</span><strong style="color:#fff">₹{{ hoveredDay.bd[m.key] }}</strong>
        </div>
      </template>
      <div class="tooltip-total" style="border-top:1px solid rgba(255,255,255,0.2); color:#fff; padding-top:8px; margin-top:6px;">
        <span>Total</span><span>₹{{ hoveredDay.total }}</span>
      </div>
    </div>

    <!-- ── Top Row: New Split Layout ── -->
    <div class="dashboard-top" style="gap:24px;">

      <!-- Left: Today's Traffic Overview -->
      <div class="traffic-overview-card" style="flex: 0 0 380px; background:var(--surface); border-radius:var(--radius); border:1px solid var(--border); padding:32px 24px; display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:var(--shadow-sm);">
        <div style="font-size:18px; font-weight:700; margin-bottom:40px; align-self:flex-start; color:var(--text);">Today's Traffic Overview</div>
        
        <div style="position:relative; width:280px; height:280px; margin-bottom:40px;">
          <svg viewBox="0 0 100 100" class="ring-svg" style="width:100%; height:100%; transform: rotate(-90deg);">
            <!-- Background ring (Inside) -->
            <circle cx="50" cy="50" r="40" stroke="var(--green)" stroke-width="12" fill="none" style="opacity:0.2;" />
            <!-- Foreground ring (Exited) -->
            <circle cx="50" cy="50" r="40" stroke="var(--blue)" stroke-width="12" fill="none" 
                    :stroke-dasharray="2 * Math.PI * 40" :stroke-dashoffset="ringOffset" 
                    style="stroke-linecap:round; transition:stroke-dashoffset 0.8s ease;" />
          </svg>
          <div style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <div style="font-size:42px; font-weight:800; color:var(--text); line-height:1.1;">{{ todayTotal }}</div>
            <div style="font-size:14px; font-weight:600; color:var(--text-2); text-transform:uppercase; letter-spacing:0.8px;">Arrived</div>
          </div>
        </div>
        
        <div style="display:flex; width:100%; justify-content:space-around; text-align:center;">
          <div>
            <div style="font-size:24px; font-weight:700; color:var(--green);">{{ inCount }}</div>
            <div style="font-size:13px; font-weight:600; color:var(--text-2); margin-top:4px;">Inside</div>
          </div>
          <div>
            <div style="font-size:24px; font-weight:700; color:var(--blue);">{{ outCount }}</div>
            <div style="font-size:13px; font-weight:600; color:var(--text-2); margin-top:4px;">Exited</div>
          </div>
        </div>
      </div>

      <!-- Right: KPIs and Bar Chart -->
      <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:20px;">
        
        <!-- KPIs Row -->
        <div class="kpi-row" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px;">
          <div class="stat-card" style="padding:16px;">
            <div class="stat-label" style="font-size:11px;">Today's Revenue</div>
            <div class="stat-value green" style="font-size:20px;">{{ fmtRupee(totalRevenue) }}</div>
            <div class="stat-sub" style="font-size:10px;">{{ outCount }} paid exits</div>
          </div>
          <div class="stat-card" style="padding:16px;">
            <div class="stat-label" style="font-size:11px;">Live Accrued Dues</div>
            <div class="stat-value amber" style="font-size:20px;">{{ fmtRupee(liveDues) }}</div>
            <div class="stat-sub" style="font-size:10px;">{{ inCount }} vehicles inside</div>
          </div>
          <div class="stat-card" style="padding:16px;">
            <div class="stat-label" style="font-size:11px;">Today's Entries</div>
            <div class="stat-value" style="font-size:20px;">{{ todayTotal }}</div>
            <div class="stat-sub" style="font-size:10px;">Entries + exits combined</div>
          </div>
          <div class="stat-card" style="padding:16px;">
            <div class="stat-label" style="font-size:11px;">Ticket Counter</div>
            <div class="stat-value purple" style="font-size:20px;">{{ state.ticketCounter }}</div>
            <div class="stat-sub" style="font-size:10px;">Total LPR-issued tickets</div>
          </div>
        </div>

        <!-- Bar Chart -->
        <div class="chart-card" style="flex:1; min-width:0; position:relative; display:flex; flex-direction:column;">
          <div style="display:flex;justify-content:space-between;align-items:center; margin-bottom:12px;">
            <div>
              <div class="chart-title" style="margin-bottom:4px;">Revenue History</div>
              <span class="chart-hint">Hover over bars for details</span>
            </div>
            
            <div class="view-toggle">
              <button class="view-btn" :class="{active: chartViewMode === 'daily'}" @click="chartViewMode = 'daily'">Daily</button>
              <button class="view-btn" :class="{active: chartViewMode === 'monthly'}" @click="chartViewMode = 'monthly'">Monthly</button>
              <button class="view-btn" :class="{active: chartViewMode === 'yearly'}" @click="chartViewMode = 'yearly'">Yearly</button>
            </div>
          </div>

          <div v-if="!chartData.length" class="empty" style="flex:1">No checkout records to chart.</div>
          <div v-else class="bar-area" style="flex:1; min-width:0; overflow:hidden; display:flex; flex-direction:column; position:relative;">
            
            <!-- Floating inside Legend -->
            <div class="pay-legend" style="position:absolute; top:0; right:0; margin:0; padding:8px 12px; border:1px solid var(--border-subtle); background:var(--surface); border-radius:var(--radius-sm); z-index:10; gap:10px; box-shadow:var(--shadow-sm);">
              <div v-for="m in METHODS" :key="m.key" class="pay-legend-item">
                <div class="pay-dot" :style="{ background: m.color }"></div>{{ m.key }}
              </div>
            </div>

            <div class="bar-track" style="height:220px; padding-top:40px;">
              <div
                v-for="day in chartData" :key="day.date"
                class="bar-col-wrap"
                @mouseenter="e => handleBarHover(e, day)"
                @mousemove="handleBarMove"
                @mouseleave="handleBarLeave"
              >
                <div class="bar-col" :style="{ height: `${maxDaily ? (day.total / maxDaily) * 100 : 0}%` }">
                  <template v-for="m in METHODS" :key="m.key">
                    <div v-if="day.bd[m.key] > 0"
                      class="bar-seg"
                      :style="{ height: `${day.total ? (day.bd[m.key] / day.total) * 100 : 0}%`, background: m.color }">
                    </div>
                  </template>
                </div>
                <span class="bar-xlbl">{{ day.date }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Entry & Exit Logs ──────────────────────────────── -->
    <div class="section">
      <div class="section-header">
        <span class="section-title">Entry & Exit Logs</span>
        <span class="badge badge-purple">{{ processedLogs.length }} records</span>
      </div>

      <!-- Toolbar -->
      <div class="log-toolbar" style="border:none; border-bottom:1px solid var(--border-subtle); border-radius:0; box-shadow:none;">
        <input
          id="log-search" v-model="searchQuery" class="search-input"
          placeholder="Search by plate, type, payment method, notes..."
          autocomplete="off"
        />

        <div class="date-range-group">
          <label class="date-label">From</label>
          <input id="date-from" v-model="fromDate" type="date" class="filter-select" />
          <label class="date-label">To</label>
          <input id="date-to" v-model="toDate" type="date" class="filter-select" />
          <button v-if="fromDate || toDate" class="clear-dates-btn" @click="clearDateRange">Clear</button>
        </div>

        <select id="dir-filter" v-model="dirFilter" class="filter-select">
          <option value="all">All Logs</option>
          <option value="in">Entries Only</option>
          <option value="out">Exits Only</option>
        </select>

        <select id="prefix-filter" v-model="statePrefix" class="filter-select">
          <option value="all">All States</option>
          <option v-for="p in platePrefixes" :key="p" :value="p">{{ p }}</option>
        </select>

        <select id="pay-filter" v-model="payFilter" class="filter-select">
          <option value="all">All Methods</option>
          <option v-for="m in paymentMethods" :key="m" :value="m">{{ m }}</option>
        </select>

        <div class="view-toggle">
          <button id="view-gallery" class="view-btn" :class="{ active: viewMode==='gallery' }" @click="viewMode='gallery'">Gallery</button>
          <button id="view-list"    class="view-btn" :class="{ active: viewMode==='list'    }" @click="viewMode='list'">List</button>
        </div>

        <button class="export-btn" @click="exportCSV">Export CSV</button>
      </div>

      <!-- Gallery view -->
      <div v-if="viewMode==='gallery'" style="padding:20px;">
        <div v-if="!paginatedLogs.length" class="empty">No records match your filters.</div>
        <div v-else class="log-gallery">
          <div
            v-for="log in paginatedLogs" :key="log.id"
            class="gallery-card"
            :class="log.checkin_status ? 'is-in' : 'is-out'"
          >
            <a v-if="log.photo_url" :href="log.photo_url" target="_blank" rel="noopener">
              <img :src="log.photo_url" class="gallery-img" alt="LPR Capture" />
            </a>
            <div v-else class="gallery-img-placeholder">No image captured</div>

            <div class="gallery-body">
              <div class="gallery-plate">{{ log.vehicle_no || '—' }}</div>
              <div class="gallery-meta">
                <span class="badge" :class="log.checkin_status ? 'badge-green' : 'badge-blue'">
                  {{ log.checkin_status ? 'Entry' : 'Exit' }}
                </span>
                <span v-if="log.ticket_no"  class="badge badge-amber">{{ log.ticket_no }}</span>
                <span v-if="!log.checkin_status && log.paymentMethod" class="badge badge-purple">{{ log.paymentMethod }}</span>
              </div>

              <div class="gallery-info">
                <div class="gallery-info-item">
                  <span class="info-label">Check-in</span>
                  <span class="info-val">{{ log.formattedEntryTime }}</span>
                </div>
                <div v-if="log.phone_number" class="gallery-info-item" style="grid-column:1/-1">
                  <span class="info-label">Phone</span>
                  <span class="info-val" style="color:var(--text);font-weight:600">{{ log.phone_number }}</span>
                </div>
                <template v-if="log.checkin_status">
                  <div class="gallery-info-item">
                    <span class="info-label">Current Stay</span>
                    <span class="info-val" style="color:var(--amber);font-weight:600">{{ log.duration }}</span>
                  </div>
                  <div class="gallery-info-item">
                    <span class="info-label">Est. Fee</span>
                    <span class="info-val" style="color:var(--amber);font-weight:700">{{ log.feeStr }}</span>
                  </div>
                </template>
                <template v-else>
                  <div class="gallery-info-item">
                    <span class="info-label">Exit</span>
                    <span class="info-val">{{ log.formattedExitTime }}</span>
                  </div>
                  <div class="gallery-info-item">
                    <span class="info-label">Duration</span>
                    <span class="info-val">{{ log.duration }}</span>
                  </div>
                </template>
                <div v-if="log.notes" class="gallery-info-item" style="grid-column:1/-1">
                  <span class="info-label">Remarks</span>
                  <span class="info-val">{{ log.notes }}</span>
                </div>
              </div>
            </div>

            <div class="gallery-footer">
              <span class="gallery-amount"
                :style="log.checkin_status ? 'color:var(--amber)' : 'color:var(--green)'">
                {{ log.feeStr }}
              </span>
              <a v-if="log.payment_url" :href="log.payment_url" target="_blank" rel="noopener" class="gallery-photo-link">
                View Receipt
              </a>
              <span v-else style="font-size:11px;color:var(--text-3)">{{ log.formattedDate }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- List view -->
      <div v-if="viewMode==='list'" class="log-list" style="border:none; border-radius:0; box-shadow:none;">
        <div class="list-row list-header">
          <span></span>
          <span>Plate</span>
          <span>Ticket No</span>
          <span>Phone Number</span>
          <span>Check-in Time</span>
          <span>Exit</span>
          <span>Duration</span>
          <span>Method</span>
          <span>Amount</span>
        </div>
        <div v-if="!paginatedLogs.length" class="empty">No records match your filters.</div>
        <div
          v-for="log in paginatedLogs" :key="log.id"
          class="list-row"
          :class="log.checkin_status ? 'list-in' : 'list-out'"
        >
          <span class="list-badge" :class="log.checkin_status ? 'badge-green' : 'badge-blue'">
            {{ log.checkin_status ? 'IN' : 'OUT' }}
          </span>
          <span class="list-plate">{{ log.vehicle_no }}</span>
          <span><span class="badge badge-amber" style="font-size:10px">{{ log.ticket_no || '—' }}</span></span>
          <span style="color:var(--text-2);font-size:12px">{{ log.phone_number || '—' }}</span>
          <span style="color:var(--text-2);font-size:12px">{{ log.formattedEntryTime }}</span>
          <span style="color:var(--text-2);font-size:12px">{{ log.formattedExitTime }}</span>
          <span style="font-size:12px">{{ log.duration }}</span>
          <span>
            <span v-if="log.paymentMethod" class="badge"
              :class="log.paymentMethod==='Cash'?'badge-green':log.paymentMethod==='UPI'?'badge-purple':'badge-blue'">
              {{ log.paymentMethod }}
            </span>
            <span v-else style="color:var(--text-3)">--</span>
          </span>
          <span style="font-weight:700;color:var(--green)">
            {{ log.feeStr }}
          </span>
        </div>
      </div>
      
      <!-- Pagination Controls -->
      <div v-if="totalPages > 1" style="display:flex; justify-content:center; align-items:center; gap:16px; margin-top:20px; padding:16px 0; border-top:1px solid var(--border-subtle);">
        <button @click="prevPage" :disabled="currentPage === 1" style="padding:8px 16px; background:var(--surface-2); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text); cursor:pointer; font-weight:600;" :style="currentPage === 1 ? 'opacity:0.5; cursor:not-allowed;' : ''">Previous</button>
        <span style="font-size:13px; color:var(--text-2); font-weight:500;">Page {{ currentPage }} of {{ totalPages }}</span>
        <button @click="nextPage" :disabled="currentPage === totalPages" style="padding:8px 16px; background:var(--surface-2); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text); cursor:pointer; font-weight:600;" :style="currentPage === totalPages ? 'opacity:0.5; cursor:not-allowed;' : ''">Next</button>
      </div>

    </div>

  </div>
</template>
