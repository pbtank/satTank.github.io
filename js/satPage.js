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
let observerMarker = null; // To hold the observer's location marker
// let currentTileLayer; // Removed, replaced by currentMapLayer
let currentMapLayer; // Renamed for clarity and consistency
let passCountdownIntervalId = null; // Interval ID for the countdown timer
let currentPassDetails = null; // Store details of the currently displayed pass

// --- Favicon Paths ---
const defaultFaviconHref = 'favicon.ico'; // Assuming default is in root
const sadFaviconHref = 'src/images/sad-face-in-rounded-square.png'; // Path to the sad favicon
let faviconLink = null; // Will hold the link element reference
// --- End Favicon Paths ---

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
    // --- Get Favicon Link Element ---
    faviconLink = document.getElementById('favicon-link');
    // --- End Get Favicon Link ---

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

        // Map type listener - Now updates map regardless of theme
        const mapTypeSelect = document.getElementById('map-type');
        if (mapTypeSelect) {
             mapTypeSelect.addEventListener('change', function() {
                 const currentTheme = document.body.getAttribute('data-theme');
                 // Removed the theme check, always update the layer
                 updateMapTileLayer(currentTheme);
             });
             // Initial map type selection based on theme is handled by setTheme call below
        }

        // Display initial info and start tracking
        displaySatelliteInfo(); // Display static info
        startTracking(); // Start dynamic updates

        // Automatically trigger pass prediction if location is available
        const savedLat = localStorage.getItem('observerLat');
        const savedLon = localStorage.getItem('observerLon');
        const locationStatusMessage = document.getElementById('location-status-message');

        if (savedLat && savedLon) {
            if (locationStatusMessage) {
                locationStatusMessage.textContent = `Using saved location: Lat ${parseFloat(savedLat).toFixed(2)}°, Lon ${parseFloat(savedLon).toFixed(2)}°. Predicting passes...`;
                locationStatusMessage.classList.add('info-message');
            }
            // Call updatePassPredictions directly, as the button is gone
            // We need to pass the lat/lon as the input fields are also gone from this page
            updatePassPredictions(parseFloat(savedLat), parseFloat(savedLon)); 
        } else {
            if (locationStatusMessage) {
                locationStatusMessage.innerHTML = 'Observer location not set. Please <a href="index.html">go to the main page</a> to set it.';
                locationStatusMessage.classList.add('error-message');
            }
            // Optionally, clear or hide the pass results section if no location is set
            const passResultsDiv = document.querySelector('.pass-results');
            if (passResultsDiv) {
                passResultsDiv.style.display = 'none';
            }
            clearPolarPlotly('polarPlot');
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
        // No need to set to 'dark' anymore.
        // If switching to light mode, ensure the dropdown reflects the actual tile layer being shown.
        // This might require reading the current layer's URL or storing the last light mode selection.
        // For simplicity, we'll just ensure it's not stuck on an invalid value if 'dark' was somehow selected before.
        if (theme === 'light' && mapTypeSelect.value === 'dark') {
             mapTypeSelect.value = 'standard'; // Default back to standard if it was dark
        }
    }

    // --- Trigger Plotly redraw if visible --- 
    const plotDiv = document.getElementById('polarPlot');
    // const predictButton = document.getElementById('predictPassesBtn'); // Removed
    // const observerLatInput = document.getElementById('observerLat'); // Removed
    // const observerLonInput = document.getElementById('observerLon'); // Removed

    // Check if plot exists and is currently visible
    if (plotDiv && plotDiv.style.display !== 'none') {
        const savedLat = localStorage.getItem('observerLat');
        const savedLon = localStorage.getItem('observerLon');

        if (savedLat && savedLon) {
            console.log('Theme changed, triggering redraw of Plotly chart with saved location (no scroll)...');
            // Re-run pass predictions which will in turn call drawPolarPlotly.
            // updatePassPredictions handles clearing the old plot and observer marker.
            // Pass false for shouldScroll to prevent scrolling.
            updatePassPredictions(parseFloat(savedLat), parseFloat(savedLon), false);
        } else {
            // This case implies a plot is visible but location was somehow lost from localStorage,
            // or the plot was generated without relying on localStorage (which shouldn't happen with current flow).
            console.warn('Theme changed and plot is visible, but observer location not found in localStorage. Plot may not update its theme correctly.');
        }
    }

    // --- Update Observer Marker Icon if it exists --- 
    if (observerMarker && map && map.hasLayer(observerMarker)) { 
        const newObserverIconUrl = theme === 'dark' ? 'src/images/observer_pin_dark.png' : 'src/images/observer_pin_light.png';
        const newObserverIcon = L.icon({
            iconUrl: newObserverIconUrl,
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            shadowSize: [41, 41]
        });
        observerMarker.setIcon(newObserverIcon);
        // console.log(`Observer marker icon updated for ${theme} theme.`);
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
            maxZoom: 13, // Default maxZoom
            // Default subdomains removed, will be set per layer if needed
        };

        // Determine tile layer based on theme AND selection
        if (theme === 'dark') {
            // In dark mode, allow selection but default to dark tiles for 'standard'
            switch (selectedMapType) {
                case 'satellite':
                    tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
                    tileOptions.attribution = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
                    tileOptions.maxZoom = 17;
                    // No subdomains needed for Esri
                    break;
                case 'terrain':
                    tileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
                    tileOptions.attribution = 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)';
                    tileOptions.maxZoom = 15;
                    tileOptions.subdomains = ['a', 'b', 'c']; // Add subdomains for OpenTopoMap
                    break;
                case 'standard':
                default: // Default to CartoDB dark tiles in dark mode if standard is selected
                    tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
                    tileOptions.attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
                    tileOptions.subdomains = 'abcd'; // CartoDB uses 'abcd'
                    break;
            }
        } else {
            // Light mode: Use selected map type as before
            switch (selectedMapType) {
                case 'satellite':
                    tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
                    tileOptions.attribution = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
                    tileOptions.maxZoom = 17;
                    // No subdomains needed for Esri
                    break;
                case 'terrain':
                    tileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
                    tileOptions.attribution = 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)';
                    tileOptions.maxZoom = 15;
                    tileOptions.subdomains = ['a', 'b', 'c']; // Add subdomains for OpenTopoMap
                    break;
                case 'standard':
                default:
                    tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
                    tileOptions.attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
                    tileOptions.subdomains = ['a', 'b', 'c']; // Standard OSM uses 'abc'
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
    const urlParams = new URLSearchParams(window.location.search);
    const urlName = urlParams.get('name'); // Get name from URL too

    try {
        // First check if this is a custom satellite
        const customSat = loadCustomSatellite(satId); 
        
        // Check if custom satellite exists AND if its name matches the URL name (if provided)
        if (customSat && (!urlName || customSat.OBJECT_NAME === urlName)) {
            // Use the custom satellite only if names match or no URL name was given
            console.log(`Using custom satellite found with ID ${satId} and matching name: ${customSat.OBJECT_NAME}`);
            satellite = customSat;
            const titleElement = document.getElementById('satellite-title');
            if (titleElement) {
                titleElement.innerText = satellite.OBJECT_NAME || `Satellite ${satId}`;
            }
            hideLoading(true);
            return true; // Return early as we found the intended custom satellite
        }
        
        // If no matching custom sat was found/used, try active.json
        console.log(`Custom satellite check passed or name mismatch. Searching active.json for ID ${satId}...`);
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

// --- NEW Countdown Timer Functionality ---

// Function to start or update the countdown timer
function startOrUpdateCountdown(startTime, endTime) {
    // Clear any existing interval
    if (passCountdownIntervalId) {
        clearInterval(passCountdownIntervalId);
        passCountdownIntervalId = null;
    }

    const countdownElement = document.getElementById('pass-countdown-status');
    if (!countdownElement) return;

    // Store pass times for the interval function
    currentPassDetails = { startTime, endTime };

    // Function to update the display
    const updateDisplay = () => {
        if (!currentPassDetails) {
            if (passCountdownIntervalId) clearInterval(passCountdownIntervalId);
            countdownElement.textContent = '';
            countdownElement.className = ''; // Clear classes
            return;
        }

        const now = new Date();
        const start = currentPassDetails.startTime;
        const end = currentPassDetails.endTime;

        if (now < start) {
            // Pass is in the future - show countdown
            const diffSeconds = Math.round((start - now) / 1000);
            if (diffSeconds <= 0) {
                // Time is very close or slightly passed, switch to 'in view'
                countdownElement.textContent = '(Satellite is in view...)'; // Added brackets
                countdownElement.className = 'pass-in-view';
                // Keep interval running to switch when pass ends
            } else {
                const hours = Math.floor(diffSeconds / 3600);
                const minutes = Math.floor((diffSeconds % 3600) / 60);
                const seconds = diffSeconds % 60;
                // Changed format to H h M m S s
                countdownElement.textContent = `(in ${hours}h ${minutes}m ${String(seconds).padStart(2, '0')}s)`; 
                countdownElement.className = 'countdown-timer';
            }
        } else if (now >= start && now <= end) {
            // Pass is currently happening
            countdownElement.textContent = '(Satellite is in view...)'; // Added brackets
            countdownElement.className = 'pass-in-view';
            // Keep interval running to clear after pass ends
        } else {
            // Pass has ended
            countdownElement.textContent = '';
            countdownElement.className = ''; // Clear classes
            currentPassDetails = null; // Clear stored details
            if (passCountdownIntervalId) clearInterval(passCountdownIntervalId); // Stop the interval
            passCountdownIntervalId = null;
        }
    };

    // Run immediately and then set interval
    updateDisplay();
    passCountdownIntervalId = setInterval(updateDisplay, 1000);
}

// Function to stop and clear the countdown timer display
function stopAndClearCountdown() {
    if (passCountdownIntervalId) {
        clearInterval(passCountdownIntervalId);
        passCountdownIntervalId = null;
    }
    currentPassDetails = null;
    const countdownElement = document.getElementById('pass-countdown-status');
    if (countdownElement) {
        countdownElement.textContent = '';
        countdownElement.className = ''; // Clear classes
    }
}

// --- End Countdown Timer Functionality ---

// Update the updatePassPredictions function to handle async operations
// MODIFIED: Now accepts observerLat and observerLon as parameters
// MODIFIED: Added shouldScroll parameter (defaults to true)
async function updatePassPredictions(observerLat, observerLon, shouldScroll = true) {
    // Reset favicon to default at the start of prediction
    // setFavicon(defaultFaviconHref); 

    // --- Stop any existing countdown --- 
    stopAndClearCountdown();

    // Ensure the main satellite object is available
    if (!satellite || !satellite.OBJECT_NAME) {
        showError('Satellite data not fully loaded. Cannot predict passes.');
        return;
    }

    const locationErrorDiv = document.getElementById('location-validation-error'); // Get the new error div
    const passResultsDiv = document.querySelector('.pass-results'); // Get the results container

    // Clear previous location validation errors
    if (locationErrorDiv) {
        locationErrorDiv.textContent = '';
        locationErrorDiv.style.display = 'none';
    }
    // Hide previous results when starting a new prediction
    if (passResultsDiv) {
        passResultsDiv.style.display = 'none';
    }
    // Clear the plot but DO NOT remove the observer marker
    clearPolarPlotly('polarPlot', true);

    // --- Always add/update the observer marker ---
    const currentTheme = document.body.getAttribute('data-theme') || 'light';
    const lightModeIconUrl = 'src/images/observer_pin_light.png';
    const darkModeIconUrl = 'src/images/observer_pin_dark.png';
    const observerIconUrl = currentTheme === 'dark' ? darkModeIconUrl : lightModeIconUrl;
    try {
        const observerIcon = L.icon({
            iconUrl: observerIconUrl,
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            shadowSize: [41, 41]
        });
        if (observerMarker) {
            observerMarker.setLatLng([observerLat, observerLon]);
            observerMarker.setIcon(observerIcon);
        } else {
            observerMarker = L.marker([observerLat, observerLon], { icon: observerIcon })
                .addTo(map)
                .bindPopup(`Observer Location<br>Lat: ${observerLat.toFixed(2)}°<br>Lon ${observerLon.toFixed(2)}°`);
        }
    } catch (iconError) {
        console.warn(`Could not create observer marker icon (using ${observerIconUrl}): ${iconError}. Marker not added.`);
        observerMarker = null;
    }

    // Basic validation for observer coordinates (already validated on index.html, but good to have a check)
    let validationError = null;
    if (isNaN(observerLat) || isNaN(observerLon)) {
        validationError = 'Invalid latitude or longitude values provided.';
    } else if (observerLat < -90 || observerLat > 90 || observerLon < -180 || observerLon > 180) {
        validationError = 'Latitude must be -90 to 90, Longitude must be -180 to 180.';
    }

    if (validationError) {
        if (locationErrorDiv) {
            locationErrorDiv.textContent = validationError;
            locationErrorDiv.style.display = 'block'; // Show the specific error message
        }
        return; // Stop execution
    }

    // Show loading state for prediction - No button to update, so we might use a general loading indicator or rely on the locationStatusMessage
    // const predictButton = document.getElementById('predictPassesBtn'); // Removed
    // const originalButtonText = predictButton.innerHTML;
    // predictButton.disabled = true;
    // predictButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    const locationStatusMessage = document.getElementById('location-status-message');
    if (locationStatusMessage) {
        locationStatusMessage.textContent = 'Predicting passes...';
        locationStatusMessage.classList.remove('error-message');
        locationStatusMessage.classList.add('info-message');
    }

    const canvas = document.getElementById('pass-visualization-canvas'); // Keep for potential future use?
    // Get table rows and cells for dynamic updates
    const passResultRows = passResultsDiv?.querySelectorAll('table.info-table tr');
    // ... (rest of the variable declarations for table cells) ...
    const nextPassRow = passResultRows?.[0];
    const maxElevationRow = passResultRows?.[1];
    const durationRow = passResultRows?.[2];
    const directionRow = passResultRows?.[3];

    const nextPassLabel = nextPassRow?.querySelector('th');
    const nextPassCell = nextPassRow?.querySelector('td');
    const maxElevationLabel = maxElevationRow?.querySelector('th');
    const maxElevationCell = maxElevationRow?.querySelector('td');
    const geoStatusMessage = document.getElementById('geo-status-message'); // Get status message element


    // Clear status message initially
    if (geoStatusMessage) geoStatusMessage.textContent = '';

    // passResultsDiv display is handled above and within the try/catch/finally
    // if (passResultsDiv) passResultsDiv.style.display = 'none';
    if (canvas) canvas.style.display = 'none';

    try {
        // --- Check if Geostationary ---
        if (window.isGeostationary(satellite)) {
             console.log(`Satellite ${satellite.OBJECT_NAME} identified as geostationary.`);
            // predictButton.innerHTML = '<i class="fas fa-satellite"></i> Calculate Look Angles';

            // Hide pass-specific rows immediately
            if (durationRow) durationRow.style.display = 'none';
            if (directionRow) directionRow.style.display = 'none';

            // --- Integrated satrec creation and look angle calculation ---
            let satrec;
            let tleSource = 'Unknown';
            let lookAngles = null;
            try {
                 // Logic adapted from calculateSatellitePosition to get satrec
                 if (satellite.TLE_LINE1 && satellite.TLE_LINE2 && /* ... TLE format checks ... */
                     satellite.TLE_LINE1.startsWith('1 ') && satellite.TLE_LINE2.startsWith('2 ')) { // Basic check
                    tleSource = 'Embedded';
                    satrec = window.satellite.twoline2satrec(satellite.TLE_LINE1, satellite.TLE_LINE2);
                } else if (satellite.OBJECT_NAME && satellite.NORAD_CAT_ID && satellite.EPOCH && satellite.MEAN_MOTION) {
                    tleSource = 'Celestrak JSON';
                    const satJson = { /* ... construct satJson object from satellite properties ... */
                        OBJECT_NAME: satellite.OBJECT_NAME,
                        OBJECT_ID: satellite.OBJECT_ID || satellite.INTL_DES || 'UNKNOWN',
                        EPOCH: satellite.EPOCH,
                        MEAN_MOTION: parseFloat(satellite.MEAN_MOTION),
                        ECCENTRICITY: parseFloat(satellite.ECCENTRICITY),
                        INCLINATION: parseFloat(satellite.INCLINATION),
                        RA_OF_ASC_NODE: parseFloat(satellite.RA_OF_ASC_NODE),
                        ARG_OF_PERICENTER: parseFloat(satellite.ARG_OF_PERICENTER),
                        MEAN_ANOMALY: parseFloat(satellite.MEAN_ANOMALY),
                        EPHEMERIS_TYPE: satellite.EPHEMERIS_TYPE || 0,
                        CLASSIFICATION_TYPE: satellite.CLASSIFICATION_TYPE || "U",
                        NORAD_CAT_ID: parseInt(satellite.NORAD_CAT_ID),
                        ELEMENT_SET_NO: satellite.ELEMENT_SET_NO || 999,
                        REV_AT_EPOCH: satellite.REV_AT_EPOCH || 0,
                        BSTAR: satellite.BSTAR || 0.0001,
                        MEAN_MOTION_DOT: satellite.MEAN_MOTION_DOT || 0,
                        MEAN_MOTION_DDOT: satellite.MEAN_MOTION_DDOT || 0
                    };
                     if (isNaN(satJson.NORAD_CAT_ID) || isNaN(satJson.MEAN_MOTION) || !satJson.EPOCH) {
                        throw new Error('Incomplete Celestrak JSON data for satrec creation');
                    }
                    satrec = window.satellite.json2satrec(satJson);
                } else {
                    throw new Error('Satellite object format not recognized or missing required data.');
                }

                if (!satrec || satrec.error !== 0) {
                    throw new Error(`Failed to initialize satrec (source: ${tleSource}, error ${satrec?.error})`);
                }

                // Propagate position for NOW
                const now = new Date();
                const positionAndVelocity = window.satellite.propagate(satrec, now);
                if (!positionAndVelocity || !positionAndVelocity.position) {
                    throw new Error('Propagation failed for current time.');
                }

                // Calculate Look Angles
                const gmst = window.satellite.gstime(now);
                const positionEcf = window.satellite.eciToEcf(positionAndVelocity.position, gmst);
                const observerGd = {
                    longitude: observerLon * Math.PI / 180,
                    latitude: observerLat * Math.PI / 180,
                    height: 0.1 // Assume low height
                };
                const lookAnglesRad = window.satellite.ecfToLookAngles(observerGd, positionEcf);
                lookAngles = {
                    azimuth: lookAnglesRad.azimuth * 180 / Math.PI,
                    elevation: lookAnglesRad.elevation * 180 / Math.PI
                };
            } catch (calcError) {
                 console.error("[GEO Calculation] Error:", calcError);
                 lookAngles = null;
            }
            // --- End integrated calculation ---

            // Display results based on calculated lookAngles
            if (passResultsDiv && nextPassRow && maxElevationRow && nextPassLabel && maxElevationLabel && nextPassCell && maxElevationCell && geoStatusMessage) {

                nextPassLabel.textContent = ' Current Azimuth';
                maxElevationLabel.textContent = 'Current Elevation';

                // Clear potentially conflicting classes first
                geoStatusMessage.classList.remove('status-not-visible');
                nextPassCell.classList.remove('status-not-visible');

                if (lookAngles && lookAngles.elevation >= 0) {
                    nextPassCell.textContent = `${lookAngles.azimuth.toFixed(1)}°`;
                    maxElevationCell.textContent = `${lookAngles.elevation.toFixed(1)}°`;
                    nextPassRow.style.display = '';
                    maxElevationRow.style.display = '';
                    // Set GEO/GSO visible message and apply the correct class
                    geoStatusMessage.textContent = 'Satellite is in view currently...';
                    geoStatusMessage.className = 'geosync-status'; // Apply the new class
                } else if (lookAngles) { // Calculated but below horizon
                    nextPassCell.textContent = 'Below Horizon (not visible from the location)';
                    nextPassCell.classList.add('status-not-visible');
                    nextPassRow.style.display = '';
                    nextPassLabel.textContent = '';
                    maxElevationRow.style.display = 'none';
                    geoStatusMessage.textContent = ''; // Clear message
                    geoStatusMessage.className = ''; // Clear class
                    clearPolarPlotly('polarPlot', true); // Keep observer marker
                } else { // Error during calculation
                    nextPassCell.textContent = 'Error calculating';
                    nextPassRow.style.display = '';
                    maxElevationRow.style.display = 'none';
                    geoStatusMessage.textContent = ''; // Clear message
                    geoStatusMessage.className = ''; // Clear class
                    clearPolarPlotly('polarPlot', true); // Keep observer marker even on calc error for GEO sat
                }
                passResultsDiv.style.display = 'block';

                // Call visualization ONLY if GEO/GSO satellite is visible
                if (lookAngles && lookAngles.elevation >= 0) {
                    drawPolarPlotly('polarPlot', [lookAngles], true);
                } else {
                    clearPolarPlotly('polarPlot', true); // Keep observer marker
                }
            } else {
                 console.error("Pass prediction table elements not found for GEO/GSO display.");
                 clearPolarPlotly('polarPlot', true); // Keep observer marker
            }

        } else {
            // --- Not Geostationary/Geosynchronous: Perform Pass Prediction ---
             console.log(`Satellite ${satellite.OBJECT_NAME} is not geostationary/geosynchronous. Predicting passes...`);
            // predictButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Predicting Passes...'; // Button removed
            // Clear GEO/GSO status message and class for non-GEO/GSO cases

             // Restore original labels and row visibility
             if (nextPassLabel) nextPassLabel.textContent = 'Next Pass at';
             if (maxElevationLabel) maxElevationLabel.textContent = 'Max Elevation';
             // Restore labels for duration/direction if needed (assuming they exist)
             const durationLabel = durationRow?.querySelector('th');
             const directionLabel = directionRow?.querySelector('th');
             if(durationLabel) durationLabel.textContent = 'Duration';
             if(directionLabel) directionLabel.textContent = 'Direction';
             // Ensure rows are visible again
             if (durationRow) durationRow.style.display = '';
             if (directionRow) directionRow.style.display = '';


             // Get references to the message div and details table
             const noPassMessageDiv = document.getElementById('no-pass-message');
             const passDetailsTable = document.getElementById('pass-details-table');

             // Ensure the global calculateNextPass function exists
             if (typeof window.calculateNextPass !== 'function') {
                 throw new Error('calculateNextPass function is not available globally.');
             }
             const nextPass = await window.calculateNextPass(satellite, observerLat, observerLon);
             if (passResultsDiv) {
                 if (nextPass) {
                    // Display Pass Data

                    // Hide the 'no pass' message and show the details table
                    if (noPassMessageDiv) noPassMessageDiv.style.display = 'none';
                    if (passDetailsTable) passDetailsTable.style.display = ''; // Show table

                    // Call Plotly function for non-GEO
                    drawPolarPlotly('polarPlot', nextPass.lookAnglePoints, false);
                    const localStartTime = nextPass.startTime.toLocaleString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
                    });
                    document.getElementById('nextPassTime').textContent = localStartTime;
                    document.getElementById('maxElevation').textContent = `${nextPass.maxElevation.toFixed(1)}°`;
                    document.getElementById('passDuration').textContent = `${Math.floor(nextPass.duration / 60)}m ${Math.floor(nextPass.duration % 60)}s`;
                    document.getElementById('passDirection').innerHTML = nextPass.direction;

                    // --- Start the countdown timer --- 
                    startOrUpdateCountdown(nextPass.startTime, nextPass.endTime);

                 } else {
                    // Show the 'no pass' message and hide the details table
                    if (passDetailsTable) passDetailsTable.style.display = 'none'; // Hide table
                    if (noPassMessageDiv) {
                         noPassMessageDiv.textContent = 'No pass for the location in the next 24 hours!';
                         noPassMessageDiv.style.display = 'block'; // Show message div
                    }

                    clearPolarPlotly('polarPlot'); // Clear plot if no pass
                    // Ensure countdown is cleared if no pass
                    stopAndClearCountdown();
                 }
                 passResultsDiv.style.display = 'block';
             }
        }

        // --- Scroll into view AFTER results are potentially displayed --- 
        // Check if either the results table or the plot is visible
        if (shouldScroll && passResultsDiv && passResultsDiv.style.display === 'block') {
            // Scroll the main container for pass predictions into view
            const passContainer = document.querySelector('.pass-predictions-container');
            if (passContainer) {
                passContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }

    } catch (error) {
        console.error('[updatePassPredictions] Error:', error);
        // Use the specific location error div for calculation errors too
        if (locationErrorDiv) {
            locationErrorDiv.textContent = `Failed calculation: ${error.message}`;
            locationErrorDiv.style.display = 'block';
        }
        // Hide the results area cleanly
        if (passResultsDiv) {
            passResultsDiv.style.display = 'none';
        }
        clearPolarPlotly('polarPlot'); // Clear plot and observer marker on error
        // Ensure countdown is cleared on error
        stopAndClearCountdown();

        // Optionally scroll even on error if the error message is shown in the results area
        if (shouldScroll && locationErrorDiv && locationErrorDiv.style.display === 'block') {
            const passContainer = document.querySelector('.pass-predictions-container');
            if (passContainer) {
                passContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    } finally {
        // Restore button state - No button to restore
        // predictButton.disabled = false;
        // predictButton.innerHTML = originalButtonText;

        // Update location status message after prediction attempt
        const finalLocationStatusMessage = document.getElementById('location-status-message');
        if (finalLocationStatusMessage) {
            const savedLat = localStorage.getItem('observerLat');
            const savedLon = localStorage.getItem('observerLon');
            if (savedLat && savedLon) {
                 finalLocationStatusMessage.textContent = `Pass predictions for: Lat ${parseFloat(savedLat).toFixed(2)}°, Lon ${parseFloat(savedLon).toFixed(2)}°.`;
            } else {
                // This case should ideally not be hit if logic is correct, but as a fallback:
                finalLocationStatusMessage.innerHTML = 'Observer location not set. Please <a href="index.html">go to the main page</a> to set it.';
                finalLocationStatusMessage.classList.add('error-message');
            }
        }
    }
}

// --- NEW Plotly Visualization Function --- //
function drawPolarPlotly(plotDivId, lookAnglePoints, isGeostationary) {
    const plotDiv = document.getElementById(plotDivId);
    if (!plotDiv) {
        console.error(`Plotly container #${plotDivId} not found.`);
        return;
    }

    // Define a color variable for light mode elements
    const lightModeAccentColor = 'rgb(117, 184, 240)';

    // --- Define Theme-Aware Colors Upfront --- 
    const currentTheme = document.body.getAttribute('data-theme') || 'light';
    const paperColor = currentTheme === 'dark' ? '#000000' : '#ffffff';
    const fontColor = currentTheme === 'dark' ? '#f5f5f5' : '#2c3e50';
    const gridColor = currentTheme === 'dark'
        ? 'rgba(180, 180, 180, 0.4)' // Light gray transparent grid for dark mode
        : 'rgba(200, 200, 200, 0.6)'; // Standard light gray transparent grid for light mode
    const lineColor = currentTheme === 'dark' ? '#aaaaaa' : '#000000'; // Axis line color
    // Define theme-dependent path line color
    const pathLineColor = currentTheme === 'dark' 
        ? 'rgba(80,200,120,0.7)' // Match green used for button and dot in dark mode
        : lightModeAccentColor;
    // --- End Theme-Aware Colors ---

    // Ensure lookAnglePoints is an array
    if (!Array.isArray(lookAnglePoints)) {
        console.warn('Invalid lookAnglePoints data for Plotly.');
        lookAnglePoints = []; // Default to empty array
    }

    let dataTraces = [];
    let visiblePointExists = false;

    if (isGeostationary) {
        // Handle single point for GEO
        if (lookAnglePoints.length > 0) {
            const currentPoint = lookAnglePoints[0];
            if (currentPoint.elevation >= 0) {
                visiblePointExists = true;
                const trace = {
                    type: 'scatterpolar',
                    r: [90 - currentPoint.elevation], // Single r value
                    theta: [currentPoint.azimuth], // Single theta value
                    mode: 'markers',
                    name: 'Current Position',
                    marker: { color: 'red', size: 14, symbol: 'star' } 
                };
                dataTraces.push(trace);
            }
        }
        // If not visible, dataTraces remains empty
    } else {
        // Handle pass trajectory for non-GEO
        if (lookAnglePoints.length > 0) {
            const r = lookAnglePoints.map(p => Math.max(0, 90 - p.elevation)); // Ensure r is not negative
            const theta = lookAnglePoints.map(p => p.azimuth);
            
            // Only include points above horizon for plotting the line
            const visibleR = [];
            const visibleTheta = [];
            lookAnglePoints.forEach((p, index) => {
                if (p.elevation >= 0) {
                    visibleR.push(r[index]);
                    visibleTheta.push(theta[index]);
                }
            });

            if (visibleR.length > 0) {
                 visiblePointExists = true;
                 const trace = {
                    type: 'scatterpolar',
                    r: visibleR,
                    theta: visibleTheta,
                    mode: 'lines', 
                    name: 'Satellite Path',
                    line: { color: pathLineColor, width: 2.5 },
                    hoverinfo: 'none' // Disable hover text for path trace
                };
                dataTraces.push(trace);
            }
        }
        // If no visible points, dataTraces remains empty
    }

    if (!visiblePointExists) {
        // If no visible points (GEO below horizon, or non-GEO pass fully below horizon)
        clearPolarPlotly(plotDivId); // Hide the plot area
        return;
    }

    // Add a center dot with slightly more blue in light mode
    const greenDotColor = currentTheme === 'dark' ? 'rgba(80,200,120,0.7)' : 'rgba(117,184,240,0.7)';
    dataTraces.push({
        type: 'scatterpolar',
        r: [0], // Center of the plot (user location)
        theta: [0], // Angle is irrelevant at r=0
        mode: 'markers',
        name: 'Observer Location',
        marker: { color: greenDotColor, size: 18, symbol: 'circle' },
        showlegend: false
    });

    // --- Define Layout (Theme Aware) ---
    const layout = {
        polar: {
            radialaxis: {
                tickvals: [0, 30, 60, 90], 
                ticktext: ['90°', '60°', '30°', '0°'], // Simplified labels
                angle: 90, 
                range: [0, 90], 
                autorange: false,
                gridcolor: gridColor,
                linecolor: lineColor,
                tickcolor: lineColor,
                tickfont: { color: fontColor, family: 'NType82 Mono, monospace' },
                showticklabels: true
            },
            angularaxis: {
                direction: "clockwise",
                rotation: 90, // North (0°) at top
                tickvals: [0, 45, 90, 135, 180, 225, 270, 315],
                ticktext: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
                gridcolor: gridColor,
                linecolor: lineColor,
                tickcolor: lineColor,
                tickfont: { color: fontColor, family: 'NType82 Mono, monospace' }
            },
            bgcolor: paperColor // Background of the polar area
        },
        paper_bgcolor: paperColor, // Background of the whole plot area
        font: { color: fontColor, family: 'NType82 Mono, monospace' },
        showlegend: !isGeostationary, // Only show legend for passes
        legend: { 
            x: 0.5,            // Center horizontally
            y: -0.15,          // Position below the plot area (adjust as needed for padding)
            xanchor: 'center', // Anchor to the center for x
            yanchor: 'top',    // Anchor to the top for y
            orientation: "h",  // Horizontal orientation below the plot
            font: {            // Set legend-specific font
                family: 'NType82 Mono, monospace', // Use Ntype82 Mono with monospace fallback
                size: 18,
                color: currentTheme === 'dark' ? '#fff' : '#111' // White in dark, black in light
            }
        },
        width: 450, // Match CSS max-width
        height: 450, // Match CSS height
        margin: { l: 40, r: 40, t: 40, b: 50 }, // Increased bottom margin slightly for legend space
        hovermode: false // Disable hover effects globally for the plot
    };

    // Define configuration to disable interactivity
    const config = {
        staticPlot: true // Makes the plot non-interactive (disables zoom, pan, hover, modebar)
    };

    // Create or update the plot, adding the config object
    Plotly.react(plotDivId, dataTraces, layout, config); 
    plotDiv.style.display = 'block'; // Show the plot
}

// Function to clear/hide the Plotly plot
function clearPolarPlotly(plotDivId, keepObserverMarker = false) {
     const plotDiv = document.getElementById(plotDivId);
    if (plotDiv) {
        Plotly.purge(plotDivId); // Remove the plot instance
        plotDiv.style.display = 'none'; // Hide the container
    }
    // --- Conditionally remove observer marker ---
    if (!keepObserverMarker && observerMarker) {
        map.removeLayer(observerMarker);
        observerMarker = null;
    }
    
}

// Function to handle footer visibility on scroll
function handleFooterVisibility() {
    const footer = document.getElementById('pageFooter');
    if (!footer) return; // Exit if footer doesn't exist
    const scrollThreshold = 100; // Show footer after scrolling 100px

    if (window.scrollY > scrollThreshold) {
        footer.classList.add('footer-visible');
    } else {
        footer.classList.remove('footer-visible');
    }
}

// Add scroll event listener
window.addEventListener('scroll', handleFooterVisibility);

// Initial check in case the page loads already scrolled
// Call it after a short delay to ensure layout is stable
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(handleFooterVisibility, 100); 
});