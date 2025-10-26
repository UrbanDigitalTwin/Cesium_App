import pandas as pd
import requests
import numpy as np # <-- New Library for Chunking

# --- CONFIGURATION ---
# 1. ***CRITICAL: Ensure this is your valid, non-expired OpenRouteService API key***
ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImQ1ZTM2MDRjOGI0ZjQ0YmFhYjM2YzAyMTc0MzlhZmI5IiwiaCI6Im11cm11cjY0In0=" 

# ORS Snapping Endpoint (Using the explicit 'driving-car' profile)
ORS_ENDPOINT = "https://api.openrouteservice.org/v2/snap/driving-car"

# A conservative batch size
BATCH_SIZE = 10 

# File Names
CSV_FILE_IN = "mock_flood_data.csv"
CSV_FILE_OUT = "mock_flood_data_snapped_FINAL_SUCCESS.csv" 
# ---------------------

def snap_coordinates_to_road_fixed(df, api_key):
    """
    Snaps all coordinates using chunking and correctly retrieves the 
    snapped coordinates from the 'locations' field.
    """
    if api_key == "YOUR_ORS_API_KEY":
        print("ERROR: Please replace 'YOUR_ORS_API_KEY' with a real key.")
        return []

    all_snapped_results = []
    total_points = len(df)
    
    df_chunks = np.array_split(df, np.ceil(total_points / BATCH_SIZE))
    
    print(f"Total points: {total_points}. Splitting into {len(df_chunks)} batch requests of size up to {BATCH_SIZE}.")

    for i, chunk in enumerate(df_chunks):
        
        print(f"\nProcessing Batch {i+1}/{len(df_chunks)} (Points {chunk.index[0]} to {chunk.index[-1]})...")
        
        # Prepare coordinates for the API: ORS expects [longitude, latitude]
        coordinates_list = chunk[['Longitude (Dec. Deg)', 'Latitude (Dec. Deg)']].values.tolist()
        
        headers = {
            'Accept': 'application/json',
            'Authorization': api_key,
            'Content-Type': 'application/json'
        }
        
        body = {
            "locations": coordinates_list,
        }
        
        try:
            response = requests.post(ORS_ENDPOINT, json=body, headers=headers)
            response.raise_for_status() 
            data = response.json()

            # --- CRITICAL FIX: RETRIEVING FROM 'locations' KEY ---
            snapped_locations = data.get('locations')

            if snapped_locations and len(snapped_locations) == len(chunk):
                # The returned format is [longitude, latitude] in the 'location' field.
                for loc in snapped_locations:
                    lon = loc['location'][0]
                    lat = loc['location'][1]
                    all_snapped_results.append((lat, lon))
                
                print(f"Batch {i+1} successful. {len(chunk)} points snapped.")
            else:
                # Should not happen with 200 OK, but handles potential API errors
                print(f"Error in Batch {i+1}: API returned unexpected data structure.")
                return [] 

        except requests.exceptions.HTTPError as e:
            print(f"API Request failed in Batch {i+1} with HTTP Error: {e}")
            try:
                error_details = response.json().get('error', {})
                print(f"API Error Details: {error_details.get('message', 'No specific error message provided.')}")
            except:
                pass
            return []
        except Exception as e:
            print(f"An unexpected error occurred in Batch {i+1}: {e}")
            return []
            
    return all_snapped_results

def main():
    try:
        df = pd.read_csv(CSV_FILE_IN)
    except FileNotFoundError:
        print(f"Error: The file '{CSV_FILE_IN}' was not found.")
        return

    snapped_coords = snap_coordinates_to_road_fixed(df, ORS_API_KEY)
    
    if len(snapped_coords) == len(df):
        print("\n--- Script Finished Successfully ---")
        df['Snapped Latitude (Road)'] = [lat for lat, lon in snapped_coords]
        df['Snapped Longitude (Road)'] = [lon for lat, lon in snapped_coords]
        df.to_csv(CSV_FILE_OUT, index=False)
        print(f"Updated data saved to: {CSV_FILE_OUT}")
        print("The new columns are 'Snapped Latitude (Road)' and 'Snapped Longitude (Road)'.")
    else:
        print("\n--- Script Finished with Errors ---")
        print("The API request failed due to an underlying HTTP or authentication error.")

if __name__ == "__main__":
    main()