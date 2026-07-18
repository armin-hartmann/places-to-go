/**
 * Old Town Explorer - Admin Portal Controller
 * Logic for picking coordinates from map, adding/editing custom locations,
 * and deleting existing ones with localStorage persistence.
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
  
  const map = L.map('admin-map', {
    zoomControl: false,
    tap: false
  }).setView(alexandriaCenter, defaultZoom);
  
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);
  
  L.control.zoom({
    position: 'topright'
  }).addTo(map);
  
  // Layer group for displaying ALL currently active locations
  const activeMarkersGroup = L.layerGroup().addTo(map);
  
  // Variable for the draggable picker marker
  let pickerMarker = null;
  
  // Metadata for categories
  const categories = {
    food: { label: "Dining", color: "var(--color-food)" },
    bar: { label: "Bar", color: "var(--color-bar)" },
    experience: { label: "Unique", color: "var(--color-experience)" }
  };
  
  // 2. Custom Icon Creator
  function createCustomIcon(type, isActive = false) {
    const colorVar = `var(--color-${type})`;
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
      iconAnchor: [22, 22]
    });
  }
  
  // 3. Render Table Listings and Map Markers
  function refreshAdminView() {
    const locations = getStoredLocations();
    
    // Clear list table
    const tbody = document.getElementById('listings-tbody');
    tbody.innerHTML = '';
    
    // Clear existing active markers from map
    activeMarkersGroup.clearLayers();
    
    locations.forEach(loc => {
      // Create table row
      const tr = document.createElement('tr');
      
      const catMeta = categories[loc.type] || { label: loc.type, color: 'var(--color-all)' };
      
      tr.innerHTML = `
        <td style="font-weight: 500;">${escapeHTML(loc.name)}</td>
        <td>
          <span style="color: ${catMeta.color}; font-weight: 600;">
            ${escapeHTML(catMeta.label)}
          </span>
        </td>
        <td style="text-align: right;">
          <button class="btn-delete" data-name="${escapeHTML(loc.name)}" type="button">Delete</button>
        </td>
      `;
      
      // Bind delete button
      tr.querySelector('.btn-delete').addEventListener('click', (e) => {
        const name = e.target.dataset.name;
        if (confirm(`Are you sure you want to delete "${name}"?`)) {
          deleteStoredLocation(name);
          refreshAdminView();
          // If we deleted the spot currently shown by picker, remove picker marker too
          if (pickerMarker) {
            map.removeLayer(pickerMarker);
            pickerMarker = null;
          }
        }
      });
      
      tbody.appendChild(tr);
      
      // Add existing marker to map to avoid overlaps
      const marker = L.marker([loc.lat, loc.lng], {
        icon: createCustomIcon(loc.type)
      }).bindPopup(`<b>${escapeHTML(loc.name)}</b><br><span style="font-size: 0.8rem; color: #64748b;">${escapeHTML(catMeta.label)}</span>`);
      
      activeMarkersGroup.addLayer(marker);
    });
  }
  
  // 4. Map Click Handler (Coordinate Selector)
  map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    setFormCoordinates(lat, lng);
    placeOrMovePicker(lat, lng);
  });
  
  function setFormCoordinates(lat, lng) {
    document.getElementById('loc-lat').value = lat.toFixed(6);
    document.getElementById('loc-lng').value = lng.toFixed(6);
  }
  
  function placeOrMovePicker(lat, lng) {
    if (pickerMarker) {
      pickerMarker.setLatLng([lat, lng]);
    } else {
      // Place new draggable pin (highlighted in 'experience'/Teal color by default for high visibility)
      pickerMarker = L.marker([lat, lng], {
        draggable: true,
        icon: createCustomIcon('experience', true) // active styling
      }).addTo(map);
      
      // Sync form on drag end
      pickerMarker.on('drag', (event) => {
        const position = pickerMarker.getLatLng();
        setFormCoordinates(position.lat, position.lng);
      });
    }
  }
  
  // 5. Add Location Form Submission
  const form = document.getElementById('add-location-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = document.getElementById('loc-name').value.trim();
    const type = document.getElementById('loc-type').value;
    const latStr = document.getElementById('loc-lat').value;
    const lngStr = document.getElementById('loc-lng').value;
    const desc = document.getElementById('loc-desc').value.trim();
    
    // Validation
    if (!name || !type || !latStr || !lngStr || !desc) {
      alert("Please fill in all form fields.");
      return;
    }
    
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    
    if (isNaN(lat) || isNaN(lng)) {
      alert("Please enter valid decimal coordinates.");
      return;
    }
    
    const newLocation = { name, type, lat, lng, desc };
    
    try {
      addStoredLocation(newLocation);
      
      // Success: Clear Form & picker pin
      form.reset();
      if (pickerMarker) {
        map.removeLayer(pickerMarker);
        pickerMarker = null;
      }
      
      // Refresh listings and map
      refreshAdminView();
      
      // Fly to newly added location to show off addition
      map.flyTo([lat, lng], 16, { animate: true, duration: 1.0 });
      
    } catch (err) {
      alert(err.message || "Failed to add location.");
    }
  });
  
  // 6. Reset to Defaults Handler
  const resetBtn = document.getElementById('btn-reset-data');
  resetBtn.addEventListener('click', () => {
    if (confirm("This will erase all custom locations and restore the default seed guide. Do you want to proceed?")) {
      resetStoredLocations();
      if (pickerMarker) {
        map.removeLayer(pickerMarker);
        pickerMarker = null;
      }
      form.reset();
      refreshAdminView();
      // Zoom back to center
      map.setView(alexandriaCenter, defaultZoom, { animate: true });
    }
  });
  
  // 7. Initial Load
  refreshAdminView();
});
