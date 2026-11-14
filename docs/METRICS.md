# Monitored metrics

<!-- Generated from lib/monitoring/catalog.ts by `npm run docs:metrics`. Edit the catalog, not this file. -->

AstroMed monitors Daily Check, routine, wearable and dosimeter readings. Each metric lists its expected cadence, the default rules a super admin can tune in **Alert rules**, and the NASA sources behind the rationale.

The thresholds shown are AstroMed demo defaults.

| Metric | Unit | Daily value | Expected every | Late / missing after |
|---|---|---|---|---|
| Sleep | h | last | 24 h | 30 h / 48 h |
| Exercise | min | sum | 24 h | 30 h / 48 h |
| Pulse trend | bpm | mean | 1 h | 6 h / 18 h |
| Hydration | mL | last | 24 h | 30 h / 48 h |
| Radiation dose | mSv/day | mean | 1 h | 6 h / 24 h |
| Systolic blood pressure | mmHg | last | 24 h | 30 h / 48 h |
| Diastolic blood pressure | mmHg | last | 24 h | 30 h / 48 h |
| Fasting blood sugar | mg/dL | last | 24 h | 30 h / 48 h |
| Non-fasting blood sugar | mg/dL | last | 24 h | 30 h / 48 h |
| Body temperature | °C | last | 24 h | 30 h / 48 h |
| Mood | /5 | last | 24 h | 30 h / 48 h |
| Urine colour | /8 | last | 24 h | 30 h / 48 h |

## Sleep

**What:** Hours of sleep in the main sleep period. The latest Daily Check entry for the night takes precedence over the routine log.

**Data source in the app:** Daily self-check and Habitat & routine sleep log.

**Why:** Astronauts sleep less in flight than on the ground, and sleep loss, circadian misalignment and work overload degrade performance and raise error risk. Continuous actigraphy on long-duration missions captures sleep changes that occasional checks miss, so sleep is tracked every night and a multi-day average flags building sleep debt.

**Default alert rules**

| Rule | Kind | Amber | Red | Window |
|---|---|---|---|---|
| Sleep debt (`sleep_low`) | threshold, below | 6 h | 5 h | 3 d |
| Short sleep in Daily Check (`self_check_sleep_low`) | latest, below | 7 h | 5 h | 2 d |
| Sleep: no data (`sleep_missing`) | missing, above | 30 h | 48 h | — |

**Sources**

