# SatTank

A minimalistic web application to track satellites in real-time, visualize their orbits, ground tracks, and footprints on an interactive map, and predict passes over a specific location.

## Features

*   **Real-time Satellite Tracking:** View the current position of numerous satellites on an interactive world map.
*   **Orbit Visualization:** Display satellite orbits, ground tracks, and sensor footprints.
*   **Pass Prediction:** Calculate and visualize upcoming satellite passes for any observer location using polar plots.
*   **Data Filtering & Sorting:** Easily find satellites by category or sort the main list.
*   **Custom TLE Input:** Add and track satellites using custom Two-Line Element sets.

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

*   **Satellite Data:** Two-Line Element (TLE) sets primarily sourced from [Celestrak](https://celestrak.org/), maintained by Dr. T.S. Kelso.
*   **Core Calculation Library:** [satellite.js](https://github.com/shashwatak/satellite-js) for orbital propagation and coordinate transformations.
*   **Mapping Library:** [Leaflet](https://leafletjs.com/) for interactive maps.
    *   **Map Tiles:** OpenStreetMap, CARTO (Dark), Esri (Satellite), OpenTopoMap.
*   **Charting Library:** [Plotly.js](https://plotly.com/javascript/) for polar plot pass visualizations.
*   **Table Library:** [DataTables](https://datatables.net/) for interactive satellite list tables.
*   **Icons:** [Font Awesome](https://fontawesome.com/) for UI icons.
*   **Fonts:** IBM Plex Mono, NType82, Ndot-55.

## Development

Developed by:

*   [Priyansu Tank](https://pbtank.github.io/Tank_Priyansu/)
*   [Carbform](https://github.com/carbform)

Version: 2.1 (Beta)