// calculations.js - Satellite position calculation module

/**
 * Calculate satellite position from TLE data for a specific time
 * @param {Object} satellite - The satellite TLE data in JSON format
 * @param {Date} time - The time for which to calculate the position
 * @returns {Object|null} The calculated position {lat, lng, alt, velocity, time} or null if calculation fails
 */
function calculateSatellitePosition(satellite, time) {
    if (!satellite || !window.satellite) {
        throw new Error('Satellite data or satellite.js library not available');
    }
    
    try {
        let satrec;
        
        // First try using original TLE if available
        if (satellite.TLE_LINE1 && satellite.TLE_LINE2 &&
            satellite.TLE_LINE1.length === 69 && satellite.TLE_LINE2.length === 69) {
            satrec = window.satellite.twoline2satrec(satellite.TLE_LINE1, satellite.TLE_LINE2);
            console.log('Using original TLE lines');
        } else {
            // Use Celestrak JSON format
            const satJson = {
                OBJECT_NAME: satellite.OBJECT_NAME,
                OBJECT_ID: satellite.OBJECT_ID,
                EPOCH: satellite.EPOCH,
                MEAN_MOTION: satellite.MEAN_MOTION,
                ECCENTRICITY: satellite.ECCENTRICITY,
                INCLINATION: satellite.INCLINATION,
                RA_OF_ASC_NODE: satellite.RA_OF_ASC_NODE,
                ARG_OF_PERICENTER: satellite.ARG_OF_PERICENTER,
                MEAN_ANOMALY: satellite.MEAN_ANOMALY,
                EPHEMERIS_TYPE: 0,
                CLASSIFICATION_TYPE: "U",
                NORAD_CAT_ID: parseInt(satellite.NORAD_CAT_ID),
                ELEMENT_SET_NO: 999,
                REV_AT_EPOCH: 0,
                BSTAR: 0.00048021,  // Using a typical value for LEO satellites
                MEAN_MOTION_DOT: 0.00005995,  // First derivative
                MEAN_MOTION_DDOT: 0  // Second derivative
            };
            
            satrec = window.satellite.json2satrec(satJson);
            console.log('Using Celestrak JSON format:', satJson);
        }

        if (!satrec) {
            throw new Error('Failed to create satellite record');
        }

        if (satrec.error !== 0) {
            throw new Error(`Satellite record error: ${satrec.error}`);
        }

        // Calculate Julian date with millisecond precision
        const jday = window.satellite.jday(
            time.getUTCFullYear(),
            time.getUTCMonth() + 1,
            time.getUTCDate(),
            time.getUTCHours(),
            time.getUTCMinutes(),
            time.getUTCSeconds() + time.getUTCMilliseconds() / 1000
        );

        // Calculate minutes since epoch
        const minutesSinceEpoch = (jday - satrec.jdsatepoch) * 24 * 60;
        
        console.log('Time details:', {
            currentTime: time.toISOString(),
            epochTime: satellite.EPOCH,
            jday: jday,
            epochJday: satrec.jdsatepoch,
            minutesSinceEpoch: minutesSinceEpoch
        });

        // Get position and velocity
        const positionAndVelocity = window.satellite.sgp4(satrec, minutesSinceEpoch);
        
        if (!positionAndVelocity?.position || !positionAndVelocity?.velocity) {
            throw new Error('Invalid position/velocity from SGP4 propagation');
        }

        // Calculate GMST
        const gmst = window.satellite.gstime(jday);
        
        // Convert to geodetic coordinates
        const positionGd = window.satellite.eciToGeodetic(positionAndVelocity.position, gmst);
        
        // Convert to degrees and calculate velocity
        const lat = window.satellite.degreesLat(positionGd.latitude);
        const lng = window.satellite.degreesLong(positionGd.longitude);
        const alt = positionGd.height * 1000; // Convert to meters
        const velocity = Math.sqrt(
            Math.pow(positionAndVelocity.velocity.x, 2) +
            Math.pow(positionAndVelocity.velocity.y, 2) +
            Math.pow(positionAndVelocity.velocity.z, 2)
        );

        console.log('Calculated position:', {
            lat: lat,
            lng: lng,
            alt: alt / 1000, // Display in km
            velocity: velocity
        });

        return {
            lat: lat,
            lng: lng,
            alt: alt / 1000, // Return in km
            velocity: velocity,
            time: time
        };
    } catch (error) {
        console.error('Position calculation error:', error);
        return null;
    }
}

// Export functions to the global scope for use in other scripts
window.calculateSatellitePosition = calculateSatellitePosition;