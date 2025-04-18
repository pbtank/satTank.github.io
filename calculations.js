// calculations.js - Satellite position calculation module

/**
 * Calculate satellite position from TLE data for a specific time
 * @param {Object} satellite - The satellite TLE data in JSON format
 * @param {Date} time - The time for which to calculate the position
 * @returns {Object} The calculated position with lat, lng, alt, velocity, and time
 */
function calculateSatellitePosition(satellite, time) {
    // Check if satellite.js library is loaded
    if (!satellite || !window.satellite) {
        throw new Error('Satellite data or satellite.js library not available');
    }
    
    try {
        // Convert the TLE data to satellite.js format
        const tle = convertJsonToTle(satellite);
        
        // Parse the TLE
        const satrec = window.satellite.twoline2satrec(tle[0], tle[1]);
        
        // Get position at the given time
        const positionAndVelocity = window.satellite.propagate(satrec, time);
        
        // Convert position from km to m
        const positionEci = positionAndVelocity.position;
        const velocityEci = positionAndVelocity.velocity;
        
        // Calculate velocity magnitude (in km/s)
        const velocity = Math.sqrt(
            Math.pow(velocityEci.x, 2) + 
            Math.pow(velocityEci.y, 2) + 
            Math.pow(velocityEci.z, 2)
        );
        
        // Convert position from ECI to geodetic coordinates
        const gmst = window.satellite.gstime(time);
        const positionGd = window.satellite.eciToGeodetic(positionEci, gmst);
        
        // Convert radians to degrees
        const lat = window.satellite.degreesLat(positionGd.latitude);
        const lng = window.satellite.degreesLong(positionGd.longitude);
        const alt = positionGd.height;
        
        return {
            lat: lat,
            lng: lng,
            alt: alt,
            velocity: velocity,
            time: time
        };
    } catch (error) {
        console.error('Error calculating satellite position:', error);
        throw new Error(`Failed to calculate position: ${error.message}`);
    }
}

/**
 * Convert Celestrak JSON TLE to classic TLE format for satellite.js
 * @param {Object} satJson - The satellite TLE data in JSON format from Celestrak
 * @returns {Array} Array with two strings representing TLE lines
 */
function convertJsonToTle(satJson) {
    // Validate inputs
    if (!satJson) {
        throw new Error('No satellite data provided');
    }
    
    // Extract the TLE data from JSON
    const name = satJson.OBJECT_NAME || 'Unknown';
    const satnum = satJson.NORAD_CAT_ID || '00000';
    const classification = satJson.CLASSIFICATION || 'U';
    const intldes = satJson.OBJECT_ID || '00000A';
    const epochyr = satJson.EPOCH?.substring(2, 4) || '00';
    const epochday = satJson.EPOCH?.substring(5, 14).replace('-', '') || '000.00000000';
    const ndot = formatScientific(satJson.MEAN_MOTION_DOT || 0, 10);
    const nddot = formatScientific(satJson.MEAN_MOTION_DDOT || 0, 10);
    const bstar = formatScientific(satJson.BSTAR || 0, 10);
    const elnum = satJson.ELEMENT_SET_NO || 0;
    const inclo = formatFixed(satJson.INCLINATION || 0, 8, 4);
    const nodeo = formatFixed(satJson.RA_OF_ASC_NODE || 0, 8, 4);
    const ecco = formatDecimal(satJson.ECCENTRICITY || 0, 7);
    const argpo = formatFixed(satJson.ARG_OF_PERICENTER || 0, 8, 4);
    const mo = formatFixed(satJson.MEAN_ANOMALY || 0, 8, 4);
    const no = formatFixed(satJson.MEAN_MOTION || 0, 11, 8);
    const revnum = satJson.REV_AT_EPOCH || 0;
    
    // Format TLE line 1
    let line1 = '1 ';
    line1 += padLeft(satnum, 5) + classification + ' ';
    line1 += intldes.padEnd(8, ' ') + ' ';
    line1 += epochyr + epochday + ' ';
    line1 += ndot + ' ';
    line1 += nddot + ' ';
    line1 += bstar + ' ';
    line1 += '0 '; // Ephemeris type
    line1 += padLeft(elnum, 4);
    
    // Calculate checksum for line 1
    const checksum1 = calculateChecksum(line1);
    line1 += checksum1;
    
    // Format TLE line 2
    let line2 = '2 ';
    line2 += padLeft(satnum, 5) + ' ';
    line2 += inclo + ' ';
    line2 += nodeo + ' ';
    line2 += ecco + ' ';
    line2 += argpo + ' ';
    line2 += mo + ' ';
    line2 += no;
    line2 += padLeft(revnum, 5);
    
    // Calculate checksum for line 2
    const checksum2 = calculateChecksum(line2);
    line2 += checksum2;
    
    return [line1, line2];
}

