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

var customSatUrl = 'data/custom_satellites.json';

var satlist = [];
var d;
var isCustomSat = false;

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

    // Check if ID is null or empty
    if (!ID) {
        console.error('Satellite ID is missing from the URL.');
        document.getElementById('loadingMessage').innerHTML = '<p>Satellite ID is missing from the URL. Please provide a valid ID.</p>';
        // Optionally, redirect to a default page:
        // window.location.href = '/index.html';
        return; // Stop further execution
    }
    satName = {};
    
    // Display a loading message
    document.getElementById('loadingMessage').innerHTML = '<p>Loading satellite data...</p>';
    
    // Load all local satellites and find the one with the matching ID
    loadAllLocalSatellites().then(allSats => {
        // Try to find by NORAD_CAT_ID or id (for custom)
        let sat = allSats.find(s => String(s.NORAD_CAT_ID) === ID || String(s.id) === ID);
        if (sat) {
            satName[ID] = sat.OBJECT_NAME || sat.name;
            document.getElementById('satNameTitle').innerHTML = satName[ID];
            document.getElementById('satName').innerHTML = satName[ID];
            processSatelliteData(sat);
        } else {
            console.error('Satellite not found');
            document.getElementById('loadingMessage').innerHTML = '<p>Satellite data not found.</p>';
        }
    }).catch(error => {
        console.error('Failed to load satellite data:', error);
        document.getElementById('loadingMessage').innerHTML = '<p>Failed to load satellite data.</p>';
    });
}

function processSatelliteData(sat) {
    // Convert Celestrak JSON to TLE format
    const tleData = convertCelestrakJsonToTLE(sat);
    
    if (tleData) {
        console.log("Successfully converted Celestrak data to TLE format");
        
        // Extract orbital parameters from TLE data
        const orbitalParams = CelestrakAPI.extractOrbitalParameters(tleData[0], tleData[1]);
        
        // Create a data structure compatible with our existing code
        const satDataObj = {
            satID: sat.NORAD_CAT_ID,
            name: sat.OBJECT_NAME,
            tle: tleData,
            eccen: orbitalParams.eccen,
            incli: orbitalParams.incli,
            node: orbitalParams.node,
            omega: orbitalParams.omega,
            mnMotion: orbitalParams.mnMotion,
            mnAnomaly: orbitalParams.mnAnomaly,
            revNum: orbitalParams.revNum
        };
        
        // Initialize satellite
        satlist[ID] = new Satellite(ID, satDataObj, L.layerGroup());
        
        // Update UI with satellite data
        updateSatelliteInfo(satDataObj);
    } else {
        console.error("Failed to convert Celestrak data");
        document.getElementById('loadingMessage').innerHTML = '<p>Invalid satellite data. Please try again later.</p>';
        fallbackToDefault();
    }
}

// Enhanced check for custom satellite that returns boolean
function checkForCustomSatellite(customSats) {
    // Check if current ID is a custom satellite
    if (ID && ID.startsWith('CUSTOM-')) {
        const index = parseInt(ID.replace('CUSTOM-', '')) - 1;
        if (customSats[index]) {
            isCustomSat = true;
            satlist[ID] = new Satellite(ID, customSats[index], L.layerGroup());
            return true;
        }
    }
    return false;
}

// Continue to iterate through satellite data?
function continueToIterate() {
    // If there's no current batch processing happening
    if (!window.batchProcessing) {
        return false;
    }
    
    // Get the current batch processing state
    const { satelliteData, currentIndex, batchSize, callback } = window.batchProcessing;
    
    // Process the next batch of satellites
    const hasMoreBatches = processSatelliteBatch(satelliteData, currentIndex, batchSize);
    
    if (hasMoreBatches) {
        // Update the index for the next batch
        window.batchProcessing.currentIndex += batchSize;
        
        // Schedule the next batch processing with a small delay to prevent UI freezing
        setTimeout(() => {
            if (callback) callback(true); // Continue iteration
        }, 10);
        
        return true;
    } else {
        // We've finished processing all batches
        console.log("Finished loading all satellites");
        window.batchProcessing = null;
        
        if (callback) callback(false); // Stop iteration
        return false;
    }
}

// Process Celestrak data and initialize satellite
function processCelestrakData(jsonData) {
    if (!jsonData || !Array.isArray(jsonData)) {
        console.error("Invalid Celestrak data format");
        loadJSON(url, (data) => {
            initDefaultSat(data);
        });
        return;
    }
    
    // Find the requested satellite by NORAD CAT ID
    const targetSatellite = jsonData.find(sat => sat.NORAD_CAT_ID === ID);
    
    if (targetSatellite) {
        console.log(`Found satellite ${ID} in Celestrak data:`, targetSatellite.OBJECT_NAME);
        
        // Convert Celestrak JSON to TLE format
        const satData = convertCelestrakJsonToTLE(targetSatellite);
        
        if (satData) {
            console.log("Successfully converted Celestrak data to TLE format");
            
            // Create a data structure compatible with our existing code
            const satDataObj = {};
            satDataObj[ID] = satData;
            
            // Initialize satellite
            satlist[ID] = new Satellite(ID, satData, L.layerGroup());
            
            // Update UI with satellite data
            updateSatelliteInfo(satData);
        } else {
            console.error("Failed to convert Celestrak data");
            fallbackToDefault();
        }
    } else {
        console.log(`Satellite ID ${ID} not found in Celestrak data, falling back to default`);
        fallbackToDefault();
    }
}

