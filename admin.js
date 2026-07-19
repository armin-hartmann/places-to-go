/**
 * Authenticated PocketBase admin portal controller.
 */
function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g,
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function parseCoordinatePair(value) {
  const match = value.trim().match(
    /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/
  );

  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

document.addEventListener('DOMContentLoaded', async () => {
  const authGate = document.getElementById('auth-gate');
  const adminContainer = document.getElementById('admin-container');
  const authUser = document.getElementById('auth-user');
  const logoutButton = document.getElementById('btn-logout');
  const loginForm = document.getElementById('login-form');
  const loginButton = document.getElementById('btn-login');
  const loginStatus = document.getElementById('login-status');
  let adminInitialized = false;

  function showLogin(message = '') {
    adminContainer.hidden = true;
    authGate.hidden = false;
    authUser.hidden = true;
    logoutButton.hidden = true;
    loginStatus.textContent = message;
  }

  function showAdmin(user) {
    authGate.hidden = true;
    adminContainer.hidden = false;
    authUser.textContent = `${user.name || user.email} · ${user.role}`;
    authUser.hidden = false;
    logoutButton.hidden = false;

    if (!adminInitialized) {
      adminInitialized = true;
      initializeAdminApp(user);
    }
  }

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    loginStatus.textContent = '';
    loginButton.disabled = true;
    loginButton.textContent = 'Signing in…';

    try {
      const user = await authenticateUser(
        document.getElementById('login-email').value.trim(),
        document.getElementById('login-password').value
      );
      loginForm.reset();
      showAdmin(user);
    } catch (error) {
      loginStatus.textContent = getPocketBaseErrorMessage(
        error,
        "Sign-in failed. Check your email and password."
      );
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = 'Sign in';
    }
  });

  logoutButton.addEventListener('click', () => {
    signOutUser();
    window.location.reload();
  });

  const user = await refreshAuthenticatedUser();
  if (user) {
    showAdmin(user);
  } else {
    showLogin();
  }
});

