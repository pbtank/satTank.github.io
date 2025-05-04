import requests
import json
import time
import os
from pathlib import Path

# Define categories and their corresponding Celestrak groups
CATEGORIES = {
    'active': 'active',
    'stations': 'stations',
    'weather': 'weather',
    'noaa': 'noaa',
    'goes': 'goes',
    'resource': 'resource',
    'amateur': 'amateur',
    'starlink': 'starlink'
}

def fetch_category_data(category):
    """Fetch satellite data for a specific category from Celestrak."""
    base_url = 'https://celestrak.org/NORAD/elements/gp.php'
    params = {
        'GROUP': CATEGORIES[category],
        'FORMAT': 'json'
    }
    
    try:
        response = requests.get(base_url, params=params)
        response.raise_for_status()  # Raise an exception for HTTP errors
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data for {category}: {e}")
        return None

def fetch_iss_data():
    """Fetch ISS data from Celestrak's supplemental TLE endpoint."""
    url = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json'
    try:
        response = requests.get(url)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching ISS data: {e}")
        return None

def save_data_to_file(category, data):
    """Save the fetched data to a JSON file."""
    if data is None:
        return
    # test command
    # Create data directory if it doesn't exist
    data_dir = Path('data')
    data_dir.mkdir(exist_ok=True)
    
    # Save to JSON file
    file_path = data_dir / f'{category}.json'
    try:
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"Saved {category} data to {file_path}")
    except IOError as e:
        print(f"Error saving {category} data: {e}")

def update_all_data():
    """Update data for all categories."""
    for category in CATEGORIES:
        print(f"Fetching {category} satellite data...")
        data = fetch_category_data(category)
        save_data_to_file(category, data)
        # Add a delay between requests to avoid rate limiting
        time.sleep(1)
    
    # Fetch and save ISS data separately
    print("Fetching ISS data...")
    iss_data = fetch_iss_data()
    if iss_data:
        # Update the active satellites data with the latest ISS data
        active_file = Path('data/active.json')
        if active_file.exists():
            try:
                with open(active_file, 'r') as f:
                    active_data = json.load(f)
                
                # Update or add ISS data
                for i, sat in enumerate(active_data):
                    if sat.get('NORAD_CAT_ID') == 25544:
                        active_data[i] = iss_data[0]  # Update existing ISS data
                        break
                else:
                    active_data.append(iss_data[0])  # Add ISS if not found
                
                # Save updated active satellites data
                with open(active_file, 'w') as f:
                    json.dump(active_data, f, indent=2)
                print("Updated ISS data in active.json")
            except Exception as e:
                print(f"Error updating ISS data: {e}")

def watch_mode():
    """Run the update process continuously."""
    while True:
        print("\nUpdating satellite data...")
        update_all_data()
        print("\nWaiting for 1 hour before next update...")
        time.sleep(3600)  # Wait for 1 hour

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == '--watch':
        watch_mode()
    else:
        update_all_data() 