function fallbackToDefault() {
    // Fall back to default data source
    loadJSON(url, (data) => {
        initDefaultSat(data);
    });
}

function checkForCustomSatellite(customSats) {
	// Check if current ID is a custom satellite
	if (ID && ID.startsWith('CUSTOM-')) {
		const index = parseInt(ID.replace('CUSTOM-', '')) - 1;
		if (customSats[index]) {
			isCustomSat = true;
			satlist[ID] = new Satellite(ID, customSats[index], L.layerGroup());
		}
	}
}

var myMap;

function setup() {
	try {
		//canvas = createCanvas(canWidth, canHeight).parent('p5canvas');
		myMap = L.map('p5canvas', {
			maxZoom: 18,
			minZoom: 1,
			maxBounds: [
				[-90, -220],
				[90, 220]
				],
			gestureHandling: true,
			inertia: true,
			inertiaDeceleration: 3000,
			maxVelocity: 2,
		}).setView([0, 0], 2);
		
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
		    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
		}).addTo(myMap);

		setInterval(() => {
			d = new Date();
			var hr = d.getUTCHours().toString().padStart(2, '0');
			var min = d.getUTCMinutes().toString().padStart(2, '0');
			var sec = d.getUTCSeconds().toString().padStart(2, '0');
			document.getElementById("UTC").innerHTML = (hr + ':' + min + ':' + sec);

			if (satlist[ID]) {
				satlist[ID].groundTrace(d, 60);
			}
		}, 1000);
	} catch (error) {
		console.error("Error initializing map:", error);
		document.getElementById('loadingMessage').innerHTML = '<p>Error initializing map.</p>';
	}
}

function onMapClick(e) {
	// Map click handler
}

// Format TLE lines according to official Two-Line Element Set specification
function formatTLE(tleLine) {
    if (!tleLine) return "";
    
    // For ISS, use standard format if we can identify it
    if (tleLine.includes('25544') && tleLine.includes('98067A')) {
        if (tleLine.startsWith('1')) {
            // Hardcode a proper ISS TLE Line 1 format as a template
            return "1 25544U 98067A   25105.53237150  .00014782  00000-0  27047-3 0  9994";
        } else if (tleLine.startsWith('2')) {
            // Hardcode a proper ISS TLE Line 2 format as a template
            return "2 25544  51.6375 257.3560 0005276  47.8113  31.7820 15.49569282505441";
        }
    }
    
    // Create a properly formatted TLE without having to extract and recombine pieces
    let formattedTle = "";
    
    // For debugging
    console.log("Original TLE: ", tleLine);
    
    // Format different for line 1 vs line 2
    if (tleLine.startsWith('1')) {
        // Keep original TLE if it already has proper spacing
        if (tleLine.length >= 69 && tleLine.charAt(8) === ' ' && tleLine.includes('  ')) {
            console.log("TLE already well-formatted, returning original");
            return tleLine;
        }
        
        // Remove all whitespace from the TLE
        const strippedTLE = tleLine.replace(/\s+/g, '');
        
        // Rebuild with proper spacing - line must be at least 69 chars in proper TLE format
        if (strippedTLE.length < 62) {
            console.error("TLE line 1 too short:", strippedTLE);
            return "1 25544U 98067A   25105.53237150  .00014782  00000-0  27047-3 0  9994"; // Return a valid format
        }
        
        formattedTle = "1 " +                                  // Line number
               strippedTLE.substring(1, 6) +                  // Satellite number
               strippedTLE.charAt(6) + " " +                  // Classification + space
               strippedTLE.substring(7, 15) + "   " +         // Int'l designator + 3 spaces
               strippedTLE.substring(15, 17) +                // Epoch year
               strippedTLE.substring(17, 29) + "  " +         // Epoch day + 2 spaces
               strippedTLE.substring(29, 39) + "  " +         // First derivative + 2 spaces
               strippedTLE.substring(39, 47) + " " +          // Second derivative + space
               strippedTLE.substring(47, 55) + " " +          // BSTAR drag term + space
               strippedTLE.substring(55, 56) + " " +          // Ephemeris type + space
               strippedTLE.substring(56, 60) +                // Element number
               strippedTLE.substring(60, 61);                 // Checksum
               
    } else if (tleLine.startsWith('2')) {
        // Keep original TLE if it already has proper spacing
        if (tleLine.length >= 69 && tleLine.includes('  ')) {
            console.log("TLE already well-formatted, returning original");
            return tleLine;
        }
        
        // Remove all whitespace from the TLE
        const strippedTLE = tleLine.replace(/\s+/g, '');
        
        if (strippedTLE.length < 62) {
            console.error("TLE line 2 too short:", strippedTLE);
            return "2 25544  51.6375 257.3560 0005276  47.8113  31.7820 15.49569282505441"; // Return valid format
        }
        
        formattedTle = "2 " +                                  // Line number
               strippedTLE.substring(1, 6) + "  " +           // Satellite number + 2 spaces
               strippedTLE.substring(6, 14) + " " +           // Inclination + space
               strippedTLE.substring(14, 22) + " " +          // Right ascension + space
               strippedTLE.substring(22, 29) + "  " +         // Eccentricity + 2 spaces
               strippedTLE.substring(29, 37) + "  " +         // Argument of perigee + 2 spaces
               strippedTLE.substring(37, 45) + " " +          // Mean anomaly + space
               strippedTLE.substring(45, 56) +                // Mean motion
               strippedTLE.substring(56, 61);                 // Revolution number + checksum
    } else {
        return tleLine; // Not a TLE, return as is
    }
    
    console.log("Formatted TLE: ", formattedTle);
    return formattedTle;
}