function initializeAdminApp(user) {
  const alexandriaCenter = [38.8045, -77.0425];
  const defaultZoom = 15;
  const form = document.getElementById('add-location-form');
  const submitButton = document.getElementById('btn-submit');
  const cancelButton = document.getElementById('btn-cancel-edit');
  const status = document.getElementById('admin-status');
  const coordinateInput = document.getElementById('loc-coordinates');
  const coordinateHelp = document.getElementById('coordinate-help');
  const coordinateHelpText = coordinateHelp.textContent;
  const categoryFieldset = document.querySelector('.category-fieldset');
  const categoryInputs = Array.from(document.querySelectorAll('input[name="loc-category"]'));
  const categoryHelp = document.getElementById('category-help');
  const categoryHelpText = categoryHelp.textContent;
  const canDelete = canDeleteLocations(user);

  document.getElementById('role-note').textContent = canDelete
    ? 'Administrators can edit and delete.'
    : 'Editors can add and edit; deletion requires an administrator.';

  const map = L.map('admin-map', {
    zoomControl: false,
    tap: false
  }).setView(alexandriaCenter, defaultZoom);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);

  const activeMarkersGroup = L.layerGroup().addTo(map);
  let pickerMarker = null;
  let editingLocationId = '';

  const categories = {
    food: { label: "Dining", color: "var(--color-food)" },
    bar: { label: "Bar", color: "var(--color-bar)" },
    experience: { label: "Unique", color: "var(--color-experience)" }
  };

  function getLocationCategories(location) {
    if (Array.isArray(location.categories) && location.categories.length) {
      return location.categories.filter(category => categories[category]);
    }
    return location.type && categories[location.type] ? [location.type] : [];
  }

  function getSelectedCategories() {
    return categoryInputs
      .filter(input => input.checked)
      .map(input => input.value);
  }

  function setSelectedCategories(categoryValues) {
    const selected = new Set(categoryValues);
    categoryInputs.forEach(input => {
      input.checked = selected.has(input.value);
    });
  }

  function setCategoryFeedback(message = categoryHelpText, state = '') {
    categoryHelp.textContent = message;
    categoryHelp.classList.toggle('form-help-success', state === 'success');
    categoryHelp.classList.toggle('form-help-error', state === 'error');
    categoryFieldset.toggleAttribute('aria-invalid', state === 'error');
  }

  function createCategoryBackground(categoryValues) {
    const validCategories = categoryValues.filter(category => categories[category]);
    if (validCategories.length <= 1) {
      return `var(--color-${validCategories[0] || 'experience'})`;
    }

    const segmentSize = 100 / validCategories.length;
    const stops = validCategories.flatMap((category, index) => {
      const start = (index * segmentSize).toFixed(2);
      const end = ((index + 1) * segmentSize).toFixed(2);
      const color = `var(--color-${category})`;
      return [`${color} ${start}%`, `${color} ${end}%`];
    });
    return `linear-gradient(135deg, ${stops.join(', ')})`;
  }

  function setStatus(message = '', isError = false) {
    status.textContent = message;
    status.classList.toggle('form-status-error', isError);
  }

  function createCustomIcon(categoryValues, isActive = false) {
    const markerBackground = createCategoryBackground(categoryValues);
    const pulseHtml = isActive
      ? `<div class="marker-pulse" style="--marker-background: ${markerBackground};"></div>`
      : '';

    return L.divIcon({
      className: `custom-marker ${isActive ? 'active' : ''}`,
      html: `
        <div class="marker-dot-wrapper">
          ${pulseHtml}
          <div class="marker-dot" style="--marker-background: ${markerBackground};"></div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
  }

  async function refreshAdminView() {
    const tbody = document.getElementById('listings-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="table-message">Loading locations…</td></tr>';

    try {
      const locations = await getStoredLocations({ includeDrafts: true });
      tbody.innerHTML = '';
      activeMarkersGroup.clearLayers();

      if (!locations.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="table-message">No locations yet.</td></tr>';
        return;
      }

      locations.forEach(loc => {
        const tr = document.createElement('tr');
        const locationCategories = getLocationCategories(loc);
        const categoryMarkup = locationCategories.map(category => {
          const catMeta = categories[category];
          return `
            <span style="color: ${catMeta.color}; font-weight: 600;">
              ${escapeHTML(catMeta.label)}
            </span>
          `;
        }).join('');

        tr.innerHTML = `
          <td class="location-name">${escapeHTML(loc.name)}</td>
          <td>
            <span class="table-category-list">${categoryMarkup}</span>
          </td>
          <td>
            <span class="status-badge ${loc.published ? 'status-published' : 'status-draft'}">
              ${loc.published ? 'Published' : 'Draft'}
            </span>
          </td>
          <td class="actions-column">
            <button class="btn-edit" data-id="${escapeHTML(loc.id)}" type="button" aria-label="Edit ${escapeHTML(loc.name)}">Edit</button>
            ${canDelete ? `<button class="btn-delete" data-id="${escapeHTML(loc.id)}" type="button" aria-label="Delete ${escapeHTML(loc.name)}">Delete</button>` : ''}
          </td>
        `;

        tr.querySelector('.btn-edit').addEventListener('click', () => {
          startEditMode(loc);
        });

        const deleteButton = tr.querySelector('.btn-delete');
        if (deleteButton) {
          deleteButton.addEventListener('click', async event => {
            const locationId = event.currentTarget.dataset.id;
            if (!window.confirm(`Are you sure you want to delete "${loc.name}"?`)) {
              return;
            }

            deleteButton.disabled = true;
            setStatus('Deleting location…');
            try {
              await deleteStoredLocation(locationId);
              if (editingLocationId === locationId) {
                cancelEditMode();
              }
              await refreshAdminView();
              setStatus('Location deleted.');
            } catch (error) {
              deleteButton.disabled = false;
              setStatus(getPocketBaseErrorMessage(error, "Failed to delete location."), true);
            }
          });
        }

        tbody.appendChild(tr);

        const popup = document.createElement('div');
        const categoryLabels = locationCategories
          .map(category => categories[category].label)
          .join(' · ');
        popup.innerHTML = `<b>${escapeHTML(loc.name)}</b><br><span class="marker-category">${escapeHTML(categoryLabels)}</span>`;
        activeMarkersGroup.addLayer(
          L.marker([loc.lat, loc.lng], {
            icon: createCustomIcon(locationCategories)
          }).bindPopup(popup)
        );
      });
    } catch (error) {
      activeMarkersGroup.clearLayers();
      tbody.innerHTML = `<tr><td colspan="4" class="table-message table-message-error">${escapeHTML(
        getPocketBaseErrorMessage(error, "Failed to load locations.")
      )}</td></tr>`;
    }
  }

  function setCoordinateFeedback(message = coordinateHelpText, state = '') {
    coordinateHelp.textContent = message;
    coordinateHelp.classList.toggle('form-help-success', state === 'success');
    coordinateHelp.classList.toggle('form-help-error', state === 'error');
  }

  function setFormCoordinates(lat, lng) {
    coordinateInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    coordinateInput.setCustomValidity('');
    coordinateInput.removeAttribute('aria-invalid');
    setCoordinateFeedback('Coordinates set on the map.', 'success');
  }

  function placeOrMovePicker(lat, lng) {
    const selectedCategories = getSelectedCategories();
    const pickerCategories = selectedCategories.length
      ? selectedCategories
      : ['experience'];
    const pickerIcon = createCustomIcon(pickerCategories, true);

    if (pickerMarker) {
      pickerMarker.setLatLng([lat, lng]);
      pickerMarker.setIcon(pickerIcon);
      return;
    }

    pickerMarker = L.marker([lat, lng], {
      draggable: true,
      icon: pickerIcon
    }).addTo(map);

    pickerMarker.on('drag', () => {
      const position = pickerMarker.getLatLng();
      setFormCoordinates(position.lat, position.lng);
    });
  }

  function clearPicker() {
    if (pickerMarker) {
      map.removeLayer(pickerMarker);
      pickerMarker = null;
    }
  }

  function startEditMode(loc) {
    editingLocationId = loc.id;
    document.getElementById('form-title').textContent = "Edit Location";
    submitButton.textContent = "Update Location";
    cancelButton.hidden = false;
    document.getElementById('loc-name').value = loc.name;
    setSelectedCategories(getLocationCategories(loc));
    setCategoryFeedback();
    coordinateInput.value = `${loc.lat}, ${loc.lng}`;
    coordinateInput.setCustomValidity('');
    coordinateInput.removeAttribute('aria-invalid');
    setCoordinateFeedback();
    document.getElementById('loc-desc').value = loc.desc;
    document.getElementById('loc-published').checked = loc.published;
    setStatus('');
    placeOrMovePicker(loc.lat, loc.lng);
    map.invalidateSize({ animate: false });
    map.setView([loc.lat, loc.lng], 16, { animate: true });
    document.getElementById('loc-name').focus();
  }

  function cancelEditMode() {
    editingLocationId = '';
    document.getElementById('form-title').textContent = "Add New Location";
    submitButton.textContent = "Save Location";
    cancelButton.hidden = true;
    form.reset();
    document.getElementById('loc-published').checked = true;
    setCategoryFeedback();
    coordinateInput.setCustomValidity('');
    coordinateInput.removeAttribute('aria-invalid');
    setCoordinateFeedback();
    clearPicker();
    setStatus('');
  }

  cancelButton.addEventListener('click', cancelEditMode);

  categoryInputs.forEach(input => {
    input.addEventListener('change', () => {
      const selectedCategories = getSelectedCategories();
      if (selectedCategories.length) {
        setCategoryFeedback(
          `${selectedCategories.length} ${selectedCategories.length === 1 ? 'category' : 'categories'} selected.`,
          'success'
        );
        if (pickerMarker) {
          pickerMarker.setIcon(createCustomIcon(selectedCategories, true));
        }
      } else {
        setCategoryFeedback('Select at least one category.', 'error');
      }
    });
  });

  coordinateInput.addEventListener('input', () => {
    const coordinates = parseCoordinatePair(coordinateInput.value);

    if (!coordinateInput.value.trim()) {
      coordinateInput.setCustomValidity('');
      coordinateInput.removeAttribute('aria-invalid');
      setCoordinateFeedback();
      return;
    }

    if (!coordinates) {
      coordinateInput.setCustomValidity(
        'Enter latitude and longitude separated by a comma. Latitude must be between -90 and 90; longitude between -180 and 180.'
      );
      coordinateInput.setAttribute('aria-invalid', 'true');
      setCoordinateFeedback('Use latitude, longitude—for example: 38.8045, -77.0591.', 'error');
      return;
    }

    coordinateInput.setCustomValidity('');
    coordinateInput.removeAttribute('aria-invalid');
    setCoordinateFeedback('Coordinates recognized and placed on the map.', 'success');
    placeOrMovePicker(coordinates.lat, coordinates.lng);
    map.setView([coordinates.lat, coordinates.lng], 16, { animate: true });
  });

  map.on('click', event => {
    const { lat, lng } = event.latlng;
    setFormCoordinates(lat, lng);
    placeOrMovePicker(lat, lng);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = document.getElementById('loc-name').value.trim();
    const selectedCategories = getSelectedCategories();
    const coordinates = parseCoordinatePair(coordinateInput.value);
    const desc = document.getElementById('loc-desc').value.trim();
    const published = document.getElementById('loc-published').checked;
    const wasEditing = Boolean(editingLocationId);

    if (!selectedCategories.length) {
      setCategoryFeedback('Select at least one category.', 'error');
      setStatus('Select at least one category before saving.', true);
      categoryInputs[0].focus();
      return;
    }

    if (!coordinates) {
      coordinateInput.reportValidity();
      setStatus('Enter valid coordinates before saving.', true);
      return;
    }

    const { lat, lng } = coordinates;
    submitButton.disabled = true;
    setStatus(wasEditing ? 'Updating location…' : 'Saving location…');

    try {
      const location = {
        name,
        categories: selectedCategories,
        lat,
        lng,
        desc,
        published
      };
      if (wasEditing) {
        await updateStoredLocation(editingLocationId, location);
      } else {
        await addStoredLocation(location);
      }

      cancelEditMode();
      await refreshAdminView();
      map.flyTo([lat, lng], 16, { animate: true, duration: 1.0 });
      setStatus(wasEditing ? 'Location updated.' : 'Location added.');
    } catch (error) {
      setStatus(getPocketBaseErrorMessage(error, "Failed to save location."), true);
    } finally {
      submitButton.disabled = false;
    }
  });

  refreshAdminView();
  window.requestAnimationFrame(() => map.invalidateSize({ animate: false }));

  if (typeof ResizeObserver !== 'undefined') {
    const mapResizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    });
    mapResizeObserver.observe(document.querySelector('.admin-map-area'));
  } else {
    window.addEventListener('resize', () => map.invalidateSize({ animate: false }));
  }
}
