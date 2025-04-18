// satPage.js - Handles the individual satellite tracking interface

// Global variables
let map;
let satellite; // Holds the specific satellite data object
let satellitePath = [];
let groundTrack = [];
let footprintPolygon;
let satelliteMarker;
let orbitLine;
let groundTrackLine;
let updateIntervalId;
let footprintCircle;
// Removed observerMarker and observerLocation

// Constants
const EARTH_RADIUS_KM = 6371;
const UPDATE_INTERVAL_MS = 1000;
const ORBIT_POINTS = 90; // Number of points to calculate for orbit
const ORBIT_PERIOD_MINUTES = 90; // Approximate period for most LEO satellites

// Initialize the page when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Check for satellite ID in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const satId = urlParams.get('ID'); // Changed from 'id' to 'ID' to match example URL
    // Removed category check
    
    if (!satId) {
        showError("Missing satellite ID (NORAD CAT ID) in URL. Please provide an ID parameter, e.g., ?ID=25544");
        return;
    }
    
    // Initialize the map
    initMap();
    
    // Load the satellite data from Celestrak API and start tracking
    loadSatelliteDataFromApi(satId);
    
    // Set up event listeners
    document.getElementById('back-button').addEventListener('click', function() {
        window.location.href = 'satelliteList.html';
    });
    
    document.getElementById('map-type').addEventListener('change', function() {
        updateMapType(this.value);
    });
    
    document.getElementById('show-orbit').addEventListener('change', function() {
        toggleOrbitDisplay(this.checked);
    });
    
    document.getElementById('show-groundtrack').addEventListener('change', function() {
        toggleGroundTrackDisplay(this.checked);
    });
    
    document.getElementById('show-footprint').addEventListener('change', function() {
        toggleFootprintDisplay(this.checked);
    });
    
    // Removed event listeners for locate-me and calculate-passes
});

// Initialize Leaflet map
function initMap() {
    // Create the map
    map = L.map('mapid', {
        center: [0, 0],
        zoom: 2,
        minZoom: 2,
        worldCopyJump: true
    });
    
    // Add the default tile layer (standard map)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        subdomains: ['a', 'b', 'c']
    }).addTo(map);
    
    // Removed graticule code causing errors
    /*
    L.latlngGraticule({
        showLabel: true,
        zoomInterval: [
            {start: 2, end: 3, interval: 30},
            {start: 4, end: 5, interval: 10},
            {start: 6, end: 9, interval: 5},
            {start: 10, end: 20, interval: 1}
        ]
    }).addTo(map);
    */
}

// Update the map type based on selection
function updateMapType(type) {
    // Remove current tile layer
    map.eachLayer(function(layer) {
        if (layer instanceof L.TileLayer) {
            map.removeLayer(layer);
        }
    });
    
    // Add the selected tile layer
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

// Load satellite data from Celestrak API using NORAD ID
async function loadSatelliteDataFromApi(satId) {
    showLoading(`Loading TLE data for NORAD ID ${satId}...`);
    try {
        // Construct the Celestrak API URL for a specific satellite by NORAD CAT ID
        const apiUrl = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${satId}&FORMAT=json`;
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} while fetching TLE for ${satId}`);
        }
        
        const data = await response.json();
        
        // Celestrak returns an array, even for a single ID
        if (!data || data.length === 0) {
            throw new Error(`No TLE data found for NORAD ID ${satId} on Celestrak.`);
        }
        
        satellite = data[0]; // Assign the first (and likely only) satellite object
        
        // Update the page title with satellite name
        document.getElementById('satellite-title').innerText = satellite.OBJECT_NAME || `Satellite ${satId}`;
        
        // Display satellite information
        displaySatelliteInfo();
        
        // Start tracking the satellite
        startTracking();
        
        hideLoading();
        
    } catch (error) {
        showError(`Failed to load satellite data: ${error.message}`);
    }
}

// Start tracking the satellite with periodic updates
function startTracking() {
    // Initial update
    updateSatellitePosition();
    
    // Set up periodic updates
    updateIntervalId = setInterval(updateSatellitePosition, UPDATE_INTERVAL_MS);
}