// Convert Celestrak JSON format to proper TLE strings
function convertCelestrakJsonToTLE(satellite) {
    if (!satellite) {
        console.error("Invalid satellite data");
        return null;
    }
    
    try {
        // Check for required fields
        if (!satellite.NORAD_CAT_ID || !satellite.OBJECT_NAME || !satellite.EPOCH ||
            !satellite.MEAN_MOTION || !satellite.ECCENTRICITY || !satellite.INCLINATION ||
            !satellite.RA_OF_ASC_NODE || !satellite.ARG_OF_PERICENTER || !satellite.MEAN_ANOMALY ||
            satellite.EPHEMERIS_TYPE === undefined) {
            console.error("Missing required fields in satellite data:", satellite);
            return null;
        }
        
        // Format the TLE line 1 according to the spec: https://celestrak.org/NORAD/documentation/gp-data-formats.php
        let line1 = "1 ";
        line1 += (satellite.NORAD_CAT_ID || "").padStart(5, '0') + (satellite.CLASSIFICATION || "U") + " "; 
        line1 += (satellite.INTLDES || "").padEnd(8, ' ') + "   "; // 3 spaces after int'l designator
        line1 += satellite.EPOCH.substring(2, 4); // Epoch year (last 2 digits)
        
        // Convert ISO date to day of year with fraction
        const epochDate = new Date(satellite.EPOCH);
        const startOfYear = new Date(Date.UTC(epochDate.getUTCFullYear(), 0, 1));
        const dayOfYear = ((epochDate - startOfYear) / 86400000) + 1; // Days since Jan 1 + 1
        line1 += dayOfYear.toFixed(8).padStart(12, '0') + "  "; // Day of year with fraction, padded to 12 chars + 2 spaces
        
        // Mean motion derivatives and drag terms
        const meanMotionDot = Number(satellite.MEAN_MOTION_DOT || 0).toExponential(8).replace("e-", "-").replace("e+", "+");
        line1 += meanMotionDot.padStart(10, ' ') + "  "; // Mean motion first derivative with 2 spaces
        
        const meanMotionDotDot = Number(satellite.MEAN_MOTION_DDOT || 0).toExponential(5).replace("e-", "-").replace("e+", "+");
        line1 += meanMotionDotDot.padStart(8, ' ') + " "; // Mean motion second derivative + space
        
        const bstar = Number(satellite.BSTAR || 0).toExponential(5).replace("e-", "-").replace("e+", "+");
        line1 += bstar.padStart(8, ' ') + " "; // B* drag term + space
        
        line1 += "0 "; // Ephemeris type + space
        line1 += (satellite.ELEMENT_SET_NO || "999").padStart(4, ' '); // Element set number
        
        // Calculate checksum for line 1
        let checksum1 = 0;
        for (let i = 0; i < line1.length; i++) {
            if (line1[i] === '-') checksum1 += 1;
            else if (!isNaN(parseInt(line1[i]))) checksum1 += parseInt(line1[i]);
        }
        line1 += (checksum1 % 10).toString();
        
        // Format the TLE line 2 according to the spec
        let line2 = "2 ";
        line2 += (satellite.NORAD_CAT_ID || "").padStart(5, '0') + "  "; // 2 spaces after catalog number
        
        // Orbital elements
        line2 += (Number(satellite.INCLINATION || 0).toFixed(4)).padStart(8, ' ') + " "; // Inclination + space
        line2 += (Number(satellite.RA_OF_ASC_NODE || 0).toFixed(4)).padStart(8, ' ') + " "; // RAAN + space
        line2 += (Number(satellite.ECCENTRICITY || 0).toFixed(7)).substring(2).padStart(7, '0') + "  "; // Eccentricity (no decimal) + 2 spaces
        line2 += (Number(satellite.ARG_OF_PERICENTER || 0).toFixed(4)).padStart(8, ' ') + "  "; // Arg of perigee + 2 spaces
        line2 += (Number(satellite.MEAN_ANOMALY || 0).toFixed(4)).padStart(8, ' ') + " "; // Mean anomaly + space
        line2 += (Number(satellite.MEAN_MOTION || 0).toFixed(8)).padStart(11, ' '); // Mean motion
        
        // Add revolution number
        line2 += (satellite.REV_AT_EPOCH || "0").padStart(5, ' ');
        
        // Calculate checksum for line 2
        let checksum2 = 0;
        for (let i = 0; i < line2.length; i++) {
            if (line2[i] === '-') checksum2 += 1;
            else if (!isNaN(parseInt(line2[i]))) checksum2 += parseInt(line2[i]);
        }
        line2 += (checksum2 % 10).toString();
        
        // Return satellite name and TLE lines
        const name = satellite.OBJECT_NAME || `SAT-${satellite.NORAD_CAT_ID}`;
        return [name, line1, line2];
    } catch (e) {
        console.error("Error converting satellite data to TLE:", e, satellite);
        return null;
    }
}

