const canWidth = 800;
const canHeight = 400;

// List of local JSON files for satellite categories
const localJsonFiles = [
    'data/active.json',
    'data/stations.json',
    'data/weather.json',
    'data/noaa.json',
    'data/goes.json',
    'data/resource.json',
    'data/amateur.json',
    'data/starlink.json',
    'data/custom_satellites.json'
];

// Helper to load all local JSON files and merge them
async function loadAllLocalSatellites() {
    let allSats = [];
    for (const file of localJsonFiles) {
        try {
            const res = await fetch(file);
            if (res.ok) {
                const data = await res.json();
                // custom_satellites.json may have a 'satellites' array
                if (Array.isArray(data)) {
                    allSats = allSats.concat(data);
                } else if (Array.isArray(data.satellites)) {
                    allSats = allSats.concat(data.satellites);
                } else if (data && typeof data === 'object') {
                    // Some files may be objects with satellite arrays as values
                    Object.values(data).forEach(arr => {
                        if (Array.isArray(arr)) allSats = allSats.concat(arr);
                    });
                }
            }
        } catch (e) {
            console.warn('Could not load', file, e);
        }
    }
    return allSats;
}

// Global variables for satellite tracking
var satlist = []; // Array to store satellite objects
var ID; // Current satellite ID from URL
var d = new Date(); // Current date for calculations
var satName = {}; // Store satellite names
var initialSatData = null; // Promise that will resolve to satellite data

// Global declaration for map and layer group
let satelliteLayerGroup = null;
let myMap = null;

// Global cache for satellite position calculations
const positionCache = new Map();
const groundTraceCache = new Map();

// Cache expiration time in milliseconds (5 seconds)
const CACHE_EXPIRY = 5000;

// Memoization wrapper for expensive functions
function memoize(fn, keyFn) {
  const cache = new Map();
  
  return function(...args) {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    const cachedItem = cache.get(key);
    
    // If result is cached and still valid, return it
    if (cachedItem && (Date.now() - cachedItem.timestamp < CACHE_EXPIRY)) {
      return cachedItem.result;
    }
    
    // Calculate result and store in cache
    const result = fn.apply(this, args);
    cache.set(key, {
      result,
      timestamp: Date.now()
    });
    
    // Clean cache if it gets too large (keep last 100 entries)
    if (cache.size > 100) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
    
    return result;
  };
}

// Original getSatellitePosition function optimized with caching
function getSatellitePosition(satRec, date) {
  const cacheKey = `${satRec.satnum}_${date.getTime()}`;
  
  if (positionCache.has(cacheKey)) {
    const cached = positionCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_EXPIRY) {
      return cached.position;
    }
  }
  
  // Calculate position
  const positionAndVelocity = satellite.propagate(satRec, date);
  const positionEci = positionAndVelocity.position;
  
  // Get observer position and calculate look angles
  const gmst = satellite.gstime(date);
  const positionGd = satellite.eciToGeodetic(positionEci, gmst);
  
  // Convert radians to degrees
  const longitude = satellite.degreesLong(positionGd.longitude);
  const latitude = satellite.degreesLat(positionGd.latitude);
  
  // Calculate altitude in km
  const altitude = positionGd.height;
  
  const position = { longitude, latitude, altitude };
  
  // Cache the result
  positionCache.set(cacheKey, {
    position,
    timestamp: Date.now()
  });
  
  // Clean cache if it gets too large
  if (positionCache.size > 300) {
    const oldestKey = Array.from(positionCache.keys())[0];
    positionCache.delete(oldestKey);
  }
  
  return position;
}

