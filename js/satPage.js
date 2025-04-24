function updateOrbitalElements(satrec) {
    document.getElementById('eccentricity').textContent = satrec.ecco.toFixed(4);
    document.getElementById('inclination').textContent = (satrec.inclo * 180/Math.PI).toFixed(1) + '°';
    document.getElementById('raan').textContent = (satrec.nodeo * 180/Math.PI).toFixed(1) + '°';
    document.getElementById('argPerigee').textContent = (satrec.argpo * 180/Math.PI).toFixed(1) + '°';
    document.getElementById('meanMotion').textContent = (satrec.no_kozai * 24 * 60 / (2 * Math.PI)).toFixed(2) + ' rev/day';
    document.getElementById('meanAnomaly').textContent = (satrec.mo * 180/Math.PI).toFixed(1) + '°';
}

function calculateNextPass(satellite, observerLat, observerLon) {
    // Only allow pass predictions for Celestrak satellites (identified by ID in URL)
    if (!satellite || !satellite.NORAD_CAT_ID) {
        console.error('Pass predictions are only available for Celestrak satellites');
        return null;
    }

    // Validate required satellite properties
    if (!satellite.OBJECT_NAME || !satellite.OBJECT_ID || !satellite.EPOCH || 
        !satellite.MEAN_MOTION || !satellite.ECCENTRICITY || !satellite.INCLINATION || 
        !satellite.RA_OF_ASC_NODE || !satellite.ARG_OF_PERICENTER || !satellite.MEAN_ANOMALY) {
        console.error('Invalid satellite data:', satellite);
        return null;
    }

    const now = new Date();
    const endTime = new Date(now.getTime() + MAX_PREDICTION_TIME);
    let currentTime = now;
    let passStart = null;
    let maxElevation = 0;
    let passEnd = null;
    let isInPass = false;

    // Create satellite record from Celestrak JSON data
    let satrec;
    try {
        // Convert satellite data to the format expected by satellite.js
        const satJson = {
            OBJECT_NAME: satellite.OBJECT_NAME,
            OBJECT_ID: satellite.OBJECT_ID,
            EPOCH: satellite.EPOCH,
            MEAN_MOTION: parseFloat(satellite.MEAN_MOTION),
            ECCENTRICITY: parseFloat(satellite.ECCENTRICITY),
            INCLINATION: parseFloat(satellite.INCLINATION),
            RA_OF_ASC_NODE: parseFloat(satellite.RA_OF_ASC_NODE),
            ARG_OF_PERICENTER: parseFloat(satellite.ARG_OF_PERICENTER),
            MEAN_ANOMALY: parseFloat(satellite.MEAN_ANOMALY),
            EPHEMERIS_TYPE: 0,
            CLASSIFICATION_TYPE: "U",
            NORAD_CAT_ID: parseInt(satellite.NORAD_CAT_ID),
            ELEMENT_SET_NO: 999,
            REV_AT_EPOCH: 0,
            BSTAR: 0.00048021,  // Using a typical value for LEO satellites
            MEAN_MOTION_DOT: 0.00005995,  // First derivative
            MEAN_MOTION_DDOT: 0  // Second derivative
        };
        
        // Create satellite record using json2satrec
        satrec = window.satellite.json2satrec(satJson);

        if (!satrec || satrec.error !== 0) {
            throw new Error('Failed to create satellite record');
        }
    } catch (error) {
        console.error('Error creating satellite record:', error);
        return null;
    }

    // Convert observer coordinates to radians
    const observerGd = {
        longitude: observerLon * Math.PI / 180,
        latitude: observerLat * Math.PI / 180,
        height: 0.370
    };

    while (currentTime < endTime) {
        try {
            // Calculate time since epoch in minutes
            const timeSinceEpoch = (currentTime - new Date(satellite.EPOCH)) / (1000 * 60);
            
            // Get satellite position using sgp4
            const positionAndVelocity = window.satellite.sgp4(satrec, timeSinceEpoch);
            if (!positionAndVelocity || !positionAndVelocity.position) continue;

            const position = positionAndVelocity.position;

            // Get GMST for coordinate transforms
            const gmst = window.satellite.gstime(currentTime);

            // Convert satellite position to ECF
            const positionEcf = window.satellite.eciToEcf(position, gmst);

            // Calculate look angles
            const lookAngles = window.satellite.ecfToLookAngles(observerGd, positionEcf);
            const elevation = lookAngles.elevation * 180 / Math.PI;

            if (elevation >= MIN_ELEVATION) {
                if (!isInPass) {
                    passStart = new Date(currentTime);
                    isInPass = true;
                }
                maxElevation = Math.max(maxElevation, elevation);
            } else if (isInPass) {
                passEnd = new Date(currentTime);
                break;
            }
        } catch (error) {
            console.error('Error calculating position:', error);
            continue;
        }

        currentTime = new Date(currentTime.getTime() + PASS_PREDICTION_INTERVAL);
    }

    if (passStart && passEnd) {
        return {
            startTime: passStart,
            endTime: passEnd,
            maxElevation: maxElevation,
            duration: (passEnd - passStart) / 1000,
            direction: calculatePassDirection(satellite, passStart, observerLat, observerLon)
        };
    }

    return null;
}

