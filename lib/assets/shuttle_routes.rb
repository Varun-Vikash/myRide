def shuttle_routes
  [
    {
      id: "route-a",
      name: "Route A (Main Campus Loop)",
      bus_no: "Bus #101",
      color: "#EF4444",
      capacity: 32,
      speed_kmh: 20,
      stops: [
        { id: "main-gate", junction: 1, name: "Main Gate Station" },
        { id: "bus", junction: 11, name: "Day Scholar Bus Stand" },
        { id: "as-main-left", junction: 111, name: "AS Main Block" },
        { id: "main-store", junction: 42, name: "Main Store Complex" },
        { id: "boys-hostels", junction: 51, name: "Boys Hostel Station" },
        { id: "boys-mess", junction: 62, name: "Boys Dining Mess" },
        { id: "girls-hostels", junction: 151, name: "Girls Hostel Complex" },
        { id: "west-gate", junction: 157, name: "West Gate Terminal" }
      ]
    },
    {
      id: "route-b",
      name: "Route B (Hostel Shuttle)",
      bus_no: "Bus #202",
      color: "#3B82F6",
      capacity: 32,
      speed_kmh: 18,
      stops: [
        { id: "main-gate", junction: 1, name: "Main Gate Station" },
        { id: "fashion-centre", junction: 48, name: "Fashion Tech Centre" },
        { id: "boys-hostels", junction: 51, name: "Boys Hostel Station" },
        { id: "cafeteria", junction: 84, name: "Central Cafeteria" },
        { id: "library", junction: 118, name: "Central Library" },
        { id: "girls-hostels", junction: 151, name: "Girls Hostel Complex" },
        { id: "west-parking", junction: 152, name: "West Parking Bay" },
        { id: "medical-centre", junction: 153, name: "Campus Medical Centre" },
        { id: "west-gate", junction: 157, name: "West Gate Terminal" }
      ]
    },
    {
      id: "route-c",
      name: "Route C (Academic Express)",
      bus_no: "Bus #303",
      color: "#10B981",
      capacity: 32,
      speed_kmh: 22,
      stops: [
        { id: "bus", junction: 11, name: "Day Scholar Bus Stand" },
        { id: "principal-office", junction: 15, name: "Principal & Dean Office" },
        { id: "as-rib-1", junction: 27, name: "AS Academic RIBs" },
        { id: "mechanic-front", junction: 32, name: "Mechanical Engineering Block" },
        { id: "main-auditorium", junction: 117, name: "Main Auditorium" },
        { id: "ib-block-1", junction: 142, name: "IB Academic Block" },
        { id: "football-ground", junction: 144, name: "Sports & Football Arena" }
      ]
    }
  ]
end
