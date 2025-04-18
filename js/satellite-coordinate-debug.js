/**
 * satellite-coordinate-debug.js
 * This script helps debug and correctly calculate satellite coordinates from TLE data.
 * Include this in your HTML file to fix coordinate calculations.
 */

// Make sure you have the satellite.js library loaded before this script
// <script src="https://cdnjs.cloudflare.com/ajax/libs/satellite.js/4.0.0/satellite.min.js"></script>

// Load data from NOAA JSON file and compute accurate coordinates
async function loadNoaaData() {
    try {
        const response = await fetch('data/noaa.json');
        const noaaData = await response.json();
        
        console.log('[DEBUG] Loaded NOAA data:', noaaData);
        
        // Process each satellite
        noaaData.forEach(sat => {
            // Format TLE from JSON data
            const tle = formatTleFromJson(sat);
            
            // Calculate position
            const position = calculateSatellitePosition(tle, sat.OBJECT_NAME);
            
            console.log(`[DEBUG] ${sat.OBJECT_NAME}:`);
            console.log(`  TLE Line 1: ${tle[1]}`);
            console.log(`  TLE Line 2: ${tle[2]}`);
            console.log(`  Latitude: ${position.latitude.toFixed(5)}`);
            console.log(`  Longitude: ${position.longitude.toFixed(5)}`);
            console.log(`  Altitude: ${position.altitude.toFixed(5)} km`);
        });
    } catch (error) {
        console.error('[ERROR] Failed to load NOAA data:', error);
    }
}

// Format TLE from NOAA JSON data
function formatTleFromJson(satData) {
    // Create a satellite name line (TLE line 0)
    const line0 = satData.OBJECT_NAME;
    
    // Format epoch for TLE
    const epochDate = new Date(satData.EPOCH);
    const epochYear = epochDate.getUTCFullYear() % 100; // Last two digits of year
    
    // Calculate day of year with fraction
    const startOfYear = new Date(Date.UTC(epochDate.getUTCFullYear(), 0, 1));
    const dayOfYear = (epochDate - startOfYear) / (24 * 60 * 60 * 1000) + 1;
    
    // Format the eccentricity (without decimal point)
    const eccentricity = satData.ECCENTRICITY.toFixed(7).substring(2);
    
    // Format TLE line 1
    const line1 = `1 ${satData.NORAD_CAT_ID.toString().padStart(5, '0')}U ${satData.OBJECT_ID.padEnd(8, ' ')} ${epochYear.toString().padStart(2, '0')}${dayOfYear.toFixed(8).padStart(12, '0')} ${satData.MEAN_MOTION_DOT.toExponential(8)} ${satData.MEAN_MOTION_DDOT.toExponential(8)} ${satData.BSTAR.toExponential(8)} 0 ${satData.ELEMENT_SET_NO}`;
    
    // Format TLE line 2
    const line2 = `2 ${satData.NORAD_CAT_ID.toString().padStart(5, '0')} ${satData.INCLINATION.toFixed(4).padStart(8, ' ')} ${satData.RA_OF_ASC_NODE.toFixed(4).padStart(8, ' ')} ${eccentricity} ${satData.ARG_OF_PERICENTER.toFixed(4).padStart(8, ' ')} ${satData.MEAN_ANOMALY.toFixed(4).padStart(8, ' ')} ${satData.MEAN_MOTION.toFixed(8).padStart(11, ' ')}${satData.REV_AT_EPOCH}`;
    
    return [line0, line1, line2];
}

// Calculate satellite position from TLE
function calculateSatellitePosition(tle, satName) {
    try {
        // Current time
        const now = new Date();
        
        // Initialize satellite record
        const satrec = satellite.twoline2satrec(tle[1], tle[2]);
        
        // Propagate satellite position
        const positionAndVelocity = satellite.propagate(satrec, now);
        
        if (!positionAndVelocity.position) {
            console.error(`[ERROR] Failed to calculate position for ${satName}`);
            return { latitude: 0, longitude: 0, altitude: 0 };
        }
        
        // Get position in ECI coordinates
        const positionEci = positionAndVelocity.position;
        
        // Get current GMST (Greenwich Mean Sidereal Time)
        const gmst = satellite.gstime(now);
        
        // Convert to geodetic coordinates (latitude, longitude, altitude)
        const positionGd = satellite.eciToGeodetic(positionEci, gmst);
        
        // Convert from radians to degrees
        return {
            latitude: satellite.degreesLat(positionGd.latitude),
            longitude: satellite.degreesLong(positionGd.longitude),
            altitude: positionGd.height // in km
        };
    } catch (error) {
        console.error(`[ERROR] Failed to calculate position for ${satName}:`, error);
        return { latitude: 0, longitude: 0, altitude: 0 };
    }
}

// Call the debug function when the page loads
window.addEventListener('DOMContentLoaded', () => {
    console.log('[DEBUG] Running satellite coordinate debug script');
    loadNoaaData();
    
    // Add a debug button to the page
    const debugButton = document.createElement('button');
    debugButton.textContent = 'Debug Satellite Coordinates';
    debugButton.style.position = 'fixed';
    debugButton.style.bottom = '10px';
    debugButton.style.right = '10px';
    debugButton.style.zIndex = '1000';
    debugButton.onclick = loadNoaaData;
    
    document.body.appendChild(debugButton);
});

// Function to manually calculate a single satellite's position
function debugSingleSatellite(noradId) {
    fetch('data/noaa.json')
        .then(response => response.json())
        .then(data => {
            const satellite = data.find(sat => sat.NORAD_CAT_ID === noradId);
            if (satellite) {
                const tle = formatTleFromJson(satellite);
                const position = calculateSatellitePosition(tle, satellite.OBJECT_NAME);
                
                console.log('%c[DEBUG] Satellite Position:', 'background: #222; color: #bada55');
                console.log(`  Name: ${satellite.OBJECT_NAME}`);
                console.log(`  NORAD ID: ${satellite.NORAD_CAT_ID}`);
                console.log(`  Latitude: ${position.latitude.toFixed(5)}`);
                console.log(`  Longitude: ${position.longitude.toFixed(5)}`);
                console.log(`  Altitude: ${position.altitude.toFixed(5)} km`);
                
                return position;
            } else {
                console.error(`[ERROR] Satellite with NORAD ID ${noradId} not found`);
                return null;
            }
        })
        .catch(error => {
            console.error('[ERROR] Failed to load NOAA data:', error);
            return null;
        });
}

// Expose the debug function globally
window.debugSatellite = debugSingleSatellite;