function calculatePassDirection(satellite, time, observerLat, observerLon) {
    try {
        // Convert satellite data to the format expected by satellite.js
        const satJson = {
            OBJECT_NAME: satellite.OBJECT_NAME,
            OBJECT_ID: satellite.OBJECT_ID,
            EPOCH: satellite.EPOCH,
            MEAN_MOTION: parseFloat(satellite.MEAN_MOTION),
            ECCENTRICITY: parseFloat(satellite.ECCENTRICITY),
            INCLINATION: parseFloat(satellite.INCLINATION),
            RA_OF_ASC_NODE: parseFloat(satellite.RA_OF_ASC_NODE),
            ARG_OF_PERICENTER: parseFloat(satellite.ARG_OF_PERICENTER),
            MEAN_ANOMALY: parseFloat(satellite.MEAN_ANOMALY),
            EPHEMERIS_TYPE: 0,
            CLASSIFICATION_TYPE: "U",
            NORAD_CAT_ID: parseInt(satellite.NORAD_CAT_ID),
            ELEMENT_SET_NO: 999,
            REV_AT_EPOCH: 0,
            BSTAR: 0.00048021,
            MEAN_MOTION_DOT: 0.00005995,
            MEAN_MOTION_DDOT: 0
        };
        
        // Create satellite record using json2satrec
        const satrec = window.satellite.json2satrec(satJson);
        if (!satrec || satrec.error !== 0) return 'Unknown';

        // Calculate time since epoch in minutes
        const timeSinceEpoch = (time - new Date(satellite.EPOCH)) / (1000 * 60);
        
        // Get satellite position using sgp4
        const positionAndVelocity = window.satellite.sgp4(satrec, timeSinceEpoch);
        if (!positionAndVelocity || !positionAndVelocity.position) return 'Unknown';

        const position = positionAndVelocity.position;

        const observerGd = {
            longitude: observerLon * Math.PI / 180,
            latitude: observerLat * Math.PI / 180,
            height: 0.370
        };

        const gmst = window.satellite.gstime(time);
        const positionEcf = window.satellite.eciToEcf(position, gmst);
        const lookAngles = window.satellite.ecfToLookAngles(observerGd, positionEcf);
        const azimuth = lookAngles.azimuth * 180 / Math.PI;

        // Determine direction based on azimuth
        if (azimuth >= 0 && azimuth < 180) {
            return 'S to N';
        } else {
            return 'N to S';
        }
    } catch (error) {
        console.error('Error calculating pass direction:', error);
        return 'Unknown';
    }
}

function getPassDirection(azimuth) {
    if (azimuth < 45 || azimuth > 315) return 'N to S';
    if (azimuth < 135) return 'E to W';
    if (azimuth < 225) return 'S to N';
    return 'W to E';
}