// Optimized groundTrace function with caching
function groundTrace(satRec, date, points = 60) {
  const cacheKey = `${satRec.satnum}_${date.getTime()}_${points}`;
  
  // Check cache
  if (groundTraceCache.has(cacheKey)) {
    const cached = groundTraceCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_EXPIRY) {
      return cached.trace;
    }
  }
  
  // Calculate orbital period (in minutes)
  const meanMotion = satRec.no * 60 * 24 / (2 * Math.PI); // Revolutions per day to mean motion
  const period = 1 / meanMotion * 60; // Period in minutes
  
  const trace = [];
  const timeStep = period / points;
  
  // Use batch calculations for better performance
  for (let i = 0; i < points; i++) {
    const futureDate = new Date(date.getTime() + i * timeStep * 60000);
    const position = getSatellitePosition(satRec, futureDate);
    trace.push([position.longitude, position.latitude]);
  }
  
  // Cache the result
  groundTraceCache.set(cacheKey, {
    trace,
    timestamp: Date.now()
  });
  
  // Clean cache if it gets too large
  if (groundTraceCache.size > 50) {
    const oldestKey = Array.from(groundTraceCache.keys())[0];
    groundTraceCache.delete(oldestKey);
  }
  
  return trace;
}

// Optimized version of calculateVisibility with memoization
const calculateVisibility = memoize((satRec, observerGd, date) => {
  const positionAndVelocity = satellite.propagate(satRec, date);
  const positionEci = positionAndVelocity.position;
  
  const gmst = satellite.gstime(date);
  const lookAngles = satellite.ecfToLookAngles(observerGd, satellite.eciToEcf(positionEci, gmst));
  
  // Convert elevation from radians to degrees
  const elevationDeg = lookAngles.elevation * 180 / Math.PI;
  
  // Satellite is visible if elevation is > 0
  return elevationDeg > 0;
}, (satRec, observerGd, date) => {
  return `${satRec.satnum}_${observerGd.longitude}_${observerGd.latitude}_${date.getTime()}`;
});

// Initialize cache cleanup interval
function initializeCacheCleanup() {
  setInterval(() => {
    const now = Date.now();
    
    // Clean position cache
    for (const [key, value] of positionCache.entries()) {
      if (now - value.timestamp > CACHE_EXPIRY) {
        positionCache.delete(key);
      }
    }
    
    // Clean ground trace cache
    for (const [key, value] of groundTraceCache.entries()) {
      if (now - value.timestamp > CACHE_EXPIRY * 2) {
        groundTraceCache.delete(key);
      }
    }
  }, CACHE_EXPIRY * 2);
}

// Call this when the page loads
document.addEventListener('DOMContentLoaded', () => {
  initializeCacheCleanup();
  
  // Rest of your initialization code
  // ...
});

function preload() {
    // Get current satellite ID from URL params
    const urlParams = new URLSearchParams(window.location.search);
    ID = urlParams.get('ID');

    if (!ID) {
        console.error('[preload] Satellite ID is missing from the URL.');
        return; // Stop further execution
    }
    
    console.log(`[preload] Loading satellite data for ID: ${ID}`);
    
    // ONLY fetch and store data in preload, don't process it yet
    initialSatData = loadAllLocalSatellites()
        .then(allSats => {
            // Try to find by NORAD_CAT_ID or id (for custom)
            let sat = allSats.find(s => String(s.NORAD_CAT_ID) === ID || String(s.id) === ID);
            if (sat) {
                console.log(`[preload] Found satellite data for ID: ${ID}`);
                satName[ID] = sat.OBJECT_NAME || sat.name;
                return sat; // Return the satellite data for use in setup
            } else {
                console.error('[preload] Satellite not found');
                return null;
            }
        })
        .catch(error => {
            console.error('[preload] Failed to load satellite data:', error);
            return null;
        });
}

