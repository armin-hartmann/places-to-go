/**
 * Brick & River - Interactive Directory Map
 * Logic for initializing the map, placing markers, handling filters, and layout toggles.
 */

// Simple HTML escaping helper to prevent XSS
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

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Map
  const alexandriaCenter = [38.8045, -77.0425];
  const defaultZoom = 15;

  // Create map, disable default zoom controls (we place custom ones)
  const map = L.map('map', {
    zoomControl: false,
    tap: false // Disable tap handler to prevent issues on touch devices
  }).setView(alexandriaCenter, defaultZoom);

  // Add clean light Voyager tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  // Add zoom control at top-right
  L.control.zoom({
    position: 'topright'
  }).addTo(map);

  // Group layer for managing visible markers
  const markerGroup = L.layerGroup().addTo(map);

  // Global cache of markers mapped to stable location IDs for quick lookup
  const markerCache = new Map();

  // Category mapping metadata
  const categories = {
    food: {
      label: "Dining",
      bg: "#fef3c7", // Light amber
      text: "#b45309", // Dark amber
    },
    bar: {
      label: "Bar",
      bg: "#e0e7ff", // Light indigo
      text: "#4338ca", // Dark indigo
    },
    experience: {
      label: "Unique",
      bg: "#ccfbf1", // Light teal
      text: "#0f766e", // Dark teal
    },
    cafe: {
      label: "Cafe",
      bg: "#fce7f3", // Light rose
      text: "#be185d", // Dark rose
    },
    transportation: {
      label: "Transportation & Parking",
      bg: "#e0f2fe", // Light sky
      text: "#0369a1", // Dark sky
    }
  };

  function getLocationCategories(location) {
    if (Array.isArray(location.categories) && location.categories.length) {
      return location.categories.filter(category => categories[category]);
    }
    return location.type && categories[location.type] ? [location.type] : [];
  }

  function createCategoryBackground(categoryValues) {
    const validCategories = categoryValues.filter(category => categories[category]);
    if (validCategories.length <= 1) {
      return `var(--color-${validCategories[0] || 'all'})`;
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

  // 2. Custom Marker Icon Creator
  function createMarkerIcon(categoryValues, isActive = false) {
    const markerBackground = createCategoryBackground(categoryValues);
    // Use motion only to communicate the currently selected location.
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
      iconAnchor: [22, 22],
      popupAnchor: [0, -14]
    });
  }

  // 3. Retrieve published locations from PocketBase
  if (typeof getStoredLocations === 'undefined') {
    console.error("PocketBase data service not loaded. Please make sure data.js is included before app.js.");
    return;
  }

  let activeLocations;
  try {
    activeLocations = await getStoredLocations();
  } catch (error) {
    const directoryList = document.getElementById('directory-list');
    directoryList.innerHTML = '';
    const errorItem = document.createElement('li');
    errorItem.className = 'directory-status directory-status-error';
    errorItem.textContent = getPocketBaseErrorMessage(
      error,
      "Places are temporarily unavailable. Please try again shortly."
    );
    directoryList.appendChild(errorItem);
    console.error("Failed to load places from PocketBase:", error);
    return;
  }

  function rebuildMarkerCache() {
    markerGroup.clearLayers();
    markerCache.clear();

    activeLocations.forEach(loc => {
      const locationCategories = getLocationCategories(loc);
      // Generate custom popup content safely escaping user text
      const popupContent = document.createElement('article');
      popupContent.className = 'place-popup';
      const mapsQuery = loc.address || `${loc.name}, Old Town Alexandria, VA`;
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`;
      const categoryLabels = locationCategories.map(category => categories[category].label);
      const details = [...categoryLabels, ...(loc.tags || [])];
      const websiteUrl = (() => {
        try {
          const url = new URL(loc.website);
          return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
        } catch {
          return '';
        }
      })();
      const externalIcon = `
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>
      `;

      popupContent.innerHTML = `
        <h3>${escapeHTML(loc.name)}</h3>
        ${details.length ? `<p class="place-popup-meta">${details.map(escapeHTML).join(' · ')}</p>` : ''}
        <p class="place-popup-description">${escapeHTML(loc.desc)}</p>
        ${loc.address ? `<p class="place-popup-address">${escapeHTML(loc.address)}</p>` : ''}
        <div class="place-popup-actions">
          <a class="place-popup-action place-popup-action-primary" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">
            Get directions ${externalIcon}
          </a>
          ${websiteUrl ? `<a class="place-popup-action" href="${escapeHTML(websiteUrl)}" target="_blank" rel="noopener noreferrer">
            Visit website ${externalIcon}
          </a>` : ''}
        </div>
      `;

      const marker = L.marker([loc.lat, loc.lng], {
        icon: createMarkerIcon(locationCategories)
      }).bindPopup(popupContent);

      // Track active state in popup open/close to update marker visual state
      marker.on('popupopen', () => {
        marker.setIcon(createMarkerIcon(locationCategories, true));
        highlightDirectoryItem(loc.id);
      });

      marker.on('popupclose', () => {
        marker.setIcon(createMarkerIcon(locationCategories, false));
        clearDirectoryItemHighlight(loc.id);
      });

      markerCache.set(loc.id, marker);
    });
  }

  rebuildMarkerCache();

  function matchesExplorerSearch(location) {
    const searchText = [location.name, location.desc, ...(location.tags || [])]
      .join(' ')
      .toLocaleLowerCase();
    return !currentSearch || searchText.includes(currentSearch);
  }

  function renderTagFilters() {
    const tagFilters = document.getElementById('tag-filters');
    const tags = [...new Set(activeLocations.flatMap(location => location.tags || []))].sort();
    tagFilters.innerHTML = '';

    tags.forEach(tag => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tag-filter';
      button.textContent = tag;
      button.setAttribute('aria-pressed', String(activeTag === tag));
      button.classList.toggle('active', activeTag === tag);
      button.addEventListener('click', () => {
        activeTag = activeTag === tag ? '' : tag;
        renderTagFilters();
        renderExplorer(currentFilter);
      });
      tagFilters.appendChild(button);
    });
  }

  // 4. Render Directory and Map Markers
  function renderExplorer(filterType = 'all') {
    // Clear active map markers and list
    markerGroup.clearLayers();
    const directoryList = document.getElementById('directory-list');
    directoryList.innerHTML = '';

    // Filter matching data
    const filteredLocations = activeLocations.filter(loc => (
      (filterType === 'all' || getLocationCategories(loc).includes(filterType)) &&
      (!activeTag || (loc.tags || []).includes(activeTag)) &&
      matchesExplorerSearch(loc)
    ));

    if (filteredLocations.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'directory-empty';
      emptyLi.textContent = "No locations found matching this filter.";
      directoryList.appendChild(emptyLi);
      return;
    }

    filteredLocations.forEach(loc => {
      const locationCategories = getLocationCategories(loc);
      // Add marker to map
      const marker = markerCache.get(loc.id);
      if (marker) {
        markerGroup.addLayer(marker);
      }

      // Use a real button inside the list item so keyboard users can select a place.
      const listItem = document.createElement('li');
      listItem.className = 'directory-list-entry';
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'directory-item';
      item.dataset.id = loc.id;
      item.style.setProperty('--accent-background', createCategoryBackground(locationCategories));

      const categoryBadges = locationCategories.map(category => {
        const catMeta = categories[category];
        return `
          <span class="directory-item-badge" style="--badge-bg: ${catMeta.bg}; --badge-color: ${catMeta.text};">
            ${escapeHTML(catMeta.label)}
          </span>
        `;
      }).join('');

      const tagBadges = (loc.tags || []).map(tag => (
        `<span class="directory-item-tag">${escapeHTML(tag)}</span>`
      )).join('');

      item.innerHTML = `
        <div class="directory-item-header">
          <span class="directory-item-title">${escapeHTML(loc.name)}</span>
          <span class="directory-item-badges">${categoryBadges}</span>
        </div>
        <p class="directory-item-desc">${escapeHTML(loc.desc)}</p>
        ${tagBadges ? `<span class="directory-item-tags">${tagBadges}</span>` : ''}
      `;

      // Clicking list item flies to location and opens popup
      item.addEventListener('click', () => {
        if (marker) {
          // Pan and zoom smoothly
          map.setView([loc.lat, loc.lng], 16, {
            animate: true,
            duration: 0.8
          });

          // Open popup after transition starts/completes
          setTimeout(() => {
            marker.openPopup();
          }, 200);

          // Close drawer on mobile for seamless map focusing
          closeSidebar();
        }
      });

      listItem.appendChild(item);
      directoryList.appendChild(listItem);
    });
  }

  // 5. Sidebar Directory Selection Highlights
  function highlightDirectoryItem(id) {
    const items = document.querySelectorAll('.directory-item');
    items.forEach(item => {
      if (item.dataset.id === id) {
        item.classList.add('active');
        item.setAttribute('aria-current', 'true');
        const match = activeLocations.find(location => location.id === id);
        if (match) {
          const primaryCategory = getLocationCategories(match)[0] || 'all';
          item.style.borderColor = `var(--color-${primaryCategory})`;
        }
        item.style.boxShadow = 'var(--shadow-md)';
        // Scroll list item into view smoothly if not visible
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        item.classList.remove('active');
        item.removeAttribute('aria-current');
        item.style.borderColor = '';
        item.style.boxShadow = '';
      }
    });
  }

  function clearDirectoryItemHighlight(id) {
    const item = document.querySelector(`.directory-item[data-id="${CSS.escape(id)}"]`);
    if (item) {
      item.classList.remove('active');
      item.removeAttribute('aria-current');
      item.style.borderColor = '';
      item.style.boxShadow = '';
    }
  }

  // 6. Filter, tag, and search interactions
  let currentFilter = 'all';
  let activeTag = '';
  let currentSearch = '';
  const searchInput = document.getElementById('place-search');
  const filterButtons = document.querySelectorAll('.filter-btn');

  searchInput.addEventListener('input', () => {
    currentSearch = searchInput.value.trim().toLocaleLowerCase();
    renderExplorer(currentFilter);
  });
  filterButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Remove active state
      filterButtons.forEach(button => {
        button.classList.remove('active');
        button.setAttribute('aria-pressed', 'false');
      });
      // Add active state to clicked button
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      const filterValue = btn.dataset.filter;
      currentFilter = filterValue;
      renderExplorer(currentFilter);

      // Fit bounds if user filters and we have markers (except 'all' which resets to original view)
      if (filterValue !== 'all') {
        const bounds = [];
        activeLocations.forEach(loc => {
          if (getLocationCategories(loc).includes(filterValue)) {
            bounds.push([loc.lat, loc.lng]);
          }
        });
        if (bounds.length > 0) {
          map.fitBounds(bounds, {
            padding: [50, 50],
            maxZoom: 16,
            animate: true
          });
        }
      } else {
        // Reset to original viewpoint
        map.setView(alexandriaCenter, defaultZoom, { animate: true });
      }
    });
  });

  // 7. Mobile Sidebar Drawer Logic
  const appContainer = document.querySelector('.app-container');
  const menuToggle = document.getElementById('menu-toggle');
  const overlay = document.getElementById('sidebar-overlay');
  const sidebar = document.getElementById('explorer-sidebar');
  const mapArea = document.querySelector('.map-area');
  const mobileQuery = window.matchMedia('(max-width: 768px)');

  function updateMapSize() {
    window.setTimeout(() => map.invalidateSize({ animate: false }), 360);
  }

  function setFocusableState(container, isEnabled) {
    const focusableElements = container.querySelectorAll(
      'a, button, input, select, textarea, [tabindex]'
    );

    focusableElements.forEach(element => {
      if (!isEnabled) {
        if (!element.hasAttribute('data-previous-tabindex')) {
          element.dataset.previousTabindex = element.getAttribute('tabindex') || '';
        }
        element.setAttribute('tabindex', '-1');
      } else if (element.hasAttribute('data-previous-tabindex')) {
        const previousTabindex = element.dataset.previousTabindex;
        if (previousTabindex) {
          element.setAttribute('tabindex', previousTabindex);
        } else {
          element.removeAttribute('tabindex');
        }
        delete element.dataset.previousTabindex;
      }
    });
  }

  function syncSidebarAccessibility(isOpen) {
    const isMobile = mobileQuery.matches;
    const drawerIsOpen = isMobile && isOpen;

    menuToggle.setAttribute('aria-expanded', String(drawerIsOpen));
    menuToggle.setAttribute(
      'aria-label',
      drawerIsOpen ? 'Close location directory' : 'Open location directory'
    );
    overlay.setAttribute('aria-hidden', String(!drawerIsOpen));

    if (isMobile) {
      sidebar.setAttribute('aria-hidden', String(!drawerIsOpen));
      sidebar.toggleAttribute('inert', !drawerIsOpen);
      mapArea.toggleAttribute('inert', drawerIsOpen);
      setFocusableState(sidebar, drawerIsOpen);
      setFocusableState(mapArea, !drawerIsOpen);
    } else {
      sidebar.removeAttribute('aria-hidden');
      sidebar.removeAttribute('inert');
      mapArea.removeAttribute('inert');
      setFocusableState(sidebar, true);
      setFocusableState(mapArea, true);
    }
  }

  function openSidebar() {
    appContainer.classList.add('sidebar-open');
    syncSidebarAccessibility(true);
    const firstSidebarControl = sidebar.querySelector('button, a');
    if (firstSidebarControl) {
      window.requestAnimationFrame(() => firstSidebarControl.focus());
    }
    updateMapSize();
  }

  function closeSidebar({ restoreFocus = true } = {}) {
    const wasOpen = appContainer.classList.contains('sidebar-open');
    appContainer.classList.remove('sidebar-open');
    syncSidebarAccessibility(false);
    if (wasOpen && restoreFocus && mobileQuery.matches) {
      menuToggle.focus();
    }
    updateMapSize();
  }

  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      const isOpen = appContainer.classList.contains('sidebar-open');
      if (isOpen) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  // The sheet closes with a deliberate downward drag. A list drag only begins
  // once its scroll position is already at the top, so normal browsing scrolls
  // never accidentally dismiss the directory.
  const sheetHandle = sidebar.querySelector('.sidebar-header');
  const directorySection = document.querySelector('.directory-section');
  let sheetDrag;
  let suppressDirectoryClick = false;

  function beginSheetDrag(event) {
    if (!mobileQuery.matches || event.button > 0) return;

    sheetDrag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      offset: 0
    };
    sidebar.classList.add('dragging');
    sidebar.setPointerCapture(event.pointerId);
  }

  function moveSheetDrag(event) {
    if (!sheetDrag || event.pointerId !== sheetDrag.pointerId) return;

    const offset = Math.max(0, event.clientY - sheetDrag.startY);
    if (offset > 0) {
      event.preventDefault();
      sheetDrag.offset = offset;
      sheetDrag.lastY = event.clientY;
      sheetDrag.lastTime = event.timeStamp;
      sidebar.style.transform = `translateY(${offset}px)`;
    }
  }

  function endSheetDrag(event) {
    if (!sheetDrag || event.pointerId !== sheetDrag.pointerId) return;

    const { offset, lastY, lastTime } = sheetDrag;
    const elapsed = Math.max(1, event.timeStamp - lastTime);
    const velocity = Math.max(0, event.clientY - lastY) / elapsed;
    const closeThreshold = Math.min(170, window.innerHeight * 0.2);
    const shouldClose = offset >= closeThreshold || (offset >= 48 && velocity > 0.7);

    if (offset > 8) suppressDirectoryClick = true;
    sheetDrag = null;
    sidebar.classList.remove('dragging');
    sidebar.style.transform = '';

    if (shouldClose) {
      closeSidebar();
    }
  }

  sheetHandle.addEventListener('pointerdown', beginSheetDrag);
  directorySection.addEventListener('pointerdown', event => {
    if (directorySection.scrollTop <= 0) beginSheetDrag(event);
  });
  sidebar.addEventListener('pointermove', moveSheetDrag, { passive: false });
  sidebar.addEventListener('pointerup', endSheetDrag);
  sidebar.addEventListener('pointercancel', endSheetDrag);
  directorySection.addEventListener('click', event => {
    if (!suppressDirectoryClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressDirectoryClick = false;
  }, true);

  // Handle keyboard escape key to close sidebar
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && appContainer.classList.contains('sidebar-open')) {
      closeSidebar();
    }
  });

  mobileQuery.addEventListener('change', () => {
    appContainer.classList.remove('sidebar-open');
    syncSidebarAccessibility(false);
    updateMapSize();
  });

  // 8. Initial Render and live updates
  let refreshTimer;
  let unsubscribeLocations;

  function scheduleExplorerRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(async () => {
      try {
        activeLocations = await getStoredLocations();
        if (activeTag && !activeLocations.some(location => (location.tags || []).includes(activeTag))) {
          activeTag = '';
        }
        rebuildMarkerCache();
        renderTagFilters();
        renderExplorer(currentFilter);
      } catch (error) {
        // Keep the currently displayed directory intact if a refresh fails.
        console.error("Failed to refresh places after a realtime update:", error);
      }
    }, 150);
  }

  renderTagFilters();
  renderExplorer(currentFilter);
  syncSidebarAccessibility(false);

  try {
    unsubscribeLocations = await subscribeToStoredLocations(scheduleExplorerRefresh);
  } catch (error) {
    // The explorer remains usable when a network blocks the realtime stream.
    console.error("Failed to subscribe to place updates:", error);
  }

  window.addEventListener('pagehide', () => {
    window.clearTimeout(refreshTimer);
    if (unsubscribeLocations) {
      unsubscribeLocations();
    }
  }, { once: true });
});
