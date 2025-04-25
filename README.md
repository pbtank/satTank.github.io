# SatTank

A minimalistic web application to track satellites in real-time, visualize their orbits, ground tracks, and footprints on an interactive map, and predict passes over a specific location.

## Usage

This application is hosted on GitHub Pages. You can access it directly via the repository's GitHub Pages link:

[https://carbform.github.io/carbsat]

1.  The main page lists active satellites. You can sort them or filter by category.
2.  Click on a satellite name to view its dedicated tracking page.
3.  On the tracking page:
    *   Observe the satellite's real-time position on the map.
    *   Use the map controls to change the map type or toggle overlays (orbit, ground track, footprint).
    *   View detailed satellite information and orbital elements in the side panels.
    *   Enter observer latitude and longitude in the "Next Pass at a Location" panel and click "Predict" to see upcoming passes and a polar plot visualization.

## Attributions

This project utilizes several excellent open-source libraries and data sources:

*   **Satellite Data:** Two-Line Element (TLE) sets primarily sourced from [Celestrak](https://celestrak.org/). Maintained by Dr. T.S. Kelso.
*   **Core Calculation Library:** [satellite.js](https://github.com/shashwatak/satellite-js) for orbital propagation and coordinate transformations.
*   **Mapping Library:** [Leaflet](https://leafletjs.com/) for interactive maps.
    *   **Map Tiles:**
        *   [OpenStreetMap](https://www.openstreetmap.org/copyright)
        *   [CARTO](https://carto.com/attributions) (Dark map)
        *   [Esri](https://www.esri.com/en-us/home) (Satellite imagery) - Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community
        *   [OpenTopoMap](https://opentopomap.org/) (Terrain map, CC-BY-SA)
*   **Charting Library:** [Plotly.js](https://plotly.com/javascript/) for creating the polar plot pass visualizations.
*   **Icons:** [Font Awesome](https://fontawesome.com/) for icons used throughout the interface.

## Development

Developed by:

*   [Priyansu Tank](https://pbtank.github.io/Tank_Priyansu/)
*   [Carbform](https://github.com/carbform)

Version: 2.1 (Beta) 