// Update the satellite position and related visualizations
function updateSatellitePosition() {
    try {
        const now = new Date();
        const position = calculateSatellitePosition(satellite, now);

        // Check if position calculation was successful
        if (position === null || isNaN(position.lat) || isNaN(position.lng)) {
            // Optionally show a temporary error or just skip the update
            console.warn('Skipping map update due to invalid position data at', now);
            // You might want to stop the interval if this happens repeatedly
            // showError('Failed to calculate valid satellite position. TLE might be outdated.');
            // clearInterval(updateIntervalId); 
            return; // Stop execution for this interval
        }
        
        // Update position display
        updatePositionInfo(position);
        
        // Update map visualization
        updateMapVisualization(position);
        
    } catch (error) {
        // This catch block might now be less likely to be hit by NaN errors, 
        // but good to keep for other unexpected issues.
        console.error('Error updating satellite position:', error);
        showError(`Failed to update satellite position: ${error.message}`);
        clearInterval(updateIntervalId);
    }
}

// Update the map visualization with the satellite's current position
function updateMapVisualization(position) {
    const { lat, lng, alt, velocity } = position;
    
    // Update or create satellite marker
    if (!satelliteMarker) {
        // Create a custom satellite icon using Font Awesome
        const satIcon = L.divIcon({
            html: '<i class="fa-solid fa-satellite" style="color: #e74c3c;"></i>',
            className: 'satellite-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        
        satelliteMarker = L.marker([lat, lng], {
            icon: satIcon,
            title: satellite.OBJECT_NAME || `Satellite ${satellite.NORAD_CAT_ID}`
        }).addTo(map);
        
        // Add a popup with basic information
        satelliteMarker.bindPopup(createSatellitePopup(position));
    } else {
        // Update marker position
        satelliteMarker.setLatLng([lat, lng]);
        
        // Update popup content
        satelliteMarker.getPopup().setContent(createSatellitePopup(position));
    }
    
    // Update satellite path for orbit visualization
    if (document.getElementById('show-orbit').checked) {
        updateOrbitVisualization();
    }
    
    // Update ground track
    if (document.getElementById('show-groundtrack').checked) {
        updateGroundTrackVisualization();
    }
    
    // Update footprint
    if (document.getElementById('show-footprint').checked) {
        updateFootprintVisualization(lat, lng, alt);
    }
    
    // Center map on satellite if it's out of view
    if (!map.getBounds().contains([lat, lng])) {
        map.setView([lat, lng]);
    }
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
    // Generate orbit points for one full period
    const orbitPoints = calculateOrbitPoints();
    
    // Update or create the orbit line
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
    
    // Calculate points for one full orbit
    for (let i = 0; i < ORBIT_POINTS; i++) {
        // Calculate time offset for this point (distributing points evenly through the orbit)
        const minutesOffset = (i / ORBIT_POINTS) * ORBIT_PERIOD_MINUTES;
        const timeOffset = minutesOffset * 60 * 1000; // Convert to milliseconds
        
        // Calculate the position at this time
        const time = new Date(now.getTime() + timeOffset);
        const position = calculateSatellitePosition(satellite, time);
        
        points.push([position.lat, position.lng]);
    }
    
    return points;
}

// Update the ground track visualization
function updateGroundTrackVisualization() {
    // Calculate ground track points (future positions projected to the ground)
    const trackPoints = calculateGroundTrackPoints();
    
    // Update or create the ground track line
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
    
    // Calculate future positions (half orbit)
    for (let i = 0; i < ORBIT_POINTS / 2; i++) {
        // Calculate time offset for this point
        const minutesOffset = (i / (ORBIT_POINTS / 2)) * (ORBIT_PERIOD_MINUTES / 2);
        const timeOffset = minutesOffset * 60 * 1000; // Convert to milliseconds
        
        // Calculate the position at this time
        const time = new Date(now.getTime() + timeOffset);
        const position = calculateSatellitePosition(satellite, time);
        
        points.push([position.lat, position.lng]);
    }
    
    return points;
}

// Update the footprint visualization (coverage area)
function updateFootprintVisualization(lat, lng, alt) {
    // Calculate footprint radius
    const radius = calculateFootprintRadius(alt);
    
    // Update or create the footprint circle
    if (footprintCircle) {
        map.removeLayer(footprintCircle);
    }
    
    footprintCircle = L.circle([lat, lng], {
        radius: radius * 1000, // Convert km to meters
        color: '#f39c12',
        weight: 1,
        fillColor: '#f39c12',
        fillOpacity: 0.1,
        className: 'footprint'
    }).addTo(map);
}

// Calculate satellite footprint radius based on altitude
function calculateFootprintRadius(altitude) {
    // Formula for calculating footprint radius
    // R = EARTH_RADIUS * arccos(EARTH_RADIUS / (EARTH_RADIUS + altitude))
    const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitude);
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
        updateFootprintVisualization(position.lat, position.lng, currentPosition.alt);
    } else if (footprintCircle) {
        map.removeLayer(footprintCircle);
        footprintCircle = null;
    }
}