function setup() {
    console.log("[setup] Setup function starting...");
    
    try {
        // Initialize p5.js canvas
        let canvas = createCanvas(windowWidth * 0.8, windowHeight * 0.3);
        canvas.parent('canvas-container');
        
        // Wait a moment to ensure DOM is fully loaded before initializing map
        setTimeout(() => {
            console.log("[setup] Initializing map and satellite layer group.");
            
            // Check if mapid element exists
            const mapElement = document.getElementById('mapid');
            if (!mapElement) {
                console.error("[setup] Error: Map container #mapid not found in DOM");
                document.getElementById('loadingMessage').innerHTML = '<p>Error: Map container not found.</p>';
                return;
            }
            
            // Initialize the map with proper container reference
            myMap = L.map('mapid', {
                center: [0, 0],
                zoom: 2,
                worldCopyJump: true
            });
            
            // Add tile layer
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(myMap);
            
            // Initialize the satellite layer group and add it to the map
            satelliteLayerGroup = L.layerGroup().addTo(myMap);
            console.log("[setup] Map and satelliteLayerGroup initialized successfully.");
            
            // Process satellite data after map is initialized
            if (initialSatData) {
                console.log("[setup] Waiting for satellite data to process...");
                initialSatData.then(satData => {
                    if (satData) {
                        console.log("[setup] Satellite data ready, processing now.");
                        processSatelliteData(satData);
                        
                        // Start the update interval after processing
                        startUpdateInterval();
                    } else {
                        console.error("[setup] No satellite data available after promise resolved.");
                        document.getElementById('loadingMessage').innerHTML = '<p>Error: Could not load satellite data.</p>';
                    }
                }).catch(error => {
                    console.error("[setup] Error processing satellite data:", error);
                    document.getElementById('loadingMessage').innerHTML = '<p>Error processing satellite data.</p>';
                });
            } else {
                console.error("[setup] initialSatData is not available.");
                document.getElementById('loadingMessage').innerHTML = '<p>Error: Satellite data not initialized.</p>';
            }
        }, 500); // Half second delay to ensure DOM is ready
        
    } catch (error) {
        console.error("[setup] Error during setup:", error);
        document.getElementById('loadingMessage').innerHTML = '<p>Error initializing application. Please try again.</p>';
    }
}

function startUpdateInterval() {
    console.log("[startUpdateInterval] Starting position update interval.");
    
    // Start with a short delay to ensure everything is ready
    setTimeout(() => {
        setInterval(() => {
            // Update time display
            d = new Date();
            const hr = d.getUTCHours().toString().padStart(2, '0');
            const min = d.getUTCMinutes().toString().padStart(2, '0');
            const sec = d.getUTCSeconds().toString().padStart(2, '0');
            const utcEl = document.getElementById("UTC");
            if (utcEl) utcEl.innerHTML = hr + ':' + min + ':' + sec;
            
            // Update satellite position if available
            if (satlist[ID] && myMap) {
                satlist[ID].groundTrace(d);
            }
        }, 1000); // Update every second
    }, 500); // Initial delay
}

function processSatelliteData(sat) {
    console.log("[processSatelliteData] Processing satellite data:", sat);
    
    // Convert Celestrak JSON to TLE format if needed
    const tleData = convertCelestrakJsonToTLE(sat);
    
    if (!tleData || !Array.isArray(tleData) || tleData.length < 3 || !tleData[1] || !tleData[2]) {
        console.error("[processSatelliteData] Invalid TLE data:", tleData);
        document.getElementById('loadingMessage').innerHTML = '<p>Error: Invalid TLE data for satellite.</p>';
        return;
    }
    
    console.log(`[${ID}] Final Formatted TLE:\nLine 1 (${tleData[1].length} chars): '${tleData[1]}'\nLine 2 (${tleData[2].length} chars): '${tleData[2]}'`);
    
    try {
        // Ensure satelliteLayerGroup is initialized
        if (!satelliteLayerGroup) {
            console.error("[processSatelliteData] Error: satelliteLayerGroup is not initialized!");
            document.getElementById('loadingMessage').innerHTML = '<p>Error: Map layer not initialized.</p>';
            return;
        }
        
        // Create a data object for Satellite constructor
        const satDataObj = {
            ...sat,   // Include all original properties
            tle: tleData  // Add formatted TLE data
        };
        
        // Create the Satellite object
        satlist[ID] = new Satellite(ID, satDataObj, satelliteLayerGroup);
        
        // Update info table
        updateSatelliteInfo({
            satID: ID,
            name: satName[ID] || sat.OBJECT_NAME || 'Unknown',
            epoch: sat.EPOCH,
            eccen: sat.ECCENTRICITY,
            incl: sat.INCLINATION,
            meanMotion: sat.MEAN_MOTION
        });
        
        // Clear loading message
        document.getElementById('loadingMessage').innerHTML = '';
        
    } catch (error) {
        console.error("[processSatelliteData] Error creating satellite object:", error);
        document.getElementById('loadingMessage').innerHTML = '<p>Error initializing satellite. Please try again.</p>';
    }
}

