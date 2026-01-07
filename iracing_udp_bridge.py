import json
import socket
import time
import math

import irsdk  # pip install pyirsdk

UDP_IP = "127.0.0.1"
UDP_PORT = 12345
HZ = 20

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
ir = irsdk.IRSDK()
LAST_RELATIVE = {"ahead": None, "behind": None}
LAST_SESSION_NUM = None
LAST_SESSION_INFO_UPDATE = None

def is_connected():
    try:
        return bool(getattr(ir, "is_initialized", False)) and bool(getattr(ir, "is_connected", False))
    except Exception:
        return False


def get_float(key, default=0.0):
    try:
        v = ir[key]
        if v is None:
            return default
        return float(v)
    except Exception:
        return default


def get_int(key, default=0):
    try:
        v = ir[key]
        if v is None:
            return default
        return int(v)
    except Exception:
        return default


def get_bool(key, default=False):
    try:
        v = ir[key]
        if v is None:
            return default
        return bool(v)
    except Exception:
        return default


def send(payload):
    sock.sendto(json.dumps(payload).encode("utf-8"), (UDP_IP, UDP_PORT))


def zero_payload():
    return {
        "in_car": False,
        "in_garage": True,
        "on_track": False,
        "speed_kmh": 0,
        "gear": 0,
        "lap_current": 0,
        "lap_total": 0,
        "fuel_level": 0.0,
        "fuel_pct": 0.0,
        "inputs": {"t": 0.0, "b": 0.0},
        "temps": {"oil": 0.0, "water": 0.0},
        "best_lap": 0.0,
        "last_lap": 0.0,
        "incidents": 0,
        "rpm": 0,
        "standings": [],
        "relative": {"ahead": None, "behind": None},
    }


def safe_driver_name(d):
    try:
        if isinstance(d, dict):
            full = d.get("UserName") or d.get("userName") or ""
            if full:
                parts = full.strip().split()
                if len(parts) >= 2:
                    return parts[-1].upper()
                return full.upper()
    except Exception:
        pass
    return "DRIVER"


def _is_num(x):
    try:
        return isinstance(x, (int, float)) and math.isfinite(float(x))
    except Exception:
        return False


