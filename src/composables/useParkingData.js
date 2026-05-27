import { ref, reactive, computed, watch } from 'vue';
import { collection, doc, onSnapshot, query, orderBy, setDoc, Timestamp } from 'firebase/firestore';
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

  const seedDatabase = async () => {
    state.dataLoading = true;
    try {
      const zoneId = 'DemoParking';
      
      // 1. Create ParkingZone DemoParking
      await setDoc(doc(db, 'ParkingZones', zoneId), {
        name: "Demo Parking Zone 1",
        entry_ip: "192.168.0.50",
        exit_ip: "192.168.0.51",
        users: state.user ? [state.user.email, "dinesh@imai-tech.com", "vignesh@imai-tech.com"] : ["dinesh@imai-tech.com", "vignesh@imai-tech.com"]
      });

      // 2. Create Global Operators (Customers)
      if (state.user) {
        await setDoc(doc(db, 'Customers', state.user.email), {
          name: state.user.displayName || 'Authorized Admin',
          parking_access: [zoneId]
        });
      }
      await setDoc(doc(db, 'Customers', 'vignesh@imai-tech.com'), {
        name: "Vignesh",
        parking_access: [zoneId]
      });
      await setDoc(doc(db, 'Customers', 'dinesh@imai-tech.com'), {
        name: "Dinesh",
        parking_access: [zoneId]
      });

      // 3. Create Pricing Config
      await setDoc(doc(db, `ParkingZones/${zoneId}/Settings/Pricing`), {
        gracePeriodMins: 10,
        dailyMaxCap: 500,
        timeBlocks: [
          { upToHours: 2, rate: 20, isFlatRate: false },
          { upToHours: 5, rate: 50, isFlatRate: false },
          { upToHours: 24, rate: 150, isFlatRate: true }
        ]
      });

      // 4. Create Ticket Counter
      await setDoc(doc(db, `ParkingZones/${zoneId}/Counters/TicketCounter`), {
        currentValue: 1042
      });

      // 5. Create Bill Counter
      await setDoc(doc(db, `ParkingZones/${zoneId}/Metadata/BillCounter`), {
        lastBillNo: 18
      });

      // 6. Create Subscriptions (Vehicles)
      await setDoc(doc(db, `ParkingZones/${zoneId}/Vehicles/TN01ND0002`), {
        vehicleno: "TN01ND0002",
        vehicletype: "4W",
        subscription: "Monthly",
        substartdate: "01/05/2026",
        subenddate: "01/05/2027",
        amount: "1500",
        active: true
      });
      await setDoc(doc(db, `ParkingZones/${zoneId}/Vehicles/KA03MM1234`), {
        vehicleno: "KA03MM1234",
        vehicletype: "2W",
        subscription: "Yearly",
        substartdate: "10/01/2026",
        subenddate: "10/01/2027",
        amount: "2400",
        active: true
      });
      await setDoc(doc(db, `ParkingZones/${zoneId}/Vehicles/MH12AA9999`), {
        vehicleno: "MH12AA9999",
        vehicletype: "4W",
        subscription: "Monthly",
        substartdate: "15/05/2026",
        subenddate: "15/06/2026",
        amount: "1500",
        active: false
      });

      // 7. Create LPR Log Entries inside /Logs/2024/Months/01/Entries
      await setDoc(doc(db, `ParkingZones/${zoneId}/Logs/2024/Months/01/Entries/log_1`), {
        vehicle_no: "TN01ND0002",
        vehicle_type: "4W",
        checkin_status: true,
        timestamp: Timestamp.fromDate(new Date(Date.now() - 3600000 * 2.5)),
        photo_url: "https://images.unsplash.com/photo-1506015391300-4802dc74de2e?auto=format&fit=crop&w=300&q=80"
      });
      await setDoc(doc(db, `ParkingZones/${zoneId}/Logs/2024/Months/01/Entries/log_2`), {
        vehicle_no: "KA03MM1234",
        vehicle_type: "2W",
        checkin_status: true,
        timestamp: Timestamp.fromDate(new Date(Date.now() - 3600000 * 0.8)),
        photo_url: "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=300&q=80"
      });
      await setDoc(doc(db, `ParkingZones/${zoneId}/Logs/2024/Months/01/Entries/log_3`), {
        vehicle_no: "DL01CC7777",
        vehicle_type: "4W",
        checkin_status: false,
        timestamp: Timestamp.fromDate(new Date(Date.now() - 3600000 * 6.2)),
        checkOutTime: Timestamp.fromDate(new Date(Date.now() - 3600000 * 5)),
        amount: "40",
        paymentMethod: "UPI",
        photo_url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=300&q=80",
        payment_url: "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?auto=format&fit=crop&w=300&q=80"
      });
      await setDoc(doc(db, `ParkingZones/${zoneId}/Logs/2024/Months/01/Entries/log_4`), {
        vehicle_no: "MH12AA9999",
        vehicle_type: "4W",
        checkin_status: false,
        timestamp: Timestamp.fromDate(new Date(Date.now() - 3600000 * 24)),
        checkOutTime: Timestamp.fromDate(new Date(Date.now() - 3600000 * 22)),
        amount: "150",
        paymentMethod: "Cash",
        photo_url: "https://images.unsplash.com/photo-1506015391300-4802dc74de2e?auto=format&fit=crop&w=300&q=80",
        payment_url: "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?auto=format&fit=crop&w=300&q=80"
      });

      // Force reload global data
      state.activeZoneId = zoneId;
      initGlobalData();
      return true;
    } catch (e) {
      console.error("Failed to seed database:", e);
      state.error = e.message;
      state.dataLoading = false;
      throw e;
    }
  };

  return {
    state,
    initAuth,
    computeFee,
    seedDatabase
  };
}
