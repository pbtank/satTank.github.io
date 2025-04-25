// pass.js - Handles satellite pass predictions

// Constants for pass prediction (moved here for modularity)
const PASS_PREDICTION_INTERVAL = 30000; // 30 seconds (Reduced loop iterations)
const MAX_PREDICTION_TIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MIN_ELEVATION = 10; // Minimum elevation angle for a pass (degrees)

// Function to calculate next pass using the provided satellite object
async function calculateNextPass(satellite, observerLat, observerLon) { // Accept full satellite object
    let satrec; 
    let tleSource = 'Unknown'; 
    try {
        console.log('[calculateNextPass] Starting for:', satellite.OBJECT_NAME);

        // --- Robust Satrec Creation (Handles TLE or JSON) ---
        if (satellite.TLE_LINE1 && satellite.TLE_LINE2 && 
            typeof satellite.TLE_LINE1 === 'string' && satellite.TLE_LINE1.length === 69 &&
            typeof satellite.TLE_LINE2 === 'string' && satellite.TLE_LINE2.length === 69 &&
            satellite.TLE_LINE1.startsWith('1 ') && satellite.TLE_LINE2.startsWith('2 ')) {
            
            console.log('[calculateNextPass] Using embedded TLE data');
            tleSource = 'Embedded';
            satrec = window.satellite.twoline2satrec(satellite.TLE_LINE1, satellite.TLE_LINE2);

        } else if (satellite.OBJECT_NAME && satellite.NORAD_CAT_ID && satellite.EPOCH && satellite.MEAN_MOTION) {
            console.log('[calculateNextPass] Using Celestrak JSON data');
            tleSource = 'Celestrak JSON';
            const satJson = { 
                OBJECT_NAME: satellite.OBJECT_NAME,
                OBJECT_ID: satellite.OBJECT_ID || satellite.INTL_DES || 'UNKNOWN',
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
                BSTAR: satellite.BSTAR || 0.0001, 
                MEAN_MOTION_DOT: satellite.MEAN_MOTION_DOT || 0,
                MEAN_MOTION_DDOT: satellite.MEAN_MOTION_DDOT || 0
            };
             if (isNaN(satJson.NORAD_CAT_ID) || isNaN(satJson.MEAN_MOTION) || !satJson.EPOCH) {
                throw new Error('Incomplete Celestrak JSON data for satrec creation');
            }
            satrec = window.satellite.json2satrec(satJson);
        } else {
            throw new Error('Satellite object format not recognized or missing required data for satrec creation.');
        }

        // Validate satrec creation
        if (!satrec) {
            throw new Error(`Failed to create satellite record (Source: ${tleSource}) - satrec is null/undefined.`);
        }
        if (satrec.error !== 0) {
            throw new Error(`Satellite record creation error (Source: ${tleSource}): ${satrec.error}`);
        }
        console.log(`[calculateNextPass] Successfully created satrec from ${tleSource} data.`);
        // --- End Satrec Creation ---

        // --- Pass Calculation Logic --- (Uses the created satrec)
        const now = new Date();
        const endTime = new Date(now.getTime() + MAX_PREDICTION_TIME);
        let currentTime = now;
        let passStart = null;
        let maxElevation = 0;
        let passEnd = null;
        let isInPass = false;

        console.log('[calculateNextPass] Time Window Start:', now.toISOString());
        console.log('[calculateNextPass] Time Window End:  ', endTime.toISOString());
        console.log('[calculateNextPass] Min Elevation Threshold:', MIN_ELEVATION);

        // Convert observer coordinates to radians
        const observerGd = {
            longitude: observerLon * Math.PI / 180, // Corrected assignment
            latitude:  observerLat * Math.PI / 180,  // Corrected assignment
            height: 0.370 // Assuming average observer height in km
        };

        // console.log('[calculateNextPass] Starting prediction loop...');
        let iterations = 0; // Debug counter
        const maxIterations = (MAX_PREDICTION_TIME / PASS_PREDICTION_INTERVAL) + 2; // Safety break

        while (currentTime <= endTime && iterations < maxIterations) {
            iterations++; // Increment counter
            try {
                // Propagate satellite position using the created satrec
                 const positionAndVelocity = window.satellite.propagate(satrec, currentTime);

                 // Log the result of propagate RIGHT AFTER calling it
                 console.log(`[Loop ${iterations}] Time: ${currentTime.toISOString()}, Propagate Result:`, positionAndVelocity);

                 if (!positionAndVelocity || !positionAndVelocity.position || !positionAndVelocity.velocity) {
                     // Log if propagation failed
                     console.warn(`[Loop ${iterations}] Propagation failed or invalid result at ${currentTime.toISOString()}`);
                     currentTime = new Date(currentTime.getTime() + PASS_PREDICTION_INTERVAL);
                      continue;
                 }
                 const positionEci = positionAndVelocity.position;
                 const gmst = window.satellite.gstime(currentTime);
                 const positionEcf = window.satellite.eciToEcf(positionEci, gmst);
                 const lookAngles = window.satellite.ecfToLookAngles(observerGd, positionEcf);
                 const elevation = lookAngles.elevation * 180 / Math.PI;

                 // Log elevation at each step for debugging
                 // if (iterations % 60 === 0) { // Log roughly every minute - Adjusted logging frequency
                 //    console.log(`[calcNextPass Loop ${iterations}] Time: ${currentTime.toISOString()}, Elevation: ${elevation.toFixed(2)}`);
                 // }

                 if (elevation >= MIN_ELEVATION) {
                     if (!isInPass) {
                         passStart = new Date(currentTime);
                         isInPass = true;
                         console.log(`%c[calculateNextPass] Pass STARTED at: ${passStart.toISOString()}, Elevation: ${elevation.toFixed(1)}`, 'color: green;'); // Added log
                     }
                     maxElevation = Math.max(maxElevation, elevation);
                 } else if (isInPass) {
                     passEnd = new Date(currentTime);
                     isInPass = false; // Reset isInPass flag
                     console.log(`%c[calculateNextPass] Pass ENDED at: ${passEnd.toISOString()}, Max Elevation during pass: ${maxElevation.toFixed(1)}`, 'color: red;'); // Added log
                     break; // Exit loop once a pass is found and ends
                 }
            } catch (error) { // Make sure isInPass is reset on error too?
                 // Use console.log for errors inside the loop for maximum visibility
                 console.log(`[calculateNextPass] CAUGHT ERROR during loop at ${currentTime.toISOString()}:`, error);
            }
             currentTime = new Date(currentTime.getTime() + PASS_PREDICTION_INTERVAL);
        }
        // console.log('[calculateNextPass] Prediction loop finished.');
        if(iterations >= maxIterations) {
             console.warn('[calculateNextPass] Loop exceeded max iterations, breaking.');
        }

        // If a pass started, return the details.
        // Handle passes ongoing at the end of the prediction window.
        if (passStart) { 
            // If pass was still ongoing when loop ended, set passEnd to the window end time
            if (!passEnd) {
                // console.log('[calculateNextPass] Pass ongoing at end of window. Setting end time to window end.');
                passEnd = endTime; 
            }

            // console.log('[calculateNextPass] Pass found. Calculating direction...');
             // Pass the created satrec to calculatePassDirection
             const direction = await calculatePassDirection(satrec, passStart, observerLat, observerLon);
             // Calculate look angle points for the visualization
             const lookAnglePoints = calculatePassLookAngles(satrec, passStart, passEnd, observerLat, observerLon);
             // console.log('[calculateNextPass] Pass direction calculated:', direction);
             return {
                 startTime: passStart,
                 endTime: passEnd, 
                 maxElevation: maxElevation,
                 duration: (passEnd - passStart) / 1000, // Duration might be up to window end
                 direction: direction,
                 lookAnglePoints: lookAnglePoints 
             };
        } else {
            // console.log('[calculateNextPass] No pass found within the prediction window.');
             return null;
        }
    } catch (error) {
         console.error('[calculateNextPass] Main function error:', error);
         throw error;
    }
}