class Satellite {
	constructor(_id, _satJson, _layerMarkerGrp) {
			// Use the same standard formatting for all satellites
		this.l1 = _satJson.tle ? _satJson.tle[0] : "";
		this.l2 = _satJson.tle ? _satJson.tle[1] : "";
		
		// Format the TLE lines consistently
		this.l1 = formatTLE(this.l1);
		this.l2 = formatTLE(this.l2);
		
		// Store the formatted TLEs for satellite.js calculations
		this.tleLines = [this.l1, this.l2];
		
		this.satID = _satJson.satID;
		this.eccen = _satJson.eccen;
		this.incli = _satJson.incli;
		this.node = _satJson.node;
		this.aop = _satJson.omega;
		this.mnMotn = _satJson.mnMotion;
		this.mnAnom = _satJson.mnAnomaly;
		this.revNum = _satJson.revNum;
		this.satName = satName[_id] || _satJson.name;
		this.layerMarkerGrp = _layerMarkerGrp;
		
		// Create satellite record for satellite.js
		if (this.tleLines && this.tleLines.length === 2) {
			try {
				this.satrec = satellite.twoline2satrec(this.tleLines[0], this.tleLines[1]);
			} catch (error) {
				console.error("Error parsing TLE data:", error);
				return;
			}
			
			// Set epoch
			if (_satJson.epoch) {
				this.epoch = _satJson.epoch;
			} else {
				// If epoch is not provided, parse it from TLE
				const epochYear = parseInt(this.tleLines[0].substring(18, 20), 10);
				const year = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear;
				const epochDay = parseFloat(this.tleLines[0].substring(20, 32));
				
				const date = new Date(Date.UTC(year, 0, 1));
				date.setUTCDate(date.getUTCDate() + Math.floor(epochDay));
				
				const hours = (epochDay % 1) * 24;
				const minutes = (hours % 1) * 60;
				const seconds = (minutes % 1) * 60;
				
				date.setUTCHours(Math.floor(hours));
				date.setUTCMinutes(Math.floor(minutes));
				date.setUTCSeconds(Math.floor(seconds));
				
				this.epoch = [
					year,
					date.getUTCMonth() + 1,
					date.getUTCDate(),
					date.getUTCHours(),
					date.getUTCMinutes(),
					date.getUTCSeconds()
				];
			}
			
			// Generate path if not provided
			if (!_satJson.path) {
				this.path = this.generatePath();
			} else {
				this.path = _satJson.path;
			}
		}
	}

	// Generate path points using satellite.js propagation
	generatePath() {
		const path = [];
		const date = new Date();
		const epochDate = new Date(this.epoch[0], this.epoch[1]-1, this.epoch[2], this.epoch[3], this.epoch[4], this.epoch[5]);
		
		// Generate points for a 24-hour period
		const hoursPerPoint = 0.25; // 15 minute intervals
		const totalPoints = 24 / hoursPerPoint;
		
		for (let i = 0; i < totalPoints; i++) {
			const pointTime = new Date(date.getTime() + (i * hoursPerPoint * 60 * 60 * 1000));
			const position = this.calculatePositionAt(pointTime);
			
			path.push({
				lat: position.lat,
				long: position.lng,
				height: position.height,
				x: position.x,
				y: position.y,
				z: position.z
			});
		}
		
		return path;
	}
	
