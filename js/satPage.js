// satPage.js - Handles the individual satellite tracking interface

// Global variables
let map;
let satellite; // Holds the specific satellite data object
// Removed unused satellitePath, groundTrack, footprintPolygon
let satelliteMarker;
let orbitLine;
let groundTrackLine;
let updateIntervalId;
let footprintCircle;
// let currentTileLayer; // Removed, replaced by currentMapLayer
let currentMapLayer; // Renamed for clarity and consistency

// Utility function to escape HTML special characters
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Constants
const EARTH_RADIUS_KM = 6371;
const UPDATE_INTERVAL_MS = 1000;
const ORBIT_POINTS = 180; // Number of points to calculate for orbit visualization
const ORBIT_PERIOD_MINUTES = 90; // Approximate period for most LEO satellites

// Only load data from active.json
const activeJsonFile = 'data/active.json';

// Initialize the page when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    // Check if satellite.js is loaded
    if (typeof window.satellite === 'undefined') {
        console.error('satellite.js library not loaded!');
        showError('Required library satellite.js is not loaded. Please check your internet connection and refresh the page.');
        return;
    }

    // --- Non-Map Related Setup ---
    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', function() { window.location.href = 'index.html'; });
    }
    // Theme toggle listener is handled in its own block below

    // --- Satellite Loading and Map Initialization ---
    const urlParams = new URLSearchParams(window.location.search);
    const satId = urlParams.get('ID');

    if (!satId) {
        showError("Missing satellite ID (NORAD CAT ID) in URL. Please provide an ID parameter, e.g., ?ID=25544");
        return; // Stop execution
    }

    const loadSuccessful = await loadSatelliteDataFromLocal(satId);

    if (loadSuccessful) {
        // --- Map and Tracking Setup (Only if load was successful) ---
        initMap(); // Initialize the map (Map tiles are set based on theme within initMap now)

        // Set default checkbox states and add listeners
        const showOrbitCheckbox = document.getElementById('show-orbit');
        const showGroundTrackCheckbox = document.getElementById('show-groundtrack');
        const showFootprintCheckbox = document.getElementById('show-footprint');

        if (showOrbitCheckbox) {
            showOrbitCheckbox.checked = true;
            showOrbitCheckbox.addEventListener('change', function() { toggleOrbitDisplay(this.checked); });
        }
        if (showGroundTrackCheckbox) {
            showGroundTrackCheckbox.checked = true;
            showGroundTrackCheckbox.addEventListener('change', function() { toggleGroundTrackDisplay(this.checked); });
        }
        if (showFootprintCheckbox) {
            showFootprintCheckbox.checked = true;
            showFootprintCheckbox.addEventListener('change', function() { toggleFootprintDisplay(this.checked); });
        }

        // Map type listener - Now only updates map if in light mode
        const mapTypeSelect = document.getElementById('map-type');
        if (mapTypeSelect) {
             mapTypeSelect.addEventListener('change', function() {
                 const currentTheme = document.body.getAttribute('data-theme');
                 if (currentTheme === 'light') {
                     updateMapTileLayer(currentTheme); // Update based on selection in light mode
                 }
             });
             // Initial map type selection based on theme is handled by setTheme call below
        }

        // Display initial info and start tracking
        displaySatelliteInfo(); // Display static info
        startTracking(); // Start dynamic updates

        // Add event listener for predict passes button
        const predictPassesBtn = document.getElementById('predictPassesBtn');
        if (predictPassesBtn) {
            predictPassesBtn.addEventListener('click', updatePassPredictions);
        }

        // console.log('Satellite data:', satellite);

    } else {
        // console.log("Satellite data load failed, map and tracking will not initialize.");
    }
});

// --- Consolidated Theme Toggle Functionality ---
document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle'); // Use theme-toggle ID
    const currentTheme = localStorage.getItem('theme') || 'dark'; // Default to dark

    // Apply theme and icon on load
    setTheme(currentTheme); // Call the consolidated function

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            let newTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            setTheme(newTheme);
        });
    }
});

