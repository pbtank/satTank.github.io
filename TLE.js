// ... existing formatTLE and convertCelestrakJsonToTLE functions ...

// ==================================================
// Satellite Class Definition (Moved from satPage.js)
// ==================================================
class Satellite {
    constructor(satID, satData, layerGroup) {
        this.satID = satID;
        this.satName = satData.name || satData.OBJECT_NAME || `SAT-${satID}`; // Use name from satData if available
        this.tle = satData.tle; // Expecting [name, line1, line2]
        this.layerGroup = layerGroup; // Store the layer group associated with this satellite
        this.marker = null; // Initialize marker
        this.orbitPath = null; // Initialize orbit path
        this.groundTrack = null; // Initialize ground track line
        this.footprintCircle = null; // Initialize footprint circle

        // Validate TLE data before attempting to parse
        if (!this.tle || !Array.isArray(this.tle) || this.tle.length < 3 || !this.tle[1] || !this.tle[2]) {
            console.error(`[${this.satName}] Invalid TLE data provided to constructor:`, this.tle);
            this.satrec = null; // Mark satrec as invalid
            return; // Stop constructor execution
        }

        // *** Log the exact TLE lines being parsed ***
        console.log(`[${this.satName}] Parsing TLE:\nLine 1: ${this.tle[1]}\nLine 2: ${this.tle[2]}`);

        try {
            // Initialize satellite record using the TLE data
            this.satrec = satellite.twoline2satrec(this.tle[1], this.tle[2]);

            // *** Log the raw satrec object immediately after creation ***
            console.log(`[${this.satName}] Raw satrec created:`, JSON.parse(JSON.stringify(this.satrec))); // Deep copy

            // Initial validation check (e.g., error code from twoline2satrec)
            if (!this.satrec || this.satrec.error !== 0) {
                 console.error(`[${this.satName}] Failed to initialize satrec from TLE. Error code: ${this.satrec ? this.satrec.error : 'N/A'}. TLE was:\n${this.tle[1]}\n${this.tle[2]}`);
                 this.satrec = null; // Ensure satrec is null if invalid
            } else {
                 console.log(`[${this.satName}] satrec passed initial validation.`);
            }

        } catch (e) {
            console.error(`[${this.satName}] Critical error during satellite.twoline2satrec:`, e, `\nTLE Line 1: ${this.tle[1]}\nTLE Line 2: ${this.tle[2]}`);
            this.satrec = null; // Ensure satrec is null on error
        }

        // *** REMOVE element property initialization ***
        // this.latElement = document.getElementById(`lat-${this.satID}`);
        // this.lonElement = document.getElementById(`lon-${this.satID}`);
        // this.altElement = document.getElementById(`alt-${this.satID}`);
        // this.ecfXElement = document.getElementById(`ecfX-${this.satID}`);
        // this.ecfYElement = document.getElementById(`ecfY-${this.satID}`);
        // this.ecfZElement = document.getElementById(`ecfZ-${this.satID}`);

        // *** REMOVE Initial update call - Elements might not exist yet ***
        // this.updatePositionDisplay('--', '--', '--', '--', '--', '--');
    }

    calculatePositionAt(date) {
        if (!this.satrec) {
            console.warn(`calculatePositionAt: satrec not available for ${this.satName}`);
            return null;
        }
        try {
            // Propagate the satellite to get position and velocity
            const positionAndVelocity = satellite.propagate(this.satrec, date);
            
            // Check if propagation returned valid results
            if (!positionAndVelocity) {
                console.error(`calculatePositionAt: Propagation failed for ${this.satName}`);
                return null;
            }
            
            const positionEci = positionAndVelocity.position;
            
            // Check if position is null or undefined
            if (!positionEci) {
                console.error(`calculatePositionAt: Null position for ${this.satName}. TLE may be invalid or date out of range.`);
                return null;
            }

            const gmst = satellite.gstime(date);
            const positionGd = satellite.eciToGeodetic(positionEci, gmst);

            // Convert radians to degrees
            const longitude = satellite.degreesLong(positionGd.longitude);
            const latitude = satellite.degreesLat(positionGd.latitude);
            const altitude = positionGd.height;

            // Basic validation
            if (isNaN(latitude) || isNaN(longitude) || isNaN(altitude)) {
                console.warn(`calculatePositionAt: Invalid coordinates (${latitude}, ${longitude}, ${altitude}) for ${this.satName}`);
                return null;
            }

            return { lat: latitude, lng: longitude, alt: altitude };
        } catch (e) {
            console.error(`Error calculating position for ${this.satName}:`, e);
            return null;
        }
    }

    calculateFootprintRadius(altitude) {
        const earthRadius = 6371;
        if (altitude <= 0) return 0;
        const angle = Math.acos(earthRadius / (earthRadius + altitude));
        const radius = earthRadius * angle;
        return radius * 1000;
    }