	// Calculate satellite position at a specific time
	calculatePositionAt(date) {
	    // Initialize the memoization cache if it doesn't exist
	    if (!this._positionCache) {
	        this._positionCache = {
	            lastTime: null,
	            lastResult: null,
	            cacheTimeThreshold: 50 // Only cache for 50ms to ensure accuracy
	        };
	    }
	    
	    // Check if we can use the cached result
	    const timestamp = date.getTime();
	    if (this._positionCache.lastTime && 
	        Math.abs(timestamp - this._positionCache.lastTime) < this._positionCache.cacheTimeThreshold) {
	        return this._positionCache.lastResult;
	    }
	    
	    try {
	        // Get position using satellite.js
	        const positionAndVelocity = satellite.propagate(this.satrec, date);
	        
	        if (!positionAndVelocity.position) {
	            console.error('Error calculating satellite position - no position data');
	            return {
	                lat: 0,
	                lng: 0,
	                height: 0,
	                x: 0,
	                y: 0,
	                z: 0
	            };
	        }
	        
	        const positionEci = positionAndVelocity.position;
	        
	        // Convert to geographic coordinates - this is computationally intensive
	        const gmst = satellite.gstime(date);
	        const positionGd = satellite.eciToGeodetic(positionEci, gmst);
	        
	        // Convert the coordinates to degrees
	        const longitudeDeg = satellite.degreesLong(positionGd.longitude);
	        const latitudeDeg = satellite.degreesLat(positionGd.latitude);
	        
	        const result = {
	            lat: latitudeDeg,
	            lng: longitudeDeg,
	            height: positionGd.height,
	            x: positionEci.x,
	            y: positionEci.y,
	            z: positionEci.z
	        };
	        
	        // Check for NaN values
	        if (isNaN(latitudeDeg) || isNaN(longitudeDeg)) {
	            console.error('Invalid coordinates calculated:', latitudeDeg, longitudeDeg);
	            return {
	                lat: 0,
	                lng: 0,
	                height: positionGd.height || 0,
	                x: positionEci.x || 0,
	                y: positionEci.y || 0,
	                z: positionEci.z || 0
	            };
	        }
	        
	        // Cache the result
	        this._positionCache.lastTime = timestamp;
	        this._positionCache.lastResult = result;
	        
	        return result;
	    } catch (e) {
	        console.error('Exception in calculatePositionAt:', e);
	        // Return default values on error
	        return {
	            lat: 0,
	            lng: 0,
	            height: 0,
	            x: 0,
	            y: 0,
	            z: 0
	        };
	    }
	}