// Function to set the theme for the page and map
function setTheme(theme) {
    document.body.setAttribute('data-theme', theme); // Use data-theme attribute
    localStorage.setItem('theme', theme);

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        // Update icon based on the new theme (assuming Font Awesome icons)
        themeToggle.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }

    // Update map tiles based on the theme
    updateMapTileLayer(theme);

    // Adjust map type dropdown based on theme
    const mapTypeSelect = document.getElementById('map-type');
    if (mapTypeSelect) {
        // Optionally disable dropdown in dark mode if desired
        // mapTypeSelect.disabled = (theme === 'dark');

        // Set dropdown value to reflect current map state
        if (theme === 'dark') {
            // If you want the dropdown to show 'dark' when dark mode is active:
            // mapTypeSelect.value = 'dark'; // Or leave it as is
        } else {
            // In light mode, ensure the dropdown reflects the actual tile layer being shown.
            // This might require reading the current layer's URL or storing the last light mode selection.
            // For simplicity, we'll just ensure it's not stuck on 'dark'.
            if (mapTypeSelect.value === 'dark') {
                 mapTypeSelect.value = 'standard'; // Default back to standard if it was dark
            }
        }
    }
}

// Function to update map tile layer based on theme and selection
function updateMapTileLayer(theme) {
    const mapTypeSelect = document.getElementById('map-type');
    const selectedMapType = mapTypeSelect ? mapTypeSelect.value : 'standard';

    if (map) {
        if (currentMapLayer) {
            map.removeLayer(currentMapLayer);
        }

        let tileUrl;
        let tileOptions = {
            maxZoom: 13,
            subdomains: ['a', 'b', 'c']
        };

        if (theme === 'dark') {
            tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
            tileOptions.attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
            tileOptions.subdomains = 'abcd';
        } else {
            switch (selectedMapType) {
                case 'satellite':
                    tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
                    tileOptions.attribution = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
                    tileOptions.maxZoom = 17;
                    delete tileOptions.subdomains;
                    break;
                case 'terrain':
                    tileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
                    tileOptions.attribution = 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)';
                    tileOptions.maxZoom = 15;
                    break;
                case 'standard':
                default:
                    tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
                    tileOptions.attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
                    break;
            }
        }

        currentMapLayer = L.tileLayer(tileUrl, tileOptions);
        currentMapLayer.addTo(map);
    }
}

// Removed redundant updateMapTiles function

// Removed second DOMContentLoaded listener for dark mode