// New function to calculate Look Angles (Az/El) during a specific pass interval
function calculatePassLookAngles(satrec, startTime, endTime, observerLat, observerLon) {
    const lookAnglePoints = [];
    let currentTime = new Date(startTime.getTime());
    const intervalMs = 30 * 1000; // Calculate point every 30 seconds

    const observerGd = {
        longitude: observerLon * Math.PI / 180,
        latitude: observerLat * Math.PI / 180,
        height: 0.370 // Observer height in km
    };

    // console.log(`[PassLookAngles] Calculating look angles from ${startTime.toISOString()} to ${endTime.toISOString()}`);

    while (currentTime <= endTime) {
        try {
            const positionAndVelocity = window.satellite.propagate(satrec, currentTime);
            if (!positionAndVelocity || !positionAndVelocity.position) {
                currentTime = new Date(currentTime.getTime() + intervalMs);
                continue;
            }

            const gmst = window.satellite.gstime(currentTime);
            const positionEcf = window.satellite.eciToEcf(positionAndVelocity.position, gmst);
            const lookAngles = window.satellite.ecfToLookAngles(observerGd, positionEcf);

            // Convert to degrees
            const azimuth = lookAngles.azimuth * 180 / Math.PI;
            const elevation = lookAngles.elevation * 180 / Math.PI;

            if (!isNaN(azimuth) && !isNaN(elevation)) {
                lookAnglePoints.push({ azimuth, elevation });
            }

        } catch(error) {
            console.error(`[PassLookAngles] Error during calculation at ${currentTime.toISOString()}:`, error);
        }
        currentTime = new Date(currentTime.getTime() + intervalMs);
    }
    // console.log(`[PassLookAngles] Calculated ${lookAnglePoints.length} look angle points.`);
    return lookAnglePoints;
}