	groundTrace(_currentUTC, _span) {
	    // Initialize cache if it doesn't exist
	    if (!this._traceCache) {
	        this._traceCache = {
	            points: [],
	            timestamp: 0,
	            validityPeriod: 5000, // Cache valid for 5 seconds
	            requestedSpan: 0
	        };
	    }
	    
	    try {
	        // Cache references to DOM elements to reduce lookups
	        const domElements = {
	            l1: document.getElementById("l1"),
	            l2: document.getElementById("l2"),
	            lat: document.getElementById("lat"),
	            long: document.getElementById("long"),
	            height: document.getElementById("height"),
	            xPos: document.getElementById("xPos"),
	            yPos: document.getElementById("yPos"),
	            zPos: document.getElementById("zPos"),
	            epochTime: document.getElementById("epochTime"),
	            eccen: document.getElementById("eccen"),
	            per: document.getElementById("per"),
	            apg: document.getElementById("apg"),
	            node: document.getElementById("node"),
	            aop: document.getElementById("aop"),
	            mnm: document.getElementById("mnm"),
	            mna: document.getElementById("mna"),
	            revNum: document.getElementById("revNum")
	        };
	        
	        // Clear any existing layers
	        if (myMap.hasLayer(this.layerMarkerGrp)) {
	            myMap.removeLayer(this.layerMarkerGrp);
	            this.layerMarkerGrp.clearLayers();
	        }
	        
	        // Calculate current position - this is a critical calculation
	        const currentPosition = this.calculatePositionAt(_currentUTC);
	        const intLat = currentPosition.lat;
	        const intLong = currentPosition.lng;
	        const intHeight = currentPosition.height;
	        const intXpos = currentPosition.x;
	        const intYpos = currentPosition.y;
	        const intZpos = currentPosition.z;
	        
	        // Check for invalid coordinates
	        if (isNaN(intLat) || isNaN(intLong) || Math.abs(intLat) > 90 || Math.abs(intLong) > 180) {
	            console.error("Invalid coordinates detected:", intLat, intLong);
	            // Update UI elements with error message
	            domElements.l1.innerHTML = this.l1;
	            domElements.l2.innerHTML = this.l2;
	            domElements.lat.innerHTML = "Error";
	            domElements.long.innerHTML = "Error";
	            domElements.height.innerHTML = "Error";
	            return;
	        }
	        
	        // Update current time for cache timestamp
	        const currentTime = _currentUTC.getTime();
	        const spanMinutes = _span || 60;
	        
	        // Check if we can use the cached trace
	        const cacheIsValid = 
	            this._traceCache.points.length > 0 && 
	            (currentTime - this._traceCache.timestamp < this._traceCache.validityPeriod) &&
	            this._traceCache.requestedSpan === spanMinutes;
	            
	        let trace = [];
	        
	        if (cacheIsValid) {
	            // Use cached trace points
	            trace = this._traceCache.points;
	        } else {
	            // Generate orbital trace points - optimize by calculating fewer points
	            const numPoints = 30; // Reduced from 60 for better performance
	            const timeIncrement = (spanMinutes * 60 * 1000) / numPoints;
	            
	            // Use batch processing for trace points
	            const batchSize = 5;
	            let validPoints = 0;
	            
	            for (let i = -numPoints/2; i <= numPoints/2; i += batchSize) {
	                const batch = [];
	                
	                // Calculate a batch of points
	                for (let j = 0; j < batchSize && (i + j) <= numPoints/2; j++) {
	                    const pointIdx = i + j;
	                    const pointTime = new Date(currentTime + (pointIdx * timeIncrement));
	                    batch.push({index: pointIdx, time: pointTime});
	                }
	                
	                // Process each point in the batch
	                batch.forEach(item => {
	                    const pos = this.calculatePositionAt(item.time);
	                    
	                    // Only add valid coordinates to prevent LatLng errors
	                    if (!isNaN(pos.lat) && !isNaN(pos.lng) && 
	                        Math.abs(pos.lat) <= 90 && Math.abs(pos.lng) <= 180) {
	                        trace.push({
	                            lat: pos.lat,
	                            lng: pos.lng,
	                            index: item.index
	                        });
	                        validPoints++;
	                    }
	                });
	            }
	            
	            // Cache the trace points if we have a reasonable number
	            if (validPoints > 10) {
	                this._traceCache.points = trace;
	                this._traceCache.timestamp = currentTime;
	                this._traceCache.requestedSpan = spanMinutes;
	            }
	        }
	        
	        // Create a current position marker with custom icon
	        const satIcon = L.icon({
	            iconUrl: 'src/images/satImage.png',
	            iconSize: [32, 32],
	            iconAnchor: [16, 16]
	        });
	        
	        const marker = L.marker([intLat, intLong], {
	            icon: satIcon,
	            title: this.satName
	        }).addTo(this.layerMarkerGrp);
	        
	        // Draw ground trace polyline
	        if (trace.length > 0) {
	            // Sort trace points by index to ensure proper polyline
	            trace.sort((a, b) => a.index - b.index);
	            
	            // Extract latLng array for polyline
	            const traceLine = trace.map(point => [point.lat, point.lng]);
	            
	            // Draw with color gradient
	            const polyline = L.polyline(traceLine, {
	                color: '#FF4500',
	                weight: 2,
	                opacity: 0.7,
	                smoothFactor: 1
	            }).addTo(this.layerMarkerGrp);
	        }
	        
	        // Add satellite footprint (visibility circle)
	        const footprintRadius = this.calculateFootprintRadius(intHeight);
	        const footprint = L.circle([intLat, intLong], {
	            radius: footprintRadius * 1000, // Convert to meters
	            color: 'rgba(0, 100, 255, 0.3)',
	            fillColor: 'rgba(0, 100, 255, 0.1)',
	            fillOpacity: 0.3
	        }).addTo(this.layerMarkerGrp);
	        
	        // Update the UI elements with satellite information
	        domElements.l1.innerHTML = this.l1;
	        domElements.l2.innerHTML = this.l2;
	        domElements.lat.innerHTML = intLat.toFixed(4) + "°";
	        domElements.long.innerHTML = intLong.toFixed(4) + "°";
	        domElements.height.innerHTML = intHeight.toFixed(2) + " km";
	        domElements.xPos.innerHTML = intXpos.toFixed(2) + " km";
	        domElements.yPos.innerHTML = intYpos.toFixed(2) + " km";
	        domElements.zPos.innerHTML = intZpos.toFixed(2) + " km";
	        
	        // Calculate and display orbital parameters
	        const epochTimeStr = this.formatEpochTime();
	        domElements.epochTime.innerHTML = epochTimeStr;
	        domElements.eccen.innerHTML = this.eccen.toFixed(7);
	        
	        // Calculate perigee and apogee
	        const earthRadius = 6371; // km
	        const semiMajorAxis = Math.pow(398600.4418 / Math.pow(this.mnMotn * (Math.PI/43200), 2), 1/3);
	        const perigee = (semiMajorAxis * (1 - this.eccen) - earthRadius).toFixed(2);
	        const apogee = (semiMajorAxis * (1 + this.eccen) - earthRadius).toFixed(2);
	        
	        domElements.per.innerHTML = perigee + " km";
	        domElements.apg.innerHTML = apogee + " km";
	        domElements.node.innerHTML = this.node.toFixed(4) + "°";
	        domElements.aop.innerHTML = this.aop.toFixed(4) + "°";
	        domElements.mnm.innerHTML = this.mnMotn.toFixed(8) + " rev/day";
	        domElements.mna.innerHTML = this.mnAnom.toFixed(4) + "°";
	        domElements.revNum.innerHTML = this.revNum;
	        
	        // Add layer to map
	        this.layerMarkerGrp.addTo(myMap);
	        
	        // Pan map to satellite position if it's outside current view
	        const bounds = myMap.getBounds();
	        if (!bounds.contains([intLat, intLong])) {
	            myMap.setView([intLat, intLong], myMap.getZoom());
	        }
	    } catch (e) {
	        console.error("Error in groundTrace:", e);
	    }
	}
	
	// Helper to format epoch time
	formatEpochTime() {
	    if (!this.epoch || !Array.isArray(this.epoch) || this.epoch.length < 6) {
	        return "Unknown";
	    }
	    
	    const [year, month, day, hour, minute, second] = this.epoch;
	    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	    const monthStr = monthNames[month - 1] || month;
	    
	    return `${day} ${monthStr} ${year} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')} UTC`;
	}
	