// Initialize Leaflet map
function initMap() {
    map = L.map('mapid', {
        center: [0, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 13,
        worldCopyJump: true // Keep this for better user experience when panning
    });

    const initialTheme = localStorage.getItem('theme') || 'dark';
    updateMapTileLayer(initialTheme);
}

// Removed updateMapType function as its logic is merged into updateMapTileLayer

// Load satellite data from local active.json file using NORAD ID
async function loadSatelliteDataFromLocal(satId) {
    showLoading(`Loading TLE data for NORAD ID ${satId}...`);
    let foundSatellite = null;

    try {
        // First check if this is a custom satellite
        const customSat = loadCustomSatellite(satId);
        if (customSat) {
            satellite = customSat;
            const titleElement = document.getElementById('satellite-title');
            if (titleElement) {
                titleElement.innerText = satellite.OBJECT_NAME || `Satellite ${satId}`;
            }
            hideLoading(true);
            return true;
        }

        // If not found in custom satellites, try active.json
        const res = await fetch(activeJsonFile);
        if (!res.ok) {
            throw new Error(`Could not fetch ${activeJsonFile}: ${res.statusText}`);
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
            throw new Error(`Data in ${activeJsonFile} is not in the expected array format.`);
        }

        const satIdNum = parseInt(satId, 10);
        foundSatellite = data.find(sat => parseInt(sat.NORAD_CAT_ID, 10) === satIdNum);

        if (!foundSatellite) {
            throw new Error(`NOT_FOUND: No TLE data found for NORAD ID ${satId}.`);
        }

        satellite = foundSatellite;

        const titleElement = document.getElementById('satellite-title');
        if (titleElement) {
            titleElement.innerText = satellite.OBJECT_NAME || `Satellite ${satId}`;
        }

        hideLoading(true);
        return true;

    } catch (error) {
        if (error.message.startsWith('NOT_FOUND:')) {
            showError(`This satellite (NORAD ID: ${satId}) is not currently listed as active.`);
        } else {
            showError(`Failed to load satellite data: ${error.message}`);
        }
        return false;
    }
}

// Start tracking the satellite with periodic updates
function startTracking() {
    updateSatellitePosition();
    updateIntervalId = setInterval(updateSatellitePosition, UPDATE_INTERVAL_MS);
}

// Update the satellite position and related visualizations
function updateSatellitePosition() {
    try {
        const now = new Date();
        const position = calculateSatellitePosition(satellite, now);

        if (position === null || isNaN(position.lat) || isNaN(position.lng)) {
            // Removed console warning
            return;
        }

        updatePositionInfo(position);
        updateMapVisualization(position);

    } catch (error) {
        // Removed console error
        showError(`Failed to update satellite position: ${error.message}`);
        if (updateIntervalId) clearInterval(updateIntervalId);
    }
}

// Update the map visualization with the satellite's current position
function updateMapVisualization(position) {
    const { lat, lng, alt } = position; // Removed unused velocity variable

    if (!satelliteMarker) {
        const satIcon = L.icon({
            iconUrl: 'src/images/satImage.png',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -16]
        });

        satelliteMarker = L.marker([lat, lng], {
            icon: satIcon,
            title: satellite.OBJECT_NAME || `Satellite ${satellite.NORAD_CAT_ID}`
        }).addTo(map);

        satelliteMarker.bindPopup(createSatellitePopup(position));

    } else {
        satelliteMarker.setLatLng([lat, lng]);
        satelliteMarker.getPopup().setContent(createSatellitePopup(position));
    }

    if (document.getElementById('show-orbit').checked) {
        updateOrbitVisualization();
    } else if (orbitLine) {
        map.removeLayer(orbitLine);
        orbitLine = null;
    }

    if (document.getElementById('show-groundtrack').checked) {
        updateGroundTrackVisualization();
    } else if (groundTrackLine) {
        map.removeLayer(groundTrackLine);
        groundTrackLine = null;
    }

    if (document.getElementById('show-footprint').checked) {
        updateFootprintVisualization(lat, lng, alt);
    } else if (footprintCircle) {
        map.removeLayer(footprintCircle);
        footprintCircle = null;
    }
    // Removed commented-out map centering code
}

// Create popup content for satellite marker
function createSatellitePopup(position) {
    const { lat, lng, alt, velocity } = position;
    
    return `<div class="satellite-popup">
        <h4>${satellite.OBJECT_NAME || `Satellite ${satellite.NORAD_CAT_ID}`}</h4>
        <p>NORAD ID: ${satellite.NORAD_CAT_ID}</p>
        <p>Latitude: ${lat.toFixed(4)}°</p>
        <p>Longitude: ${lng.toFixed(4)}°</p>
        <p>Altitude: ${alt.toFixed(2)} km</p>
        <p>Velocity: ${velocity.toFixed(2)} km/s</p>
    </div>`;
}

// Update the orbit visualization
function updateOrbitVisualization() {
    const orbitSegments = calculateOrbitPoints();
    
    if (orbitLine) {
        map.removeLayer(orbitLine);
    }
    
    // Create a feature group to hold all orbit segments
    orbitLine = L.featureGroup();
    
    // Add each segment as a separate polyline
    orbitSegments.forEach(segment => {
        L.polyline(segment, {
            color: '#3498db',
            weight: 2,
            opacity: 0.7,
            dashArray: '5, 5',
            className: 'orbit-path'
        }).addTo(orbitLine);
    });
    
    orbitLine.addTo(map);
}