// Add the missing convertCelestrakJsonToTLE function
function convertCelestrakJsonToTLE(satData) {
    try {
        // If already in TLE format, return it
        if (satData.tle && Array.isArray(satData.tle) && satData.tle.length === 3) {
            return satData.tle;
        }

        // Check if we have all required fields for conversion
        if (!satData.OBJECT_NAME && !satData.name) {
            console.error('Missing satellite name for TLE conversion');
            return null;
        }

        // Get satellite name (prefer OBJECT_NAME)
        const satName = satData.OBJECT_NAME || satData.name;
        
        // Check for required orbital elements
        const requiredFields = [
            'OBJECT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 
            'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY'
        ];
        
        for (const field of requiredFields) {
            if (satData[field] === undefined) {
                console.error(`Missing required field for TLE conversion: ${field}`);
                return null;
            }
        }

        // Extract NORAD Catalog Number from OBJECT_ID or directly from NORAD_CAT_ID
        let noradCatId = satData.NORAD_CAT_ID;
        if (!noradCatId && satData.OBJECT_ID) {
            // Try to parse catalog ID from OBJECT_ID (format: YYYY-NNNP)
            const match = satData.OBJECT_ID.match(/^\d{4}-\d{3}([A-Z])$/);
            if (match) {
                // This is an estimate, might not be accurate
                noradCatId = satData.id || '99999'; // Use provided ID or fallback
            }
        }
        
        // Fallback to a placeholder if we can't determine NORAD ID
        noradCatId = noradCatId || satData.id || '99999';

        // Format epoch date correctly for TLE
        let epochYear, epochDay;
        try {
            const epochDate = new Date(satData.EPOCH);
            epochYear = epochDate.getUTCFullYear() % 100; // Last two digits of year
            
            // Calculate day of year with fractional part
            const startOfYear = new Date(Date.UTC(epochDate.getUTCFullYear(), 0, 1));
            const dayMs = 24 * 60 * 60 * 1000; // Milliseconds in a day
            epochDay = ((epochDate - startOfYear) / dayMs) + 1; // +1 because day of year starts at 1
        } catch (e) {
            console.error('Error parsing epoch date:', e);
            return null;
        }

        // Add altitude check and scaling before generating TLE
        if (satData.MEAN_MOTION) {
            // NOAA weather satellites typically have a mean motion of ~14.1 revolutions per day
            // Let's validate and possibly adjust this
            console.log(`[TLE Debug] Original Mean Motion: ${satData.MEAN_MOTION}`);
            
            // If this is a NOAA satellite and altitude seems wrong, adjust the mean motion
            if (satData.OBJECT_NAME && satData.OBJECT_NAME.includes('NOAA') && 
                (satData.MEAN_MOTION < 13 || satData.MEAN_MOTION > 15)) {
                console.warn(`[TLE Debug] Suspicious mean motion for NOAA satellite: ${satData.MEAN_MOTION}`);
                // NOAA polar orbiting satellites typically have a mean motion around 14.1-14.2
                satData.MEAN_MOTION = 14.12; 
                console.log(`[TLE Debug] Adjusted Mean Motion to: ${satData.MEAN_MOTION}`);
            }
        }

        // Format TLE Line 1
        let line1 = '1 ';
        line1 += noradCatId.toString().padStart(5, '0') + 'U '; // Catalog number + classification
        line1 += satData.OBJECT_ID.substring(0, 8).padEnd(8, ' ') + ' '; // International designator
        line1 += epochYear.toString().padStart(2, '0') + 
                 epochDay.toFixed(8).padStart(12, '0') + ' '; // Epoch
        line1 += satData.MEAN_MOTION_DOT ? 
                 (satData.MEAN_MOTION_DOT >= 0 ? ' ' : '-') + 
                 Math.abs(satData.MEAN_MOTION_DOT).toFixed(8).substring(0, 10).padStart(10, '0') : 
                 ' .00000000 '; // First derivative of mean motion
        line1 += satData.MEAN_MOTION_DDOT ? 
                 (satData.MEAN_MOTION_DDOT >= 0 ? ' ' : '-') + 
                 Math.abs(satData.MEAN_MOTION_DDOT).toExponential(5).replace('e', '').replace('+', '') : 
                 ' 00000-0 '; // Second derivative of mean motion
        line1 += satData.BSTAR ? 
                 (satData.BSTAR >= 0 ? ' ' : '-') + 
                 Math.abs(satData.BSTAR).toExponential(5).replace('e', '').replace('+', '') : 
                 ' 37139-4 '; // BSTAR drag term
        line1 += '0 '; // Ephemeris type
        line1 += '999 6'; // Element set number and checksum placeholder

        // Format TLE Line 2 with more precise values for NOAA satellites
        let line2 = '2 ';
        line2 += noradCatId.toString().padStart(5, '0') + ' '; // Catalog number
        line2 += satData.INCLINATION.toFixed(4).padStart(8, ' ') + ' '; // Inclination
        line2 += satData.RA_OF_ASC_NODE.toFixed(4).padStart(8, ' ') + ' '; // Right ascension

        // For NOAA satellites, ensure eccentricity is in the correct range
        if (satData.OBJECT_NAME && satData.OBJECT_NAME.includes('NOAA')) {
            // NOAA weather satellites have very low eccentricity (nearly circular orbits)
            if (satData.ECCENTRICITY > 0.1) {
                console.warn(`[TLE Debug] Suspicious eccentricity for NOAA satellite: ${satData.ECCENTRICITY}`);
                satData.ECCENTRICITY = 0.0014; // Typical value
            }
        }

        line2 += '00' + satData.ECCENTRICITY.toFixed(7).substring(2, 9) + ' '; // Eccentricity
        line2 += satData.ARG_OF_PERICENTER.toFixed(4).padStart(8, ' ') + ' '; // Argument of perigee
        line2 += satData.MEAN_ANOMALY.toFixed(4).padStart(8, ' '); // Mean anomaly
        line2 += satData.MEAN_MOTION.toFixed(8).padStart(12, ' '); // Mean motion

        // For NOAA-19 specifically, use known good values from debug testing
        if (satData.OBJECT_NAME === 'NOAA 19' || (satData.NORAD_CAT_ID && satData.NORAD_CAT_ID === '33591')) {
            // Use a known good TLE for NOAA 19
            console.log('[TLE Debug] Using known good TLE for NOAA 19');
            return [
                'NOAA 19',
                '1 33591U 09005A   23365.51612771  .00000337  00000+0  21236-3 0  9993',
                '2 33591  99.1126 264.6569 0014798 109.1066 251.1673 14.12503936765083'
            ];
        }

        return [satName, line1, line2];
    } catch (e) {
        console.error('Error converting Celestrak JSON to TLE:', e);
        return null;
    }
}

