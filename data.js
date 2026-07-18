/**
 * Old Town Alexandria - Curated Directory Data
 * 
 * Contains default seed data and utility functions to read/write state to browser localStorage.
 */
const OLD_TOWN_LOCATIONS = [
  {
    name: "Virtue Feed & Grain",
    type: "food",
    lat: 38.8042,
    lng: -77.0406,
    desc: "A lively, modern American tavern housed in a historic 1800s feed house."
  },
  {
    name: "Captain Gregory's",
    type: "bar",
    lat: 38.8092,
    lng: -77.0468,
    desc: "An intimate, hidden cocktail speakeasy tucked away behind a secret door."
  },
  {
    name: "BARCA Pier & Wine Bar",
    type: "bar",
    lat: 38.8015,
    lng: -77.0401,
    desc: "Built on a shipping pier over the Potomac River. Perfect for outdoor Spanish tapas."
  },
  {
    name: "Torpedo Factory Art Center",
    type: "experience",
    lat: 38.8048,
    lng: -77.0398,
    desc: "A former WWII munitions factory transformed into three floors of open artist studios."
  },
  {
    name: "Stabler-Leadbeater Apothecary Museum",
    type: "experience",
    lat: 38.8046,
    lng: -77.0441,
    desc: "A perfectly preserved 19th-century pharmacy featuring historic medicine bottles."
  }
];

const STORAGE_KEY = 'old_town_explorer_places';

/**
 * Retrieves the active array of locations.
 * Fallbacks to standard seed data and initializes storage if empty.
 */
function getStoredLocations() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(OLD_TOWN_LOCATIONS));
    return OLD_TOWN_LOCATIONS;
  }
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error("Error parsing stored locations, resetting to default seed data.", e);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(OLD_TOWN_LOCATIONS));
    return OLD_TOWN_LOCATIONS;
  }
}

/**
 * Saves a list of locations to local storage.
 */
function saveLocations(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/**
 * Appends a new location to the list.
 */
function addStoredLocation(location) {
  const list = getStoredLocations();
  // Double-check if name already exists
  if (list.some(l => l.name.toLowerCase() === location.name.toLowerCase())) {
    throw new Error("A location with this name already exists.");
  }
  list.push(location);
  saveLocations(list);
  return list;
}

/**
 * Deletes a location by name.
 */
function deleteStoredLocation(name) {
  let list = getStoredLocations();
  list = list.filter(l => l.name !== name);
  saveLocations(list);
  return list;
}

/**
 * Resets local storage back to defaults.
 */
function resetStoredLocations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(OLD_TOWN_LOCATIONS));
  return OLD_TOWN_LOCATIONS;
}