// Update the ground track visualization
function updateGroundTrackVisualization() {
    const trackSegments = calculateGroundTrackPoints();
    
    if (groundTrackLine) {
        map.removeLayer(groundTrackLine);
    }
    
    // Create a feature group to hold all ground track segments
    groundTrackLine = L.featureGroup();
    
    // Add each segment as a separate polyline
    trackSegments.forEach(segment => {
        L.polyline(segment, {
            color: '#e74c3c',
            weight: 2,
            opacity: 0.8,
            className: 'ground-track'
        }).addTo(groundTrackLine);
    });
    
    groundTrackLine.addTo(map);
}

// Update the footprint visualization (coverage area)
function updateFootprintVisualization(lat, lng, alt) {
    const radius = calculateFootprintRadius(alt);
    
    if (footprintCircle) {
        map.removeLayer(footprintCircle);
    }
    
    footprintCircle = L.circle([lat, lng], {
        radius: radius * 1000,
        color: '#f39c12',
        weight: 1,
        fillColor: '#f39c12',
        fillOpacity: 0.1,
        className: 'footprint'
    }).addTo(map);
}

// Calculate satellite footprint radius based on altitude
function calculateFootprintRadius(altitude) {
    if (altitude <= 0) return 0; // Avoid calculation errors for negative/zero altitude
    const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitude);
    // Ensure ratio is within valid range for acos to prevent NaN
    if (ratio > 1 || ratio < -1) return 0; 
    const angle = Math.acos(ratio);
    return EARTH_RADIUS_KM * angle;
}

// Toggle orbit display
function toggleOrbitDisplay(show) {
    if (show) {
        updateOrbitVisualization();
    } else if (orbitLine) {
        map.removeLayer(orbitLine);
        orbitLine = null;
    }
}

// Toggle ground track display
function toggleGroundTrackDisplay(show) {
    if (show) {
        updateGroundTrackVisualization();
    } else if (groundTrackLine) {
        map.removeLayer(groundTrackLine);
        groundTrackLine = null;
    }
}

// Toggle footprint display
function toggleFootprintDisplay(show) {
    if (show && satelliteMarker) {
        const position = satelliteMarker.getLatLng();
        const currentPosition = calculateSatellitePosition(satellite, new Date());
        if (currentPosition && !isNaN(currentPosition.alt)) {
             updateFootprintVisualization(position.lat, position.lng, currentPosition.alt);
        } else {
            // Removed console warning
            // Attempt to draw with last known altitude if available
            const lastAlt = parseFloat(document.querySelector('#position-info table tr:nth-child(5) td')?.textContent);
            if (!isNaN(lastAlt)) {
                updateFootprintVisualization(position.lat, position.lng, lastAlt);
            }
        }
    } else if (footprintCircle) {
        map.removeLayer(footprintCircle);
        footprintCircle = null;
    }
}

// Removed toggleDarkMode function and related initialization blocks

// Display satellite information in the details panels
function displaySatelliteInfo() {
    // Ensure satellite object exists before trying to access properties
    if (!satellite) return;

    // Update satellite info panel
    const satNameElement = document.getElementById('satName');
    const yearLaunchedElement = document.getElementById('yearLaunched');
    const orbitalPeriodElement = document.getElementById('orbitalPeriod');

    if (satNameElement) satNameElement.textContent = satellite.OBJECT_NAME || 'N/A';
    if (yearLaunchedElement) yearLaunchedElement.textContent = formatLaunchDate(satellite.OBJECT_ID) || 'N/A';
    if (orbitalPeriodElement) orbitalPeriodElement.textContent = `${calculateOrbitalPeriod(satellite) || 'N/A'} minutes`;

    // Update orbital elements panel
    const elements = {
        'eccentricity': { value: satellite.ECCENTRICITY, decimals: 6, unit: '' },
        'inclination': { value: satellite.INCLINATION, decimals: 1, unit: '°' },
        'raan': { value: satellite.RA_OF_ASC_NODE, decimals: 1, unit: '°' },
        'argPerigee': { value: satellite.ARG_OF_PERICENTER, decimals: 1, unit: '°' },
        'meanMotion': { value: satellite.MEAN_MOTION, decimals: 2, unit: ' rev/day' },
        'meanAnomaly': { value: satellite.MEAN_ANOMALY, decimals: 1, unit: '°' }
    };

    for (const [id, config] of Object.entries(elements)) {
        const element = document.getElementById(id);
        if (element) {
            const formattedValue = (config.value || 0).toFixed(config.decimals);
            element.textContent = `${formattedValue}${config.unit}`;
        }
    }
}