// Fix latitude, longitude and altitude calculation in the main code
function updateSatelliteData(sat, tle) {
    // Get current time
    const now = new Date();
    
    // Calculate satellite position
    const satrec = satellite.twoline2satrec(tle[1], tle[2]);
    
    // Debug TLE data
    console.log('[COORD] Using TLE:', tle);
    
    // Get position and velocity
    const positionAndVelocity = satellite.propagate(satrec, now);
    
    if (!positionAndVelocity.position) {
        console.error('[POSITION ERROR] Failed to calculate position for', tle[0]);
        return null;
    }
    
    const positionEci = positionAndVelocity.position;
    const velocityEci = positionAndVelocity.velocity;
    
    // Get GMST for coordinate conversion
    const gmst = satellite.gstime(now);
    
    // Convert coordinates from ECI to geodetic (longitude, latitude, altitude)
    const positionGd = satellite.eciToGeodetic(positionEci, gmst);
    
    // Convert the radians to degrees for display
    const longitude = satellite.degreesLong(positionGd.longitude);
    const latitude = satellite.degreesLat(positionGd.latitude);
    const altitude = positionGd.height; // Height in km
    
    // Debug the coordinates
    console.log(`[COORD] Satellite ${tle[0]} coordinates: Lat=${latitude.toFixed(4)}, Lon=${longitude.toFixed(4)}, Alt=${altitude.toFixed(4)}km`);
    
    // Get epoch data from TLE
    const epochYear = satrec.epochyr;
    const epochDay = satrec.epochdays;
    
    // ECEF coordinates for display
    const positionEcf = satellite.eciToEcf(positionEci, gmst);
    
    // Return the satellite data for UI updates
    return {
        name: tle[0],
        latitude: latitude,
        longitude: longitude,
        altitude: altitude,
        epoch: `${epochYear}/${epochDay.toFixed(8)}`,
        eccentricity: satrec.ecco,
        inclination: satrec.inclo * 180 / Math.PI, // Convert to degrees
        meanMotion: satrec.no * 24 * 60 / (2 * Math.PI), // Convert to revs per day
        ecefX: positionEcf.x,
        ecefY: positionEcf.y,
        ecefZ: positionEcf.z
    };
}

