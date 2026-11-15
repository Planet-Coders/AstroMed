# Features

For each feature: what it does, where the code is, and how to try it in the demo (sign in as `john@aahms.demo` unless noted).

## Crew console

### My vitals
- **What:** live heart rate, SpO₂ and HRV tiles, a Lead II ECG, a 24 h HRV trend and the Medical assessment. An irregular rhythm always shows WARNING. When the wearable is silent, the tiles freeze on the last valid reading and show its age.
- **Code:** `components/VitalsMonitor.tsx`, `components/EcgMonitor.tsx`, `lib/risk.ts`, `components/OfflineAICopilot.tsx`
- **Try it:** use **Demo → Arrhythmia** for the warning and **Demo → Missing data** for the last-valid-reading view.

### Daily check
- **What:** six readings (blood pressure, blood sugar, temperature, mood, sleep, hydration), each a clickable tab, with instant colour-coded results.
  - Next needs a valid value; Skip records the step as not measured.
  - "Save just this reading" logs one tab on its own, and re-tests update today's status and monitoring.
  - Swapped blood pressure asks you to re-enter.
  - An unfinished check resumes, and the results page confirms the save.
- **Code:** `components/DailySelfCheck.tsx`, `lib/selfCheck.ts`, `lib/selfCheckThresholds.ts`
- **Try it:** enter 80/120 to see the input check. Then save 168/104, re-test with 118/76 and watch the status go WARNING → NOMINAL. Tap **Hydration** on the start screen to log only water.

### My monitoring
- **What:** 7/14/30-day charts with alert lines, missing-data badges, trends, and alerts with a note thread (open → acknowledged → resolved). Re-tests auto-resolve alerts with a note naming the reading.
- **Code:** `components/monitoring/*`, `lib/monitoring/*`, `app/api/monitoring/me`, `app/api/alerts/[id]`
- **Try it:** after a red Daily Check reading, open **My monitoring**.

### Body map and five hazards
- **What:** a rotatable 3D body (MakeHuman CC0 mesh, male or female build from the account) with a status point per body system, and the RIDGE hazard strip.
  - Report injuries by tapping the body. Without WebGL, Report injury opens the report form directly and you choose the area from a list.
  - Period tracking is built in.
- **Code:** `components/BodyMap.tsx`, `components/BodyMap3D.tsx`, `components/InjuryPanel.tsx`, `lib/bodyMap.ts`, `lib/injuries.ts`, `public/models/body.bin` (baked by `scripts/bake-body-model.py`)
- **Try it:** open **Body map**, pick **G** in the hazard strip, then **Report injury**.

### Blood labs
- **What:** real post-flight lab values from a paired Inspiration4 astronaut (NASA OSDR), compared with normal ranges and the person's own baseline. Flags use the shared status colours.
- **Code:** `components/LabPanel.tsx`, `lib/labs.ts`, `lib/data/inspiration4*.json`, `lib/statusColors.ts`

### Hotline to Earth
- **What:** crew-to-Earth medical line with Routine / Urgent / Emergency levels (emergency needs a confirm step) and an optional vitals snapshot.
  - Messages arrive after the 20 m link delay (20 s in demo), and work offline through the queue.
  - Flight surgeons get a banner and chime, reply, acknowledge and resolve.
- **Code:** `components/hotline/*`, `lib/hotline/*`, `app/api/hotline/*`, model `HotlineMessage`
- **Try it:** send an Urgent message as an astronaut, then sign in as an oversight user and open `/oversight`.

### Habitat & routine
- **What:** cabin CO₂ and radiation against flight-rule limits (click the rule labels to read the rule), exercise and sleep logs, and spoken reminders.
- **Code:** `components/CabinEnvironment.tsx`, `components/ExerciseSleep.tsx`, `lib/routineLog.ts`, `lib/voiceReminder.ts`

### Health missions
- **What:** four daily core missions with points, a streak and patches. Patches reward habits, never health values.
- **Code:** `components/HealthMissions.tsx`, `lib/missions.ts`

### Cognitive test
- **What:** Beacon Lock, a reaction-time (PVT) game.
- **Code:** `components/PVTTest.tsx`

### Space cat
- **What:** a 3D astronaut cat (Crew Morale). Feed it with mission points (30 per meal), and it grows from Slim to Plump to Chonky.
  - It floats on every page and speaks voice reminders when Auto is on.
  - "Talk to me" repeats you in a squeaky voice and pauses reminder speech.
- **Code:** `components/spacecat/*`, `lib/spaceCat.ts`, `lib/voiceReminder.ts`
- **Try it:** open **Space cat**, then turn on **Habitat → Voice reminder → Auto**.

### AI co-pilot
- **What:** Llama 3.2 1B running in the browser (WebLLM), grounded on the crew's vitals, baselines, protocols and checks. Basic mode uses built-in triage rules. Every exchange is stored for oversight.
- **Code:** `components/OfflineAICopilot.tsx`, `components/CopilotProvider.tsx`, `lib/webllm/*`, `lib/copilot*.ts`. Details in [COPILOT.md](COPILOT.md).

### Offline first and sync
- **What:** vitals and an outbox in IndexedDB; Sync to Earth flushes them. The queue shows Queued → Sent → Confirmed by Earth.
- **Code:** `lib/db.ts`, `lib/outbox.ts`, `components/SyncContext.tsx`, `components/StoreForwardQueue.tsx`
- **Try it:** set DevTools → Network → Offline, record a reading, go back online and **Sync to Earth**.

### Navigation and themes
- **What:** sidebar grouped into Clinical Telemetry, Habitat & Protocols, Operations & Sync and Crew Morale. A light theme (white cards, sunflower yellow) and a dark theme (black with lime), switched in the header. On phones the co-pilot button is compact.
- **Code:** `components/ui/SideNav.tsx`, `components/MissionHeader.tsx`, `app/globals.css`, `components/ThemeToggle.tsx`

## Ground consoles

### Super admin (`/admin`, sign in as `admin@aahms.demo`)
- Mission groups, astronaut and oversight accounts, CSV import, account edit / reset / disable / delete, alert rules (with blood pressure validation) and the audit log.
- **Code:** `components/staff/AdminConsole.tsx`, `app/api/admin/*`

### Crew oversight (`/oversight`, sign in as `surgeon@aahms.demo`)
- Assigned groups at a glance, each astronaut's vitals history, health logs, AI conversations and monitoring, plus the hotline inbox.
- **Code:** `components/staff/OversightConsole.tsx`, `components/hotline/EarthHotline.tsx`, `app/api/oversight/*`

## Demo scenarios
The header's **Demo** dropdown switches between Nominal, Arrhythmia, EV1 voice stress, ppCO₂ + PVT slowdown, Solar particle event and Missing data (`lib/demoScenarios.ts`).
