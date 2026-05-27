import { reactive, watch } from 'vue';
import { collection, doc, onSnapshot, collectionGroup, query, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';

/**
 * useParkingData.js
 * -----------------
 * Central data layer for the IMAI Parking dashboard.
 * Exports:
 *   state        – reactive app-wide state
 *   tsToStr      – Firestore Timestamp → ISO string
 *   tsToMs       – Firestore Timestamp → epoch ms (for date comparisons)
 *   computeFee   – calculates fee based on entry time + pricing config
 *   useParkingData() – composable that sets up Firebase listeners
 */

// ── App-wide reactive state ──────────────────────────────
export const state = reactive({
  user:          null,
  authLoading:   true,
  dataLoading:   false,
  error:         null,

  zones:         [],
  activeZoneId:  'DemoParking',

  logEntries:    [],        // All entries across all months
  pricingConfig: null,      // Settings/Pricing
  ticketCounter: 0,         // Counters/TicketCounter
});

// ── Utility: Firestore Timestamp → ISO string ────────────
export function tsToStr(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (val.seconds != null) return new Date(val.seconds * 1000).toISOString();
  if (val.toDate)  return val.toDate().toISOString();
  return null;
}

// ── Utility: Firestore Timestamp → epoch milliseconds ────
export function tsToMs(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (val.seconds != null) return val.seconds * 1000;
  if (val.toDate) return val.toDate().getTime();
  const d = new Date(val);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

// ── Utility: Calculate parking fee from check-in time ────
export function computeFee(inTimeVal, pricingConfig) {
  if (!inTimeVal || !pricingConfig) return null;

  let inMs;
  if (inTimeVal.seconds != null) inMs = inTimeVal.seconds * 1000;
  else if (inTimeVal.toDate)     inMs = inTimeVal.toDate().getTime();
  else                           inMs = new Date(inTimeVal).getTime();
  if (isNaN(inMs)) return null;

  const diffMins = (Date.now() - inMs) / 60000;
  if (diffMins < 0) return null;
  if (diffMins <= (pricingConfig.gracePeriodMins || 0)) return 0;

  const totalHrs = diffMins / 60;
  const blocks   = [...(pricingConfig.timeBlocks || [])]
    .sort((a, b) => (a.upToHours || 0) - (b.upToHours || 0));
  if (!blocks.length) return null;

  let fee = 0, prev = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b      = blocks[i];
    const isLast = i === blocks.length - 1;
    const hrs    = isLast
      ? Math.max(0, totalHrs - prev)
      : Math.max(0, Math.min(totalHrs, b.upToHours || 0) - prev);

    if (hrs <= 0 && !isLast) { prev = b.upToHours || 0; continue; }
    fee += b.isFlatRate ? (b.rate || 0) : Math.ceil(hrs) * (b.rate || 0);
    prev = b.upToHours || 0;
    if (totalHrs <= (b.upToHours || 0) && !isLast) break;
  }
  return Math.min(Math.round(fee), pricingConfig.dailyMaxCap || Infinity);
}

// ── Internal: active Firestore listener teardowns ────────
let unsubs = [];
const teardown = () => { unsubs.forEach(u => u()); unsubs = []; };

// ── Composable ───────────────────────────────────────────
export function useParkingData() {

  /** Attach realtime listeners for a given parking zone */
  const listenToZone = (zoneId) => {
    teardown();

    // Ticket counter
    unsubs.push(onSnapshot(
      doc(db, `ParkingZones/${zoneId}/Counters/TicketCounter`),
      s  => { state.ticketCounter = s.exists() ? (s.data().currentValue || 0) : 0; },
      err => { console.error('[TicketCounter]', err); state.ticketCounter = 0; }
    ));

    // Pricing rules
    unsubs.push(onSnapshot(
      doc(db, `ParkingZones/${zoneId}/Settings/Pricing`),
      s  => { state.pricingConfig = s.exists() ? s.data() : null; },
      err => { console.error('[Pricing]', err); state.pricingConfig = null; }
    ));

    // Entry/exit log entries across ALL months via collectionGroup
    const entriesQuery = query(collectionGroup(db, 'Entries'));
    unsubs.push(onSnapshot(
      entriesQuery,
      snap => {
        state.logEntries = snap.docs
          .filter(d => d.ref.path.includes(`ParkingZones/${zoneId}/`))
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = tsToMs(a.timestamp);
            const tb = tsToMs(b.timestamp);
            return tb - ta;
          });
        state.dataLoading = false;
        console.log(`[Logs] Loaded ${state.logEntries.length} entries for ${zoneId}`);
      },
      err => {
        console.error('[Logs listener]', err);
        state.logEntries  = [];
        state.dataLoading = false;
      }
    ));
  };

  /** Bootstrap all zone listeners after login */
  const initGlobalData = () => {
    state.dataLoading = true;

    onSnapshot(
      collection(db, 'ParkingZones'),
      snap => {
        state.zones = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const zone  = state.zones.find(z => z.id === state.activeZoneId) || state.zones[0];
        if (zone) { state.activeZoneId = zone.id; listenToZone(zone.id); }
        else { state.dataLoading = false; }
      },
      err => { console.error('[Zones listener]', err); state.error = err.message; state.dataLoading = false; }
    );
  };

  /** Start auth listener */
  const initAuth = () => {
    onAuthStateChanged(auth, user => {
      state.user        = user;
      state.authLoading = false;
      if (user) {
        initGlobalData();
      } else {
        teardown();
        state.zones = []; state.logEntries = [];
      }
    });
  };

  // Re-attach listeners when user manually switches zone
  watch(() => state.activeZoneId, newId => {
    if (newId) { state.dataLoading = true; listenToZone(newId); }
  });

  return { state, initAuth, computeFee };
}
