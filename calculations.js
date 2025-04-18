// calculations.js - Satellite position calculation module

/**
 * Calculate satellite position from TLE data for a specific time
 * @param {Object} satellite - The satellite TLE data in JSON format
 * @param {Date} time - The time for which to calculate the position
 * @returns {Object|null} The calculated position {lat, lng, alt, velocity, time} or null if calculation fails
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
        
        // Check if satrec initialization failed (often due to bad TLE)
        if (!satrec || satrec.error !== 0) {
            console.error('Satellite record initialization failed. Error code:', satrec?.error, 'TLE:', tle);
            return null; // Return null to indicate failure
        }

        // Get position at the given time
        const positionAndVelocity = window.satellite.propagate(satrec, time);
        
        // Check if propagation failed
        if (!positionAndVelocity || typeof positionAndVelocity.position !== 'object' || typeof positionAndVelocity.velocity !== 'object') {
            console.error('Propagation failed for time:', time, 'TLE:', tle);
            return null; // Return null to indicate failure
        }

        // Convert position from km to m
        const positionEci = positionAndVelocity.position;
        const velocityEci = positionAndVelocity.velocity;
        
        console.log('Raw ECI Position (km):', positionEci);
        console.log('Raw ECI Velocity (km/s):', velocityEci);

        // Calculate velocity magnitude (in km/s)
        const velocity = Math.sqrt(
            Math.pow(velocityEci.x, 2) + 
            Math.pow(velocityEci.y, 2) + 
            Math.pow(velocityEci.z, 2)
        );
        
        // Convert position from ECI to geodetic coordinates
        const gmst = window.satellite.gstime(time);
        const positionGd = window.satellite.eciToGeodetic(positionEci, gmst);
        
        // Add logging for GMST and geodetic conversion results
        console.log('GMST:', gmst);
        console.log('Geodetic (Radians Lat, Lon; km Height):', positionGd);
        
        // Convert radians to degrees
        const lat = window.satellite.degreesLat(positionGd.latitude);
        const lng = window.satellite.degreesLong(positionGd.longitude);
        const alt = positionGd.height;

        // Add logging for final geodetic coordinates
        console.log('Geodetic (Degrees Lat, Lon; km Height):', { lat, lng, alt });

        // Validate the final coordinates
        if (isNaN(lat) || isNaN(lng) || isNaN(alt) || isNaN(velocity)) {
            console.error('NaN detected in calculated position:', { lat, lng, alt, velocity }, 'Time:', time, 'TLE:', tle, 'ECI:', positionEci, 'GMST:', gmst);
            return null; // Return null if any value is NaN
        }
        
        return {
            lat: lat,
            lng: lng,
            alt: alt,
            velocity: velocity,
            time: time
        };
    } catch (error) {
        console.error('Error calculating satellite position:', error, 'Time:', time, 'TLE:', satellite);
        // Optionally re-throw or return null based on desired error handling
        return null; // Return null on general error
    }
}

/**
 * Convert Celestrak JSON TLE to classic TLE format for satellite.js
 * @param {Object} satJson - The satellite TLE data in JSON format from Celestrak
 * @returns {Array} Array with two strings representing TLE lines
 */
