// ... existing formatTLE and convertCelestrakJsonToTLE functions ...

// ==================================================
// Satellite Class Definition (Moved from satPage.js)
// ==================================================
class Satellite {
    constructor(id, satData, layerGroup) {
        this.satID = id;
        this.satName = satData.name || `SAT-${id}`;
        this.tle = satData.tle; // Expecting [name, line1, line2]
        this.layerMarkerGrp = layerGroup; // Should be an L.layerGroup() instance
        this.satrec = null; // Initialize satrec
        this._traceCache = { points: [], timestamp: 0, validityPeriod: 10000, requestedSpan: 0 }; // Cache for ground trace

        // Ensure TLE data is valid before parsing
        if (this.tle && Array.isArray(this.tle) && this.tle.length === 3 && this.tle[1] && this.tle[2]) {
            try {
                // *** Log TLE lines being parsed ***
                console.log(`Parsing TLE for ${this.satName}:\nLine 1: ${this.tle[1]}\nLine 2: ${this.tle[2]}`);
                this.satrec = satellite.twoline2satrec(this.tle[1], this.tle[2]);
                console.log(`Raw satrec created for ${this.satName}:`, JSON.parse(JSON.stringify(this.satrec))); // Log a copy

                // *** ADD STRICT VALIDATION FOR SATREC ***
                if (!this.satrec) {
                    console.error(`twoline2satrec returned null/undefined for ${this.satName}.`);
                    this.satrec = null; // Ensure it's null
                } else if (this.satrec.error !== 0) {
                    console.error(`satrec error code ${this.satrec.error} for ${this.satName}. TLE likely invalid.`);
                    this.satrec = null;
                } else if (isNaN(this.satrec.no) || this.satrec.no <= 0 || this.satrec.no > 20) { // Mean motion (rad/min) check
                    console.error(`Invalid mean motion (no) in satrec for ${this.satName}: ${this.satrec.no}. Expected > 0 and < ~17 revs/day.`);
                    this.satrec = null;
                } else if (isNaN(this.satrec.ecco) || this.satrec.ecco < 0 || this.satrec.ecco >= 1) { // Eccentricity check
                    console.error(`Invalid eccentricity (ecco) in satrec for ${this.satName}: ${this.satrec.ecco}. Expected 0 <= ecco < 1.`);
                    this.satrec = null;
                } else {
                     console.log(`satrec for ${this.satName} passed initial validation.`);
                }
                // *** END STRICT VALIDATION ***

            } catch (e) {
                console.error(`Error during TLE parsing or satrec validation for ${this.satName}:`, e);
                this.satrec = null;
            }
        } else {
            console.error(`Invalid TLE data provided to Satellite constructor for ID ${id}:`, this.tle);
            this.satrec = null; // Ensure satrec is null if TLE is bad
        }
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

    groundTrace(_currentUTC, _span) {
        if (!this.satrec) {
            return;
        }

        try {
            const minutesPerOrbit = (2 * Math.PI) / this.satrec.no;
            const orbitSpanMinutes = minutesPerOrbit;

            const currentTime = _currentUTC.getTime();
            const cacheIsValid =
                this._traceCache.points.length > 0 &&
                currentTime - this._traceCache.timestamp < this._traceCache.validityPeriod &&
                this._traceCache.requestedSpan === orbitSpanMinutes;

            if (myMap.hasLayer(this.layerMarkerGrp)) {
                myMap.removeLayer(this.layerMarkerGrp);
            }
            this.layerMarkerGrp.clearLayers();

            const currentPosition = this.calculatePositionAt(_currentUTC);
            if (!currentPosition) {
                console.error(`Failed to calculate current position for ${this.satName}`);
                return;
            }

            const intLat = currentPosition.lat;
            const intLong = currentPosition.lng;
            const intHeight = currentPosition.alt;

            if (isNaN(intLat) || isNaN(intLong) || Math.abs(intLat) > 90 || Math.abs(intLong) > 180) {
                console.error(`Invalid coordinates for ${this.satName}:`, intLat, intLong);
                return;
            }

            // Calculate X, Y, Z positions with strict validation
            let xPos = "--", yPos = "--", zPos = "--";
            try {
                const positionAndVelocity = satellite.propagate(this.satrec, _currentUTC);
                if (positionAndVelocity && positionAndVelocity.position) {
                    const positionEci = positionAndVelocity.position;
                    // Validate ECI position values before converting
                    if (isFinite(positionEci.x) && isFinite(positionEci.y) && isFinite(positionEci.z) &&
                        Math.abs(positionEci.x) < 100000 && Math.abs(positionEci.y) < 100000 && Math.abs(positionEci.z) < 100000) {
                        
                        const gmst = satellite.gstime(_currentUTC);
                        const positionEcf = satellite.eciToEcf(positionEci, gmst);
                        
                        // Additional validation for ECF coordinates
                        if (positionEcf && isFinite(positionEcf.x) && isFinite(positionEcf.y) && isFinite(positionEcf.z) &&
                            Math.abs(positionEcf.x) < 100000 && Math.abs(positionEcf.y) < 100000 && Math.abs(positionEcf.z) < 100000) {
                            
                            xPos = positionEcf.x.toFixed(2);
                            yPos = positionEcf.y.toFixed(2);
                            zPos = positionEcf.z.toFixed(2);
                        } else {
                            console.error(`Invalid ECF coordinates for ${this.satName}:`, positionEcf);
                        }
                    } else {
                        console.error(`Invalid ECI coordinates for ${this.satName}:`, positionEci);
                    }
                }
            } catch (e) {
                console.error(`Failed to calculate X, Y, Z positions for ${this.satName}:`, e);
            }

            // Update UI elements for X, Y, Z positions
            const xPosEl = document.getElementById('xPos');
            const yPosEl = document.getElementById('yPos');
            const zPosEl = document.getElementById('zPos');
            if (xPosEl) xPosEl.innerText = xPos;
            if (yPosEl) yPosEl.innerText = yPos;
            if (zPosEl) zPosEl.innerText = zPos;

            let trace = [];

            if (cacheIsValid) {
                trace = this._traceCache.points;
            } else {
                const numPoints = 240;
                const timeIncrement = (orbitSpanMinutes * 60 * 1000) / numPoints;
                const batchSize = 20;
                let validPoints = 0;
                trace = [];

                for (let i = -numPoints / 2; i <= numPoints / 2; i += batchSize) {
                    const batch = [];
                    for (let j = 0; j < batchSize && i + j <= numPoints / 2; j++) {
                        const pointIndex = i + j;
                        const time = new Date(currentTime + pointIndex * timeIncrement);
                        batch.push({ time: time, index: pointIndex });
                    }

                    batch.forEach((item) => {
                        const pos = this.calculatePositionAt(item.time);
                        if (
                            pos &&
                            !isNaN(pos.lat) &&
                            !isNaN(pos.lng) &&
                            Math.abs(pos.lat) <= 90 &&
                            Math.abs(pos.lng) <= 180
                        ) {
                            trace.push({ lat: pos.lat, lng: pos.lng, index: item.index });
                            validPoints++;
                        }
                    });
                }

                if (validPoints > numPoints * 0.5) {
                    this._traceCache.points = trace;
                    this._traceCache.timestamp = currentTime;
                    this._traceCache.requestedSpan = orbitSpanMinutes;
                }
            }

            const satIcon = L.icon({
                iconUrl: 'src/images/satImage.png', // Updated to use the provided local image
                iconSize: [32, 32],
                iconAnchor: [16, 16],
            });

            const marker = L.marker([intLat, intLong], {
                icon: satIcon,
                title: this.satName,
            }).addTo(this.layerMarkerGrp);

            if (trace.length > 1) {
                trace.sort((a, b) => a.index - b.index);
                const traceLine = trace.map((point) => [point.lat, point.lng]);

                const segments = [];
                let currentSegment = [];
                for (let i = 0; i < traceLine.length; i++) {
                    currentSegment.push(traceLine[i]);
                    if (i < traceLine.length - 1) {
                        const lon1 = traceLine[i][1];
                        const lon2 = traceLine[i + 1][1];
                        if (Math.abs(lon1 - lon2) > 180) {
                            segments.push(currentSegment);
                            currentSegment = [];
                        }
                    }
                }
                segments.push(currentSegment);

                segments.forEach((segment) => {
                    if (segment.length > 1) {
                        L.polyline(segment, {
                            color: '#FF4500',
                            weight: 2,
                            opacity: 0.8,
                            smoothFactor: 1,
                        }).addTo(this.layerMarkerGrp);
                    }
                });
            }

            const footprintRadius = this.calculateFootprintRadius(intHeight);
            if (footprintRadius > 0) {
                L.circle([intLat, intLong], {
                    radius: footprintRadius,
                    color: '#00FFFF',
                    fillColor: '#00FFFF',
                    fillOpacity: 0.1,
                    weight: 1,
                }).addTo(this.layerMarkerGrp);
            }

            const latEl = document.getElementById('lat');
            const longEl = document.getElementById('long');
            const heightEl = document.getElementById('height');
            if (latEl) latEl.innerText = intLat.toFixed(4);
            if (longEl) longEl.innerText = intLong.toFixed(4);
            if (heightEl) heightEl.innerText = intHeight.toFixed(2);

            this.layerMarkerGrp.addTo(myMap);
        } catch (e) {
            console.error(`Error in groundTrace for ${this.satName}:`, e);
        }
    }
}
// ==================================================
// End Satellite Class Definition
// ==================================================