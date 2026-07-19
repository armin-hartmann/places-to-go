/**
 * Old Town Alexandria - Curated Directory Data
 *
 * Contains default seed data and utility functions to read/write state to browser localStorage.
 */
const OLD_TOWN_LOCATIONS = [
  {
    id: "virtue-feed-grain",
    name: "Virtue Feed & Grain",
    type: "food",
    lat: 38.8042,
    lng: -77.0406,
    desc: "A lively, modern American tavern housed in a historic 1800s feed house."
  },
  {
    id: "captain-gregorys",
    name: "Captain Gregory's",
    type: "bar",
    lat: 38.8092,
    lng: -77.0468,
    desc: "An intimate, hidden cocktail speakeasy tucked away behind a secret door."
  },
  {
    id: "barca-pier-wine-bar",
    name: "BARCA Pier & Wine Bar",
    type: "bar",
    lat: 38.8015,
    lng: -77.0401,
    desc: "Built on a shipping pier over the Potomac River. Perfect for outdoor Spanish tapas."
  },
  {
    id: "torpedo-factory-art-center",
    name: "Torpedo Factory Art Center",
    type: "experience",
    lat: 38.8048,
    lng: -77.0398,
    desc: "A former WWII munitions factory transformed into three floors of open artist studios."
  },
  {
    id: "stabler-leadbeater-apothecary-museum",
    name: "Stabler-Leadbeater Apothecary Museum",
    type: "experience",
    lat: 38.8046,
    lng: -77.0441,
    desc: "A perfectly preserved 19th-century pharmacy featuring historic medicine bottles."
  }
];

const STORAGE_KEY = 'old_town_explorer_places';
const STORAGE_BACKUP_KEY = `${STORAGE_KEY}_recovery`;
const STORAGE_VERSION = 2;
const LOCATION_TYPES = new Set(['food', 'bar', 'experience']);
const LOCATION_LIMITS = Object.freeze({
  id: 100,
  name: 120,
  description: 600
});

function cloneLocations(list) {
  return list.map(location => ({ ...location }));
}

function createLocationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `place-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createLegacyLocationId(location, index) {
  const slug = typeof location.name === 'string'
    ? location.name
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 72)
    : '';
  return `legacy-${slug || 'place'}-${index + 1}`;
}

function normalizeLocation(location, fallbackId) {
  if (!location || typeof location !== 'object' || Array.isArray(location)) {
    throw new Error("Each location must be an object.");
  }

  const id = typeof location.id === 'string' && location.id.trim()
    ? location.id.trim()
    : fallbackId;
  const name = typeof location.name === 'string' ? location.name.trim() : '';
  const type = typeof location.type === 'string' ? location.type.trim() : '';
  const desc = typeof location.desc === 'string' ? location.desc.trim() : '';
  const lat = typeof location.lat === 'number'
    ? location.lat
    : typeof location.lat === 'string' && location.lat.trim()
      ? Number(location.lat)
      : Number.NaN;
  const lng = typeof location.lng === 'number'
    ? location.lng
    : typeof location.lng === 'string' && location.lng.trim()
      ? Number(location.lng)
      : Number.NaN;

  if (!id || id.length > LOCATION_LIMITS.id) {
    throw new Error("Location ID is missing or invalid.");
  }
  if (!name || name.length > LOCATION_LIMITS.name) {
    throw new Error(`Location name must be between 1 and ${LOCATION_LIMITS.name} characters.`);
  }
  if (!LOCATION_TYPES.has(type)) {
    throw new Error("Location category is invalid.");
  }
  if (!desc || desc.length > LOCATION_LIMITS.description) {
    throw new Error(`Description must be between 1 and ${LOCATION_LIMITS.description} characters.`);
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error("Latitude must be between -90 and 90.");
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error("Longitude must be between -180 and 180.");
  }

  return { id, name, type, lat, lng, desc };
}

function validateLocationList(list, { migrateLegacy = false } = {}) {
  if (!Array.isArray(list)) {
    throw new Error("Stored locations must be an array.");
  }

  const normalized = list.map((location, index) => normalizeLocation(
    location,
    migrateLegacy ? createLegacyLocationId(location, index) : undefined
  ));
  const ids = new Set();
  const names = new Set();

  normalized.forEach(location => {
    const normalizedName = location.name.toLocaleLowerCase();
    if (ids.has(location.id)) {
      throw new Error("Stored locations contain duplicate IDs.");
    }
    if (names.has(normalizedName)) {
      throw new Error("Stored locations contain duplicate names.");
    }
    ids.add(location.id);
    names.add(normalizedName);
  });

  return normalized;
}

function persistLocations(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: STORAGE_VERSION,
    locations: list
  }));
}

function restoreDefaultLocations(error, corruptValue) {
  if (error) {
    console.error("Stored location data is invalid; restoring defaults.", error);
  }
  const defaults = cloneLocations(OLD_TOWN_LOCATIONS);
  try {
    if (corruptValue) {
      localStorage.setItem(STORAGE_BACKUP_KEY, corruptValue);
    }
    persistLocations(defaults);
  } catch (storageError) {
    console.error("Unable to persist default locations.", storageError);
  }
  return defaults;
}

/**
 * Retrieves the active array of locations.
 * Fallbacks to standard seed data and initializes storage if empty.
 */
function getStoredLocations() {
  let stored;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("Unable to read stored locations; using defaults for this session.", error);
    return cloneLocations(OLD_TOWN_LOCATIONS);
  }

  if (!stored) {
    return restoreDefaultLocations();
  }

  try {
    const parsed = JSON.parse(stored);

    // Version 1 stored the location array directly. Migrate it in place.
    if (Array.isArray(parsed)) {
      const migrated = validateLocationList(parsed, { migrateLegacy: true });
      try {
        persistLocations(migrated);
      } catch (storageError) {
        console.error("Unable to persist migrated locations.", storageError);
      }
      return cloneLocations(migrated);
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.version !== STORAGE_VERSION
    ) {
      throw new Error("Unsupported location storage format.");
    }

    const locations = validateLocationList(parsed.locations);
    return cloneLocations(locations);
  } catch (error) {
    return restoreDefaultLocations(error, stored);
  }
}

/**
 * Saves a list of locations to local storage.
 */
function saveLocations(list) {
  const validated = validateLocationList(list);
  persistLocations(validated);
  return cloneLocations(validated);
}

/**
 * Appends a new location to the list.
 */
function addStoredLocation(location) {
  const list = getStoredLocations();
  const normalizedLocation = normalizeLocation(
    { ...location, id: location && location.id ? location.id : createLocationId() }
  );
  // Double-check if name already exists
  if (list.some(l => l.name.toLocaleLowerCase() === normalizedLocation.name.toLocaleLowerCase())) {
    throw new Error("A location with this name already exists.");
  }
  list.push(normalizedLocation);
  return saveLocations(list);
}

/**
 * Deletes a location by stable ID (or by name for legacy callers).
 */
function deleteStoredLocation(identifier) {
  const list = getStoredLocations();
  const filtered = list.filter(location => (
    location.id !== identifier && location.name !== identifier
  ));
  if (filtered.length === list.length) {
    throw new Error("Location to delete not found.");
  }
  return saveLocations(filtered);
}

/**
 * Updates an existing location by stable ID (or by name for legacy callers).
 */
function updateStoredLocation(identifier, updatedLocation) {
  const list = getStoredLocations();
  const index = list.findIndex(location => (
    location.id === identifier || location.name === identifier
  ));
  if (index === -1) {
    throw new Error("Location to update not found.");
  }

  const normalizedLocation = normalizeLocation({
    ...updatedLocation,
    id: list[index].id
  });

  // If the name changed, check if the new name already exists elsewhere
  if (list[index].name.toLocaleLowerCase() !== normalizedLocation.name.toLocaleLowerCase()) {
    if (list.some((location, locationIndex) => (
      locationIndex !== index &&
      location.name.toLocaleLowerCase() === normalizedLocation.name.toLocaleLowerCase()
    ))) {
      throw new Error("A location with this name already exists.");
    }
  }

  list[index] = normalizedLocation;
  return saveLocations(list);
}

/**
 * Resets local storage back to defaults.
 */
function resetStoredLocations() {
  const defaults = cloneLocations(OLD_TOWN_LOCATIONS);
  persistLocations(defaults);
  return defaults;
}