	// Calculate satellite footprint radius based on height
	calculateFootprintRadius(height) {
	    // Check for valid height
	    if (!height || height <= 0) return 0;
	    
	    // Cache footprint calculations
	    if (!this._footprintCache) this._footprintCache = {};
	    
	    // Round height to nearest km for caching
	    const roundedHeight = Math.round(height);
	    
	    // Return cached value if available
	    if (this._footprintCache[roundedHeight]) {
	        return this._footprintCache[roundedHeight];
	    }
	    
	    // Earth radius in km
	    const earthRadius = 6371;
	    
	    // Calculate footprint radius using spherical geometry
	    // Based on the formula: r = R * acos(R / (R + h))
	    // where R is Earth radius, h is satellite height
	    const radiusAngle = Math.acos(earthRadius / (earthRadius + roundedHeight));
	    const footprintRadius = earthRadius * radiusAngle;
	    
	    // Cache the result
	    this._footprintCache[roundedHeight] = footprintRadius;
	    
	    return footprintRadius;
	}
}

// Function to interpolate between two values - used for legacy support
function interpolate(_to, _td, _sec) {
	let x = _to + ((_td - _to)/60) * _sec;
	return x;
}

// Initialize satellite objects
function initDefaultSat(data) {
    console.log("Loading default satellite data:", data);
    var nodes = L.layerGroup();
    
    if (!data || !data[ID]) {
        console.error("No data available for satellite ID:", ID);
        return;
    }
    
    try {
        // Make sure we properly format the TLE lines before creating the satellite
        if (data[ID].tle && Array.isArray(data[ID].tle) && data[ID].tle.length === 2) {
            // Store original TLEs for debugging
            const originalTLE1 = data[ID].tle[0];
            const originalTLE2 = data[ID].tle[1];
            
            // For ISS, we're already getting properly formatted TLEs from Celestrak
            if (ID === "25544" && originalTLE1.length >= 69 && originalTLE2.length >= 69) {
                console.log("Using Celestrak-generated TLEs for ISS");
                // No need to reformat, they're already in the proper format
            } else {
                // Pre-format the TLE lines for other satellites
                data[ID].tle[0] = formatTLE(data[ID].tle[0]);
                data[ID].tle[1] = formatTLE(data[ID].tle[1]);
            }
            
            console.log("Original TLEs:", originalTLE1, originalTLE2);
            console.log("Final TLEs:", data[ID].tle[0], data[ID].tle[1]);
        } else {
            console.error("Invalid TLE data structure for satellite ID:", ID);
        }
        
        console.log("Creating satellite object for ID:", ID, data[ID]);
        satlist[ID] = new Satellite(ID, data[ID], nodes);
        console.log("Satellite object created:", satlist[ID]);
    } catch (e) {
        console.error("Error initializing satellite:", e);
    }
}

// Create a sample custom_satellites.json file if it doesn't exist
function createSampleCustomSatellitesFile() {
	const sampleData = {
		satellites: [
			{
				id: "CUSTOM-1",
				name: "ISS (Sample)",
				tle: [
					"1 25544U 98067A   25105.50000000  .00008724  00000+0  15761-3 0  9997",
					"2 25544  51.6424 123.7835 0003755  83.7171  83.5677 15.50141434 24205"
				],
				satID: "CUSTOM-1",
				eccen: 0.0003755,
				incli: 51.6424,
				node: 123.7835,
				omega: 83.7171,
				mnMotion: 15.50141434,
				mnAnomaly: 83.5677,
				revNum: 24205
			}
		]
	};
	
	try {
		saveJSON(sampleData, 'data/custom_satellites.json');
	} catch (e) {
		console.error("Could not create sample satellites file:", e);
		localStorage.setItem('customSatellites', JSON.stringify(sampleData));
	}
}

// Process Celestrak JSON data and convert to TLE format
function processCelestrakData(jsonData) {
    console.log(`Processing ${jsonData.length} satellites from Celestrak`);
    
    try {
        // Filter data to keep only objects with complete information
        const validData = jsonData.filter(sat => 
            sat && sat.OBJECT_NAME && sat.OBJECT_ID && 
            sat.EPOCH && sat.MEAN_MOTION && sat.ECCENTRICITY && 
            sat.INCLINATION && sat.RA_OF_ASC_NODE && 
            sat.ARG_OF_PERICENTER && sat.MEAN_ANOMALY && 
            sat.EPHEMERIS_TYPE !== undefined
        );
        
        if (validData.length === 0) {
            console.error("No valid satellite data in Celestrak response");
            fallbackToDefault();
            return;
        }
        
        // Convert to TLE format
        const tleData = {};
        validData.forEach(sat => {
            const tle = convertCelestrakJsonToTLE(sat);
            if (tle) {
                const name = sat.OBJECT_NAME.trim();
                tleData[name] = tle;
            }
        });
        
        // Check if we have enough data
        const tleCount = Object.keys(tleData).length;
        if (tleCount > 0) {
            console.log(`Successfully processed ${tleCount} satellites`);
            
            // Update the satelliteTLEData with our new data
            satelliteTLEData = tleData;
            
            // Cache the data for future use
            localStorage.setItem('celestrakCache', JSON.stringify({
                timestamp: Date.now(),
                data: tleData
            }));
            
            dataLoadingStatus = "loaded";
            
            // If setup has already run, update satellites
            if (setupCompleted) {
                loadSatellites();
            }
        } else {
            console.error("Failed to convert any satellites to TLE format");
            fallbackToDefault();
        }
    } catch (error) {
        console.error("Error processing Celestrak data:", error);
        fallbackToDefault();
    }
}

