// calculations.js - Satellite position calculation module

/**
 * Calculate satellite position from TLE data for a specific time
 * @param {Object} satellite - The satellite object (either Celestrak JSON format or custom format with TLE lines)
 * @param {Date} time - The time for which to calculate the position
 * @returns {Object|null} The calculated position {lat, lng, alt, velocity, time} or null if calculation fails
 */
function calculateSatellitePosition(satellite, time) {
    if (!satellite || !window.satellite) {
        // console.error('[calcPos] Satellite data or satellite.js library not available');
        throw new Error('Satellite data or satellite.js library not available');
    }
    
    let satrec;
    let tleSource = 'Unknown';

    try {
        // Check if TLE is embedded in the satellite object (custom satellite)
        if (satellite.TLE_LINE1 && satellite.TLE_LINE2 && 
            typeof satellite.TLE_LINE1 === 'string' && satellite.TLE_LINE1.length === 69 &&
            typeof satellite.TLE_LINE2 === 'string' && satellite.TLE_LINE2.length === 69 &&
            satellite.TLE_LINE1.startsWith('1 ') && satellite.TLE_LINE2.startsWith('2 ')) {
            
            // console.log('[calcPos] Using embedded TLE data');
            tleSource = 'Embedded';
            satrec = window.satellite.twoline2satrec(satellite.TLE_LINE1, satellite.TLE_LINE2);

        } else if (satellite.OBJECT_NAME && satellite.NORAD_CAT_ID && satellite.EPOCH && satellite.MEAN_MOTION) {
            // If not embedded, assume Celestrak JSON format and use json2satrec
            // console.log('[calcPos] Using Celestrak JSON data');
            tleSource = 'Celestrak JSON';
            
            // Prepare JSON object for json2satrec (ensure required fields are present and parsed)
            const satJson = {
                OBJECT_NAME: satellite.OBJECT_NAME,
                OBJECT_ID: satellite.OBJECT_ID || satellite.INTL_DES || 'UNKNOWN', // Handle potential missing fields
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
                BSTAR: satellite.BSTAR || 0.0001, // Use a default BSTAR if missing
                MEAN_MOTION_DOT: satellite.MEAN_MOTION_DOT || 0,
                MEAN_MOTION_DDOT: satellite.MEAN_MOTION_DDOT || 0
            };

            // Validate necessary fields for json2satrec
            if (isNaN(satJson.NORAD_CAT_ID) || isNaN(satJson.MEAN_MOTION) || !satJson.EPOCH) {
                // console.error('[calcPos] Missing critical data for json2satrec:', satJson);
                 throw new Error('Incomplete Celestrak JSON data for position calculation');
            }

            satrec = window.satellite.json2satrec(satJson);

        } else {
            // console.error('[calcPos] Satellite object format not recognized:', satellite);
            throw new Error('Satellite object format not recognized or missing required data.');
        }

        // Validate satrec creation
        if (!satrec) {
            throw new Error(`Failed to create satellite record (Source: ${tleSource}) - satrec is null/undefined.`);
        }
        if (satrec.error !== 0) {
            throw new Error(`Satellite record creation error (Source: ${tleSource}): ${satrec.error}`);
        }
        // console.log(`[calcPos] Successfully created satrec from ${tleSource} data.`);

        // Calculate position using propagate (handles time conversion internally)
        const positionAndVelocity = window.satellite.propagate(satrec, time); 
        
        if (!positionAndVelocity || !positionAndVelocity.position || !positionAndVelocity.velocity) {
            // console.warn(`[calcPos] Propagation failed for time: ${time.toISOString()} (Source: ${tleSource}). Might be due to expired TLE or time mismatch.`);
            return null; 
        }

        // Calculate GMST
        const gmst = window.satellite.gstime(time); // Use time directly
        
        // Convert ECI position to geodetic coordinates
        const positionGd = window.satellite.eciToGeodetic(positionAndVelocity.position, gmst);
        
        // Extract and format results
        const lat = window.satellite.degreesLat(positionGd.latitude);
        const lng = window.satellite.degreesLong(positionGd.longitude);
        const altKm = positionGd.height; // Height is already in km
        const velocityVec = positionAndVelocity.velocity;
        const velocityMag = Math.sqrt(
            velocityVec.x * velocityVec.x + 
            velocityVec.y * velocityVec.y + 
            velocityVec.z * velocityVec.z
        ); // Velocity magnitude in km/s

        // Ensure values are numbers before returning
        if (isNaN(lat) || isNaN(lng) || isNaN(altKm) || isNaN(velocityMag)) {
            // console.warn('[calcPos] Calculated position/velocity contains NaN values.');
             return null;
        }

        return {
            lat: lat,
            lng: lng,
            alt: altKm, // Already in km
            velocity: velocityMag, // Already in km/s
            time: time
        };
        
    } catch (error) {
        // console.error(`[calcPos] Error calculating position for ${satellite?.OBJECT_NAME || 'Unknown'}:`, error);
        return null; 
    }
}

// Export functions to the global scope for use in other scripts
window.calculateSatellitePosition = calculateSatellitePosition;