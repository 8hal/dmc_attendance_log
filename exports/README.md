# Garmin Training Export (last ~3 months)

Exported **2026-09-12** from Garmin Connect API for handoff to another agent.

## Files

| File | Rows | Description |
|------|------|-------------|
| `garmin-training-last-3mo.csv` | 74 activities | **One row per activity** (primary) |
| `garmin-daily-summary-last-3mo.csv` | 63 days | **One row per calendar day** (running rollup) |
| `garmin-export-meta.json` | — | Period, counts, athlete context notes |

**Period:** 2026-06-13 → 2026-09-12 (67 runs, 7 other activities)

## Key columns (`garmin-training-last-3mo.csv`)

| Column | Use |
|--------|-----|
| `date`, `start_time_local`, `day_of_week` | Scheduling / weekly structure |
| `distance_km`, `pace_avg_min_per_km`, `duration_sec` | Volume & intensity |
| `avg_hr`, `max_hr` | Effort (athlete: low-HR phenotype, marathon max ~171) |
| `aerobic_te`, `training_effect_label` | Session load / quality tag |
| `temp_c`, `humidity_pct`, `dewpoint_c` | **Always normalize pace-HR by weather** |
| `elevation_gain_m` | Hilly vs flat (e.g. Namsan) |
| `avg_power_w`, `normalized_power_w` | Pace comparison when elevation/heat differs |
| `km_1_pace`, `last_km_pace`, `km_1_hr`, `last_km_hr` | Cardiac drift / late-run fade |
| `activity_vo2max` | Garmin VO2 snapshot per activity |

## Athlete context (for analysis)

- **A-race #1:** Gyeongju International Marathon **2026-10-17** — sub-3 (~4:15/km), MP HR **158–165**
- **A-race #2:** JTBC Seoul **2026-11-01** — PB target 2:56:59
- **Cheorwon 2026-09-05:** 42.4 km, 3:29:51, max HR 165, bonk km 31+ (fueling + heat)
- **Key positive:** 2026-09-12 long 31.7 km, rear MP 4:08–4:13 @ HR 152–158

## Mobile download

Open in phone browser:

- **After hosting deploy:** https://dmc-attendance.web.app/exports/
- **GitHub (branch pushed):** https://github.com/8hal/dmc_attendance_log/tree/cursor/add-marathon-coach-skill-b7b3/exports

Tap **ZIP 전체 다운로드** on `index.html`, or download individual CSV files.

## Regenerate

```bash
# From repo root, with ~/.garminconnect tokens present
python3 scripts/export-garmin-training-csv.py
```
