export const TIRUMALA_CENTER = { lat: 13.6832, lng: 79.3471 };

export const crowdZones = [
  {
    id: "main-gate",
    name: "Main Darshan Gate",
    lat: 13.6835,
    lng: 79.3473,
    people: 240,
    capacity: 300,
    density: 80,
    level: "HIGH",
    radius: 70,
  },
  {
    id: "queue-area",
    name: "Queue Area",
    lat: 13.6833,
    lng: 79.3472,
    people: 180,
    capacity: 250,
    density: 72,
    level: "HIGH",
    radius: 65,
  },
  {
    id: "darshan-area",
    name: "Darshan Area",
    lat: 13.6830,
    lng: 79.3471,
    people: 120,
    capacity: 200,
    density: 60,
    level: "MODERATE",
    radius: 60,
  },
  {
    id: "exit-area",
    name: "Exit Area",
    lat: 13.6828,
    lng: 79.3469,
    people: 60,
    capacity: 150,
    density: 40,
    level: "LOW",
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
