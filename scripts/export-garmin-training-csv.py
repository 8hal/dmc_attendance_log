#!/usr/bin/env python3
"""Export last ~3 months of Garmin activities to CSV for agent handoff."""

import csv
import json
import os
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

from garminconnect import Garmin

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "exports"
DAYS = 92


def f_to_c(f):
    if f is None:
        return None
    return round((float(f) - 32) * 5 / 9, 1)


def pace_str(mps):
    if not mps or mps <= 0:
        return ""
    sec = 1000 / mps
    return f"{int(sec // 60)}:{int(sec % 60):02d}"


def dur_str(sec):
    if not sec:
        return ""
    sec = int(sec)
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    token_path = os.path.expanduser("~/.garminconnect/garmin_tokens.json")

    client = Garmin()
    client.login(tokenstore=token_path)

    end = datetime.now()
    start = end - timedelta(days=DAYS)
    start_str = start.strftime("%Y-%m-%d")

    all_acts = []
    start_idx = 0
    batch = 100
    while start_idx <= 500:
        batch_acts = client.get_activities(start_idx, batch)
        if not batch_acts:
            break
        for a in batch_acts:
            date = (a.get("startTimeLocal") or "")[:10]
            if date and date >= start_str:
                all_acts.append(a)
        oldest = min((a.get("startTimeLocal") or "9999")[:10] for a in batch_acts)
        start_idx += batch
        if len(batch_acts) < batch or oldest < start_str:
            break

    seen = set()
    acts = []
    for a in sorted(all_acts, key=lambda x: x.get("startTimeLocal", "")):
        aid = a.get("activityId")
        if aid in seen:
            continue
        seen.add(aid)
        acts.append(a)

    fieldnames = [
        "date", "start_time_local", "day_of_week",
        "activity_id", "activity_type", "activity_name",
        "distance_km", "duration_sec", "duration_hms", "pace_avg_min_per_km",
        "avg_hr", "max_hr", "min_hr",
        "elevation_gain_m", "elevation_loss_m",
        "avg_cadence", "max_cadence",
        "avg_power_w", "max_power_w", "normalized_power_w",
        "aerobic_te", "anaerobic_te", "training_effect_label",
        "activity_vo2max", "training_load",
        "calories", "avg_stroke_rate",
        "temp_c", "humidity_pct", "dewpoint_c", "weather_desc",
        "device_name",
        "laps_count", "km_1_pace", "km_1_hr", "last_km_pace", "last_km_hr",
        "notes_for_analyst",
    ]

    rows = []
    for a in acts:
        date = (a.get("startTimeLocal") or "")[:10]
        time_local = (a.get("startTimeLocal") or "")[11:19]
        try:
            dow = datetime.strptime(date, "%Y-%m-%d").strftime("%a")
        except ValueError:
            dow = ""

        dist = a.get("distance") or 0
        dur = a.get("duration") or 0
        mps = dist / dur if dur > 0 else 0
        tk = (a.get("activityType") or {}).get("typeKey", "")

        temp_c = hum = dew_c = wdesc = ""
        try:
            w = client.get_activity_weather(a["activityId"])
            temp_c = f_to_c(w.get("temp"))
            hum = w.get("relativeHumidity")
            dew_c = f_to_c(w.get("dewPoint"))
            wdesc = (w.get("weatherTypeDTO") or {}).get("desc", "")
        except Exception:
            pass

        laps_count = km1_pace = km1_hr = last_pace = last_hr = ""
        if tk == "running" and dist > 1000:
            try:
                splits = client.get_activity_splits(a["activityId"])
                laps = splits.get("lapDTOs") or []
                valid = [lap for lap in laps if (lap.get("distance") or 0) >= 500]
                laps_count = len(valid)
                if valid:
                    l0 = valid[0]
                    d0, t0 = l0.get("distance") or 0, l0.get("duration") or 0
                    if d0 and t0:
                        km1_pace = pace_str(d0 / t0)
                        km1_hr = l0.get("averageHR") or ""
                    ln = valid[-1]
                    dn, tn = ln.get("distance") or 0, ln.get("duration") or 0
                    if dn and tn:
                        last_pace = pace_str(dn / tn)
                        last_hr = ln.get("averageHR") or ""
            except Exception:
                pass

        rows.append({
            "date": date,
            "start_time_local": time_local,
            "day_of_week": dow,
            "activity_id": a.get("activityId"),
            "activity_type": tk,
            "activity_name": a.get("activityName", ""),
            "distance_km": round(dist / 1000, 2) if dist else "",
            "duration_sec": int(dur) if dur else "",
            "duration_hms": dur_str(dur),
            "pace_avg_min_per_km": pace_str(mps) if tk == "running" else "",
            "avg_hr": a.get("averageHR") or "",
            "max_hr": a.get("maxHR") or "",
            "min_hr": a.get("minHR") or "",
            "elevation_gain_m": round(a.get("elevationGain") or 0, 1),
            "elevation_loss_m": round(a.get("elevationLoss") or 0, 1),
            "avg_cadence": a.get("averageRunningCadenceInStepsPerMinute") or "",
            "max_cadence": a.get("maxRunningCadenceInStepsPerMinute") or "",
            "avg_power_w": round(a.get("avgPower") or 0, 1) or "",
            "max_power_w": round(a.get("maxPower") or 0, 1) or "",
            "normalized_power_w": round(a.get("normPower") or 0, 1) or "",
            "aerobic_te": round(a.get("aerobicTrainingEffect") or 0, 1) or "",
            "anaerobic_te": round(a.get("anaerobicTrainingEffect") or 0, 1) or "",
            "training_effect_label": a.get("trainingEffectLabel") or "",
            "activity_vo2max": a.get("vO2MaxValue") or "",
            "training_load": a.get("activityTrainingLoad") or "",
            "calories": a.get("calories") or "",
            "avg_stroke_rate": "",
            "temp_c": temp_c,
            "humidity_pct": hum,
            "dewpoint_c": dew_c,
            "weather_desc": wdesc,
            "device_name": a.get("deviceName") or "Forerunner 265",
            "laps_count": laps_count,
            "km_1_pace": km1_pace,
            "km_1_hr": km1_hr,
            "last_km_pace": last_pace,
            "last_km_hr": last_hr,
            "notes_for_analyst": "",
        })

    activity_path = OUT_DIR / "garmin-training-last-3mo.csv"
    with activity_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    daily_fields = [
        "date", "day_of_week", "run_count", "total_run_km", "total_duration_min",
        "sessions", "max_te", "quality_session", "weekly_run_km_to_date",
    ]
    by_day = defaultdict(list)
    for r in rows:
        by_day[r["date"]].append(r)

    daily_rows = []
    cum_week = defaultdict(float)
    for date in sorted(by_day.keys()):
        day_acts = by_day[date]
        runs = [a for a in day_acts if a["activity_type"] == "running"]
        total_km = sum(float(r["distance_km"]) for r in runs if r["distance_km"])
        total_min = sum(int(r["duration_sec"]) / 60 for r in runs if r["duration_sec"])
        max_te = max((float(r["aerobic_te"]) for r in runs if r["aerobic_te"]), default=0)
        sessions = " | ".join(
            f"{a['activity_type']}:{a['distance_km']}km TE{a['aerobic_te']} "
            f"{a['pace_avg_min_per_km']} HR{a['avg_hr']}"
            for a in day_acts
        )
        quality = ""
        for r in runs:
            te = float(r["aerobic_te"] or 0)
            label = r["training_effect_label"] or ""
            if te >= 4.0 or label in ("LACTATE_THRESHOLD", "VO2MAX", "ANAEROBIC_CAPACITY"):
                quality = f"{r['distance_km']}km {r['pace_avg_min_per_km']} TE{te} {label}"
                break

        d = datetime.strptime(date, "%Y-%m-%d")
        week_key = (d - timedelta(days=d.weekday())).strftime("%Y-%m-%d")
        cum_week[week_key] += total_km

        daily_rows.append({
            "date": date,
            "day_of_week": day_acts[0]["day_of_week"],
            "run_count": len(runs),
            "total_run_km": round(total_km, 2),
            "total_duration_min": round(total_min, 1),
            "sessions": sessions,
            "max_te": max_te,
            "quality_session": quality,
            "weekly_run_km_to_date": round(cum_week[week_key], 1),
        })

    daily_path = OUT_DIR / "garmin-daily-summary-last-3mo.csv"
    with daily_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=daily_fields)
        writer.writeheader()
        writer.writerows(daily_rows)

    meta = {
        "exported_at": end.isoformat(),
        "period_start": start_str,
        "period_end": end.strftime("%Y-%m-%d"),
        "activity_count": len(rows),
        "running_count": sum(1 for r in rows if r["activity_type"] == "running"),
        "files": [str(activity_path), str(daily_path)],
        "athlete_notes": {
            "device": "Garmin Forerunner 265",
            "goals": "Gyeongju sub-3 2026-10-17, JTBC PB 2026-11-01",
            "hr_profile": "low-HR athlete, marathon max HR ~171",
            "pace_hr_heat": "compare pace-HR only at similar temp/dewpoint",
        },
    }
    meta_path = OUT_DIR / "garmin-export-meta.json"
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    import zipfile

    zip_path = OUT_DIR / "garmin-export-last-3mo.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in (
            "garmin-training-last-3mo.csv",
            "garmin-daily-summary-last-3mo.csv",
            "garmin-export-meta.json",
            "README.md",
        ):
            p = OUT_DIR / name
            if p.exists():
                zf.write(p, name)

    print(f"Wrote {activity_path} ({len(rows)} activities)")
    print(f"Wrote {daily_path} ({len(daily_rows)} days)")
    print(f"Wrote {meta_path}")
    print(f"Wrote {zip_path}")


if __name__ == "__main__":
    main()
