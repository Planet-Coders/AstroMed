# Monitored metrics

<!-- Generated from lib/monitoring/catalog.ts by `npm run docs:metrics`. Edit the catalog, not this file. -->

AAHMS monitors five metrics for each astronaut: sleep, exercise (activity), pulse trend, hydration (self-report) and radiation dose in the mission's space-weather context. Each has a definition, an expected data cadence (for the missing-data badge), default alert rules a super admin can tune in `/admin` → **Alert rules**, and the NASA sources behind it.

Every citation was checked to resolve on 2026-11-04 (NTRS record, OSDR study page or NASA standards PDF). Thresholds are demo defaults informed by these sources, **not medical guidance**.

| Metric | Unit | Daily value | Expected every | Late / missing after |
|---|---|---|---|---|
| Sleep | h | last | 24 h | 30 h / 48 h |
| Exercise | min | sum | 24 h | 30 h / 48 h |
| Pulse trend | bpm | mean | 1 h | 6 h / 18 h |
| Hydration | mL | last | 24 h | 30 h / 48 h |
| Radiation dose | mSv/day | mean | 1 h | 6 h / 24 h |

## Sleep

**What:** Hours of sleep in the main sleep period, from the wearable or the crew sleep log.

**Data source in the app:** Habitat & routine sleep log (one value per night).

**Why:** Astronauts sleep less in flight than on the ground, and sleep loss, circadian misalignment and work overload degrade performance and raise error risk. Continuous actigraphy on long-duration missions captures sleep changes that occasional checks miss, so sleep is tracked every night and a multi-day average flags building sleep debt.

**Default alert rules**

| Rule | Kind | Amber | Red | Window |
|---|---|---|---|---|
| Sleep debt (`sleep_low`) | threshold, below | 6 h | 5 h | 3 d |
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

**What:** Self-reported fluid intake over the last 24 hours (mL), with urine colour on a 1–8 chart.

**Data source in the app:** Daily self-check, hydration step (self-report).

**Why:** Relative dehydration, together with calcium released from bone, raises urine supersaturation and kidney-stone risk in flight. A NASA study found long-duration crew producing more than 2.5 L of urine a day appeared to minimise stone risk, while lower volumes raised it, so a daily intake target near 2–2.5 L is tracked.

**Default alert rules**

| Rule | Kind | Amber | Red | Window |
|---|---|---|---|---|
| Low fluid intake (`hydration_low`) | threshold, below | 2000 mL | 1500 mL | 2 d |
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

## How alerts work

- **Threshold** rules compare the average daily value over the window with the amber and red limits.
- **Trend** rules compare the window's average with the window before it, as a % change.
- **Missing-data** rules count hours since the last value against the metric's expected cadence. A metric that has never reported shows *No data yet* instead of alerting.
- Rules are checked whenever a crew member's monitoring is viewed (crew console, oversight dashboard). An alert opens when a rule fires, updates while it keeps firing, re-opens if it escalates from amber to red, and resolves automatically when the value is back within limits.
- Crew can add notes and **acknowledge** their own alerts. Oversight users of the crew member's group (and super admins) can also **resolve**. A rule resolved by hand stays quiet for 24 h. Every acknowledgement, resolution and rule edit is in the admin audit log.

## Synthetic test crew

`npm run db:synthetic -- --days 30 --seed 1` creates group **SIM-1 (Synthetic test crew)** with one astronaut per profile, marked SYNTHETIC in the UI: normal, missing data (wearable offline 20 h, no hydration report for 3 days, two nights without a sleep log), sleep debt, rising heart rate (+~17% over a week, still under 100 bpm), dehydration (~1.4 L/day) and a solar particle event (~0.5 mSv/h for 36 h). The generator is in `lib/monitoring/synthetic.ts`; it is seeded, so the same seed gives the same records. None of it is real astronaut data.