def fmt_lap_time(seconds: float) -> str:
    """1:19.406"""
    if not _is_num(seconds) or seconds <= 0:
        return ""
    s = float(seconds)
    m = int(s // 60)
    r = s - m * 60
    return f"{m}:{r:06.3f}"


def fmt_gap(seconds: float) -> str:
    """+2.347 eller +1:02.345"""
    if not _is_num(seconds) or seconds <= 0:
        return ""
    s = float(seconds)
    if s < 60:
        return f"+{s:0.3f}"
    m = int(s // 60)
    r = s - m * 60
    return f"+{m}:{r:06.3f}"


def _short_name(full_name: str) -> str:
    if not full_name:
        return "DRIVER"
    parts = str(full_name).strip().split()
    return (parts[-1] if parts else full_name).upper()


def build_standings(limit=12):
    """
    Robust standings:
      - Primärt: SessionInfo.ResultsPositions
      - Fallback: CarIdxPosition (+ best lap / gap)
    """
    try:
        drv_info = ir["DriverInfo"]
        drivers = drv_info.get("Drivers", []) if isinstance(drv_info, dict) else []

        # player car idx
        try:
            player_idx = int(drv_info.get("DriverCarIdx", -1))
        except Exception:
            player_idx = -1

        # CarIdx -> num/name
        caridx_map = {}
        for d in drivers:
            if not isinstance(d, dict):
                continue
            caridx = d.get("CarIdx")
            if caridx is None:
                continue
            try:
                caridx = int(caridx)
            except Exception:
                continue
            num = str(d.get("CarNumber", "") or "")
            name = _short_name(d.get("UserName", "") or "")
            caridx_map[caridx] = {"num": num, "name": name}

        # session info
        sess_num = int(ir["SessionNum"])
        sess_info = ir["SessionInfo"]
        sessions = sess_info.get("Sessions", []) if isinstance(sess_info, dict) else []
        session = sessions[sess_num] if 0 <= sess_num < len(sessions) else {}
        session_type = (session.get("SessionType") or "").lower()
        results = session.get("ResultsPositions") or []

        # "Time attack"-typer där vi vill visa: "1:18.738 +0.300" (mot P1)
        is_time_attack = ("practice" in session_type) or ("qual" in session_type) or ("warmup" in session_type)

        # --- Primärt: ResultsPositions ---
        if results:
            f2 = _safe_arr("CarIdxF2Time")

            def best_from_rp(rp_dict):
                """Försök hitta bästa tid för en ResultsPositions-rad."""
                best = rp_dict.get("FastestTime", None)
                if not _is_num(best) or float(best) <= 0:
                    best = rp_dict.get("BestLapTime", None)
                if not _is_num(best) or float(best) <= 0:
                    best = rp_dict.get("Time", None)
                return float(best) if _is_num(best) and float(best) > 0 else None

            # P1-tid för gap-beräkning (Practice/Qual/Warmup)
            leader_best = None
            if is_time_attack:
                # Primärt: position 1
                for rp in results:
                    if not isinstance(rp, dict):
                        continue
                    try:
                        if int(rp.get("Position", 0) or 0) == 1:
                            leader_best = best_from_rp(rp)
                            break
                    except Exception:
                        continue
                # Fallback: minsta positiva tid om P1 saknar tid
                if leader_best is None:
                    bests = []
                    for rp in results:
                        if not isinstance(rp, dict):
                            continue
                        b = best_from_rp(rp)
                        if b is not None:
                            bests.append(b)
                    leader_best = min(bests) if bests else None

            out = []
            for rp in results:
                if not isinstance(rp, dict):
                    continue
                caridx = rp.get("CarIdx", None)
                if caridx is None:
                    continue
                caridx = int(caridx)

                pos = int(rp.get("Position", 0) or 0)
                if pos <= 0:
                    continue

                info = caridx_map.get(caridx, {"num": "", "name": "DRIVER"})
                right = ""

                if is_time_attack:
                    best = best_from_rp(rp)
                    lap_txt = fmt_lap_time(best) if best is not None else ""

                    if pos == 1:
                        # P1: visa bara tiden (om den finns)
                        right = lap_txt
                    else:
                        gap_txt = ""
                        if best is not None and leader_best is not None:
                            gap_txt = fmt_gap(float(best) - float(leader_best))

                        # Visa tid + gap på samma rad
                        if lap_txt and gap_txt:
                            right = f"{lap_txt} {gap_txt}"
                        else:
                            right = lap_txt or gap_txt
                else:
                    behind = rp.get("Behind", None)
                    if _is_num(behind) and float(behind) > 0:
                        right = fmt_gap(behind)
                    else:
                        interval = rp.get("Interval", None)
                        if _is_num(interval) and float(interval) > 0:
                            right = fmt_gap(interval)
                        else:
                            if f2 is not None and caridx < len(f2):
                                try:
                                    g = float(f2[caridx])
                                    if math.isfinite(g) and g > 0 and pos != 1:
                                        right = fmt_gap(g)
                                except Exception:
                                    pass
                    if pos == 1:
                        right = ""

                out.append({
                    "pos": pos,
                    "num": info["num"],
                    "name": info["name"],
                    "me": (caridx == player_idx),
                    "gap": right
                })

            out.sort(key=lambda x: x["pos"])
            return out[:limit]

        # --- Fallback: CarIdxPosition ---
        car_pos = _safe_arr("CarIdxPosition")
        if car_pos is None:
            return []

        bestlap = _safe_arr("CarIdxBestLapTime")
        f2 = _safe_arr("CarIdxF2Time")
        est = _safe_arr("CarIdxEstTime")

        # varvtid-estimat för wrap (om vi behöver)
        lap_time_est = get_float("LapLastLapTime", 0.0)
        if not _is_num(lap_time_est) or float(lap_time_est) <= 0:
            lap_time_est = get_float("LapBestLapTime", 0.0)
        lap_time_est = float(lap_time_est) if _is_num(lap_time_est) and float(lap_time_est) > 0 else 0.0

        # hitta leader est för race-gap fallback
        leader_est = None
        if est is not None:
            for ci in range(len(car_pos)):
                try:
                    p = int(car_pos[ci] or 0)
                except Exception:
                    continue
                if p == 1:
                    e = _arr_get(est, ci, None)
                    if _is_num(e):
                        leader_est = float(e)
                    break

        # P1-tid för gap-beräkning i fallback-läge (Practice/Qual/Warmup)
        leader_bt = None
        if is_time_attack:
            for ci in range(len(car_pos)):
                try:
                    p = int(car_pos[ci] or 0)
                except Exception:
                    continue
                if p == 1:
                    bt = _arr_get(bestlap, ci, None)
                    if _is_num(bt) and float(bt) > 0:
                        leader_bt = float(bt)
                    break
            if leader_bt is None:
                bests = []
                for ci in range(len(car_pos)):
                    bt = _arr_get(bestlap, ci, None)
                    if _is_num(bt) and float(bt) > 0:
                        bests.append(float(bt))
                leader_bt = min(bests) if bests else None

        out = []
        for ci in range(len(car_pos)):
            try:
                pos = int(car_pos[ci] or 0)
            except Exception:
                continue
            if pos <= 0:
                continue

            info = caridx_map.get(ci, {"num": "", "name": "DRIVER"})
            right = ""

            if is_time_attack:
                bt = _arr_get(bestlap, ci, None)
                lap_txt = fmt_lap_time(bt) if _is_num(bt) and float(bt) > 0 else ""

                if pos == 1:
                    right = lap_txt
                else:
                    gap_txt = ""
                    if _is_num(bt) and float(bt) > 0 and leader_bt is not None:
                        gap_txt = fmt_gap(float(bt) - float(leader_bt))

                    if lap_txt and gap_txt:
                        right = f"{lap_txt} {gap_txt}"
                    else:
                        right = lap_txt or gap_txt
            else:
                # Race: försök F2Time först
                if f2 is not None and ci < len(f2):
                    try:
                        g = float(f2[ci])
                        if math.isfinite(g) and g > 0 and pos != 1:
                            right = fmt_gap(g)
                    except Exception:
                        pass

                # annars est-diff mot leader
                if right == "" and leader_est is not None and est is not None:
                    e = _arr_get(est, ci, None)
                    if _is_num(e):
                        dt = float(e) - float(leader_est)
                        if dt < 0 and lap_time_est > 0:
                            dt += lap_time_est
                        if _is_num(dt) and float(dt) > 0 and pos != 1:
                            right = fmt_gap(float(dt))

                if pos == 1:
                    right = ""

            out.append({
                "pos": pos,
                "num": info["num"],
                "name": info["name"],
                "me": (ci == player_idx),
                "gap": right
            })

        out.sort(key=lambda x: x["pos"])
        return out[:limit]

    except Exception:
        return []





def _safe_arr(key):
    try:
        return ir[key]
    except Exception:
        return None


def _arr_get(arr, idx, default=None):
    try:
        if arr is None:
            return default
        if idx < 0 or idx >= len(arr):
            return default
        v = arr[idx]
        return v if v is not None else default
    except Exception:
        return default


def _lap_gap_text(laps: int) -> str:
    if laps <= 0:
        return ""
    return f"+{laps}L"


def build_relative(lap_time_est: float):
    """
    Robust REL:
      1) ResultsPositions (om den finns och innehåller player)
      2) CarIdxPosition (om den är giltig)
      3) Fallback: sortera på (LapCompleted, EstTime) och ta grannarna
    Behåller senaste kända värden om iRacing ger 0/None under pits/sessionswitch.
    """
    global LAST_RELATIVE

    try:
        drv_info = ir["DriverInfo"]
        drivers = drv_info.get("Drivers", []) if isinstance(drv_info, dict) else []

        # player car idx
        try:
            player_idx = int(drv_info.get("DriverCarIdx", -1))
        except Exception:
            player_idx = -1
        if player_idx < 0:
            return LAST_RELATIVE

        # CarIdx -> num/name
        caridx_map = {}
        for d in drivers:
            if not isinstance(d, dict):
                continue
            caridx = d.get("CarIdx")
            if caridx is None:
                continue
            try:
                caridx = int(caridx)
            except Exception:
                continue
            num = str(d.get("CarNumber", "") or "")
            name = _short_name(d.get("UserName", "") or "")
            caridx_map[caridx] = {"num": num, "name": name}

        est = _safe_arr("CarIdxEstTime")
        lap_completed = _safe_arr("CarIdxLapCompleted")
        if lap_completed is None:
            lap_completed = _safe_arr("CarIdxLap")
        car_pos = _safe_arr("CarIdxPosition")

        lap_time_est = float(lap_time_est) if _is_num(lap_time_est) and float(lap_time_est) > 0 else 0.0

        def make_entry(other_idx: int, direction: str):
            if other_idx is None:
                return None
            other_idx = int(other_idx)

            info = caridx_map.get(other_idx, {"num": "", "name": "DRIVER"})

            my_laps = int(_arr_get(lap_completed, player_idx, 0) or 0)
            other_laps = int(_arr_get(lap_completed, other_idx, 0) or 0)

            if direction == "ahead":
                laps_gap = other_laps - my_laps
            else:
                laps_gap = my_laps - other_laps

            if laps_gap >= 1:
                return {"num": info["num"], "name": info["name"], "gap": _lap_gap_text(laps_gap)}

            my_est = _arr_get(est, player_idx, None)
            other_est = _arr_get(est, other_idx, None)
            if not _is_num(my_est) or not _is_num(other_est):
                return {"num": info["num"], "name": info["name"], "gap": "--"}

            my_est = float(my_est)
            other_est = float(other_est)
            dt = (other_est - my_est) if direction == "ahead" else (my_est - other_est)

            if dt < 0 and lap_time_est > 0:
                dt += lap_time_est

            if not _is_num(dt) or float(dt) <= 0:
                return {"num": info["num"], "name": info["name"], "gap": "--"}

            return {"num": info["num"], "name": info["name"], "gap": (fmt_gap(float(dt)) or "--")}

        ahead_idx = None
        behind_idx = None

        # 1) ResultsPositions
        try:
            sess_num = int(ir["SessionNum"])
            sess_info = ir["SessionInfo"]
            sessions = sess_info.get("Sessions", []) if isinstance(sess_info, dict) else []
            session = sessions[sess_num] if 0 <= sess_num < len(sessions) else {}
            results = session.get("ResultsPositions") or []
        except Exception:
            results = []

        if results:
            pos_to_caridx = {}
            my_pos = None
            for rp in results:
                if not isinstance(rp, dict):
                    continue
                ci = rp.get("CarIdx", None)
                po = rp.get("Position", None)
                if ci is None or po is None:
                    continue
                try:
                    ci = int(ci)
                    po = int(po)
                except Exception:
                    continue
                if po <= 0:
                    continue
                pos_to_caridx[po] = ci
                if ci == player_idx:
                    my_pos = po

            if my_pos:
                ahead_idx = pos_to_caridx.get(my_pos - 1)
                behind_idx = pos_to_caridx.get(my_pos + 1)

        # 2) CarIdxPosition
        if (ahead_idx is None and behind_idx is None) and car_pos is not None:
            try:
                my_pos = int(_arr_get(car_pos, player_idx, 0) or 0)
            except Exception:
                my_pos = 0

            if my_pos > 0:
                target_a = my_pos - 1
                target_b = my_pos + 1
                for i in range(len(car_pos)):
                    try:
                        p = int(car_pos[i] or 0)
                    except Exception:
                        continue
                    if p == target_a:
                        ahead_idx = i
                    elif p == target_b:
                        behind_idx = i

        # 3) Fallback: sortera på (lap_completed, est_time) och ta grannarna runt player
        if (ahead_idx is None and behind_idx is None) and est is not None and lap_completed is not None:
            pack = []
            for ci in range(len(est)):
                e = _arr_get(est, ci, None)
                if not _is_num(e):
                    continue
                l = int(_arr_get(lap_completed, ci, 0) or 0)
                pack.append((l, float(e), ci))

            if pack:
                pack.sort(key=lambda x: (x[0], x[1]))
                me_index = None
                for idx, (_l, _e, _ci) in enumerate(pack):
                    if _ci == player_idx:
                        me_index = idx
                        break

                if me_index is not None:
                    if me_index + 1 < len(pack):
                        ahead_idx = pack[me_index + 1][2]
                    if me_index - 1 >= 0:
                        behind_idx = pack[me_index - 1][2]

        out = {
            "ahead": make_entry(ahead_idx, "ahead"),
            "behind": make_entry(behind_idx, "behind"),
        }

        # Om iRacing tillfälligt saknar data (pits/sessionswitch) – håll kvar senaste kända
        if out["ahead"] is None and out["behind"] is None:
            return LAST_RELATIVE

        LAST_RELATIVE = out
        return out

    except Exception:
        return LAST_RELATIVE



def main():
    try:
        ir.startup()
    except Exception:
        pass

    last_speed_kmh = 0
    last_ok_time = 0.0

    global LAST_SESSION_NUM, LAST_SESSION_INFO_UPDATE

    while True:
        try:
            if not getattr(ir, "is_initialized", False):
                try:
                    ir.startup()
                except Exception:
                    pass

            # VIKTIGT: pyirsdk måste uppdateras varje loop
            try:
                ir.update()
            except Exception:
                pass

            # Freeze är valfritt; om du kör det, gör det efter update()
            if hasattr(ir, "freeze_var_buffer_latest"):
                try:
                    ir.freeze_var_buffer_latest()
                except Exception:
                    pass

            if not is_connected():
                send(zero_payload())

                if hasattr(ir, "unfreeze_var_buffer_latest"):
                    try:
                        ir.unfreeze_var_buffer_latest()
                    except Exception:
                        pass

                time.sleep(1.0 / HZ)
                continue

            # Om session byts, nollställ cache så UI inte “hänger kvar”
            try:
                sess_num_now = int(ir["SessionNum"])
            except Exception:
                sess_num_now = None

            try:
                sess_info_update_now = int(ir["SessionInfoUpdate"])
            except Exception:
                sess_info_update_now = None

            if sess_num_now != LAST_SESSION_NUM or sess_info_update_now != LAST_SESSION_INFO_UPDATE:
                LAST_SESSION_NUM = sess_num_now
                LAST_SESSION_INFO_UPDATE = sess_info_update_now
                # valfritt men bra: tvinga nya REL/standings att “släppa” gamla värden
                # LAST_RELATIVE = {"ahead": None, "behind": None}

                send(zero_payload())

                if hasattr(ir, "unfreeze_var_buffer_latest"):
                    try:
                        ir.unfreeze_var_buffer_latest()
                    except Exception:
                        pass

                time.sleep(1.0 / HZ)
                continue

            # --- Status ---
            is_in_garage = get_bool("IsInGarage", False)
            is_on_track = get_bool("IsOnTrack", False) or get_bool("IsOnTrackCar", False)
            is_in_car = get_bool("IsInCar", False) or get_bool("IsOnTrackCar", False) or is_on_track

            speed_ms = get_float("Speed", 0.0)
            speed_kmh = int(round(speed_ms * 3.6))
            speed_kmh = max(0, min(450, speed_kmh))

            # Mild stabilisering
            if abs(speed_kmh - last_speed_kmh) > 50:
                if time.time() - last_ok_time < 2.0:
                    speed_kmh = last_speed_kmh

            last_speed_kmh = speed_kmh
            last_ok_time = time.time()

            # Estimerad varvtid för wrap
            lap_time_est = get_float("LapLastLapTime", 0.0)
            if not _is_num(lap_time_est) or float(lap_time_est) <= 0:
                lap_time_est = get_float("LapBestLapTime", 0.0)

            payload = {
                "in_car": is_in_car,
                "in_garage": is_in_garage,
                "on_track": is_on_track,

                "speed_kmh": speed_kmh,
                "gear": get_int("Gear", 0),
                "lap_current": get_int("Lap", 0),
                "lap_total": get_int("SessionLaps", 0),
                "fuel_level": get_float("FuelLevel", 0.0),
                "fuel_pct": max(0.0, min(100.0, get_float("FuelLevelPct", 0.0) * 100.0)),
                "inputs": {
                    "t": max(0.0, min(1.0, get_float("Throttle", 0.0))),
                    "b": max(0.0, min(1.0, get_float("Brake", 0.0))),
                },
                "temps": {
                    "oil": get_float("OilTemp", 0.0),
                    "water": get_float("WaterTemp", 0.0),
                },
                "best_lap": get_float("LapBestLapTime", 0.0),
                "last_lap": get_float("LapLastLapTime", 0.0),
                "incidents": get_int("PlayerCarMyIncidentCount", 0),
                "rpm": get_int("RPM", 0),
                "standings": build_standings(),
                "relative": build_relative(lap_time_est),
            }

            send(payload)

            if hasattr(ir, "unfreeze_var_buffer_latest"):
                try:
                    ir.unfreeze_var_buffer_latest()
                except Exception:
                    pass

            time.sleep(1.0 / HZ)

        except Exception:
            try:
                send(zero_payload())
            except Exception:
                pass

            if hasattr(ir, "unfreeze_var_buffer_latest"):
                try:
                    ir.unfreeze_var_buffer_latest()
                except Exception:
                    pass

            time.sleep(0.2)
            
if __name__ == "__main__":
    main()