- [NTRS 20160003864](https://ntrs.nasa.gov/citations/20160003864): Risk of Performance Decrements and Adverse Health Outcomes Resulting from Sleep Loss, Circadian Desynchronization, and Work Overload (HRP Evidence Report) (2016). Why sleep loss is a crew health and performance risk.
- [NTRS 20220014774](https://ntrs.nasa.gov/citations/20220014774): Comparison Between Continuous and Intermittent Actigraphy Outcomes During Long-Duration Missions (2023). Why sleep is measured every night rather than in occasional blocks.

## Exercise

**What:** Minutes of countermeasure exercise per day on the resistance device, treadmill and cycle.

**Data source in the app:** Habitat & routine exercise log (wearable sessions + manual entries).

**Why:** Without gravity, muscle mass, strength and aerobic capacity fall. On the ISS, crew who keep to the daily exercise prescription (about 2.5 h across resistance and aerobic devices) return with minimal losses on average, so falling below the plan for several days is an early warning.

**Default alert rules**

| Rule | Kind | Amber | Red | Window |
|---|---|---|---|---|
| Exercise below plan (`activity_low`) | threshold, below | 90 min | 45 min | 3 d |
| Exercise: no data (`activity_missing`) | missing, above | 30 h | 48 h | — |

**Sources**

- [NTRS 20220019338](https://ntrs.nasa.gov/citations/20220019338): Risk of Impaired Performance Due to Reduced Muscle Mass, Strength & Endurance, and Risk of Reduced Physical Performance Capabilities Due to Reduced Aerobic Capacity (HRP Evidence Report) (2023). Why daily countermeasure exercise is prescribed and monitored.
- [OSDR OSD-195](https://osdr.nasa.gov/bio/repo/data/studies/OSD-195): Effects of 21 days of bedrest on human skeletal muscle gene expression (2018). Open human data on muscle changes from disuse, the ground analog of weightlessness.

## Pulse trend

**What:** Daily average heart rate from the wearable, compared with the crew member's own previous week.

**Data source in the app:** Wearable vitals (BiometricRecord, synced from the crew console).

**Why:** Spaceflight lowers plasma volume, changes heart size and shifts autonomic control. Rhythm problems have been seen in flight, and a heart rate that drifts up over days can reflect deconditioning, dehydration, illness or stress. A personal trend catches a rise that is still inside the population normal range.

**Default alert rules**

| Rule | Kind | Amber | Red | Window |
|---|---|---|---|---|
| High heart rate (`pulse_high`) | threshold, above | 100 bpm | 120 bpm | 1 d |
| Rising heart rate trend (`pulse_trend`) | trend, above | 8 % | 15 % | 7 d |
| Heart rate: no data (`pulse_missing`) | missing, above | 6 h | 18 h | — |

**Sources**

- [NTRS 20170005625](https://ntrs.nasa.gov/citations/20170005625): Risk of Cardiac Rhythm Problems During Spaceflight (HRP Evidence Report) (2017). Cardiovascular changes in flight and why heart rhythm is monitored.
- [OSDR OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575): SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays (2024). Open astronaut data with cardiac markers before, during and after flight.

## Hydration

**What:** Total newly logged fluid intake for each UTC day. Earlier 24-hour reports are shown as snapshots.

**Data source in the app:** Daily self-check, hydration step (self-report).

**Why:** Relative dehydration, together with calcium released from bone, raises urine supersaturation and kidney-stone risk in flight. A NASA study found long-duration crew producing more than 2.5 L of urine a day appeared to minimise stone risk, while lower volumes raised it, so a daily intake target near 2–2.5 L is tracked.

**Default alert rules**

| Rule | Kind | Amber | Red | Window |
|---|---|---|---|---|
| Low fluid intake (`hydration_low`) | latest, below | 2000 mL | 1500 mL | 2 d |
| Hydration: no data (`hydration_missing`) | missing, above | 30 h | 48 h | — |

**Sources**

- [NTRS 20240012429](https://ntrs.nasa.gov/citations/20240012429): Evidence Report: Risk of Renal Stone Formation (2024 update) (2024). Dehydration as a main driver of kidney-stone risk in flight.
- [NTRS 20000020539](https://ntrs.nasa.gov/citations/20000020539): Renal Stone Risk During Space Flight (1999). Urine volume above 2.5 L/day appeared to minimise stone risk.
- [OSDR OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575): SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays (2024). Open astronaut metabolic panel (sodium, BUN, creatinine): blood markers of hydration.
- [OSDR OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569): Whole Blood Measurements from the SpaceX Inspiration4 Mission (incl. CBC) (2024). Open astronaut blood counts, including haematocrit, which shifts with fluid balance.

## Radiation dose

**What:** Daily dose from the cabin dosimeter (dose rate × 24 h), in the context of the mission's space weather.

**Data source in the app:** Cabin dosimeter readings (BiometricRecord radiation, mSv/h × 24) and NOAA / NASA DONKI space weather.

**Why:** Galactic cosmic rays give a steady background dose on a Mars transit; a solar particle event can add a large dose within hours and cause acute radiation effects. NASA limits career effective dose to 600 mSv, so daily dose is tracked against the mission background and a sudden jump triggers shelter procedures.

**Default alert rules**

| Rule | Kind | Amber | Red | Window |
|---|---|---|---|---|
| Radiation dose above background (`radiation_high`) | threshold, above | 2.5 mSv/day | 10 mSv/day | 1 d |
| Dosimeter: no data (`radiation_missing`) | missing, above | 6 h | 24 h | — |

**Sources**

- [NTRS 20160003870](https://ntrs.nasa.gov/citations/20160003870): Evidence Report: Risk of Acute Radiation Syndromes Due to Solar Particle Events (2016). Why a solar particle event needs immediate detection and shelter.
- [NTRS 20240012790](https://ntrs.nasa.gov/citations/20240012790): RadLab: A Comprehensive Database and Graphical and Programming Interfaces for Space Radiation Data (NASA OSDR) (2024). OSDR's database of measured spacecraft dose rates, used as the reference for dose data.
- [NASA standard NASA-STD-3001 Vol. 1 Rev C](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf): NASA Space Flight Human-System Standard, Volume 1: Crew Health (2023). The 600 mSv career effective dose limit.

## Systolic blood pressure

**What:** Top number from the latest blood pressure reading each day.

**Data source in the app:** Daily self-check.

**Why:** Fluid shifts in microgravity change cardiovascular workload. Tracking systolic readings helps the crew identify changes in pressure.

**Default alert rules**

| Rule | Kind | Amber | Red | Window |
|---|---|---|---|---|
| High systolic pressure (`systolic_high`) | latest, above | 130 mmHg | 160 mmHg | 2 d |
| Low systolic pressure (`systolic_low`) | latest, below | 95 mmHg | 85 mmHg | 2 d |

**Sources**

- [NTRS 20170005625](https://ntrs.nasa.gov/citations/20170005625): Risk of Cardiac Rhythm Problems During Spaceflight (2017). Cardiovascular changes in flight.

## Diastolic blood pressure

**What:** Bottom number from the latest blood pressure reading each day.

**Data source in the app:** Daily self-check.

**Why:** Fluid shifts in microgravity change cardiovascular workload. Diastolic pressure describes pressure between beats.

**Default alert rules**

| Rule | Kind | Amber | Red | Window |
|---|---|---|---|---|
| High diastolic pressure (`diastolic_high`) | latest, above | 85 mmHg | 100 mmHg | 2 d |
| Low diastolic pressure (`diastolic_low`) | latest, below | 60 mmHg | 50 mmHg | 2 d |

**Sources**

- [NTRS 20170005625](https://ntrs.nasa.gov/citations/20170005625): Risk of Cardiac Rhythm Problems During Spaceflight (2017). Cardiovascular changes in flight.

## Fasting blood sugar

**What:** Latest daily blood sugar reading after at least 8 hours without food.

**Data source in the app:** Daily self-check.

**Why:** Fasting values have their own reference range. Spaceflight, reduced muscle loading and disrupted sleep can affect glucose regulation.

**Default alert rules**

| Rule | Kind | Amber | Red | Window |
|---|---|---|---|---|
| High fasting blood sugar (`glucose_fasting_high`) | latest, above | 100 mg/dL | 126 mg/dL | 2 d |
| Low fasting blood sugar (`glucose_fasting_low`) | latest, below | 65 mg/dL | 54 mg/dL | 2 d |

**Sources**

- [OSDR OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575): SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays (2024). Inspiration4 crew glucose measurements.

## Non-fasting blood sugar

**What:** Latest daily blood sugar reading taken without an 8-hour fast.

**Data source in the app:** Daily self-check.

**Why:** Food changes blood sugar. Keeping meal context with a reading lets the console apply the matching thresholds.

**Default alert rules**

| Rule | Kind | Amber | Red | Window |
|---|---|---|---|---|
| High non-fasting blood sugar (`glucose_after_meal_high`) | latest, above | 140 mg/dL | 200 mg/dL | 2 d |
| Low non-fasting blood sugar (`glucose_after_meal_low`) | latest, below | 65 mg/dL | 54 mg/dL | 2 d |

**Sources**

- [OSDR OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575): SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays (2024). Inspiration4 crew glucose measurements.

## Body temperature

**What:** Latest body temperature measured in Daily Check each day.

**Data source in the app:** Daily self-check.

**Why:** Body temperature can shift during spaceflight and after exercise. Follow-up measurements help the crew track an abnormal reading.

**Default alert rules**

| Rule | Kind | Amber | Red | Window |
|---|---|---|---|---|
| High body temperature (`temperature_high`) | latest, above | 37.6 °C | 38.5 °C | 2 d |
| Low body temperature (`temperature_low`) | latest, below | 36 °C | 35 °C | 2 d |

**Sources**

- [NTRS 20000104233](https://ntrs.nasa.gov/citations/20000104233): Temperature Regulation in Crewmembers After a 115-Day Space Flight (1995). Altered thermoregulation during exercise after spaceflight.

## Mood

**What:** Latest self-reported mood score each day, from 1 (very low) to 5 (great).

**Data source in the app:** Daily self-check.

**Why:** Isolation, confinement and workload can affect mood. A simple daily check gives the crew a way to report changes.

**Default alert rules**

| Rule | Kind | Amber | Red | Window |
|---|---|---|---|---|
| Low mood (`mood_low`) | latest, below | 3 /5 | 2 /5 | 2 d |

**Sources**

- [NTRS 20160004365](https://ntrs.nasa.gov/citations/20160004365): Risk of Adverse Cognitive or Behavioral Conditions and Psychiatric Disorders (2015). Behavioral health risks during spaceflight.

## Urine colour

**What:** Latest reported shade on the Daily Check chart each day, from pale to dark.

**Data source in the app:** Daily self-check.

**Why:** Urine colour gives the crew another self-reported observation to track alongside fluid intake.

**Default alert rules**

| Rule | Kind | Amber | Red | Window |
|---|---|---|---|---|
| Dark urine colour (`urine_color_dark`) | latest, above | 4 /8 | 6 /8 | 2 d |

**Sources**

- [NTRS 20240012429](https://ntrs.nasa.gov/citations/20240012429): Evidence Report: Risk of Renal Stone Formation (2024 update) (2024). Dehydration as a driver of kidney-stone risk.

## How alerts work

- **Threshold** rules compare the average daily value over the window with the amber and red limits.
- **Latest** rules compare the last applicable reading in the window. A missed recheck leaves an existing alert open.
- **Fluid intake** adds entries within the same UTC day. Older 24-hour snapshots are used on days without new-style fluid entries.
- **Trend** rules compare the window's average with the window before it, as a % change.
- **Missing-data** rules count hours since the last value against the metric's expected cadence. A metric that has never reported shows *No data yet* instead of alerting.
- Rules are checked whenever a crew member's monitoring is viewed (crew console, oversight dashboard). An alert opens when a rule fires, updates while it keeps firing, re-opens if it escalates from amber to red, and resolves automatically when the value is back within limits.
- Crew can add notes and **acknowledge** their own alerts. Oversight users of the crew member's group (and super admins) can also **resolve**. A rule resolved by hand stays quiet for 24 h. Every acknowledgement, resolution and rule edit is in the admin audit log.

## Synthetic test crew

`npm run db:synthetic -- --days 30 --seed 1` creates group **SIM-1 (Synthetic test crew)** with one astronaut per profile, marked SYNTHETIC in the UI: normal, missing data (wearable offline 20 h, no hydration report for 3 days, two nights without a sleep log), sleep debt, rising heart rate (+~17% over a week, still under 100 bpm), dehydration (~1.4 L/day) and a solar particle event (~0.5 mSv/h for 36 h). The generator is in `lib/monitoring/synthetic.ts`; it is seeded, so the same seed gives the same records. None of it is real astronaut data.
