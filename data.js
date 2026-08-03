/**
 * PocketBase client and location data service for Brick & River.
 */
const LOCATION_TYPES = new Set(['food', 'bar', 'experience', 'cafe', 'transportation']);
const LOCATION_LIMITS = Object.freeze({
  name: 120,
  description: 600
});
const AUTHORIZED_ROLES = new Set(['editor', 'admin']);

const pocketBaseUrl = window.OLD_TOWN_CONFIG?.pocketBaseUrl || window.location.origin;
const pocketBaseClient = new PocketBase(pocketBaseUrl);

function normalizeLocationInput(location) {
  if (!location || typeof location !== 'object' || Array.isArray(location)) {
    throw new Error("Each location must be an object.");
  }

  const name = typeof location.name === 'string' ? location.name.trim() : '';
  const rawCategories = Array.isArray(location.categories)
    ? location.categories
    : typeof location.type === 'string'
      ? [location.type]
      : [];
  const categories = [...new Set(
    rawCategories.map(category => (
      typeof category === 'string' ? category.trim() : ''
    ))
  )];
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

  if (!name || name.length > LOCATION_LIMITS.name) {
    throw new Error(`Location name must be between 1 and ${LOCATION_LIMITS.name} characters.`);
  }
  if (
    categories.length === 0 ||
    categories.length > LOCATION_TYPES.size ||
    categories.some(category => !LOCATION_TYPES.has(category))
  ) {
    throw new Error("Select at least one valid location category.");
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

  return {
    name,
    categories,
    lat,
    lng,
    desc,
    published: location.published !== false,
    sortOrder: Number.isFinite(Number(location.sortOrder))
      ? Number(location.sortOrder)
      : Date.now()
  };
}

function mapPlaceRecord(record) {
  const categories = Array.isArray(record.categories) && record.categories.length
    ? record.categories
    : typeof record.type === 'string' && record.type
      ? [record.type]
      : [];

  return {
    id: record.id,
    name: record.name,
    categories,
    lat: record.location?.lat,
    lng: record.location?.lon,
    desc: record.description,
    published: record.published,
    sortOrder: record.sortOrder,
    createdBy: record.createdBy || ''
  };
}

function locationToRecordData(location, { includeOwner = false } = {}) {
  const normalized = normalizeLocationInput(location);
  const data = {
    name: normalized.name,
    categories: normalized.categories,
    location: {
      lat: normalized.lat,
      lon: normalized.lng
    },
    description: normalized.desc,
    published: normalized.published,
    sortOrder: normalized.sortOrder
  };

  if (includeOwner && pocketBaseClient.authStore.record?.id) {
    data.createdBy = pocketBaseClient.authStore.record.id;
  }

  return data;
}

function getPocketBaseErrorMessage(error, fallbackMessage = "The request could not be completed.") {
  const fieldErrors = error?.response?.data
    ? Object.values(error.response.data)
      .map(entry => entry?.message)
      .filter(Boolean)
    : [];

  if (fieldErrors.length) {
    return fieldErrors.join(' ');
  }

  return error?.response?.message || error?.message || fallbackMessage;
}

async function getStoredLocations({ includeDrafts = false } = {}) {
  const query = {
    sort: 'sortOrder,name'
  };

  // Keep the public explorer strictly published even when an editor happens
  // to have a valid auth session in the same browser.
  if (!includeDrafts) {
    query.filter = 'published = true';
  }

  const records = await pocketBaseClient.collection('places').getFullList(query);
  return records.map(mapPlaceRecord);
}

async function addStoredLocation(location) {
  const record = await pocketBaseClient.collection('places').create(
    locationToRecordData(location, { includeOwner: true })
  );
  return mapPlaceRecord(record);
}

async function deleteStoredLocation(id) {
  if (!id) {
    throw new Error("Location to delete not found.");
  }
  await pocketBaseClient.collection('places').delete(id);
}

async function updateStoredLocation(id, location) {
  if (!id) {
    throw new Error("Location to update not found.");
  }
  const record = await pocketBaseClient.collection('places').update(
    id,
    locationToRecordData(location)
  );
  return mapPlaceRecord(record);
}

function getCurrentUser() {
  return pocketBaseClient.authStore.record;
}

function isAuthorizedUser(record = getCurrentUser()) {
  return Boolean(
    pocketBaseClient.authStore.isValid &&
    record &&
    AUTHORIZED_ROLES.has(record.role)
  );
}

function canDeleteLocations(record = getCurrentUser()) {
  return isAuthorizedUser(record) && record.role === 'admin';
}

async function refreshAuthenticatedUser() {
  if (!pocketBaseClient.authStore.isValid) {
    return null;
  }

  try {
    const authData = await pocketBaseClient.collection('users').authRefresh();
    if (!isAuthorizedUser(authData.record)) {
      pocketBaseClient.authStore.clear();
      return null;
    }
    return authData.record;
  } catch (error) {
    pocketBaseClient.authStore.clear();
    return null;
  }
}

async function authenticateUser(identity, password) {
  const authData = await pocketBaseClient
    .collection('users')
    .authWithPassword(identity, password);

  if (!isAuthorizedUser(authData.record)) {
    pocketBaseClient.authStore.clear();
    throw new Error("This account does not have editor access.");
  }

  return authData.record;
}

function signOutUser() {
  pocketBaseClient.authStore.clear();
}

function subscribeToStoredLocations(callback) {
  return pocketBaseClient.collection('places').subscribe('*', callback);
}