// Update position information panel with current data
function updatePositionInfo(position) {
    // Ensure satellite object exists
    if (!satellite) return;
    const { lat, lng, alt, velocity, time } = position;

    // Update each element individually
    document.getElementById('timeUTC').textContent = time.toISOString();
    document.getElementById('timeLocal').textContent = time.toLocaleString();
    document.getElementById('latitude').textContent = `${lat.toFixed(4)}°`;
    document.getElementById('longitude').textContent = `${lng.toFixed(4)}°`;
    document.getElementById('altitude').textContent = `${alt.toFixed(2)} km`;
    document.getElementById('velocity').textContent = `${velocity.toFixed(2)} km/s`;
    document.getElementById('groundSpeed').textContent = `${calculateGroundSpeed(velocity, alt).toFixed(2)} km/s`;
}

// Calculate ground speed from orbital velocity
function calculateGroundSpeed(velocity, altitude) {
    if (altitude <= -EARTH_RADIUS_KM) return 0; // Avoid division by zero or negative radius
    return velocity * (EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitude));
}

// Removed isInDaylight function

// Removed calculateSunPosition function

// Removed getDayOfYear function

// Removed latLngToCartesian function

// Helper function to get object type description
function getObjectType(typeCode) {
    const types = {
        'PAY': 'Payload',
        'R/B': 'Rocket Body',
        'DEB': 'Debris',
        'UNK': 'Unknown'
    };
    return types[typeCode] || typeCode || 'Unknown';
}

// Helper function to format launch date from international designator
function formatLaunchDate(objectId) {
    if (!objectId) return null;
    const match = objectId.match(/^(\d{4})/);
    if (match) {
        return match[1]; // Return only the year
    }
    return objectId;
}

// Calculate orbital period in minutes
function calculateOrbitalPeriod(satellite) {
    if (!satellite || !satellite.MEAN_MOTION || satellite.MEAN_MOTION <= 0) return null;
    return (24 * 60 / satellite.MEAN_MOTION).toFixed(1);
}

// Show loading message
function showLoading(message) {
    const loadingElement = document.getElementById('loading-message');
    const errorElement = document.getElementById('error-message');
    const titleElement = document.getElementById('satellite-title');
    const mapElement = document.getElementById('mapid');
    const detailsElements = document.querySelectorAll('.satellite-details-section'); // Target details sections

    if (loadingElement) {
        loadingElement.textContent = message || 'Loading...';
        loadingElement.style.display = 'block';
    }
    if (errorElement) errorElement.style.display = 'none';
    if (titleElement) titleElement.style.display = 'none';
    if (mapElement) mapElement.style.display = 'none'; // Hide map
    detailsElements.forEach(el => el.style.display = 'none'); // Hide details
}

// Hide loading message (and show content if successful)
function hideLoading(isSuccess = true) {
    const loadingElement = document.getElementById('loading-message');
    const titleElement = document.getElementById('satellite-title');
    const mapElement = document.getElementById('mapid');
    const detailsElements = document.querySelectorAll('.satellite-details-section');

    if (loadingElement) loadingElement.style.display = 'none';

    // Only show content if loading was successful
    if (isSuccess) {
        if (titleElement) titleElement.style.display = 'block';
        if (mapElement) mapElement.style.display = 'block'; // Show map
        detailsElements.forEach(el => el.style.display = 'block'); // Show details
    } else {
        // Ensure content remains hidden on failure
        if (titleElement) titleElement.style.display = 'none';
        if (mapElement) mapElement.style.display = 'none';
        detailsElements.forEach(el => el.style.display = 'none');
    }
}

