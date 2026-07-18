/**
 * Old Town Explorer - Interactive Directory Map
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

document.addEventListener('DOMContentLoaded', () => {
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
  
  // Global cache of markers mapped to location name for quick lookup
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
    }
  };
  
  // 2. Custom Marker Icon Creator
  function createMarkerIcon(type, isActive = false) {
    const colorVar = `var(--color-${type})`;
    // Include a pulse animation only for "experience/unique" locations or when active
    const pulseHtml = (type === 'experience' || isActive) ? `<div class="marker-pulse" style="--marker-color: ${colorVar};"></div>` : '';
    
    return L.divIcon({
      className: `custom-marker ${isActive ? 'active' : ''}`,
      html: `
        <div class="marker-dot-wrapper">
          ${pulseHtml}
          <div class="marker-dot" style="--marker-color: ${colorVar};"></div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      popupAnchor: [0, -14]
    });
  }

  // 3. Retrieve Active locations from localStorage
  if (typeof getStoredLocations === 'undefined') {
    console.error("Storage layer not loaded. Please make sure data.js is included before app.js.");
    return;
  }
  
  const activeLocations = getStoredLocations();
  
  // Pre-create markers and cache them
  activeLocations.forEach(loc => {
    // Generate custom popup content safely escaping user text
    const popupContent = document.createElement('div');
    popupContent.innerHTML = `
      <h3>${escapeHTML(loc.name)}</h3>
      <p>${escapeHTML(loc.desc)}</p>
    `;
    
    // Create marker
    const marker = L.marker([loc.lat, loc.lng], {
      icon: createMarkerIcon(loc.type)
    }).bindPopup(popupContent);
    
    // Track active state in popup open/close to update marker visual state
    marker.on('popupopen', () => {
      marker.setIcon(createMarkerIcon(loc.type, true));
      highlightDirectoryItem(loc.name);
    });
    
    marker.on('popupclose', () => {
      marker.setIcon(createMarkerIcon(loc.type, false));
      clearDirectoryItemHighlight(loc.name);
    });
    
    markerCache.set(loc.name, marker);
  });
  
  // 4. Render Directory and Map Markers
  function renderExplorer(filterType = 'all') {
    // Clear active map markers and list
    markerGroup.clearLayers();
    const directoryList = document.getElementById('directory-list');
    directoryList.innerHTML = '';
    
    // Filter matching data
    const filteredLocations = activeLocations.filter(loc => filterType === 'all' || loc.type === filterType);
    
    if (filteredLocations.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'directory-empty';
      emptyLi.textContent = "No locations found matching this filter.";
      directoryList.appendChild(emptyLi);
      return;
    }
    
    filteredLocations.forEach(loc => {
      // Add marker to map
      const marker = markerCache.get(loc.name);
      if (marker) {
        markerGroup.addLayer(marker);
      }
      
      // Create sidebar item
      const item = document.createElement('li');
      item.className = 'directory-item';
      item.dataset.name = loc.name;
      item.style.setProperty('--accent-color', `var(--color-${loc.type})`);
      
      const catMeta = categories[loc.type] || { label: loc.type, bg: '#f1f5f9', text: '#334155' };
      
      item.innerHTML = `
        <div class="directory-item-header">
          <span class="directory-item-title">${escapeHTML(loc.name)}</span>
          <span class="directory-item-badge" style="--badge-bg: ${catMeta.bg}; --badge-color: ${catMeta.text};">
            ${escapeHTML(catMeta.label)}
          </span>
        </div>
        <p class="directory-item-desc">${escapeHTML(loc.desc)}</p>
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
      
      directoryList.appendChild(item);
    });
  }
  
  // 5. Sidebar Directory Selection Highlights
  function highlightDirectoryItem(name) {
    const items = document.querySelectorAll('.directory-item');
    items.forEach(item => {
      if (item.dataset.name === name) {
        item.classList.add('active');
        const match = activeLocations.find(l => l.name === name);
        if (match) {
          item.style.borderColor = `var(--color-${match.type})`;
        }
        item.style.boxShadow = 'var(--shadow-md)';
        // Scroll list item into view smoothly if not visible
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        item.classList.remove('active');
        item.style.borderColor = '';
        item.style.boxShadow = '';
      }
    });
  }
  
  function clearDirectoryItemHighlight(name) {
    const item = document.querySelector(`.directory-item[data-name="${CSS.escape(name)}"]`);
    if (item) {
      item.classList.remove('active');
      item.style.borderColor = '';
      item.style.boxShadow = '';
    }
  }
  
  // 6. Filter Buttons Interaction
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Remove active state
      filterButtons.forEach(b => b.classList.remove('active'));
      // Add active state to clicked button
      btn.classList.add('active');
      
      const filterValue = btn.dataset.filter;
      renderExplorer(filterValue);
      
      // Fit bounds if user filters and we have markers (except 'all' which resets to original view)
      if (filterValue !== 'all') {
        const bounds = [];
        activeLocations.forEach(loc => {
          if (loc.type === filterValue) {
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
  
  function openSidebar() {
    appContainer.classList.add('sidebar-open');
  }
  
  function closeSidebar() {
    appContainer.classList.remove('sidebar-open');
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
  
  // Handle keyboard escape key to close sidebar
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSidebar();
    }
  });
  
  // 8. Initial Render
  renderExplorer('all');
});
