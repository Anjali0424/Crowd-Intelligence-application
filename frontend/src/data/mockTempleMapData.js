
export const TIRUMALA_CENTER = {
  lat: 13.6832,
  lng: 79.3471,
};

export const crowdZones = [
  {
    id: "main-gate",
    name: "Main Darshan Gate",
    lat: 13.6835,
    lng: 79.3473,
    capacity: 300,
    radius: 70,
  },
  {
    id: "queue-area",
    name: "Queue Area",
    lat: 13.6833,
    lng: 79.3472,
    capacity: 250,
    radius: 65,
  },
  {
    id: "darshan-area",
    name: "Darshan Area",
    lat: 13.6830,
    lng: 79.3471,
    capacity: 200,
    radius: 60,
  },
  {
    id: "exit-area",
    name: "Exit Area",
    lat: 13.6828,
    lng: 79.3469,
    capacity: 150,
    radius: 55,
  },
];

export const entryPoints = [
  {
    id: "entry-1",
    name: "Main Entrance",
    lat: 13.6840,
    lng: 79.3475,
    type: "ENTRY",
  },
];

export const exitPoints = [
  {
    id: "exit-1",
    name: "Main Exit",
    lat: 13.6826,
    lng: 79.3468,
    type: "EXIT",
  },
];

export const facilities = [
  {
    id: "washroom-1",
    name: "Washroom",
    lat: 13.6836,
    lng: 79.3470,
    type: "Washroom",
  },
  {
    id: "water-1",
    name: "Drinking Water",
    lat: 13.6834,
    lng: 79.3469,
    type: "Drinking Water",
  },
  {
    id: "medical-1",
    name: "Medical Help Desk",
    lat: 13.6832,
    lng: 79.3474,
    type: "Medical",
  },
  {
    id: "helpdesk-1",
    name: "Help Desk",
    lat: 13.6837,
    lng: 79.3472,
    type: "Help Desk",
  },
];

export const recommendedRoute = [
  { lat: 13.6840, lng: 79.3475 },
  { lat: 13.6835, lng: 79.3473 },
  { lat: 13.6833, lng: 79.3472 },
  { lat: 13.6830, lng: 79.3471 },
];

export const userLocationDemo = [13.6838, 79.3474];