// Display satellite information in the details panels
function displaySatelliteInfo() {
    // Orbital information
    const orbitalInfo = document.getElementById('orbital-info');
    orbitalInfo.innerHTML = `
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
    
    // Satellite metadata
    const satelliteInfo = document.getElementById('satellite-info');
    satelliteInfo.innerHTML = `
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
    
    // Format time for display
    const utcTimeString = time.toISOString();
    const localTimeString = time.toLocaleString(); // Browser's local time format
    
    positionInfo.innerHTML = `
    <table>
        <tr><th>Time (UTC)</th><td>${utcTimeString}</td></tr>
        <tr><th>Time (Local)</th><td>${localTimeString}</td></tr>
        <tr><th>Latitude</th><td>${lat.toFixed(4)}°</td></tr>
        <tr><th>Longitude</th><td>${lng.toFixed(4)}°</td></tr>
        <tr><th>Altitude</th><td>${alt.toFixed(2)} km</td></tr>
        <tr><th>Velocity</th><td>${velocity.toFixed(2)} km/s</td></tr>
        <tr><th>Ground Track Speed</th><td>${calculateGroundSpeed(velocity, alt).toFixed(2)} km/s</td></tr>
        <tr><th>Phase</th><td>${isInDaylight(lat, lng, time) ? 'Daylight' : 'Eclipse'}</td></tr>
    </table>`;
}

// Calculate ground speed from orbital velocity
function calculateGroundSpeed(velocity, altitude) {
    // Simple approximation of ground speed
    return velocity * (EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitude));
}

// Determine if the satellite is in daylight or eclipse
function isInDaylight(lat, lng, time) {
    // This is a simplification - we'd need a more complex algorithm for accurate determination
    // For now, we'll use the Sun's position to approximate
    const sunPos = calculateSunPosition(time);
    
    // Calculate the angle between satellite and sun position
    const satelliteVector = latLngToCartesian(lat, lng);
    const sunVector = latLngToCartesian(sunPos.lat, sunPos.lng);
    
    const dotProduct = satelliteVector.x * sunVector.x + 
                      satelliteVector.y * sunVector.y + 
                      satelliteVector.z * sunVector.z;
    
    // If the angle is less than 90 degrees, the satellite is in daylight
    return dotProduct > 0;
}

// Calculate a simplified sun position
function calculateSunPosition(date) {
    // This is a very simplified model for demo purposes
    const dayOfYear = getDayOfYear(date);
    const declination = 23.45 * Math.sin(2 * Math.PI * (284 + dayOfYear) / 365);
    
    // Calculate longitude based on time of day (UTC)
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    
    const timeDecimal = hours + minutes/60 + seconds/3600;
    const longitude = (timeDecimal - 12) * 15; // 15 degrees per hour
    
    return { lat: declination, lng: longitude };
}

// Get day of year (1-366)
function getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
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

// Removed getUserLocation, updateObserverMarker, calculatePasses, predictPasses, displayPasses functions

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
    
    // Format: YYYY-NNNL where YYYY is launch year, NNN is launch number, L is piece letter
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
    if (!satellite || !satellite.MEAN_MOTION) return null;
    
    // Period in minutes = (24 * 60) / mean_motion
    return (24 * 60 / satellite.MEAN_MOTION).toFixed(1);
}

// Show loading message
function showLoading(message) {
    const loadingElement = document.getElementById('loading-message');
    loadingElement.textContent = message || 'Loading...';
    loadingElement.style.display = 'block';
    document.getElementById('error-message').style.display = 'none';
}

// Hide loading message
function hideLoading() {
    document.getElementById('loading-message').style.display = 'none';
}

// Show error message
function showError(message) {
    const errorElement = document.getElementById('error-message');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    hideLoading(); // Hide loading message if error occurs
}