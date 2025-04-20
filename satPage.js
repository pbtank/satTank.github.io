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

// Constants
const EARTH_RADIUS_KM = 6371;
const UPDATE_INTERVAL_MS = 1000;
const ORBIT_POINTS = 90; // Number of points to calculate for orbit
const ORBIT_PERIOD_MINUTES = 90; // Approximate period for most LEO satellites

// Only load data from active.json
const activeJsonFile = 'data/active.json';

// Initialize the page when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() { // Make async
    // --- Non-Map Related Setup ---
    // Setup back button listener
    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', function() {
            window.location.href = 'index.html';
        });
    }
    // Theme toggle listener is handled in its own block below

    // --- Satellite Loading and Map Initialization ---
    const urlParams = new URLSearchParams(window.location.search);
    const satId = urlParams.get('ID');

    if (!satId) {
        showError("Missing satellite ID (NORAD CAT ID) in URL. Please provide an ID parameter, e.g., ?ID=25544");
        return; // Stop execution
    }

    // Attempt to load satellite data FIRST
    const loadSuccessful = await loadSatelliteDataFromLocal(satId);

    if (loadSuccessful) {
        // --- Map and Tracking Setup (Only if load was successful) ---
        initMap(); // Initialize the map

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

        // Map type listener
        const mapTypeSelect = document.getElementById('map-type');
        if (mapTypeSelect) {
             mapTypeSelect.addEventListener('change', function() { updateMapType(this.value); });
             // Apply initial theme map type after map is initialized
             const currentTheme = localStorage.getItem('theme') || 'dark';
             if (currentTheme === 'dark') {
                 updateMapType('dark');
                 mapTypeSelect.value = 'dark';
             } else {
                 updateMapType('standard');
                 mapTypeSelect.value = 'standard';
             }
        }

        // Display initial info and start tracking
        displaySatelliteInfo(); // Display static info
        startTracking(); // Start dynamic updates

    } else {
        // If loading failed, ensure map and details remain hidden (handled by showError/hideLoading)
        console.log("Satellite data load failed, map and tracking will not initialize.");
    }
});

// --- Theme Toggle Functionality ---
document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    const mapTypeSelect = document.getElementById('map-type'); // Get map type dropdown
    const currentTheme = localStorage.getItem('theme') || 'dark'; // Default to dark

    function setTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        if (themeToggle) {
            // Update icon based on the new theme
            themeToggle.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        }

        // Update map type based on theme - ONLY IF MAP EXISTS
        if (map && mapTypeSelect) { // Add map check here
            if (theme === 'dark') {
                updateMapType('dark');
                mapTypeSelect.value = 'dark';
            } else {
                updateMapType('standard');
                mapTypeSelect.value = 'standard';
            }
        }
    }

    // Apply theme and icon on load
    setTheme(currentTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            let newTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            setTheme(newTheme);
        });
    }
});

// Initialize Leaflet map
function initMap() {
    map = L.map('mapid', {
        center: [0, 0],
        zoom: 2,
        minZoom: 2,
        worldCopyJump: true
    });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        subdomains: ['a', 'b', 'c']
    }).addTo(map);
    
    // Removed commented-out graticule code
}

// Update the map type based on selection
function updateMapType(type) {
    map.eachLayer(function(layer) {
        if (layer instanceof L.TileLayer) {
            map.removeLayer(layer);
        }
    });
    
    switch (type) {
        case 'satellite':
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            }).addTo(map);
            break;
        case 'dark':
            L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
                subdomains: 'abcd'
            }).addTo(map);
            break;
        case 'terrain':
            L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}{r}.{ext}', {
                attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                subdomains: 'abcd',
                ext: 'png'
            }).addTo(map);
            break;
        default: // standard
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                subdomains: ['a', 'b', 'c']
            }).addTo(map);
    }
}