function convertJsonToTle(satJson) {
    if (!satJson) {
        throw new Error('No satellite data provided');
    }

    // --- Corrected Epoch Calculation ---
    let epochyr = '00';
    let epochday = '000.00000000';
    if (satJson.EPOCH) {
        try {
            const epochDate = new Date(satJson.EPOCH);
            const year = epochDate.getUTCFullYear();
            epochyr = year.toString().substring(2);

            const startOfYear = new Date(Date.UTC(year, 0, 1)); // Jan 1st UTC
            const millisSinceYearStart = epochDate.getTime() - startOfYear.getTime();
            const oneDayMillis = 24 * 60 * 60 * 1000;
            const dayOfYear = Math.floor(millisSinceYearStart / oneDayMillis) + 1; // Day 1 is Jan 1st

            const fractionOfDay = (millisSinceYearStart % oneDayMillis) / oneDayMillis;

            // Format epochday as DDD.FFFFFFFF (ensure 8 decimal places)
            epochday = dayOfYear.toString().padStart(3, '0') +
                       fractionOfDay.toFixed(8).substring(1); // Get decimal part '.FFFFFFFF'

        } catch (e) {
            console.error("Error parsing EPOCH date:", satJson.EPOCH, e);
            // Fallback to defaults if parsing fails
            epochyr = '00';
            epochday = '000.00000000';
        }
    }
    // --- End Corrected Epoch Calculation ---

    const satnum = satJson.NORAD_CAT_ID || '00000';
    const classification = satJson.CLASSIFICATION_TYPE || 'U';
    const intldes = (satJson.OBJECT_ID || '00000A').padEnd(8).substring(0, 8);
    // Corrected: Pass MEAN_MOTION_DOT directly to formatNdot (it's already nDot/2)
    const ndot = formatNdot(satJson.MEAN_MOTION_DOT || 0);
    // Corrected: Pass MEAN_MOTION_DDOT / 6 to formatNddotBstar
    const nddot = formatNddotBstar((satJson.MEAN_MOTION_DDOT || 0) / 6.0);
    const bstar = formatNddotBstar(satJson.BSTAR || 0); // BSTAR is passed directly
    const elnum = satJson.ELEMENT_SET_NO || 0;
    const inclo = formatFixed(satJson.INCLINATION || 0, 8, 4);
    const nodeo = formatFixed(satJson.RA_OF_ASC_NODE || 0, 8, 4);
    const ecco = formatEccentricity(satJson.ECCENTRICITY || 0); // Use specific formatter
    const argpo = formatFixed(satJson.ARG_OF_PERICENTER || 0, 8, 4);
    const mo = formatFixed(satJson.MEAN_ANOMALY || 0, 8, 4);
    const no = formatFixed(satJson.MEAN_MOTION || 0, 11, 8); // Mean motion revs/day
    const revnum = satJson.REV_AT_EPOCH || 0;

    // Format TLE line 1 (Columns as per TLE spec)
    let line1 = '1 ';                                                    // Col 01-02: Line number
    line1 += padLeft(satnum, 5) + classification;                        // Col 03-07: Sat Number, Col 08: Classification
    line1 += ' ';                                                        // Col 09: Space
    line1 += intldes;                                                    // Col 10-17: Intl Des
    line1 += ' ';                                                        // Col 18: Space
    line1 += epochyr + epochday;                                         // Col 19-32: Epoch
    line1 += ' ';                                                        // Col 33: Space
    line1 += ndot;                                                       // Col 34-43: First Derivative of Mean Motion (ndot/2)
    line1 += ' ';                                                        // Col 44: Space
    line1 += nddot;                                                      // Col 45-52: Second Derivative of Mean Motion (nddot/6)
    line1 += ' ';                                                        // Col 53: Space
    line1 += bstar;                                                      // Col 54-61: BSTAR Drag Term
    line1 += ' ';                                                        // Col 62: Space
    line1 += '0';                                                        // Col 63: Ephemeris Type (assumed 0)
    line1 += ' ';                                                        // Col 64: Space
    line1 += padLeft(elnum, 4);                                          // Col 65-68: Element Set Number
    // Col 69: Checksum calculated below

    // Calculate checksum for line 1
    const checksum1 = calculateChecksum(line1);
    line1 += checksum1;

    // Format TLE line 2
    let line2 = '2 ';                                                    // Col 01-02: Line number
    line2 += padLeft(satnum, 5);                                         // Col 03-07: Sat Number
    line2 += ' ';                                                        // Col 08: Space
    line2 += inclo;                                                      // Col 09-16: Inclination
    line2 += ' ';                                                        // Col 17: Space
    line2 += nodeo;                                                      // Col 18-25: RAAN
    line2 += ' ';                                                        // Col 26: Space
    line2 += ecco;                                                       // Col 27-33: Eccentricity
    line2 += ' ';                                                        // Col 34: Space
    line2 += argpo;                                                      // Col 35-42: Arg of Perigee
    line2 += ' ';                                                        // Col 43: Space
    line2 += mo;                                                         // Col 44-51: Mean Anomaly
    line2 += ' ';                                                        // Col 52: Space
    line2 += no;                                                         // Col 53-63: Mean Motion
    line2 += padLeft(revnum, 5);                                         // Col 64-68: Revolution Number at Epoch
    // Col 69: Checksum calculated below

    // Calculate checksum for line 2
    const checksum2 = calculateChecksum(line2);
    line2 += checksum2;

    // console.log("Generated TLE:", [line1, line2]); // Keep for debugging if needed
    return [line1, line2];
}