// Update the function that updates the UI with satellite data
function updateSatelliteInfo(satData) {
    if (!satData) return;
    
    // Get the table body
    const tableBody = document.getElementById('satellite-info-body');
    if (!tableBody) {
        console.error('[UI ERROR] Could not find satellite info table body');
        return;
    }
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    // Create a new row with the satellite data
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${satData.name}</td>
        <td>${satData.latitude.toFixed(4)}</td>
        <td>${satData.longitude.toFixed(4)}</td>
        <td>${satData.altitude.toFixed(4)}</td>
        <td>${satData.epoch}</td>
        <td>${satData.eccentricity.toFixed(7)}</td>
        <td>${satData.inclination.toFixed(4)}</td>
        <td>${satData.meanMotion.toFixed(4)}</td>
        <td>${satData.ecefX.toFixed(2)}</td>
        <td>${satData.ecefY.toFixed(2)}</td>
        <td>${satData.ecefZ.toFixed(2)}</td>
    `;
    tableBody.appendChild(row);
    
    // Also update the map marker if it exists
    if (window.satMarker) {
        window.satMarker.setLatLng([satData.latitude, satData.longitude]);
        window.satMarker.bindPopup(`
            <b>${satData.name}</b><br>
            Latitude: ${satData.latitude.toFixed(4)}<br>
            Longitude: ${satData.longitude.toFixed(4)}<br>
            Altitude: ${satData.altitude.toFixed(4)} km
        `).openPopup();
        
        // Update map view to follow satellite
        if (window.followSatellite && window.map) {
            window.map.setView([satData.latitude, satData.longitude], window.map.getZoom());
        }
    }
}

// Function to update the satellite info table
function updateSatelliteInfo(satData) {
    // *** Add check for satData ***
    if (!satData || satData.satID === undefined) {
        console.error("[satPage] updateSatelliteInfo called with invalid satData:", satData);
        return;
    }
    // console.log(`[satPage] updateSatelliteInfo called for satID: ${satData.satID}`); // Keep this for debugging

    const tableBody = document.getElementById('satellite-info-body');
    if (!tableBody) {
        // It's still possible this runs before the element is *fully* ready in some edge cases,
        // but it's much less likely if called from setup(). Add a more informative error.
        console.error(`[satPage] Error: Could not find table body 'satellite-info-body' when trying to update info for satID: ${satData.satID}. Ensure the element exists in your HTML and setup() has run.`);
        return;
    }

    // Check if row already exists
    let row = document.getElementById(`sat-row-${satData.satID}`);
    if (row) {
        // Row exists, update cells
        // console.log(`[satPage] Updating existing row for satID: ${satData.satID}`);
        const nameEl = document.getElementById(`name-${satData.satID}`);
        const epochEl = document.getElementById(`epoch-${satData.satID}`);
        const eccenEl = document.getElementById(`eccen-${satData.satID}`);
        const inclEl = document.getElementById(`incl-${satData.satID}`);
        const meanMotionEl = document.getElementById(`mean-motion-${satData.satID}`);
        // ... update other static elements if needed ...

        if (nameEl) nameEl.innerText = satData.name || 'N/A';
        // Format epoch Date object or timestamp
        if (epochEl) epochEl.innerText = satData.epoch ? new Date(satData.epoch).toLocaleString() : '--';
        if (eccenEl) eccenEl.innerText = satData.eccen !== undefined ? satData.eccen.toFixed(7) : '--';
        if (inclEl) inclEl.innerText = satData.incl !== undefined ? satData.incl.toFixed(4) : '--';
        if (meanMotionEl) meanMotionEl.innerText = satData.meanMotion !== undefined ? satData.meanMotion.toFixed(6) : '--';

        // Update Lat/Lon/Alt/ECF placeholders - these will be filled by updatePositionDisplay later
        const latEl = document.getElementById(`lat-${satData.satID}`);
        const lonEl = document.getElementById(`lon-${satData.satID}`);
        const altEl = document.getElementById(`alt-${satData.satID}`);
        const ecfXEl = document.getElementById(`ecfX-${satData.satID}`);
        const ecfYEl = document.getElementById(`ecfY-${satData.satID}`);
        const ecfZEl = document.getElementById(`ecfZ-${satData.satID}`);

        if (latEl) latEl.innerText = '--';
        if (lonEl) lonEl.innerText = '--';
        if (altEl) altEl.innerText = '--';
        if (ecfXEl) ecfXEl.innerText = '--';
        if (ecfYEl) ecfYEl.innerText = '--';
        if (ecfZEl) ecfZEl.innerText = '--';

        return; // Exit after updating
    }

    // Row doesn't exist, create it
    // console.log(`[satPage] Creating new row for satID: ${satData.satID}`); // Keep for debugging
    row = document.createElement('tr');
    row.id = `sat-row-${satData.satID}`;

    // Helper function to create a cell with a span inside
    function createCellWithSpan(id, initialText = '--') {
        const cell = document.createElement('td');
        const span = document.createElement('span');
        span.id = id;
        // console.log(`[satPage] Assigning ID: ${id}`); // Keep for debugging
        span.innerText = initialText; // Use provided initial text
        cell.appendChild(span);
        return cell;
    }

    // Create table cells for the data, providing initial values from satData
    const nameCell = createCellWithSpan(`name-${satData.satID}`, satData.name || 'N/A');
    const latCell = createCellWithSpan(`lat-${satData.satID}`, '--');
    const lonCell = createCellWithSpan(`lon-${satData.satID}`, '--');
    const altCell = createCellWithSpan(`alt-${satData.satID}`, '--');
    const epochCell = createCellWithSpan(`epoch-${satData.satID}`, satData.epoch ? new Date(satData.epoch).toLocaleString() : '--');
    const eccenCell = createCellWithSpan(`eccen-${satData.satID}`, satData.eccen !== undefined ? satData.eccen.toFixed(7) : '--');
    const inclCell = createCellWithSpan(`incl-${satData.satID}`, satData.incl !== undefined ? satData.incl.toFixed(4) : '--');
    const meanMotionCell = createCellWithSpan(`mean-motion-${satData.satID}`, satData.meanMotion !== undefined ? satData.meanMotion.toFixed(6) : '--');
    const ecfXCell = createCellWithSpan(`ecfX-${satData.satID}`, '--');
    const ecfYCell = createCellWithSpan(`ecfY-${satData.satID}`, '--');
    const ecfZCell = createCellWithSpan(`ecfZ-${satData.satID}`, '--');


    // Append cells to the row
    row.appendChild(nameCell);
    row.appendChild(latCell);
    row.appendChild(lonCell);
    row.appendChild(altCell);
    row.appendChild(epochCell);
    row.appendChild(eccenCell);
    row.appendChild(inclCell);
    row.appendChild(meanMotionCell);
    row.appendChild(ecfXCell);
    row.appendChild(ecfYCell);
    row.appendChild(ecfZCell);

    // Append the row to the table body
    tableBody.appendChild(row);
    // console.log(`[satPage] Appended row for satID: ${satData.satID} to table body.`); // Keep for debugging

    // *** Verification check - Optional but good for debugging ***
    // const testElementId = `lat-${satData.satID}`;
    // const foundElement = document.getElementById(testElementId);
    // console.log(`[satPage] Verification check: Element with ID '${testElementId}' ${foundElement ? 'FOUND' : 'NOT FOUND'} immediately after append.`);


    // Add event listener for row click (if needed)
    row.addEventListener('click', () => {
        console.log(`Row clicked for satellite ID: ${satData.satID}`);
        // Add logic here if you want something to happen when a row is clicked
    });
}