// Destination data for the navigation page.
//
// Coordinates marked `verified: true` were taken from OpenStreetMap features
// (looked up via the Nominatim API) and correspond to real mapped places.
// Entries marked `verified: false` could not be matched to a mapped feature;
// their positions are approximate placeholders inside the temple complex and
// are shown as "(approx.)" in the UI until a real location is confirmed.
export const templeDestinations = [
  // --- Temple / darshan (Temple) ---
  { id: "main-gate", name: "Tirumala Main Gate", category: "Temple", lat: 13.6835, lng: 79.3473, verified: false },
  { id: "gopuram", name: "Sri Venkateswara Temple Gopuram", category: "Temple", lat: 13.6832, lng: 79.3471, verified: true },
  { id: "srivari-temple", name: "Sri Venkateswara Swamy Temple (Main Sanctum)", category: "Temple", lat: 13.6832, lng: 79.3473, verified: true },
  { id: "srivari-inner-complex", name: "Sri Venkateswara Swamy Inner Complex (Sampangi Pradakshinam)", category: "Temple", lat: 13.6832, lng: 79.3470, verified: true },
  { id: "swami-pushkarini", name: "Swami Pushkarini (Temple Tank)", category: "Temple", lat: 13.6843, lng: 79.3479, verified: true },
  { id: "varahaswamy-temple", name: "Sri Varahaswamy Temple", category: "Temple", lat: 13.6849, lng: 79.3476, verified: true },
  { id: "bedi-anjaneya-temple", name: "Sri Bedi Anjaneya Swamy Temple", category: "Temple", lat: 13.6834, lng: 79.3492, verified: true },
  { id: "vqc-1", name: "Vaikuntam Queue Complex 1", category: "Temple", lat: 13.6819, lng: 79.3462, verified: true },
  { id: "vqc-2", name: "Vaikuntam Queue Complex 2", category: "Temple", lat: 13.6828, lng: 79.3444, verified: true },
  { id: "north-mada-street", name: "North Mada Street (Pradakshina Path)", category: "Temple", lat: 13.6851, lng: 79.3478, verified: true },
  { id: "south-mada-street", name: "South Mada Street (Pradakshina Path)", category: "Temple", lat: 13.6827, lng: 79.3464, verified: true },
  { id: "east-mada-street", name: "East Mada Street (Pradakshina Path)", category: "Temple", lat: 13.6842, lng: 79.3483, verified: true },
  { id: "west-mada-street", name: "West Mada Street (Pradakshina Path)", category: "Temple", lat: 13.6841, lng: 79.3458, verified: true },
  { id: "swami-padalu", name: "Srivari Padalu (Swami Vari Padalu)", category: "Temple", lat: 13.6791, lng: 79.3332, verified: true },
  { id: "venugopala-temple", name: "Sri Venugopala Swamy Temple", category: "Temple", lat: 13.7030, lng: 79.3448, verified: true },
  { id: "japali-hanuman-temple", name: "Sri Japali Hanuman Temple", category: "Temple", lat: 13.6969, lng: 79.3367, verified: true },
  { id: "padmavathi-temple", name: "Sri Padmavathi Ammavari Temple (Tiruchanur)", category: "Temple", lat: 13.6079, lng: 79.4500, verified: true },
  { id: "kapila-theertham", name: "Kapila Theertham Temple", category: "Temple", lat: 13.6554, lng: 79.4208, verified: true },

  // --- Laddu / prasadam (Prasadam) ---
  { id: "laddu-counter", name: "Srivari Laddu Prasadam Counter", category: "Prasadam", lat: 13.6834, lng: 79.3476, verified: false },
  { id: "annaprasadam-complex", name: "Sri Tarigonda Vengamamba Annaprasadam Complex", category: "Prasadam", lat: 13.6829, lng: 79.3455, verified: false },

  // --- Medical / emergency (Medical) ---
  { id: "ashwini-hospital", name: "Ashwini Hospital (Tirumala)", category: "Medical", lat: 13.6774, lng: 79.3486, verified: true },
  { id: "ashwini-blood-bank", name: "Aswini Hospital Blood Bank", category: "Medical", lat: 13.6773, lng: 79.3485, verified: true },
  { id: "ayurvedic-hospital", name: "TTD Ayurvedic Hospital", category: "Medical", lat: 13.6800, lng: 79.3503, verified: true },
  { id: "svims-hospital", name: "SVIMS Hospital (Tirupati)", category: "Medical", lat: 13.6426, lng: 79.4064, verified: true },
  { id: "birrd-hospital", name: "BIRRD Hospital (Tirupati)", category: "Medical", lat: 13.6392, lng: 79.4038, verified: true },
  { id: "tirumala-hospital", name: "Tirumala Hospital (Tirupati)", category: "Medical", lat: 13.6353, lng: 79.4213, verified: true },

  // --- Washrooms (Washroom) ---
  { id: "washroom-temple-complex", name: "Public Washroom (Temple Complex)", category: "Washroom", lat: 13.6836, lng: 79.3470, verified: false },

  // --- Drinking water (Water) ---
  { id: "akasaganga", name: "Akasa Ganga Teertham", category: "Water", lat: 13.7006, lng: 79.3385, verified: true },
  { id: "drinking-water-temple-complex", name: "Drinking Water Point (Temple Complex)", category: "Water", lat: 13.6834, lng: 79.3469, verified: false },

  // --- Help desk & services (Help Desk) ---
  { id: "ttd-information-centre", name: "TTD Information / Help Desk", category: "Help Desk", lat: 13.6833, lng: 79.3472, verified: false },
  { id: "cloak-room", name: "Cloak Room / Luggage Counter", category: "Help Desk", lat: 13.6835, lng: 79.3471, verified: false },
  { id: "sbi-tirumala", name: "State Bank of India (Tirumala)", category: "Help Desk", lat: 13.6813, lng: 79.3503, verified: true },
  { id: "vijaya-bank-atm", name: "Vijaya Bank & ATM (West Mada Street)", category: "Help Desk", lat: 13.6857, lng: 79.3455, verified: true },
  { id: "cooperative-bank", name: "Tirumala Co-operative Bank", category: "Help Desk", lat: 13.6850, lng: 79.3466, verified: true },
  { id: "canara-bank", name: "Canara Bank (Tirumala)", category: "Help Desk", lat: 13.6803, lng: 79.3487, verified: true },
  { id: "tirumala-post-office", name: "Tirumala Post Office", category: "Help Desk", lat: 13.6777, lng: 79.3489, verified: true },

  // --- Transport (Transport) ---
  { id: "balaji-bus-station", name: "APSRTC Balaji Bus Station (Tirumala)", category: "Transport", lat: 13.6770, lng: 79.3500, verified: true },
  { id: "rambhagicha-bus-station", name: "APSRTC Bus Station Ramabhagicha (Tirumala)", category: "Transport", lat: 13.6840, lng: 79.3518, verified: true },
  { id: "srivari-mettu", name: "Srivari Mettu Footpath (Walking Route)", category: "Transport", lat: 13.6675, lng: 79.3397, verified: true },
  { id: "alipiri-gate", name: "Alipiri Gate (Footpath Start)", category: "Transport", lat: 13.6458, lng: 79.4072, verified: true },
  { id: "alipiri-bus-depot", name: "APSRTC Bus Depot, Alipiri", category: "Transport", lat: 13.6479, lng: 79.4133, verified: true },
  { id: "tirupati-railway-station", name: "Tirupati Railway Station", category: "Transport", lat: 13.6283, lng: 79.4195, verified: true },
  { id: "tirupati-airport", name: "Tirupati Airport", category: "Transport", lat: 13.6325, lng: 79.5416, verified: true },
  { id: "srinivasa-mangapuram", name: "Srinivasa Mangapuram", category: "Transport", lat: 13.6114, lng: 79.3263, verified: true },

  // --- Accommodation (Accommodation) ---
  { id: "kousthubam-guest-house", name: "Kousthubam Guest House (TTD)", category: "Accommodation", lat: 13.6802, lng: 79.3533, verified: true },
  { id: "vip-guest-house", name: "VIP Guest House (TTD)", category: "Accommodation", lat: 13.6792, lng: 79.3477, verified: true },
  { id: "vijay-mallya-guest-house", name: "Vijay Mallya Guest House (TTD)", category: "Accommodation", lat: 13.6871, lng: 79.3434, verified: true },
  { id: "saptagiri-guest-house", name: "Saptagiri Guest House (TTD)", category: "Accommodation", lat: 13.6820, lng: 79.3514, verified: true },

  // --- Other visitor destinations (Other) ---
  { id: "sri-venkateswara-museum", name: "Sri Venkateswara Museum", category: "Other", lat: 13.6839, lng: 79.3430, verified: true },
  { id: "silathoranam", name: "Silathoranam Natural Stone Arch", category: "Other", lat: 13.6873, lng: 79.3403, verified: true },
  { id: "papavinasanam-dam", name: "Papavinasanam Dam", category: "Other", lat: 13.7198, lng: 79.3434, verified: true },
  { id: "gogarbham-dam", name: "Gogarbham Dam", category: "Other", lat: 13.6910, lng: 79.3540, verified: true },
  { id: "chandragiri-fort", name: "Chandragiri Fort", category: "Other", lat: 13.5830, lng: 79.3053, verified: true },
];
