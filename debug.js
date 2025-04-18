// Debug utility for satellite coordinates
document.addEventListener('DOMContentLoaded', function() {
    console.log('[COORD DEBUG] Starting coordinate validation');
    
    // Test with known good values for NOAA 19
    const knownGoodTLE = [
        'NOAA 19',
        '1 33591U 09005A   23365.51612771  .00000337  00000+0  21236-3 0  9993',
        '2 33591  99.1126 264.6569 0014798 109.1066 251.1673 14.12503936765083'
    ];
    
    if (typeof satellite === 'undefined') {
        console.error('[COORD DEBUG] satellite.js library not loaded properly');
        return;
    }
    
    try {
        // Parse the TLE
        const satrec = satellite.twoline2satrec(knownGoodTLE[1], knownGoodTLE[2]);
        
        // Current time
        const now = new Date();
        
        // Propagate satellite using time
        const positionAndVelocity = satellite.propagate(satrec, now);
        const positionEci = positionAndVelocity.position;
        
        if (!positionEci) {
            console.error('[COORD DEBUG] Failed to calculate position for NOAA 19');
            return;
        }
        
        // Convert the position to geographic coordinates
        const gmst = satellite.gstime(now);
        const positionGd = satellite.eciToGeodetic(positionEci, gmst);
        
        // Convert to degrees
        const latitudeRad = positionGd.latitude;
        const longitudeRad = positionGd.longitude;
        const altitude = positionGd.height;
        
        const latitudeDeg = satellite.degreesLat(latitudeRad);
        const longitudeDeg = satellite.degreesLong(longitudeRad);
        
        console.log('[COORD DEBUG] NOAA 19 coordinates:');
        console.log(`  Latitude (deg): ${latitudeDeg.toFixed(4)}`);
        console.log(`  Longitude (deg): ${longitudeDeg.toFixed(4)}`);
        console.log(`  Altitude (km): ${altitude.toFixed(4)}`);
        
        console.log('[COORD DEBUG] Raw ECI position:', positionEci);
        console.log('[COORD DEBUG] GMST:', gmst);
        console.log('[COORD DEBUG] Raw geodetic position:', positionGd);
        
        // Add test entry to the table for validation
        const tableBody = document.getElementById('satellite-info-body');
        if (tableBody) {
            const debugRow = document.createElement('tr');
            debugRow.style.backgroundColor = '#ffe0e0';
            debugRow.innerHTML = `
                <td>DEBUG NOAA 19</td>
                <td>${latitudeDeg.toFixed(4)}</td>
                <td>${longitudeDeg.toFixed(4)}</td>
                <td>${altitude.toFixed(4)}</td>
                <td colspan="7">Debug reference coordinates</td>
            `;
            tableBody.appendChild(debugRow);
        }
    } catch (error) {
        console.error('[COORD DEBUG] Error during calculation:', error);
    }
});