/**
 * Format a number to scientific notation with specific width
 * @param {number} num - The number to format
 * @param {number} width - The total width of the formatted string
 * @returns {string} Formatted number
 */
function formatScientific(num, width) {
    const absNum = Math.abs(num);
    
    if (absNum === 0) {
        return ' 00000-0'.padStart(width, ' ');
    }
    
    // Convert to scientific notation with 5 digits
    const exp = Math.floor(Math.log10(absNum));
    const mantissa = absNum / Math.pow(10, exp);
    
    // Format as required for TLE (+/-)00000(+/-)0
    const sign = num < 0 ? '-' : ' ';
    const mantissaStr = Math.floor(mantissa * 100000).toString().padStart(5, '0');
    const expSign = exp < 0 ? '-' : '+';
    const expStr = Math.abs(exp).toString();
    
    return sign + mantissaStr + expSign + expStr.padStart(1, '0');
}

/**
 * Format a number with fixed width and decimal places
 * @param {number} num - The number to format
 * @param {number} width - The total width of the formatted string
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted number
 */
function formatFixed(num, width, decimals) {
    const factor = Math.pow(10, decimals);
    const numStr = String(Math.round(num * factor) / factor);
    
    // Split into integer and decimal parts
    const parts = numStr.split('.');
    const intPart = parts[0];
    let decPart = parts.length > 1 ? parts[1] : '';
    
    // Pad decimal part to required decimals
    decPart = decPart.padEnd(decimals, '0');
    
    // Combine and pad to required width
    return (intPart + '.' + decPart).padStart(width, ' ');
}

/**
 * Format a decimal with leading zeros for TLE format
 * @param {number} num - The decimal to format
 * @param {number} digits - Number of digits after decimal point
 * @returns {string} Formatted decimal
 */
function formatDecimal(num, digits) {
    // TLE format uses leading zeros without decimal point
    return '.' + (num * Math.pow(10, digits)).toFixed(0).padStart(digits, '0');
}

/**
 * Pad a string or number with spaces on the left
 * @param {string|number} str - The string or number to pad
 * @param {number} length - The desired length after padding
 * @returns {string} Padded string
 */
function padLeft(str, length) {
    return String(str).padStart(length, ' ');
}

/**
 * Calculate TLE checksum (modulo 10 sum of all digits)
 * @param {string} line - TLE line to calculate checksum for
 * @returns {string} Single digit checksum
 */
function calculateChecksum(line) {
    let sum = 0;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '-') {
            sum += 1;
        } else if (char >= '0' && char <= '9') {
            sum += parseInt(char, 10);
        }
    }
    
    return (sum % 10).toString();
}

/**
 * Calculate upcoming passes for a satellite over a location
 * @param {Object} tle - TLE object for the satellite
 * @param {Object} observer - Observer location {lat, lng, alt}
 * @param {number} hoursAhead - Hours ahead to predict
 * @param {number} minElevation - Minimum elevation for a pass
 * @returns {Array} Array of pass objects with start/end times and details
 */