// Show error message
function showError(message) {
    const errorElement = document.getElementById('error-message');
    const loadingElement = document.getElementById('loading-message');
    // No need to hide map/details here, hideLoading(false) handles it

    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
    if (loadingElement) loadingElement.style.display = 'none';

    // Call hideLoading with false to ensure title/map/details remain hidden
    hideLoading(false);
}

// Improve orbit calculation for smoother paths
function calculateOrbitPoints() {
    const points = [];
    const segments = [];
    const now = new Date();
    
    const orbitDuration = ORBIT_PERIOD_MINUTES * 60 * 1000;
    const timeStep = orbitDuration / ORBIT_POINTS;
    const numPoints = ORBIT_POINTS * 2; // Two full orbits
    
    let currentSegment = [];
    let prevLng = null;
    
    for (let i = 0; i < numPoints; i++) {
        const timeOffset = i * timeStep;
        const time = new Date(now.getTime() + timeOffset);
        const position = calculateSatellitePosition(satellite, time);
        
        if (position && !isNaN(position.lat) && !isNaN(position.lng)) {
            let lng = position.lng;
            
            // Handle longitude wrapping by creating new segments
            if (prevLng !== null) {
                const diff = lng - prevLng;
                if (Math.abs(diff) > 180) {
                    if (currentSegment.length > 0) {
                        segments.push(currentSegment);
                        currentSegment = [];
                    }
                }
            }
            
            currentSegment.push([position.lat, lng]);
            prevLng = lng;
        }
    }
    
    // Add the last segment if it contains points
    if (currentSegment.length > 0) {
        segments.push(currentSegment);
    }
    
    return segments;
}

// Update ground track calculation
function calculateGroundTrackPoints() {
    const segments = [];
    const now = new Date();
    
    const orbitDuration = ORBIT_PERIOD_MINUTES * 60 * 1000;
    const timeStep = orbitDuration / ORBIT_POINTS;
    const numPoints = Math.floor(ORBIT_POINTS * 1.5); // One and a half orbits
    
    let currentSegment = [];
    let prevLng = null;
    
    for (let i = 0; i < numPoints; i++) {
        const timeOffset = i * timeStep;
        const time = new Date(now.getTime() + timeOffset);
        const position = calculateSatellitePosition(satellite, time);
        
        if (position && !isNaN(position.lat) && !isNaN(position.lng)) {
            let lng = position.lng;
            
            // Handle longitude wrapping by creating new segments
            if (prevLng !== null) {
                const diff = lng - prevLng;
                if (Math.abs(diff) > 180) {
                    if (currentSegment.length > 0) {
                        segments.push(currentSegment);
                        currentSegment = [];
                    }
                }
            }
            
            currentSegment.push([position.lat, lng]);
            prevLng = lng;
        }
    }
    
    // Add the last segment if it contains points
    if (currentSegment.length > 0) {
        segments.push(currentSegment);
    }
    
    return segments;
}

