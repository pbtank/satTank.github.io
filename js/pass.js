// pass.js - Handles satellite pass predictions

// Constants for pass prediction (moved here for modularity)
const PASS_PREDICTION_INTERVAL = 30000; // 30 seconds (Reduced loop iterations)
const MAX_PREDICTION_TIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MIN_ELEVATION = 10; // Minimum elevation angle for a pass (degrees)

// Function to fetch TLE data for a specific satellite
async function fetchTLEForSatellite(satelliteName) {
    try {
        // console.log('[fetchTLE] Fetching TLE data for satellite:', satelliteName);

        const response = await fetch('data/active_tle.dat');
        if (!response.ok) {
            throw new Error(`[fetchTLE] Failed to fetch TLE data: ${response.statusText}`);
        }

        const tleData = await response.text();
        // console.log('[fetchTLE] Raw TLE data fetched.');

        // Handle potential \r\n line endings and filter empty lines
        const lines = tleData.split(/\r?\n/).filter(line => line.trim() !== '');
        // console.log('[fetchTLE] Number of lines after split and filter:', lines.length);

        if (lines.length % 3 !== 0) {
            // console.warn('[fetchTLE] TLE file line count is not a multiple of 3. Possible formatting issue.');
        }

        // TLE data is in groups of 3 lines (name, line1, line2)
        for (let i = 0; i < lines.length - 2; i += 3) {
            const name = lines[i].trim();
            const line1 = lines[i + 1]?.trim(); // Optional chaining for safety
            const line2 = lines[i + 2]?.trim(); // Optional chaining for safety

            // console.log('[fetchTLE] Checking TLE entry:', { name, line1, line2 }); // Verbose

            // Check if this is our satellite (Case-sensitive comparison)
            if (name === satelliteName) {
                // console.log(`[fetchTLE] Match found for ${satelliteName}. Validating TLE lines...`);
                // Validate TLE lines
                if (!line1 || !line2) {
                    // console.error(`[fetchTLE] Invalid TLE data for satellite ${satelliteName}: missing line1 or line2.`);
                    throw new Error(`Invalid TLE data for satellite ${satelliteName}: missing line1 or line2`);
                }

                // Basic TLE line format check
                if (!line1.startsWith('1 ') || line1.length !== 69 || !line2.startsWith('2 ') || line2.length !== 69) {
                    // console.error(`[fetchTLE] Invalid TLE format for satellite ${satelliteName}. L1(${line1.length}):"${line1}", L2(${line2.length}):"${line2}"`);
                    throw new Error(`Invalid TLE format for satellite ${satelliteName}`);
                }

                // console.log('[fetchTLE] TLE data validated and found:', { name, line1, line2 });
                return { line1, line2 };
            }
        }

        // console.error(`[fetchTLE] No TLE data found after checking ${lines.length / 3} entries for satellite: ${satelliteName}`);
        throw new Error(`No TLE data found for satellite: ${satelliteName}`);
    } catch (error) {
        // console.error('[fetchTLE] Error fetching/processing TLE data:', error);
        throw error;
    }
}


// Function to calculate next pass using TLE data
async function calculateNextPass(satellite, observerLat, observerLon) { // Accept full satellite object
    let satrec; // Declare satrec here
    let tleSource = 'Unknown'; // To track where TLE came from
    try {
        console.log('[calculateNextPass] Starting for:', satellite.OBJECT_NAME);

        let tleLine1, tleLine2;

        // Check if TLE is embedded in the satellite object (custom satellite)
        if (satellite && typeof satellite.TLE_LINE1 === 'string' && satellite.TLE_LINE1.length === 69 &&
            typeof satellite.TLE_LINE2 === 'string' && satellite.TLE_LINE2.length === 69) {
            // console.log('[calculateNextPass] Found embedded TLE data in satellite object.');
            tleLine1 = satellite.TLE_LINE1;
            tleLine2 = satellite.TLE_LINE2;
            tleSource = 'Embedded';
        } else {
            // If not embedded, fetch TLE from the file
            // console.log('[calculateNextPass] No embedded TLE found, fetching from file...');
            const tleData = await fetchTLEForSatellite(satellite.OBJECT_NAME);
            if (!tleData || !tleData.line1 || !tleData.line2) {
                throw new Error('Failed to fetch valid TLE data from file.');
            }
            tleLine1 = tleData.line1;
            tleLine2 = tleData.line2;
            tleSource = 'Fetched';
            // console.log('[calculateNextPass] Successfully fetched TLE data from file.');
        }
        console.log('[calculateNextPass] TLE Source:', tleSource);
        console.log('[calculateNextPass] TLE Line 1:', tleLine1);
        console.log('[calculateNextPass] TLE Line 2:', tleLine2);

        // Rigorous check of the determined TLE lines
        if (typeof tleLine1 !== 'string' || typeof tleLine2 !== 'string' || tleLine1.length !== 69 || tleLine2.length !== 69) {
            // console.error(`[calculateNextPass] Invalid TLE data before creating satrec (Source: ${tleSource}):', { tleLine1, tleLine2 });
            throw new Error(`Invalid or incomplete TLE data (Source: ${tleSource})`);
        }
        // console.log(`[calculateNextPass] TLE data (Source: ${tleSource}) seems valid for satrec. Line 1:`, tleLine1);
        // console.log(`[calculateNextPass] TLE data (Source: ${tleSource}) seems valid for satrec. Line 2:`, tleLine2);

        // Create satellite record from TLE data
        if (typeof window.satellite === 'undefined' || typeof window.satellite.twoline2satrec === 'undefined') {
             throw new Error("satellite.js library or twoline2satrec function not found.");
        }
        satrec = window.satellite.twoline2satrec(tleLine1, tleLine2);
        // console.log('[calculateNextPass] twoline2satrec result:', satrec);

        if (!satrec || satrec.error !== 0) {
            // console.error('[calculateNextPass] Failed to create satellite record. Error code:', satrec ? satrec.error : 'undefined');
            throw new Error(`Failed to create satellite record from TLE data (Source: ${tleSource}). Error code: ${satrec?.error || 'N/A'}. Check TLE format/checksums for ${satellite.OBJECT_NAME}.`);
        }
        // console.log('[calculateNextPass] Successfully created satellite record.');
        console.log('[calculateNextPass] satrec created successfully.', satrec);

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
            return 'S to N';
        } else { // Azimuth 180-360 (Westward component) -> Generally North to South
            return 'N to S';
        }
    } catch (error) {
        // console.error('[calculatePassDirection] Error:', error);
        return 'Unknown'; // Return Unknown on error
    }
}

// Make functions globally available if not using modules
window.fetchTLEForSatellite = fetchTLEForSatellite;
window.calculateNextPass = calculateNextPass;
window.calculatePassDirection = calculatePassDirection; 