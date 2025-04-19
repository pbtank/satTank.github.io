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
document.addEventListener('DOMContentLoaded', function() {
    // Check for satellite ID in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const satId = urlParams.get('ID');
    
    if (!satId) {
        showError("Missing satellite ID (NORAD CAT ID) in URL. Please provide an ID parameter, e.g., ?ID=25544");
        return;
    }
    
    // Initialize the map
    initMap();
    
    // Set default checkbox states
    const showOrbitCheckbox = document.getElementById('show-orbit');
    const showGroundTrackCheckbox = document.getElementById('show-groundtrack');
    const showFootprintCheckbox = document.getElementById('show-footprint');

    if (showOrbitCheckbox) showOrbitCheckbox.checked = true;
    if (showGroundTrackCheckbox) showGroundTrackCheckbox.checked = true;
    if (showFootprintCheckbox) showFootprintCheckbox.checked = true;

    // Load the satellite data from LOCAL FILES and start tracking
    loadSatelliteDataFromLocal(satId);
    
    // Set up event listeners
    document.getElementById('back-button').addEventListener('click', function() {
        window.location.href = 'satelliteList.html';
    });
    
    document.getElementById('map-type').addEventListener('change', function() {
        updateMapType(this.value);
    });
    
    if (showOrbitCheckbox) {
        showOrbitCheckbox.addEventListener('change', function() {
            toggleOrbitDisplay(this.checked);
        });
    }
    
    if (showGroundTrackCheckbox) {
        showGroundTrackCheckbox.addEventListener('change', function() {
            toggleGroundTrackDisplay(this.checked);
        });
    }
    
    if (showFootprintCheckbox) {
        showFootprintCheckbox.addEventListener('change', function() {
            toggleFootprintDisplay(this.checked);
        });
    }

    // Removed redundant dark mode listener and UI update call
});

// --- Theme Toggle Functionality ---
document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    const currentTheme = localStorage.getItem('theme') || 'dark'; // Default to dark

    function setTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        if (themeToggle) {
            themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙'; 
        }
    }

    setTheme(currentTheme); // Apply theme and emoji on load

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            let newTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            setTheme(newTheme);
        });
    }
    // Removed initialization calls from here
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
async function loadSatelliteDataFromLocal(satId) {
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
            throw new Error(`No TLE data found for NORAD ID ${satId} in ${activeJsonFile}.`);
        }

        satellite = foundSatellite;

        document.getElementById('satellite-title').innerText = satellite.OBJECT_NAME || `Satellite ${satId}`;
        displaySatelliteInfo();
        startTracking();
        hideLoading();

    } catch (error) {
        showError(`Failed to load satellite data: ${error.message}`);
        hideLoading();
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
    const orbitalInfo = document.getElementById('orbital-info');
    // Populate TLE Data table
    orbitalInfo.innerHTML = `
    <h4>TLE Data</h4>
    <table>
        <tr><th>NORAD ID</th><td>${satellite.NORAD_CAT_ID}</td></tr>
        <tr><th>Int'l Designator</th><td>${satellite.OBJECT_ID || 'N/A'}</td></tr>
        <tr><th>Epoch</th><td>${satellite.EPOCH || 'N/A'}</td></tr>
        <tr><th>Eccentricity</th><td>${satellite.ECCENTRICITY?.toFixed(6) || 'N/A'}</td></tr>
        <tr><th>Inclination</th><td>${satellite.INCLINATION?.toFixed(4) || 'N/A'}°</td></tr>
        <tr><th>RAAN</th><td>${satellite.RA_OF_ASC_NODE?.toFixed(4) || 'N/A'}°</td></tr>
        <tr><th>Arg. of Perigee</th><td>${satellite.ARG_OF_PERICENTER?.toFixed(4) || 'N/A'}°</td></tr>
        <tr><th>Mean Anomaly</th><td>${satellite.MEAN_ANOMALY?.toFixed(4) || 'N/A'}°</td></tr>
        <tr><th>Mean Motion</th><td>${satellite.MEAN_MOTION?.toFixed(6) || 'N/A'} rev/day</td></tr>
    </table>`;

    const satelliteInfo = document.getElementById('satellite-info');
    // Populate Satellite Info table
    satelliteInfo.innerHTML = `
    <h4>Satellite Info</h4>
    <table>
        <tr><th>Name</th><td>${satellite.OBJECT_NAME || 'N/A'}</td></tr>
        <tr><th>Object Type</th><td>${getObjectType(satellite.OBJECT_TYPE) || 'N/A'}</td></tr>
        <tr><th>Country</th><td>${satellite.COUNTRY_CODE || 'N/A'}</td></tr>
        <tr><th>Launch Date</th><td>${formatLaunchDate(satellite.OBJECT_ID) || 'N/A'}</td></tr>
        <tr><th>Size</th><td>${satellite.RCS_SIZE || 'N/A'}</td></tr>
        <tr><th>Orbital Period</th><td>${calculateOrbitalPeriod(satellite) || 'N/A'} minutes</td></tr>
    </table>`;
}