function updatePassPredictions() {
    if (!satellite) return;

    // Check if this is a Celestrak satellite
    if (!satellite.NORAD_CAT_ID) {
        showError('Pass predictions are only available for Celestrak satellites');
        return;
    }

    const observerLat = parseFloat(document.getElementById('observerLat').value);
    const observerLon = parseFloat(document.getElementById('observerLon').value);

    if (isNaN(observerLat) || isNaN(observerLon)) {
        showError('Please enter valid latitude and longitude values');
        return;
    }

    // Validate latitude and longitude ranges
    if (observerLat < -90 || observerLat > 90) {
        showError('Latitude must be between -90 and 90 degrees');
        return;
    }
    if (observerLon < -180 || observerLon > 180) {
        showError('Longitude must be between -180 and 180 degrees');
        return;
    }

    const nextPass = calculateNextPass(satellite, observerLat, observerLon);
    const passResults = document.querySelector('.pass-results');
    
    if (nextPass) {
        const now = new Date();
        const timeUntilPass = nextPass.startTime - now;
        const hours = Math.floor(timeUntilPass / (60 * 60 * 1000));
        const minutes = Math.floor((timeUntilPass % (60 * 60 * 1000)) / (60 * 1000));

        document.getElementById('nextPassTime').textContent = `In ${hours}h ${minutes}m`;
        document.getElementById('maxElevation').textContent = `${nextPass.maxElevation.toFixed(1)}°`;
        document.getElementById('passDuration').textContent = `${Math.floor(nextPass.duration / 60)}m ${Math.floor(nextPass.duration % 60)}s`;
        document.getElementById('passDirection').textContent = nextPass.direction;
        
        passResults.style.display = 'block';
    } else {
        document.getElementById('nextPassTime').textContent = 'No passes in next 24h';
        document.getElementById('maxElevation').textContent = '-';
        document.getElementById('passDuration').textContent = '-';
        document.getElementById('passDirection').textContent = '-';
        
        passResults.style.display = 'block';
    }
}

function updateSatellitePosition(satrec, observerGd) {
    // ... existing position update code ...
    
    // Add these lines at the end of the function
    updateOrbitalElements(satrec);
    calculateNextPass(satrec, observerGd);
}

// Display satellite information in the details panels
function displaySatelliteInfo() {
    // Ensure satellite object exists before trying to access properties
    if (!satellite) return;

    // Update satellite info panel
    document.getElementById('satName').textContent = satellite.OBJECT_NAME || 'N/A';
    document.getElementById('yearLaunched').textContent = formatLaunchDate(satellite.OBJECT_ID) || 'N/A';
    document.getElementById('orbitalPeriod').textContent = `${calculateOrbitalPeriod(satellite) || 'N/A'} minutes`;

    // Update orbital elements panel
    document.getElementById('eccentricity').textContent = (satellite.ECCENTRICITY || 0).toFixed(4);
    document.getElementById('inclination').textContent = `${(satellite.INCLINATION || 0).toFixed(1)}°`;
    document.getElementById('raan').textContent = `${(satellite.RA_OF_ASC_NODE || 0).toFixed(1)}°`;
    document.getElementById('argPerigee').textContent = `${(satellite.ARG_OF_PERICENTER || 0).toFixed(1)}°`;
    document.getElementById('meanMotion').textContent = `${(satellite.MEAN_MOTION || 0).toFixed(2)} rev/day`;
    document.getElementById('meanAnomaly').textContent = `${(satellite.MEAN_ANOMALY || 0).toFixed(1)}°`;

    // Update orbital table at the bottom
    const orbitalTableBody = document.querySelector('#orbital-table tbody');
    if (orbitalTableBody) {
        orbitalTableBody.innerHTML = `
            <tr>
                <th>NORAD ID</th>
                <th>Int'l Designator</th>
                <th>Epoch</th>
                <th>Eccentricity</th>
                <th>Inclination</th>
                <th>RAAN</th>
                <th>Arg. of Perigee</th>
                <th>Mean Anomaly</th>
                <th>Mean Motion</th>
            </tr>
            <tr>
                <td>${escapeHTML(satellite.NORAD_CAT_ID || 'N/A')}</td>
                <td>${escapeHTML(satellite.OBJECT_ID || 'N/A')}</td>
                <td>${escapeHTML(satellite.EPOCH || 'N/A')}</td>
                <td>${escapeHTML((satellite.ECCENTRICITY || 0).toFixed(6))}</td>
                <td>${escapeHTML((satellite.INCLINATION || 0).toFixed(4))}°</td>
                <td>${escapeHTML((satellite.RA_OF_ASC_NODE || 0).toFixed(4))}°</td>
                <td>${escapeHTML((satellite.ARG_OF_PERICENTER || 0).toFixed(4))}°</td>
                <td>${escapeHTML((satellite.MEAN_ANOMALY || 0).toFixed(4))}°</td>
                <td>${escapeHTML((satellite.MEAN_MOTION || 0).toFixed(6))} rev/day</td>
            </tr>
        `;
    }
}

