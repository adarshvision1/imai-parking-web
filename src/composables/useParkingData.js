import { ref, reactive, computed, watch } from 'vue';
import { collection, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';

// Global state using reactive
export const state = reactive({
  user: null,
  authLoading: true,
  zones: [],
  activeZoneId: 'DemoParking',
  zoneVehicles: [],
  logEntries: [],
  pricingConfig: null,
  ticketCounter: 0,
  lastBillNo: 0,
  spots: [],
  customers: [],
  selectedSpot: null,
  dataLoading: false,
  error: null
});

// Utility: Date formatter
export function tsToStr(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (val.seconds) return new Date(val.seconds * 1000).toISOString();
  if (val.toDate) return val.toDate().toISOString();
  return String(val);
}

// Compute Fee logic
export function computeFee(inTimeVal, pricingConfig) {
  if (!inTimeVal || !pricingConfig) return null;

  let inMs;
  if (inTimeVal && inTimeVal.seconds) {
    inMs = inTimeVal.seconds * 1000;
  } else if (inTimeVal && inTimeVal.toDate) {
    inMs = inTimeVal.toDate().getTime();
  } else {
    inMs = new Date(inTimeVal).getTime();
  }
  if (isNaN(inMs)) return null;

  const diffMs = Date.now() - inMs;
  if (diffMs < 0) return null;
  const diffMins = diffMs / 60000;

  const graceMins = pricingConfig.gracePeriodMins || 0;
  if (diffMins <= graceMins) return 0;

  const totalHours = diffMins / 60;
  const blocks = pricingConfig.timeBlocks || [];
  const dailyCap = pricingConfig.dailyMaxCap || Infinity;

  if (!blocks.length) return null;

  const sorted = [...blocks].sort((a, b) => (a.upToHours || 0) - (b.upToHours || 0));

  let fee = 0;
  let prevBoundary = 0;

  for (let i = 0; i < sorted.length; i++) {
    const block = sorted[i];
    const boundary = block.upToHours || 0;
    const isLast = i === sorted.length - 1;

    let tierHours;
    if (isLast) {
      tierHours = Math.max(0, totalHours - prevBoundary);
    } else {
      tierHours = Math.max(0, Math.min(totalHours, boundary) - prevBoundary);
    }

    if (tierHours <= 0 && !isLast) {
      prevBoundary = boundary;
      continue;
    }

    if (block.isFlatRate) {
      fee += block.rate || 0;
    } else {
      fee += Math.ceil(tierHours) * (block.rate || 0);
    }

    prevBoundary = boundary;
    if (totalHours <= boundary && !isLast) break;
  }

  return Math.min(Math.round(fee), dailyCap);
}

let activeUnsubs = [];

function deriveSpots() {
  const parkedList = state.logEntries.filter(e => e.checkin_status);
  const totalSpots = 12;
  const generatedSpots = [];

  for (let i = 1; i <= totalSpots; i++) {
    const spotId = `A-${String(i).padStart(2, '0')}`;
    const vehicle = parkedList[i - 1];
    if (vehicle) {
      generatedSpots.push({
        id: spotId,
        spot_id: spotId,
        status: 'Occupied',
        active_vehicle_no: vehicle.vehicle_no,
        type: vehicle.vehicle_type || '2W',
        logData: vehicle
      });
    } else {
      generatedSpots.push({
        id: spotId,
        spot_id: spotId,
        status: i === 7 ? 'Reserved' : 'Vacant',
        active_vehicle_no: null,
        type: null
      });
    }
  }
  state.spots = generatedSpots;

  if (state.selectedSpot) {
    const updated = state.spots.find(s => s.id === state.selectedSpot.id);
    if (updated) state.selectedSpot = updated;
  }
}

export function useParkingData() {
  const initAuth = () => {
    onAuthStateChanged(auth, (user) => {
      state.user = user;
      state.authLoading = false;
      if (user) {
        initGlobalData();
      } else {
        clearData();
      }
    });
  };

  const clearData = () => {
    activeUnsubs.forEach(unsub => unsub());
    activeUnsubs = [];
    state.zones = [];
    state.customers = [];
    state.logEntries = [];
    state.spots = [];
  };

  const initGlobalData = () => {
    state.dataLoading = true;
    
    // Load Zones
    const zonesUnsub = onSnapshot(collection(db, 'ParkingZones'), (snap) => {
      state.zones = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const currentZone = state.zones.find(z => z.id === state.activeZoneId) || state.zones[0];
      if (currentZone) {
        state.activeZoneId = currentZone.id;
        setupZoneListeners(currentZone.id);
      }
    }, (err) => {
      console.error("Zones error:", err);
      state.error = err.message;
    });

    // Load Customers (Resiliently)
    try {
      const custUnsub = onSnapshot(collection(db, 'Customers'), (snap) => {
        state.customers = snap.docs.map(d => ({ id: d.id, email: d.id, ...d.data() }));
      }, () => applyFallbackCustomers());
    } catch {
      applyFallbackCustomers();
    }
  };

  const applyFallbackCustomers = () => {
    if (state.user) {
      state.customers = [{
        id: state.user.email,
        email: state.user.email,
        name: state.user.displayName || 'Access Station User',
        parking_access: [state.activeZoneId]
      }];
    }
  };

  const setupZoneListeners = (zoneId) => {
    activeUnsubs.forEach(unsub => unsub());
    activeUnsubs = [];

    // Subscriptions
    activeUnsubs.push(
      onSnapshot(collection(db, `ParkingZones/${zoneId}/Vehicles`), (snap) => {
        state.zoneVehicles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }, () => state.zoneVehicles = [])
    );

    // TicketCounter
    activeUnsubs.push(
      onSnapshot(doc(db, `ParkingZones/${zoneId}/Counters/TicketCounter`), (docSnap) => {
        state.ticketCounter = docSnap.exists() ? (docSnap.data().currentValue || 0) : 0;
      }, () => state.ticketCounter = 0)
    );

    // BillCounter
    activeUnsubs.push(
      onSnapshot(doc(db, `ParkingZones/${zoneId}/Metadata/BillCounter`), (docSnap) => {
        state.lastBillNo = docSnap.exists() ? (docSnap.data().lastBillNo || 0) : 0;
      }, () => state.lastBillNo = 0)
    );

    // Pricing Config
    activeUnsubs.push(
      onSnapshot(doc(db, `ParkingZones/${zoneId}/Settings/Pricing`), (docSnap) => {
        state.pricingConfig = docSnap.exists() ? docSnap.data() : null;
      }, () => state.pricingConfig = null)
    );

    // Logs (Hardcoded path from previous implementation)
    // Note: In a real app, '2024' and '01' might need to be dynamic, but matching vanilla js logic here
    activeUnsubs.push(
      onSnapshot(collection(db, `ParkingZones/${zoneId}/Logs/2024/Months/01/Entries`), (snap) => {
        state.logEntries = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
          const ta = new Date(tsToStr(a.timestamp) || 0).getTime();
          const tb = new Date(tsToStr(b.timestamp) || 0).getTime();
          return tb - ta;
        });
        deriveSpots();
        state.dataLoading = false;
      }, (err) => {
        console.error("Logs update failed:", err);
        state.logEntries = [];
        deriveSpots();
        state.dataLoading = false;
      })
    );
  };

  // Watch for manual zone changes
  watch(() => state.activeZoneId, (newId) => {
    if (newId) {
      state.dataLoading = true;
      setupZoneListeners(newId);
    }
  });

  return {
    state,
    initAuth,
    computeFee
  };
}
