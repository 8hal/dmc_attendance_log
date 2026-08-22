# Garmin MCP Data Contract

Use this reference to minimize unnecessary MCP calls while still grounding decisions.

## Daily workout decision

Retrieve, when available:
- activities for the last 7 days: type, distance, duration, pace, avg/max HR, elevation, cadence, power, training effect, load
- lap data for the most recent quality workout and long run
- recovery time
- resting HR trend (not just one day)
- HRV status / nightly HRV trend
- sleep duration/score if available
- acute training load / load ratio

Ask the user only for data Garmin does not contain reliably, such as:
- exact localized soreness and whether it is focal/asymmetric
- subjective fatigue / RPE if not recorded
- schedule constraints
- whether an upcoming race is A/B/C priority

## Post-key-workout analysis

Retrieve:
- exact lap pace
- avg and max HR per lap
- power per lap if available
- elevation change per lap
- cadence and ground contact metrics if useful
- weather/temperature/humidity if recorded
- training effect and load
- RPE/feel
- estimated sweat loss if available

Calculate or reason about:
- HR drift at similar pace/power
- pace change at similar HR
- power required for target pace
- late-run deterioration or stability
- whether the session matched the planned physiological purpose

## Weekly review

Retrieve 6-12 weeks of:
- weekly distance and duration
- runs per week
- longest run
- quality-session count
- 20 km+ runs

Retrieve detailed laps only for workouts that matter to the current decision. Do not flood context with every lap from every easy run.

## Race-readiness review

Prioritize evidence in this order:
1. marathon-specific long-run late segments
2. sustained threshold/tempo sessions
3. weekly volume consistency and long-run frequency
4. recent race/time-trial results
5. VO2max/race predictions

Garmin race predictions can lag rapid fitness changes and may be distorted by heat. They should not override recent high-quality race-specific evidence.

## Missing/ambiguous fields

- Do not infer a unit from a raw API field unless the MCP schema confirms it.
- If only a scalar is available but a trend is needed, fetch the historical series.
- If weather is missing and conditions materially affect interpretation, ask for temperature/humidity or use an available weather source.
