// Add a debug script to verify the map is loading properly
document.addEventListener('DOMContentLoaded', function() {
    // Check if map container exists
    const mapContainer = document.getElementById('mapid');
    if (!mapContainer) {
        console.error('[MAP DEBUG] Map container #mapid not found in DOM');
        // Insert a visible error message directly into the body
        const errorDiv = document.createElement('div');
        errorDiv.style.color = 'red';
        errorDiv.style.padding = '10px';
        errorDiv.style.marginTop = '10px';
        errorDiv.style.backgroundColor = '#ffeeee';
        errorDiv.style.border = '1px solid red';
        errorDiv.innerText = 'ERROR: Map container #mapid not found! Please check HTML structure.';
        document.body.prepend(errorDiv);
    } else {
        console.log('[MAP DEBUG] Map container found with dimensions:',
            mapContainer.clientWidth + 'x' + mapContainer.clientHeight);
        
        // Force refresh of map container style
        mapContainer.style.display = 'none';
        setTimeout(() => {
            mapContainer.style.display = 'block';
            mapContainer.style.height = '500px';
            mapContainer.style.width = '100%';
            mapContainer.style.border = '2px solid #333';
            console.log('[MAP DEBUG] Forced map container refresh');
        }, 100);
    }
});