// Update the updatePassPredictions function to handle async operations
async function updatePassPredictions() {
    // Ensure the main satellite object is available
    if (!satellite || !satellite.OBJECT_NAME) {
        showError('Satellite data not fully loaded. Cannot predict passes.');
        return;
    }

    const observerLat = parseFloat(document.getElementById('observerLat').value);
    const observerLon = parseFloat(document.getElementById('observerLon').value);

    // Basic validation for observer coordinates
    if (isNaN(observerLat) || isNaN(observerLon)) {
        showError('Please enter valid latitude and longitude values');
        return;
    }
    if (observerLat < -90 || observerLat > 90 || observerLon < -180 || observerLon > 180) {
        showError('Latitude must be -90 to 90, Longitude must be -180 to 180');
        return;
    }

    // Show loading state for prediction
    const predictButton = document.getElementById('predictPassesBtn');
    const originalButtonText = predictButton.innerHTML;
    predictButton.disabled = true;
    predictButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Predicting...';
    const passResults = document.querySelector('.pass-results');
    if (passResults) passResults.style.display = 'none'; // Hide previous results

    try {
        // console.log(`[updatePassPredictions] Requesting pass prediction for: ${satellite.OBJECT_NAME}`);

        // Ensure the global calculateNextPass function exists
        if (typeof window.calculateNextPass !== 'function') {
             throw new Error('calculateNextPass function is not available globally.');
        }

        // Pass the entire satellite object
        const nextPass = await window.calculateNextPass(satellite, observerLat, observerLon);
        
        if (passResults) { // Check if passResults element exists
            if (nextPass) { 
                // console.log('[updatePassPredictions] Pass prediction successful:', nextPass);
                
                // Ensure lookAnglePoints exists before using it
                const lookAnglePoints = nextPass.lookAnglePoints || []; 

                // Draw the visualization using look angles and direction
                drawPassVisualization('pass-visualization-canvas', lookAnglePoints, nextPass.direction);
                
                // Format start time to local string
                const localStartTime = nextPass.startTime.toLocaleString(undefined, {
                    // weekday: 'short', 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit' 
                    // timeZoneName: 'short' // Optional: Add timezone name
                });

                document.getElementById('nextPassTime').textContent = localStartTime; // Display local time
                document.getElementById('maxElevation').textContent = `${nextPass.maxElevation.toFixed(1)}°`;
                document.getElementById('passDuration').textContent = `${Math.floor(nextPass.duration / 60)}m ${Math.floor(nextPass.duration % 60)}s`;
                document.getElementById('passDirection').textContent = nextPass.direction;
                
            } else {
                // console.log('[updatePassPredictions] No pass found.');
                document.getElementById('nextPassTime').textContent = 'No passes in next 24h';
                document.getElementById('maxElevation').textContent = '-';
                document.getElementById('passDuration').textContent = '-';
                document.getElementById('passDirection').textContent = '-';
                // Clear visualization if no pass
                clearPassVisualization('pass-visualization-canvas');
            }
            passResults.style.display = 'block'; // Show results table
        }

    } catch (error) {
        console.error('[updatePassPredictions] Error calculating/displaying pass predictions:', error);
        showError(`Failed to calculate pass predictions: ${error.message}`);
        // Display error in the results table
        if (passResults) {
            document.getElementById('nextPassTime').textContent = 'Error';
            document.getElementById('maxElevation').textContent = '-';
            document.getElementById('passDuration').textContent = '-';
            document.getElementById('passDirection').textContent = '-';
            passResults.style.display = 'block';
        }
    } finally {
        // Restore button state
        predictButton.disabled = false;
        predictButton.innerHTML = originalButtonText;
    }
}

// --- Pass Visualization --- //