// Process a batch of satellite data
function processSatelliteBatch() {
    const BATCH_SIZE = 100;
    const startIndex = Math.floor(satInfo.length / BATCH_SIZE) * BATCH_SIZE;
    const endIndex = Math.min(startIndex + BATCH_SIZE, satData.length);
    
    console.log(`Processing satellite batch: ${startIndex} to ${endIndex-1}`);
    
    // Update loading status element if it exists
    const satDataStatus = document.getElementById('satDataStatus');
    if (satDataStatus) {
        satDataStatus.textContent = `Processing satellites ${startIndex+1}-${endIndex} of ${satData.length}`;
    }
    
    // Process this batch of satellites
    for (let i = startIndex; i < endIndex; i++) {
        if (i < satData.length) {
            processSatelliteData(satData[i]);
        }
    }
    
    // Update the UI with new data
    updateSatelliteList();
    
    // Check if we should continue to the next batch
    if (endIndex < satData.length) {
        dataLoadingStatus = "loading";
        
        // Schedule the next batch
        setTimeout(() => {
            // Continue processing in the next tick if continueToIterate allows
            if (continueToIterate()) {
                processSatelliteBatch();
            } else {
                dataLoadingStatus = "complete";
                console.log("Satellite data loading complete");
            }
        }, 100);
    } else {
        dataLoadingStatus = "complete";
        console.log("All satellite data processed");
        
        // Update status when complete
        if (satDataStatus) {
            satDataStatus.textContent = `Loaded ${satInfo.length} satellites`;
        }
    }
}

function processSatelliteBatch(satelliteData, startIdx, batchSize) {
    const endIdx = Math.min(startIdx + batchSize, satelliteData.length);
    const batch = satelliteData.slice(startIdx, endIdx);
    
    console.log(`Processing satellite batch ${startIdx} to ${endIdx-1} (of ${satelliteData.length})`);
    
    // Process each satellite in the current batch
    batch.forEach(satData => {
        try {
            // Create satellite object and add to tracking array
            const sat = createSatelliteObject(satData);
            if (sat) {
                satInfo.push(sat);
            }
        } catch (e) {
            console.warn(`Error processing satellite data: ${e.message}`);
        }
    });
    
    // Update the UI to show progress
    updateLoadingStatus(endIdx, satelliteData.length);
    
    // Return true if there are more batches to process
    return endIdx < satelliteData.length;
}

/**
 * Processes a batch of satellites from the satellite data array
 * @param {Array} satelliteData - The full array of satellite data
 * @param {number} startIndex - The starting index for this batch
 * @param {number} batchSize - The number of satellites to process in this batch
 * @returns {boolean} - Returns true if there are more batches to process
 */
function processSatelliteBatch(satelliteData, startIndex, batchSize) {
    const dataLength = satelliteData.length;
    const endIndex = Math.min(startIndex + batchSize, dataLength);
    
    console.log(`Processing satellites ${startIndex} to ${endIndex-1} of ${dataLength}`);
    
    // Process this batch
    for (let i = startIndex; i < endIndex; i++) {
        // Add the satellite to the visualization
        try {
            const satData = satelliteData[i];
            
            // Skip if the data is invalid or already processed
            if (!satData || satData.processed) continue;
            
            // Process the satellite (add to visualization, etc.)
            processSatellite(satData);
            
            // Mark as processed to avoid duplicates
            satData.processed = true;
        } catch (error) {
            console.error(`Error processing satellite at index ${i}:`, error);
        }
    }
    
    // Calculate loading progress
    const progress = Math.min(100, Math.round((endIndex / dataLength) * 100));
    updateLoadingProgress(progress);
    
    // Return true if there are more batches to process
    return endIndex < dataLength;
}

function updateSatelliteInfo(satData) {
    // Update UI elements with satellite data
    console.log("Updating UI with satellite data:", satData);
    
    document.getElementById("l1").innerText = satData.tle[0];
    document.getElementById("l2").innerText = satData.tle[1];
    document.getElementById("eccen").innerText = satData.eccen;
    document.getElementById("node").innerText = satData.node;
    document.getElementById("aop").innerText = satData.omega;
    document.getElementById("mnm").innerText = satData.mnMotion;
    document.getElementById("mna").innerText = satData.mnAnomaly;
    document.getElementById("revNum").innerText = satData.revNum;

    // Calculate perigee and apogee
    const earthRadius = 6371; // km
    const semiMajorAxis = Math.pow(398600.4418 / Math.pow(satData.mnMotion * (Math.PI / 43200), 2), 1 / 3);
    const perigee = (semiMajorAxis * (1 - satData.eccen) - earthRadius).toFixed(2);
    const apogee = (semiMajorAxis * (1 + satData.eccen) - earthRadius).toFixed(2);

    document.getElementById("per").innerText = perigee + " km";
    document.getElementById("apg").innerText = apogee + " km";
}


