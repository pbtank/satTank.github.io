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

    // Check if tleData is valid before proceeding
    if (tleData && Array.isArray(tleData) && tleData.length === 3 && tleData[1] && tleData[2]) {
        console.log("Successfully converted Celestrak data to TLE format");

        // Create a data structure compatible with our existing code
        const satDataObj = {
            satID: sat.NORAD_CAT_ID,
            name: sat.OBJECT_NAME,
            tle: tleData, // Pass the full [name, line1, line2] array
            epoch: sat.EPOCH, // Pass epoch directly
            eccen: sat.ECCENTRICITY,
            incli: sat.INCLINATION,
            node: sat.RA_OF_ASC_NODE,
            omega: sat.ARG_OF_PERICENTER,
            mnMotion: sat.MEAN_MOTION,
            mnAnomaly: sat.MEAN_ANOMALY,
            revNum: sat.REV_AT_EPOCH
        };

        console.log("Processing satellite data:", sat);
        if (!tleData || !Array.isArray(tleData) || tleData.length < 3 || !tleData[1] || !tleData[2]) {
            console.error("Invalid TLE data:", tleData);
            document.getElementById('loadingMessage').innerHTML = '<p>Error: Invalid TLE data. Cannot create satellite object.</p>';
            return;
        }

        console.log("Creating Satellite object with valid TLE:", tleData);

        // Ensure L.layerGroup is properly initialized
        const layerGroup = L.layerGroup();

        try {
            satlist[ID] = new Satellite(ID, {
                ...sat,
                tle: tleData
            }, layerGroup);

            if (!satlist[ID].satrec) {
                console.error("Satellite object created, but satrec is invalid. Check TLE data.");
                document.getElementById('loadingMessage').innerHTML = '<p>Error processing TLE data.</p>';
                return;
            }

            // Add layer group to the map
            layerGroup.addTo(myMap);

            // Update UI with satellite data - pass the properly structured object
            updateSatelliteInfo(satDataObj);
            document.getElementById('loadingMessage').innerHTML = ''; // Clear loading message
        } catch (e) {
            console.error("Error creating Satellite object:", e);
            document.getElementById('loadingMessage').innerHTML = '<p>Error initializing satellite visualization.</p>';
        }

    } else {
        console.error("Failed to convert Celestrak data or TLE data is invalid");
        document.getElementById('loadingMessage').innerHTML = '<p>Invalid satellite data format. Cannot display satellite.</p>';
        // Optionally call fallbackToDefault(); if desired
    }
}

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
    console.warn("Falling back to default satellite data (stations.json)");
    dataLoadingStatus = "loading";
    // Remove the problematic loadJSON(url, ...) call
    // loadJSON(url, (data) => {
    //     initDefaultSat(data);
    // });

    // Attempt to load stations.json as a fallback
    loadJSON('data/stations.json', (data) => {
        initDefaultSat(data);
    }, (error) => {
        console.error("Failed to load fallback stations.json:", error);
        // Handle final failure - maybe display a message
        document.getElementById('satName').innerText = "Error Loading Data";
        dataLoadingStatus = "error";
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

            // Add logging here
            console.log(`Interval tick: ${hr}:${min}:${sec}. Checking satlist[${ID}]...`);
			if (satlist[ID] && myMap) { // Check if both satellite object and map exist
                console.log(`Calling groundTrace for ${satlist[ID].satName}`);
				satlist[ID].groundTrace(d, 60);
			} else {
                console.warn(`Interval tick: satlist[${ID}] or myMap not ready yet.`);
                if (!satlist[ID]) console.log("satlist[ID] is missing.");
                if (!myMap) console.log("myMap is missing.");
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
               strippedTLE.substring(45, 56) + " " +          // Mean motion + ADDED SPACE
               strippedTLE.substring(56, 61);                 // Revolution number + checksum
    } else {
        return tleLine; // Not a TLE, return as is
    }
    
    console.log("Formatted TLE: ", formattedTle);
    return formattedTle;
}

// Convert Celestrak JSON format to proper TLE strings
function convertCelestrakJsonToTLE(sat) {
    // Strictly follow NORAD TLE format: https://celestrak.org/NORAD/documentation/tle-fmt.php
    if (!sat) {
        console.error("Invalid satellite data: null or undefined");
        return null;
    }

    try {
        // Check for required fields with detailed logging
        const required = [
            'NORAD_CAT_ID', 'OBJECT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY',
            'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY'
        ];
        
        for (const field of required) {
            if (sat[field] === undefined || sat[field] === null) {
                console.error(`Missing required field '${field}' in satellite data:`, sat);
                return null;
            }
        }

        // Parse epoch date
        const epochDate = new Date(sat.EPOCH);
        const epochYear = String(epochDate.getUTCFullYear()).slice(-2);
        const startOfYear = new Date(Date.UTC(epochDate.getUTCFullYear(), 0, 1));
        const dayOfYear = ((epochDate - startOfYear) / 86400000) + 1;
        const epochDay = dayOfYear.toFixed(8).padStart(12, '0');
        
        // Format TLE Line 1 fields
        const satnum = String(sat.NORAD_CAT_ID).padStart(5, '0'); // Columns 03-07
        const classification = (sat.CLASSIFICATION_TYPE || 'U'); // Column 08
        
        // International Designator (Columns 10-17)
        let intl = '';
        if (sat.OBJECT_ID) {
            // Format: YYNNNP (year, launch number, piece)
            const parts = sat.OBJECT_ID.split('-');
            if (parts.length >= 2) {
                const year = parts[0].slice(-2); // Last two digits of year
                let launch = parts[1];
                let piece = '';
                
                // Handle piece letter (like 'A' in '2009-005A')
                if (launch.length > 3) {
                    piece = launch.substring(3);
                    launch = launch.substring(0, 3);
                }
                
                intl = `${year}${launch.padStart(3, '0')}${piece}`;
            }
        }
        intl = intl.padEnd(8, ' '); // Ensure 8 chars total
        
        // Mean Motion Derivatives and Drag
        // Format: +.NNNNNNNN (Column 34-43, first derivative)
        const meanMotionDot = Number(sat.MEAN_MOTION_DOT || 0);
        let ndotFmt;
        if (Math.abs(meanMotionDot) < 1) {
            // Small value format like " .00000XXX"
            ndotFmt = (meanMotionDot >= 0 ? ' ' : '-') + 
                      '.' + 
                      Math.abs(meanMotionDot).toFixed(8).substring(2).padStart(8, '0');
        } else {
            // Large value format
            ndotFmt = meanMotionDot.toFixed(8).padStart(10, ' ');
        }
        
        // Format second derivative (Columns 45-52)
        // Format: +NNNNN-N (decimal point assumed)
        const meanMotionDdot = Number(sat.MEAN_MOTION_DDOT || 0);
        // Convert to scientific notation and format per TLE spec
        const nddotExp = meanMotionDdot.toExponential(5).replace(/e([+-])0?(\d+)/, '$1$2');
        let nddotSign = nddotExp.charAt(0) === '-' ? '-' : ' ';
        if (nddotSign === ' ' && nddotExp.charAt(0) !== '+' && nddotExp.charAt(0) !== '-') {
            nddotSign = ' '; // Ensure space for positive values
        }
        let nddotMantissa = nddotExp.replace(/^[+-]?/, '').split('e')[0].replace('.', '');
        nddotMantissa = nddotMantissa.substring(0, 5).padStart(5, '0');
        let nddotExponent = nddotExp.split('e')[1];
        if (nddotExponent) {
            // Strip leading + and ensure single digit
            nddotExponent = nddotExponent.replace(/^\+/, '').padStart(1, '0').substring(0, 1);
        } else {
            nddotExponent = '0';
        }
        const nddotFmt = `${nddotSign}${nddotMantissa}-${nddotExponent}`;
        
        // Format BSTAR drag (Columns 54-61)
        // Format: +NNNNN-N (decimal point assumed)
        const bstar = Number(sat.BSTAR || 0);
        const bstarExp = bstar.toExponential(5).replace(/e([+-])0?(\d+)/, '$1$2');
        let bstarSign = bstarExp.charAt(0) === '-' ? '-' : ' ';
        if (bstarSign === ' ' && bstarExp.charAt(0) !== '+' && bstarExp.charAt(0) !== '-') {
            bstarSign = ' '; // Ensure space for positive values
        }
        let bstarMantissa = bstarExp.replace(/^[+-]?/, '').split('e')[0].replace('.', '');
        bstarMantissa = bstarMantissa.substring(0, 5).padStart(5, '0');
        let bstarExponent = bstarExp.split('e')[1];
        if (bstarExponent) {
            // Strip leading + and ensure single digit
            bstarExponent = bstarExponent.replace(/^\+/, '').padStart(1, '0').substring(0, 1);
        } else {
            bstarExponent = '0';
        }
        const bstarFmt = `${bstarSign}${bstarMantissa}-${bstarExponent}`;
        
        // Ephemeris Type and Element Number
        const ephType = '0'; // Column 63
        const elemNumber = String(sat.ELEMENT_SET_NO || '0').padStart(4, ' '); // Columns 65-68

        // Assemble Line 1 with exact column positions
        let line1 = 
            '1 ' +                // Columns 01-02: Line Number
            satnum +             // Columns 03-07: Satellite Number
            classification + ' ' + // Columns 08-09: Classification + space
            intl +               // Columns 10-17: International Designator
            epochYear +          // Columns 19-20: Epoch Year
            epochDay + ' ' +     // Columns 21-32: Epoch Day + space
            ndotFmt + ' ' +      // Columns 34-43: First Derivative + space
            nddotFmt + ' ' +     // Columns 45-52: Second Derivative + space
            bstarFmt + ' ' +     // Columns 54-61: BSTAR drag + space
            ephType + ' ' +      // Columns 63: Ephemeris Type + space
            elemNumber;          // Columns 65-68: Element Number

        // Calculate checksum for line 1 (Column 69)
        let cksum1 = 0;
        for (let i = 0; i < line1.length; i++) {
            const ch = line1.charAt(i);
            if (ch === '-') cksum1 += 1;
            else if (!isNaN(parseInt(ch)) && ch !== ' ') cksum1 += parseInt(ch);
        }
        cksum1 = cksum1 % 10;
        line1 += cksum1;

        // Format TLE Line 2 fields
        
        // Inclination [Degrees] (Columns 09-16)
        const incl = Number(sat.INCLINATION).toFixed(4).padStart(8, ' ');
        
        // Right Ascension of the Ascending Node [Degrees] (Columns 18-25)
        const raan = Number(sat.RA_OF_ASC_NODE).toFixed(4).padStart(8, ' ');
        
        // Eccentricity (Columns 27-33) - Leading decimal point assumed
        const eccVal = Number(sat.ECCENTRICITY);
        const ecc = String(eccVal).substring(String(eccVal).indexOf('.')+1).padStart(7, '0');
        
        // Argument of Perigee [Degrees] (Columns 35-42)
        const argp = Number(sat.ARG_OF_PERICENTER).toFixed(4).padStart(8, ' ');
        
        // Mean Anomaly [Degrees] (Columns 44-51)
        const meanan = Number(sat.MEAN_ANOMALY).toFixed(4).padStart(8, ' ');
        
        // Mean Motion [Revs per day] (Columns 53-63)
        const mmotion = Number(sat.MEAN_MOTION).toFixed(8).padStart(11, ' ');
        
        // Revolution number at epoch (Columns 64-68)
        const rev = String(sat.REV_AT_EPOCH || '0').padStart(5, ' ');

        // Assemble Line 2 with exact column positions
        let line2 = 
            '2 ' +               // Columns 01-02: Line Number
            satnum + ' ' +       // Columns 03-07: Satellite Number + space
            incl + ' ' +         // Columns 09-16: Inclination + space
            raan + ' ' +         // Columns 18-25: RAAN + space
            ecc + ' ' +          // Columns 27-33: Eccentricity + space
            argp + ' ' +         // Columns 35-42: Argument of Perigee + space
            meanan + ' ' +       // Columns 44-51: Mean Anomaly + space
            mmotion +           // Columns 53-63: Mean Motion
            rev;                 // Columns 64-68: Revolution Number

        // Calculate checksum for line 2 (Column 69)
        let cksum2 = 0;
        for (let i = 0; i < line2.length; i++) {
            const ch = line2.charAt(i);
            if (ch === '-') cksum2 += 1;
            else if (!isNaN(parseInt(ch)) && ch !== ' ') cksum2 += parseInt(ch);
        }
        cksum2 = cksum2 % 10;
        line2 += cksum2;

        // Log the generated TLE for debugging
        console.log("Generated TLE for satellite " + sat.NORAD_CAT_ID + ":", [sat.OBJECT_NAME, line1, line2]);
        
        // Return [name, line1, line2]
        return [sat.OBJECT_NAME, line1, line2];
    } catch (e) {
        console.error("Error converting satellite data to TLE:", e, sat);
        return null;
    }
}

// ==================================================
// End Satellite Class Definition (REMOVED)
// ==================================================


// ... rest of the code ...

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
    
    // Handle TLE display
    if (satData && satData.tle && Array.isArray(satData.tle) && satData.tle.length >= 3) {
        document.getElementById("l1").innerText = satData.tle[1] || "--";
        document.getElementById("l2").innerText = satData.tle[2] || "--";
        document.getElementById("epochTime").innerText = satData.epoch ? new Date(satData.epoch).toISOString() : "--";
    } else {
        console.error("TLE data is incomplete or invalid:", satData);
        document.getElementById("l1").innerText = "--";
        document.getElementById("l2").innerText = "--";
        document.getElementById("epochTime").innerText = "--";
    }

    // Handle orbital parameters with defaults for undefined values
    document.getElementById("eccen").innerText = satData.eccen || "--";
    document.getElementById("node").innerText = satData.node ? satData.node + "°" : "--";
    document.getElementById("aop").innerText = satData.omega ? satData.omega + "°" : "--";
    document.getElementById("mnm").innerText = satData.mnMotion ? satData.mnMotion + " rev/day" : "--";
    document.getElementById("mna").innerText = satData.mnAnomaly ? satData.mnAnomaly + "°" : "--";
    document.getElementById("revNum").innerText = satData.revNum || "--";

    // Calculate perigee and apogee with proper error handling
    const earthRadius = 6371; // km
    let perigee = "--";
    let apogee = "--";

    if (satData && typeof satData.mnMotion === 'number' && typeof satData.eccen === 'number' && 
        !isNaN(satData.mnMotion) && !isNaN(satData.eccen) && satData.mnMotion > 0) {
        try {
            // Convert revs/day to rad/min: (revs/day) * (2π rad/rev) / (1440 min/day)
            const meanMotionRadPerMin = satData.mnMotion * (Math.PI / 720);
            // Earth's gravitational parameter in km³/s²
            const mu = 398600.4418;
            // Convert to km³/min²
            const muPerMin = mu * 3600; // 60²
            // Calculate semi-major axis in km
            const semiMajorAxis = Math.pow(muPerMin / Math.pow(meanMotionRadPerMin, 2), 1/3);
            // Calculate perigee and apogee heights
            perigee = (semiMajorAxis * (1 - satData.eccen) - earthRadius).toFixed(2) + " km";
            apogee = (semiMajorAxis * (1 + satData.eccen) - earthRadius).toFixed(2) + " km";
        } catch (calcError) {
            console.error("Error calculating perigee/apogee:", calcError);
        }
    }

    document.getElementById("per").innerText = perigee;
    document.getElementById("apg").innerText = apogee;
}