// Function to draw the pass visualization on a canvas (Sky Plot)
function drawPassVisualization(canvasId, lookAnglePoints, direction) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.getContext) {
        console.error('Canvas element not found or not supported.');
        return;
    }
    const ctx = canvas.getContext('2d');
    // Get computed style from documentElement for theme variables
    const computedStyle = getComputedStyle(document.documentElement); 

    // --- Set Canvas Resolution based on CSS size and devicePixelRatio ---
    const cssWidth = 400; // From CSS
    const cssHeight = 200; // From CSS
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    // CSS size remains 400x200, but drawing buffer is higher resolution
    ctx.scale(dpr, dpr); // Scale the context to draw appropriately

    // --- Recalculate dimensions based on CSS size (used for drawing logic) ---
    const width = cssWidth; 
    const height = cssHeight;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 15;

    // Get computed colors from CSS variables
    const borderColor = computedStyle.getPropertyValue('--border-color').trim() || '#cccccc';
    const gridColor = computedStyle.getPropertyValue('--grid-color').trim() || '#e0e0e0';
    const textColor = computedStyle.getPropertyValue('--text-primary').trim() || '#555555'; // Use --text-primary
    const accentColor = computedStyle.getPropertyValue('--accent-color').trim() || '#007bff';
    const arrowColor = computedStyle.getPropertyValue('--direction-arrow-color').trim() || 'orange';

    // Clear canvas - Use canvas attributes for actual pixel dimensions
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- Draw Background Elements --- (Drawing commands remain based on cssWidth/cssHeight due to ctx.scale)
    ctx.beginPath();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = gridColor;
    ctx.setLineDash([2, 3]);
    [30, 60].forEach(el => {
        const r = radius * (1 - el / 90);
        ctx.moveTo(centerX + r, centerY);
        ctx.arc(centerX, centerY, r, 0, 2 * Math.PI);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.strokeStyle = borderColor;
    ctx.moveTo(centerX, centerY - radius);
    ctx.lineTo(centerX, centerY + radius);
    ctx.moveTo(centerX - radius, centerY);
    ctx.lineTo(centerX + radius, centerY);
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', centerX, centerY - radius - 8);
    ctx.fillText('S', centerX, centerY + radius + 8);
    ctx.textAlign = 'left';
    ctx.fillText('E', centerX + radius + 5, centerY);
    ctx.textAlign = 'right';
    ctx.fillText('W', centerX - radius - 5, centerY);

    // --- Draw Observer Location (Center Dot) ---
    ctx.beginPath();
    ctx.fillStyle = 'red'; // Keep observer red
    ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI);
    ctx.fill();

    // --- Draw Pass Trajectory --- Using computed accentColor
    ctx.beginPath();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    let firstPoint = true;

    lookAnglePoints.forEach(p => {
        // Convert Az/El to canvas coordinates
        // Azimuth is angle (0=N, 90=E, 180=S, 270=W)
        // Elevation is distance from center (90=center, 0=edge)
        const angleRad = (p.azimuth - 90) * Math.PI / 180; // Convert Azimuth to canvas angle (0=E)
        const dist = radius * (1 - p.elevation / 90);
        
        const x = centerX + dist * Math.cos(angleRad);
        const y = centerY + dist * Math.sin(angleRad);

        if (p.elevation >= 0) { // Only draw points above the horizon
            if (firstPoint) {
                ctx.moveTo(x, y);
                // REMOVED start marker drawing
                // ctx.fillStyle = 'var(--start-color, green)'; 
                // ctx.fillRect(x - 2, y - 2, 4, 4);
                firstPoint = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
    });
    ctx.stroke(); // Draw the path itself

    // --- Draw Direction Arrow ON the path start --- Using computed arrowColor
    // Find the first two visible points to determine initial direction
    let p1 = null, p2 = null;
    for (const p of lookAnglePoints) {
        if (p.elevation >= 0) {
            if (p1 === null) {
                p1 = p;
            } else {
                p2 = p;
                break; // Found first two visible points
            }
        }
    }

    // If we have two points, draw the arrow
    if (p1 && p2) {
        // Convert p1 and p2 to canvas coordinates
        const angleRad1 = (p1.azimuth - 90) * Math.PI / 180;
        const dist1 = radius * (1 - p1.elevation / 90);
        const x1 = centerX + dist1 * Math.cos(angleRad1);
        const y1 = centerY + dist1 * Math.sin(angleRad1);

        const angleRad2 = (p2.azimuth - 90) * Math.PI / 180;
        const dist2 = radius * (1 - p2.elevation / 90);
        const x2 = centerX + dist2 * Math.cos(angleRad2);
        const y2 = centerY + dist2 * Math.sin(angleRad2);

        // Calculate angle of the path segment
        const pathAngle = Math.atan2(y2 - y1, x2 - x1);
        const arrowSize = 12;

        ctx.save();
        ctx.translate(x1, y1);
        ctx.rotate(pathAngle);

        ctx.beginPath();
        ctx.fillStyle = arrowColor;
        ctx.moveTo(0, 0);
        ctx.lineTo(-arrowSize, -arrowSize / 2);
        ctx.lineTo(-arrowSize, arrowSize / 2);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
    // --- End Direction Arrow --- 

    /* REMOVED old static arrow logic
    if (direction) {
        ctx.strokeStyle = 'var(--direction-arrow-color, orange)';
        ctx.fillStyle = 'var(--direction-arrow-color, orange)';
        // ... rest of old arrow code ...
    }
    */

    // Show the canvas
    canvas.style.display = 'block';
}

// Function to clear the pass visualization canvas
function clearPassVisualization(canvasId) {
     const canvas = document.getElementById(canvasId);
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = 'none';
    }
}