// Function to calculate pass direction using a pre-created satrec
async function calculatePassDirection(satrec, time, observerLat, observerLon) { // Accepts satrec directly
    try {
        // No need to fetch TLE or create satrec here, it's passed in
        // console.log('[calculatePassDirection] Starting with pre-created satrec at time:', time.toISOString());

        if (!satrec) {
             throw new Error('Invalid satrec received in calculatePassDirection');
        }

        // Propagate to the specified time (pass start time)
        const positionAndVelocity = window.satellite.propagate(satrec, time);
         if (!positionAndVelocity || !positionAndVelocity.position) {
            // console.warn(`[calculatePassDirection] Propagation failed for time: ${time.toISOString()}`);
            return 'Unknown'; // Cannot determine direction if propagation fails
         }

        const positionEci = positionAndVelocity.position;

        // Observer geodetic coordinates (ensure correct assignment)
        const observerGd = {
            longitude: observerLon * Math.PI / 180, // Longitude comes from observerLon
            latitude: observerLat * Math.PI / 180,  // Latitude comes from observerLat
            height: 0.370
        };

        // Calculate GMST and ECF position
        const gmst = window.satellite.gstime(time);
        const positionEcf = window.satellite.eciToEcf(positionEci, gmst);

        // Calculate Look Angles
        const lookAngles = window.satellite.ecfToLookAngles(observerGd, positionEcf);
        const azimuth = lookAngles.azimuth * 180 / Math.PI; // Azimuth in degrees

        // console.log(`[calculatePassDirection] Calculated Azimuth at pass start: ${azimuth.toFixed(1)}`);

        // Determine direction based on azimuth at the start of the pass
        if (azimuth >= 0 && azimuth < 180) { // Azimuth 0-180 (Eastward component) -> Generally South to North
            return 'South &rarr; North';
        } else { // Azimuth 180-360 (Westward component) -> Generally North to South
            return 'North &rarr; South';
        }
    } catch (error) {
        // console.error('[calculatePassDirection] Error:', error);
        return 'Unknown'; // Return Unknown on error
    }
}

// Make functions globally available if not using modules
window.calculateNextPass = calculateNextPass;
window.calculatePassDirection = calculatePassDirection; 