// Load satellite data from local active.json file using NORAD ID
async function loadSatelliteDataFromLocal(satId) { // Already async
    showLoading(`Loading TLE data for NORAD ID ${satId} from ${activeJsonFile}...`);
    let foundSatellite = null;

    try {
        const res = await fetch(activeJsonFile);
        if (!res.ok) {
            throw new Error(`Could not fetch ${activeJsonFile}: ${res.statusText}`);
        }
        const data = await res.json();
        let satellitesInData = [];

        if (Array.isArray(data)) {
            satellitesInData = data;
        } else {
             if (!Array.isArray(data)) {
                 throw new Error(`Data in ${activeJsonFile} is not in the expected array format.`);
             }
        }

        const satIdNum = parseInt(satId, 10);
        foundSatellite = satellitesInData.find(sat => parseInt(sat.NORAD_CAT_ID, 10) === satIdNum);

        if (!foundSatellite) {
            throw new Error(`NOT_FOUND: No TLE data found for NORAD ID ${satId} in ${activeJsonFile}.`);
        }

        satellite = foundSatellite; // Assign to global variable

        // Set title text but don't display it yet (hideLoading will handle it)
        const titleElement = document.getElementById('satellite-title');
        if (titleElement) {
             titleElement.innerText = satellite.OBJECT_NAME || `Satellite ${satId}`;
        }

        hideLoading(true); // Indicate success
        return true; // Return success

    } catch (error) {
        if (error.message.startsWith('NOT_FOUND:')) {
            showError(`This satellite (NORAD ID: ${satId}) is not currently listed as active.`);
        } else {
            showError(`Failed to load satellite data: ${error.message}`);
        }
        // hideLoading(false) is called within showError
        return false; // Return failure
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
    const orbitPoints = calculateOrbitPoints();
    
    if (orbitLine) {
        map.removeLayer(orbitLine);
    }
    
    orbitLine = L.polyline(orbitPoints, {
        color: '#3498db',
        weight: 2,
        opacity: 0.7,
        dashArray: '5, 5',
        className: 'orbit-path'
    }).addTo(map);
}

// Calculate orbit points for visualization
function calculateOrbitPoints() {
    const points = [];
    const now = new Date();
    
    for (let i = 0; i < ORBIT_POINTS; i++) {
        const minutesOffset = (i / ORBIT_POINTS) * ORBIT_PERIOD_MINUTES;
        const timeOffset = minutesOffset * 60 * 1000;
        const time = new Date(now.getTime() + timeOffset);
        const position = calculateSatellitePosition(satellite, time);
        
        // Add check for valid position before pushing
        if (position && !isNaN(position.lat) && !isNaN(position.lng)) {
            points.push([position.lat, position.lng]);
        }
    }
    
    return points;
}

// Update the ground track visualization
function updateGroundTrackVisualization() {
    const trackPoints = calculateGroundTrackPoints();
    
    if (groundTrackLine) {
        map.removeLayer(groundTrackLine);
    }
    
    groundTrackLine = L.polyline(trackPoints, {
        color: '#e74c3c',
        weight: 2,
        opacity: 0.8,
        className: 'ground-track'
    }).addTo(map);
}

// Calculate ground track points
function calculateGroundTrackPoints() {
    const points = [];
    const now = new Date();
    
    for (let i = 0; i < ORBIT_POINTS / 2; i++) {
        const minutesOffset = (i / (ORBIT_POINTS / 2)) * (ORBIT_PERIOD_MINUTES / 2);
        const timeOffset = minutesOffset * 60 * 1000;
        const time = new Date(now.getTime() + timeOffset);
        const position = calculateSatellitePosition(satellite, time);
        
        // Add check for valid position before pushing
        if (position && !isNaN(position.lat) && !isNaN(position.lng)) {
            points.push([position.lat, position.lng]);
        }
    }
    
    return points;
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

    const orbitalTableBody = document.querySelector('#orbital-table tbody');
    const satelliteTableBody = document.querySelector('#satellite-table tbody');
    const positionTableBody = document.querySelector('#position-table tbody'); // Clear initial position too

    // Reformat orbital data into fewer rows with more columns
    orbitalTableBody.innerHTML = `
        <tr>
            <th>NORAD ID</th><td>${satellite.NORAD_CAT_ID}</td>
            <th>Int'l Designator</th><td>${satellite.OBJECT_ID || 'N/A'}</td>
            <th>Epoch</th><td>${satellite.EPOCH || 'N/A'}</td>
        </tr>
        <tr>
            <th>Eccentricity</th><td>${satellite.ECCENTRICITY?.toFixed(6) || 'N/A'}</td>
            <th>Inclination</th><td>${satellite.INCLINATION?.toFixed(4) || 'N/A'}°</td>
            <th>RAAN</th><td>${satellite.RA_OF_ASC_NODE?.toFixed(4) || 'N/A'}°</td>
        </tr>
        <tr>
            <th>Arg. of Perigee</th><td>${satellite.ARG_OF_PERICENTER?.toFixed(4) || 'N/A'}°</td>
            <th>Mean Anomaly</th><td>${satellite.MEAN_ANOMALY?.toFixed(4) || 'N/A'}°</td>
            <th>Mean Motion</th><td>${satellite.MEAN_MOTION?.toFixed(6) || 'N/A'} rev/day</td>
        </tr>
    `;

    satelliteTableBody.innerHTML = `
        <tr><th>Name</th><td>${satellite.OBJECT_NAME || 'N/A'}</td></tr>
        <tr><th>Launch Date</th><td>${formatLaunchDate(satellite.OBJECT_ID) || 'N/A'}</td></tr>        <tr><th>Orbital Period</th><td>${calculateOrbitalPeriod(satellite) || 'N/A'} minutes</td></tr>
    `;

    // Clear position table initially
    if(positionTableBody) positionTableBody.innerHTML = '';
}

// Update position information panel with current data
function updatePositionInfo(position) {
     // Ensure satellite object exists
    if (!satellite) return;
    const { lat, lng, alt, velocity, time } = position;
    const positionTableBody = document.querySelector('#position-table tbody');

    const utcTimeString = time.toISOString();
    const localTimeString = time.toLocaleString();

    // Populate Current Position table body
    positionTableBody.innerHTML = `
        <tr><th>Time (UTC)</th><td>${utcTimeString}</td></tr>
        <tr><th>Time (Local)</th><td>${localTimeString}</td></tr>
        <tr><th>Latitude</th><td>${lat.toFixed(4)}°</td></tr>
        <tr><th>Longitude</th><td>${lng.toFixed(4)}°</td></tr>
        <tr><th>Altitude</th><td>${alt.toFixed(2)} km</td></tr>
        <tr><th>Velocity</th><td>${velocity.toFixed(2)} km/s</td></tr>
        <tr><th>Ground Speed</th><td>${calculateGroundSpeed(velocity, alt).toFixed(2)} km/s</td></tr>
    `;
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
    const match = objectId.match(/^(\d{4})-(\d{3})/);
    if (match) {
        const year = match[1];
        const launchNum = match[2];
        return `${year} (Launch #${parseInt(launchNum, 10)})`;
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