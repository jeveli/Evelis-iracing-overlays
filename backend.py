import irsdk
import socket
import json
import time
import yaml # Krävs för att läsa förarnamn: pip install pyyaml

# Inställningar för nätverk
UDP_IP = "127.0.0.1"
UDP_PORT = 12345
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

# Initiera iRacing
ir = irsdk.IRSDK()
ir.startup()

print("Python Backend startad. Väntar på iRacing...")

# Variabler för att hålla koll på sessionen
drivers_map = {} # Mappar CarIdx till Förarnamn
last_session_update = -1 # Håller koll på versionsnumret för sessionen

def get_session_info():
    """Hämtar statisk data som förarnamn och bilnummer"""
    global drivers_map, last_session_update
    
    # Försök hämta versionsnumret för SessionInfo
    try:
        current_update = ir['SessionInfoUpdate']
    except:
        return # Data inte redo än

    # Om versionsnumret har ändrats, parsa YAML-datan igen
    if current_update is not None and current_update != last_session_update:
        last_session_update = current_update
        try:
            # Hämta själva YAML-strängen
            yaml_text = ir.session_info
            
            if yaml_text:
                info = yaml.safe_load(yaml_text)
                
                drivers = info.get('DriverInfo', {}).get('Drivers', [])
                new_drivers_map = {}
                for driver in drivers:
                    idx = driver.get('CarIdx')
                    name = driver.get('UserName')
                    number = driver.get('CarNumber')
                    
                    # Förkorta namnet: "Andersson, Erik" -> "E. Andersson"
                    short_name = name
                    if name and "," in name: 
                        parts = name.split(",")
                        if len(parts) >= 2:
                            short_name = f"{parts[1].strip()[0]}. {parts[0].strip()}"

                    new_drivers_map[idx] = {'name': short_name, 'num': number}
                
                drivers_map = new_drivers_map
                print(f"Session Info uppdaterad (v{current_update}): {len(drivers_map)} förare laddade.")
            
        except Exception as e:
            print(f"Kunde inte tolka session info: {e}")

try:
    while True:
        # Kontrollera anslutning
        if not ir.is_initialized or not ir.is_connected:
            ir.startup()
            time.sleep(1)
            continue

        # Uppdatera statisk data (förarnamn etc)
        get_session_info()

        # Frys telemetridata för detta ögonblick
        ir.freeze_var_buffer_latest()

        # --- HÄMTA ALL DATA FÖR 10 WIDGETS ---
        
        # 1. Speed & RPM & Gear
        speed_ms = ir['Speed'] if ir['Speed'] is not None else 0
        rpm = ir['RPM'] if ir['RPM'] is not None else 0
        gear = ir['Gear'] if ir['Gear'] is not None else 0
        
        # 2. Standings (Kräver bearbetning)
        positions = ir['CarIdxPosition'] if ir['CarIdxPosition'] is not None else []
        
        # Vi skapar en lista med komplett förardata för de som kör
        standings_data = []
        if positions is not None:
            for car_idx, pos in enumerate(positions):
                if pos > 0 and car_idx in drivers_map:
                    standings_data.append({
                        'pos': pos,
                        'name': drivers_map[car_idx]['name'],
                        'num': drivers_map[car_idx]['num']
                    })
            # Sortera listan baserat på position
            standings_data.sort(key=lambda x: x['pos'])

        # 3. Lap Counter
        lap_current = ir['Lap'] if ir['Lap'] is not None else 0
        lap_total = ir['SessionLapsRemain'] if ir['SessionLapsRemain'] is not None else 0 

        # 4. Fuel
        fuel_level = ir['FuelLevel'] if ir['FuelLevel'] is not None else 0 # Liter
        fuel_pct = ir['FuelLevelPct'] if ir['FuelLevelPct'] is not None else 0 # Procent

        # 5. Pedals (Inputs)
        throttle = ir['Throttle'] if ir['Throttle'] is not None else 0
        brake = ir['Brake'] if ir['Brake'] is not None else 0
        clutch = ir['Clutch'] if ir['Clutch'] is not None else 0

        # 6. Temps (Water/Oil)
        oil_temp = ir['OilTemp'] if ir['OilTemp'] is not None else 0
        water_temp = ir['WaterTemp'] if ir['WaterTemp'] is not None else 0

        # 7. Best Lap Time
        best_lap = ir['LapBestLapTime'] if ir['LapBestLapTime'] is not None else 0

        # 8. Last Lap Time
        last_lap = ir['LapLastLapTime'] if ir['LapLastLapTime'] is not None else 0

        # 9. Incident Points
        incidents = ir['PlayerCarMyIncidentCount'] if ir['PlayerCarMyIncidentCount'] is not None else 0

        # 10. Steering Angle
        steering = ir['SteeringWheelAngle'] if ir['SteeringWheelAngle'] is not None else 0

        # --- PAKETERA OCH SKICKA ---
        data = {
            'speed_kmh': round(speed_ms * 3.6),
            'rpm': round(rpm),
            'gear': gear,
            'standings': standings_data[:20], # Topp 20
            'lap_current': lap_current,
            'lap_total': lap_total,
            'fuel_level': round(fuel_level, 1),
            'fuel_pct': round(fuel_pct * 100),
            'inputs': {'t': throttle, 'b': brake, 'c': clutch},
            'temps': {'oil': round(oil_temp), 'water': round(water_temp)},
            'best_lap': best_lap,
            'last_lap': last_lap,
            'incidents': incidents,
            'steering': steering
        }

        # Skicka via UDP
        try:
            message = json.dumps(data).encode('utf-8')
            sock.sendto(message, (UDP_IP, UDP_PORT))
        except Exception as e:
            print(f"Fel vid sändning: {e}")

        time.sleep(0.033) # 30 FPS

except KeyboardInterrupt:
    print("Stänger ner...")
    ir.shutdown()