// Update position information panel with current data
function updatePositionInfo(position) {
    const { lat, lng, alt, velocity, time } = position;
    const positionInfo = document.getElementById('position-info');

    const utcTimeString = time.toISOString();
    const localTimeString = time.toLocaleString();

    // Populate Current Position table
    positionInfo.innerHTML = `
    <h4>Current Position</h4>
    <table>
        <tr><th>Time (UTC)</th><td>${utcTimeString}</td></tr>
        <tr><th>Time (Local)</th><td>${localTimeString}</td></tr>
        <tr><th>Latitude</th><td>${lat.toFixed(4)}°</td></tr>
        <tr><th>Longitude</th><td>${lng.toFixed(4)}°</td></tr>
        <tr><th>Altitude</th><td>${alt.toFixed(2)} km</td></tr>
        <tr><th>Velocity</th><td>${velocity.toFixed(2)} km/s</td></tr>
        <tr><th>Ground Speed</th><td>${calculateGroundSpeed(velocity, alt).toFixed(2)} km/s</td></tr>
        <tr><th>Phase</th><td>${isInDaylight(lat, lng, time) ? 'Daylight' : 'Eclipse'}</td></tr>
    </table>`;
}

// Calculate ground speed from orbital velocity
function calculateGroundSpeed(velocity, altitude) {
    if (altitude <= -EARTH_RADIUS_KM) return 0; // Avoid division by zero or negative radius
    return velocity * (EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitude));
}

// Determine if the satellite is in daylight or eclipse
function isInDaylight(lat, lng, time) {
    const sunPos = calculateSunPosition(time);
    const satelliteVector = latLngToCartesian(lat, lng);
    const sunVector = latLngToCartesian(sunPos.lat, sunPos.lng);
    const dotProduct = satelliteVector.x * sunVector.x + 
                      satelliteVector.y * sunVector.y + 
                      satelliteVector.z * sunVector.z;
    return dotProduct > 0;
}

// Calculate a simplified sun position
function calculateSunPosition(date) {
    const dayOfYear = getDayOfYear(date);
    const declination = 23.45 * Math.sin(2 * Math.PI * (284 + dayOfYear) / 365);
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    const timeDecimal = hours + minutes/60 + seconds/3600;
    const longitude = (timeDecimal - 12) * 15;
    return { lat: declination, lng: longitude };
}

// Get day of year (1-366)
function getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime(); // Use getTime() for accurate difference
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay) + 1; // Day of year is 1-based
}

// Convert latitude and longitude to Cartesian coordinates (unit sphere)
function latLngToCartesian(lat, lng) {
    const latRad = lat * Math.PI / 180;
    const lngRad = lng * Math.PI / 180;
    
    return {
        x: Math.cos(latRad) * Math.cos(lngRad),
        y: Math.cos(latRad) * Math.sin(lngRad),
        z: Math.sin(latRad)
    };
}

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
    if (loadingElement) {
        loadingElement.textContent = message || 'Loading...';
        loadingElement.style.display = 'block';
    }
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

// Hide loading message
function hideLoading() {
    const loadingElement = document.getElementById('loading-message');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

// Show error message
function showError(message) {
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
    hideLoading();
}