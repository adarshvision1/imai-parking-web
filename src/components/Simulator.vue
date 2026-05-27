<script setup>
import { ref, reactive } from 'vue'
import { db } from '../firebase'
import { collection, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore'
import { useParkingData, tsToMs } from '../composables/useParkingData'

const { state } = useParkingData()
const msg = ref('')
const loadingEntry = ref(false)
const loadingExit = ref(false)

const entryForm = reactive({
  vehicle_no: '',
  ticket_no: '',
  phone_number: '',
  notes: '',
  type: 'Car'
})

const randomMethod = () => ['Cash', 'Credit Card', 'UPI', 'Debit Card', 'Other'][Math.floor(Math.random() * 5)]

const generateEntry = async () => {
  if (!entryForm.vehicle_no) {
    msg.value = '⚠️ Please enter a vehicle number.'
    return
  }
  loadingEntry.value = true
  msg.value = 'Injecting entry...'
  try {
    const now = new Date()
    const year = now.getFullYear().toString()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const zone = state.activeZoneId || 'DemoParking'
    const colPath = `ParkingZones/${zone}/Logs/${year}/Months/${month}/Entries`
    
    await addDoc(collection(db, colPath), {
      timestamp: Timestamp.fromDate(now),
      checkin_status: true,
      vehicle_no: entryForm.vehicle_no.toUpperCase(),
      ticket_no: entryForm.ticket_no || `TKT-${Math.floor(Math.random() * 100000)}`,
      phone_number: entryForm.phone_number || '',
      notes: entryForm.notes || '',
      zoneId: zone,
      type: entryForm.type
    })
    msg.value = `✅ Successfully injected ENTRY for ${entryForm.vehicle_no.toUpperCase()}!`
    
    // reset form
    entryForm.vehicle_no = ''
    entryForm.ticket_no = ''
    entryForm.phone_number = ''
    entryForm.notes = ''
  } catch (e) {
    console.error(e)
    msg.value = '❌ Failed to inject entry: ' + e.message
  } finally {
    loadingEntry.value = false
  }
}

const generateExit = async () => {
  loadingExit.value = true
  msg.value = 'Injecting exit...'
  try {
    // To make sure pie chart updates (which only tracks vehicles that entered TODAY),
    // we preferentially exit a vehicle that entered today.
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const endOfDay = startOfDay + 86400000 - 1
    
    let inside = state.logEntries.filter(e => e.checkin_status)
    const todayInside = inside.filter(e => {
      const ms = tsToMs(e.timestamp)
      return ms >= startOfDay && ms <= endOfDay
    })
    
    // Pick today's vehicle if available, else fallback to any inside vehicle
    let targetList = todayInside.length > 0 ? todayInside : inside
    
    if (targetList.length === 0) {
      msg.value = '⚠️ No vehicles currently inside to exit!'
      loadingExit.value = false
      return
    }
    
    const target = targetList[Math.floor(Math.random() * targetList.length)]
    
    const ts = target.timestamp.toDate ? target.timestamp.toDate() : new Date(target.timestamp.seconds * 1000)
    const year = ts.getFullYear().toString()
    const month = String(ts.getMonth() + 1).padStart(2, '0')
    const zone = state.activeZoneId || 'DemoParking'
    
    const docRef = doc(db, `ParkingZones/${zone}/Logs/${year}/Months/${month}/Entries`, target.id)
    
    await updateDoc(docRef, {
      checkin_status: false,
      checkOutTime: Timestamp.fromDate(now),
      paymentMethod: randomMethod(),
      amount: Math.floor(Math.random() * 400 + 50)
    })
    
    msg.value = `✅ Successfully EXITED vehicle ${target.vehicle_no || target.ticket_no}!`
  } catch (e) {
    console.error(e)
    msg.value = '❌ Failed to inject exit: ' + e.message
  } finally {
    loadingExit.value = false
  }
}
</script>

<template>
  <div class="simulator-panel" style="padding:40px; max-width:800px; margin:40px auto; background:var(--surface); border-radius:var(--radius); border:1px solid var(--border); box-shadow:var(--shadow-lg);">
    <div style="text-align:center; margin-bottom:40px;">
      <h1 style="margin-bottom:12px; font-size:24px; color:var(--text);">Traffic Simulator</h1>
      <p style="color:var(--text-2); font-size:14px; line-height:1.5;">
        Use these tools to manually inject live entry and exit events into the database. 
        Switch back to the Dashboard to see the real-time updates!
      </p>
    </div>
    
    <div style="display:flex; gap:32px;">
      <!-- Left: Entry Form -->
      <div style="flex:1; background:var(--surface-2); padding:24px; border-radius:var(--radius-sm);">
        <h3 style="margin-bottom:16px; font-size:16px; color:var(--text);">Simulate Manual Entry</h3>
        <form @submit.prevent="generateEntry" style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <label style="display:block; font-size:12px; color:var(--text-2); margin-bottom:4px;">Vehicle Number *</label>
            <input v-model="entryForm.vehicle_no" required placeholder="e.g. TN10AB1234" style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--surface); color:var(--text); text-transform:uppercase;" />
          </div>
          <div>
            <label style="display:block; font-size:12px; color:var(--text-2); margin-bottom:4px;">Phone Number (Optional)</label>
            <input v-model="entryForm.phone_number" placeholder="e.g. 9876543210" style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--surface); color:var(--text);" />
          </div>
          <div>
            <label style="display:block; font-size:12px; color:var(--text-2); margin-bottom:4px;">Notes (Optional)</label>
            <input v-model="entryForm.notes" placeholder="VIP, monthly pass, etc." style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--surface); color:var(--text);" />
          </div>
          <button type="submit" :disabled="loadingEntry" style="margin-top:8px; padding:12px; font-size:14px; font-weight:600; background:var(--green); color:#fff; border:none; border-radius:var(--radius-sm); cursor:pointer;">
            {{ loadingEntry ? 'Injecting...' : 'Simulate Entry' }}
          </button>
        </form>
      </div>

      <!-- Right: Exit Button -->
      <div style="flex:1; background:var(--surface-2); padding:24px; border-radius:var(--radius-sm); display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center;">
        <h3 style="margin-bottom:12px; font-size:16px; color:var(--text);">Simulate Random Exit</h3>
        <p style="font-size:12px; color:var(--text-2); margin-bottom:24px; line-height:1.5;">
          This will pick a random vehicle that is currently marked as "Inside" and generate a checkout event for it with a random payment method and amount.
        </p>
        <button @click="generateExit" :disabled="loadingExit" style="padding:12px 24px; width:100%; font-size:14px; font-weight:600; background:var(--blue); color:#fff; border:none; border-radius:var(--radius-sm); cursor:pointer;">
          {{ loadingExit ? 'Injecting...' : 'Simulate Random Exit' }}
        </button>
      </div>
    </div>
    
    <div v-if="msg" style="margin-top:24px; padding:16px; text-align:center; background:var(--surface-2); border-radius:var(--radius-sm); color:var(--text); font-weight:500;">
      {{ msg }}
    </div>
  </div>
</template>