    groundTrace(time = new Date()) {
        if (!this.satrec) {
            // console.warn(`Cannot calculate ground trace for ${this.satName}: satrec is invalid.`); // Keep commented
            return null;
        }

        const propagationTime = new Date(time);
        if (isNaN(propagationTime.getTime())) {
            console.error(`Invalid date provided to groundTrace for ${this.satName}:`, time);
            return null;
        }

        try {
            // *** Remove detailed logging before propagation ***
            // console.log(`[${this.satName}] Propagating for time:`, propagationTime.toISOString());
            // const satrecEpochYear = (this.satrec.epochyr < 57 ? this.satrec.epochyr + 2000 : this.satrec.epochyr + 1900);
            // const satrecEpochDate = new Date(Date.UTC(satrecEpochYear, 0, 1));
            // satrecEpochDate.setUTCDate(this.satrec.epochdays);
            // console.log(`[${this.satName}] TLE Epoch Date:`, satrecEpochDate.toISOString());
            // console.log(`[${this.satName}] Time difference from epoch (ms):`, propagationTime.getTime() - satrecEpochDate.getTime());

            const positionAndVelocity = satellite.propagate(this.satrec, propagationTime);

            // *** Remove raw propagation result log ***
            // console.log(`[${this.satName}] Raw positionAndVelocity:`, JSON.parse(JSON.stringify(positionAndVelocity || {})));

            // Check if propagation was successful and returned valid position data
            if (!positionAndVelocity || !positionAndVelocity.position) {
                console.error(`[${this.satName}] Propagation failed or returned invalid data structure at ${propagationTime.toISOString()}`);
                this.updatePositionDisplay('--', '--', '--', '--', '--', '--');
                return null;
            }

            // Extract ECI position (units: km)
            const positionEci = positionAndVelocity.position;

            // Validation for ECI coordinates (Keep this check)
             if (!positionEci || typeof positionEci.x !== 'number' || typeof positionEci.y !== 'number' || typeof positionEci.z !== 'number' ||
                 !isFinite(positionEci.x) || !isFinite(positionEci.y) || !isFinite(positionEci.z) ||
                 Math.abs(positionEci.x) > 1e8 || Math.abs(positionEci.y) > 1e8 || Math.abs(positionEci.z) > 1e8) {
                 console.error(`[${this.satName}] Invalid or excessively large ECI coordinates detected during validation: `, positionEci);
                 this.updatePositionDisplay('--', '--', '--', '--', '--', '--');
                 return null;
             }

            // Calculate GMST for ECI to ECF conversion
            const gmst = satellite.gstime(propagationTime);
            // *** Log GMST ***
            console.log(`[${this.satName}] Calculated GMST:`, gmst);


            // Convert ECI to Geodetic (latitude, longitude, height)
            const positionGd = satellite.eciToGeodetic(positionEci, gmst);
            // *** Log Geodetic position object ***
            console.log(`[${this.satName}] Calculated Geodetic Position (Radians):`, JSON.parse(JSON.stringify(positionGd || {})));


            // Extract geodetic coordinates
            const latitude = satellite.degreesLat(positionGd.latitude);
            const longitude = satellite.degreesLong(positionGd.longitude);
            const height = positionGd.height; // Already in km

            // *** Log calculated Lat/Lon/Height before final validation ***
            console.log(`[${this.satName}] Calculated Lat: ${latitude}, Lon: ${longitude}, Height: ${height}`);

            // Validate height - NOAA weather satellites orbit around 800-850 km
            if (height > 2000) {
                console.warn(`[${this.satName}] Suspicious altitude value: ${height} km. This seems too high for a weather satellite.`);
            }

            // Convert ECI to ECF (primarily for X, Y, Z display if needed)
            const positionEcf = satellite.eciToEcf(positionEci, gmst);


            // Validation for final coordinates (Keep this check)
            if (isNaN(latitude) || isNaN(longitude) || isNaN(height) || !isFinite(height) || Math.abs(height) > 1e8) {
                 console.error(`[${this.satName}] Invalid final geodetic coordinates detected during validation: Lat=${latitude}, Lon=${longitude}, H=${height}`); // Log the problematic values
                 this.updatePositionDisplay('--', '--', '--', '--', '--', '--');
                 return null;
            }

            // Update the UI elements with the calculated position
            this.updatePositionDisplay(
                latitude.toFixed(4),
                longitude.toFixed(4),
                height.toFixed(4),
                positionEcf.x.toFixed(2),
                positionEcf.y.toFixed(2),
                positionEcf.z.toFixed(2)
            );

            // Return the calculated position data
            return {
                latitude: latitude,
                longitude: longitude,
                height: height,
                ecf: positionEcf
            };

        } catch (e) {
            console.error(`[${this.satName}] Error during propagation or coordinate conversion:`, e);
             try {
                 this.updatePositionDisplay('--', '--', '--', '--', '--', '--');
             } catch (uiError) {
                 console.error(`[${this.satName}] Failed to update UI after propagation error:`, uiError);
             }
            return null; // Indicate failure
        }
    }

    updatePositionDisplay(lat, lon, alt, ecfX, ecfY, ecfZ) {
        // Query elements directly each time using satID
        const latElement = document.getElementById(`lat-${this.satID}`);
        const lonElement = document.getElementById(`lon-${this.satID}`);
        const altElement = document.getElementById(`alt-${this.satID}`);
        const ecfXElement = document.getElementById(`ecfX-${this.satID}`);
        const ecfYElement = document.getElementById(`ecfY-${this.satID}`);
        const ecfZElement = document.getElementById(`ecfZ-${this.satID}`);

        // Update only if elements exist
        if (latElement) latElement.innerText = lat;
        if (lonElement) lonElement.innerText = lon;
        if (altElement) altElement.innerText = alt;
        if (ecfXElement) ecfXElement.innerText = ecfX;
        if (ecfYElement) ecfYElement.innerText = ecfY;
        if (ecfZElement) ecfZElement.innerText = ecfZ;
    }
}
// ==================================================
// End Satellite Class Definition
// ==================================================