// Load satellite data from local active.json file using NORAD ID
async function loadSatelliteDataFromLocal(satId) {
    showLoading(`Loading satellite data for NORAD ID ${satId}...`);
    let foundSatellite = null;

    try {
        // First check if this is a custom satellite
        const customSat = loadCustomSatellite(satId);
        if (customSat) {
            // For custom satellites, we need to convert TLE data to JSON format
            const satJson = {
                OBJECT_NAME: customSat.OBJECT_NAME,
                OBJECT_ID: customSat.OBJECT_ID,
                EPOCH: customSat.EPOCH,
                MEAN_MOTION: customSat.MEAN_MOTION,
                ECCENTRICITY: customSat.ECCENTRICITY,
                INCLINATION: customSat.INCLINATION,
                RA_OF_ASC_NODE: customSat.RA_OF_ASC_NODE,
                ARG_OF_PERICENTER: customSat.ARG_OF_PERICENTER,
                MEAN_ANOMALY: customSat.MEAN_ANOMALY,
                NORAD_CAT_ID: customSat.NORAD_CAT_ID
            };
            satellite = satJson;
            const titleElement = document.getElementById('satellite-title');
            if (titleElement) {
                titleElement.innerText = satellite.OBJECT_NAME || `Satellite ${satId}`;
            }
            hideLoading(true);
            return true;
        }

        // If not found in custom satellites, try active.json
        const res = await fetch(activeJsonFile);
        if (!res.ok) {
            throw new Error(`Could not fetch ${activeJsonFile}: ${res.statusText}`);
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
            throw new Error(`Data in ${activeJsonFile} is not in the expected array format.`);
        }

        const satIdNum = parseInt(satId, 10);
        foundSatellite = data.find(sat => parseInt(sat.NORAD_CAT_ID, 10) === satIdNum);

        if (!foundSatellite) {
            throw new Error(`NOT_FOUND: No satellite data found for NORAD ID ${satId}.`);
        }

        // Validate required satellite properties
        if (!foundSatellite.OBJECT_NAME || !foundSatellite.OBJECT_ID || !foundSatellite.EPOCH || 
            !foundSatellite.MEAN_MOTION || !foundSatellite.ECCENTRICITY || !foundSatellite.INCLINATION || 
            !foundSatellite.RA_OF_ASC_NODE || !foundSatellite.ARG_OF_PERICENTER || !foundSatellite.MEAN_ANOMALY) {
            throw new Error(`INVALID_DATA: Satellite data for NORAD ID ${satId} is incomplete.`);
        }

        satellite = foundSatellite;

        const titleElement = document.getElementById('satellite-title');
        if (titleElement) {
            titleElement.innerText = satellite.OBJECT_NAME || `Satellite ${satId}`;
        }

        hideLoading(true);
        return true;

    } catch (error) {
        if (error.message.startsWith('NOT_FOUND:')) {
            showError(`This satellite (NORAD ID: ${satId}) is not currently listed as active.`);
        } else if (error.message.startsWith('INVALID_DATA:')) {
            showError(`Satellite data for NORAD ID ${satId} is incomplete or invalid.`);
        } else {
            showError(`Failed to load satellite data: ${error.message}`);
        }
        return false;
    }
} 