function calculateUpcomingPasses(tle, observer, hoursAhead = 24, minElevation = 10) {
    // Convert the TLE data to satellite.js format
    const tleLines = convertJsonToTle(tle);
    
    // Parse the TLE
    const satRec = window.satellite.twoline2satrec(tleLines[0], tleLines[1]);
    
    // Observer location
    const observerGd = {
        longitude: observer.lng * window.satellite.constants.deg2rad,
        latitude: observer.lat * window.satellite.constants.deg2rad,
        height: observer.alt || 0
    };
    
    // Start time
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + hoursAhead * 60 * 60 * 1000);
    
    // Sample interval (30 seconds)
    const stepSecs = 30;
    const passes = [];
    let currentPass = null;
    
    // Track the satellite for the prediction period
    for (let currentDate = new Date(startDate); currentDate < endDate; currentDate = new Date(currentDate.getTime() + stepSecs * 1000)) {
        // Propagate the satellite to the current time
        const positionAndVelocity = window.satellite.propagate(satRec, currentDate);
        
        // Convert the satellite position to ECI coordinates
        const positionEci = positionAndVelocity.position;
        
        // Get the observer's ECI position
        const gmst = window.satellite.gstime(currentDate);
        const observerEci = window.satellite.geodeticToEci(observerGd, gmst);
        
        // Get the satellite position relative to the observer
        const positionEcf = window.satellite.eciToEcf(positionEci, gmst);
        const lookAngles = window.satellite.ecfToLookAngles(observerGd, positionEcf);
        
        // Get azimuth, elevation, and range
        const azimuthDeg = lookAngles.azimuth * window.satellite.constants.rad2deg;
        const elevationDeg = lookAngles.elevation * window.satellite.constants.rad2deg;
        const rangekm = lookAngles.rangeSat;
        
        // Check if the elevation is above the horizon and minimum elevation
        const visible = elevationDeg >= minElevation;
        
        // Determine if the satellite is in sunlight (approximate)
        const inSunlight = isInSunlight(positionEci, currentDate);
        
        // Check if we've started or ended a pass
        if (visible && !currentPass) {
            // Start of a new pass
            currentPass = {
                start: new Date(currentDate),
                startAzimuth: azimuthDeg,
                maxElevation: elevationDeg,
                maxElevationTime: new Date(currentDate),
                visible: inSunlight,
                dataPoints: [{
                    time: new Date(currentDate),
                    elevation: elevationDeg,
                    azimuth: azimuthDeg,
                    range: rangekm,
                    inSunlight: inSunlight
                }]
            };
        } else if (visible && currentPass) {
            // During a pass - update max elevation if needed
            if (elevationDeg > currentPass.maxElevation) {
                currentPass.maxElevation = elevationDeg;
                currentPass.maxElevationTime = new Date(currentDate);
            }
            
            // Update visibility status - needs one point of sunlight to be considered visible
            if (inSunlight) {
                currentPass.visible = true;
            }
            
            // Add data point
            currentPass.dataPoints.push({
                time: new Date(currentDate),
                elevation: elevationDeg,
                azimuth: azimuthDeg,
                range: rangekm,
                inSunlight: inSunlight
            });
            
        } else if (!visible && currentPass) {
            // End of a pass
            currentPass.end = new Date(currentDate);
            currentPass.endAzimuth = azimuthDeg;
            currentPass.duration = (currentPass.end - currentPass.start) / 60000; // in minutes
            
            // Add the completed pass to the list
            passes.push(currentPass);
            currentPass = null;
        }
    }
    
    // If there's an ongoing pass at the end of our prediction window, add it
    if (currentPass) {
        currentPass.end = new Date(endDate);
        currentPass.endAzimuth = azimuthDeg;
        currentPass.duration = (currentPass.end - currentPass.start) / 60000; // in minutes
        passes.push(currentPass);
    }
    
    return passes;
}

/**
 * Check if satellite is in sunlight (simple approximation)
 * @param {Object} positionEci - Satellite position in ECI coordinates
 * @param {Date} date - Date to check
 * @returns {boolean} True if in sunlight, false if in eclipse
 */
function isInSunlight(positionEci, date) {
    // Get the sun's position in ECI coordinates
    const sunEci = calculateSunEci(date);
    
    // Normalize the satellite position vector
    const satPosition = {
        x: positionEci.x,
        y: positionEci.y,
        z: positionEci.z
    };
    const satDistance = Math.sqrt(
        satPosition.x * satPosition.x +
        satPosition.y * satPosition.y +
        satPosition.z * satPosition.z
    );
    
    // Calculate the angle between the satellite position and the sun
    const dotProduct = 
        (satPosition.x * sunEci.x + 
         satPosition.y * sunEci.y + 
         satPosition.z * sunEci.z) / satDistance;
    
    // If the angle is < 90 degrees, the satellite is generally in sunlight
    // This ignores Earth's shadow - a more complex model would be needed for accuracy
    return dotProduct >= 0;
}

/**
 * Calculate the sun's position in ECI coordinates (simplified model)
 * @param {Date} date - The date to calculate for
 * @returns {Object} Sun position in ECI
 */
function calculateSunEci(date) {
    // Calculate the number of days since J2000
    const j2000 = new Date('2000-01-01T12:00:00Z');
    const daysSinceJ2000 = (date - j2000) / (1000 * 60 * 60 * 24);
    
    // Calculate mean anomaly
    const meanAnomaly = (357.5291 + 0.98560028 * daysSinceJ2000) * Math.PI / 180;
    
    // Calculate ecliptic longitude
    const eclipticLongitude = (280.459 + 0.98564736 * daysSinceJ2000 + 
                              1.915 * Math.sin(meanAnomaly) + 
                              0.020 * Math.sin(2 * meanAnomaly)) * Math.PI / 180;
    
    // Calculate distance to sun (in AU)
    const distanceAU = 1.00014 - 0.01671 * Math.cos(meanAnomaly) - 0.00014 * Math.cos(2 * meanAnomaly);
    
    // Convert to ECI coordinates (simplified)
    const distanceKm = distanceAU * 149597870.7; // 1 AU in km
    
    return {
        x: distanceKm * Math.cos(eclipticLongitude),
        y: distanceKm * Math.sin(eclipticLongitude),
        z: 0 // Simplified - ignoring ecliptic obliquity
    };
}

// Export functions to the global scope for use in other scripts
window.calculateSatellitePosition = calculateSatellitePosition;
window.calculateUpcomingPasses = calculateUpcomingPasses;