// --- TLE Formatting Helpers ---

/**
 * Format Mean Motion Dot (ndot/2) - TLE Format: ±.NNNNNNNN (10 chars)
 * Input `num` is expected to be MEAN_MOTION_DOT from Celestrak JSON (which is nDot/2).
 */
function formatNdot(num) {
    const val = num; // Input is already nDot/2
    const sign = val >= 0 ? ' ' : '-';
    // Format to 8 decimal places, get the part after '0.'
    const decimalPart = Math.abs(val).toFixed(8).substring(2);
    // Combine sign, '.', decimal part, pad with leading spaces to 10 chars
    return (sign + '.' + decimalPart).padStart(10, ' ');
}

/**
 * Format Nddot/6 or BSTAR - TLE Format: ±NNNNN±E (8 chars)
 * Represents value as ±0.NNNNN * 10^±E
 */
function formatNddotBstar(num) {
     // Use exponential notation to easily extract mantissa and exponent
     const numStr = Math.abs(num).toExponential(5); // e.g., "1.23450e-7"

     // Extract parts: ['1.23450e-7', '1.23450', '-7']
     const parts = /(\d\.\d+)e([+-]\d+)/.exec(numStr);
     if (!parts) {
         // Handle zero or very small numbers that don't format well
         return ' 00000-0';
     }

     // Mantissa needs to be the digits *after* the decimal in 0.NNNNN form
     // Example: 1.23450e-7 -> 0.12345 * 10^-6. Mantissa=12345, Exponent=-6
     let mantissaDigits = parts[1].replace('.', ''); // "123450"
     let exponent = parseInt(parts[2], 10);

     // Adjust exponent and mantissa for the 0.NNNNN format
     exponent += 1;
     mantissaDigits = mantissaDigits.substring(0, 5); // Take first 5 digits "12345"

     // Rounding check (might be needed if precision issues arise)
     // This simplified approach assumes toExponential handles rounding sufficiently.

     const sign = num >= 0 ? ' ' : '-';
     const expSign = exponent >= 0 ? '+' : '-';
     const expStr = Math.abs(exponent).toString();

     // Combine: SNNNNN[sign]E
     return (sign + mantissaDigits + expSign + expStr).padEnd(8, ' ');
}

/**
 * Format Eccentricity - NNNNNNN (7 chars, leading decimal point assumed)
 */
function formatEccentricity(num) {
    if (num < 0 || num >= 1) {
        console.warn("Eccentricity out of range (0 <= e < 1):", num);
        // Handle potentially invalid input, maybe return default?
        num = Math.max(0, Math.min(num, 0.9999999)); // Clamp
    }
    // Format to 7 decimal places, remove leading '0.'
    const numStr = num.toFixed(7);
    return numStr.substring(2); // Remove "0."
}

/**
 * Format a number with fixed width and decimal places (for angles, mean motion)
 * Ensures padding with leading spaces.
 */
function formatFixed(num, width, decimals) {
    const numStr = num.toFixed(decimals);
    return numStr.padStart(width, ' ');
}

/**
 * Pad a string or number with spaces on the left
 */
function padLeft(str, length) {
    return String(str).padStart(length, ' ');
}

/**
 * Calculate TLE checksum (modulo 10 sum of digits, '-' counts as 1)
 */
function calculateChecksum(line) {
    let sum = 0;
    // Checksum is calculated over the first 68 characters
    for (let i = 0; i < 68; i++) {
        const char = line[i];
        if (char === '-') {
            sum += 1;
        } else if (char >= '0' && char <= '9') {
            sum += parseInt(char, 10);
        }
    }
    return (sum % 10).toString();
}

// Export functions to the global scope for use in other scripts
window.calculateSatellitePosition = calculateSatellitePosition;