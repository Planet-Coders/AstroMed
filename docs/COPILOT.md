# Onboard co-pilot

The browser runs Llama 3.2 1B or the compact SmolLM2 360M model through WebLLM. Basic mode uses local rules and bundled research excerpts while the model starts or when WebGPU is unavailable.

## Model startup and recovery

The dashboard opens with built-in answers available. Select **Start on-device AI** to load the model. Full AI appears when WebLLM has loaded its files and initialized its worker. The first generated reply runs when you ask for it. WebLLM reuses files in the browser cache when available.

Mobile browsers and devices reporting low memory select the compact model. On desktop, **Use compact model** switches a running Llama session to the smaller model and remembers the choice in that browser. The app can restart a failed worker once. After GPU loss, it stays in Basic mode until you select **Try on-device AI again**. Restart the browser if it can no longer get a WebGPU adapter.

Use HTTPS or localhost for WebGPU. To qualify one model for a particular deployment, set `NEXT_PUBLIC_WEBLLM_MODEL` before building. For example, `SmolLM2-360M-Instruct-q4f16_1-MLC` requires WebGPU with `shader-f16`. Pinning also keeps the chosen model during a restart.

To serve the model from your development server, copy the official WebLLM chat config, tokenizer, tensor cache manifest, and weight shards to `public/copilot-models/<model-id>/resolve/main/`. Save the matching WebGPU library from the installed WebLLM model catalog as `public/copilot-models/<model-id>/model.wasm`. Add these settings to `.env.development.local` and restart the dev server.

```dotenv
NEXT_PUBLIC_WEBLLM_MODEL=SmolLM2-360M-Instruct-q4f16_1-MLC
NEXT_PUBLIC_WEBLLM_ASSET_BASE=/copilot-models/
```

## Prompt

The previous prompt opened with “You are the Flight Surgeon Co-Pilot on a Mars transit spacecraft.” It told the model to answer first, use only supplied data and protocols, trust the high/low labels, check allergies before medication, and respond in two to four short sentences in the user's language. It appended a mission brief, crew and habitat readings, logs, lab summaries, selected demo protocols, and OSDR baselines. Every request also included a scripted “Is Park okay?” exchange, up to two visible transcript messages, and the new question.

The current static instructions live in [copilotPrompt.ts](../lib/copilotPrompt.ts). Each generated reply can use the selected person's available readings, a personal baseline, relevant routine or health logs, applicable demo procedures, and up to two NASA excerpts. **Personal data used** shows the readings and logs supplied for that answer, and **NASA references** links to the retrieved research.

Asking what the last Daily Check recorded returns the original measurements from the latest saved check or retest. AstroMed compares the signed-in user's device and synced records by capture time. The same record can be supplied to the model when the user asks for an explanation.

The active transcript stays in the signed-in user's browser tab across reloads. Prompts include completed turns for the selected subject within the model's context budget. When space runs low, a referenced earlier turn, recent turns, and relevant older turns take priority. **New chat** clears the tab's transcript and context. **Stop** interrupts an in-progress reply. Messages already queued or saved remain available to authorized mission oversight.

**Use Basic mode** stops the worker and switches chat and new inline explanations to built-in rules and record lookups. The setting stays active in the current tab across reloads. Select **Use on-device AI** to load the model again.

## Knowledge base

[copilotEvidence.ts](../lib/copilotEvidence.ts) contains the offline evidence cards. Add a verified NASA source ID, link, a short finding, a limitation, and phrases that should retrieve it. Cards match English words and phrases. Only the best matches enter the prompt.

- Renal stone risk and hydration. [NASA NTRS 20240012429](https://ntrs.nasa.gov/citations/20240012429)
- Sleep, circadian disruption, and crew performance. [NASA NTRS 20160003864](https://ntrs.nasa.gov/citations/20160003864)
- Cardiac rhythm risk in flight. [NASA NTRS 20170005625](https://ntrs.nasa.gov/citations/20170005625)
- Muscle and aerobic deconditioning. [NASA NTRS 20220019338](https://ntrs.nasa.gov/citations/20220019338)
- Solar particle events and radiation risk. [NASA NTRS 20160003870](https://ntrs.nasa.gov/citations/20160003870)
- Inspiration4 metabolic and cytokine measurements. [NASA OSDR OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575)
- Behavioral health risks in exploration missions. [NASA NTRS 20250001454](https://ntrs.nasa.gov/citations/20250001454)

NASA research provides background. Demo procedures, current crew readings, cohort measurements, and animal research each have different uses. Review [copilotGuidance.ts](../lib/copilotGuidance.ts) for examples of symptom and medication questions handled by built-in guidance before the model runs.

## Inline explanations

**Daily Check** offers an explanation after a full save or a single retest. **My Monitoring** offers one on each active alert. The saved result, trigger, and alert controls appear immediately. The model selects a finding, a follow-up, and an optional comparison and NASA reference from the supplied record. The app displays the original values and approved text.

Explanations share the chat's worker. A request can take up to 12 seconds including queue time, with Basic guidance available if the model is busy, unavailable, or returns an invalid selection. A late explanation cancels its own request and leaves chat's model available. A stalled worker is recovered independently. Model explanations are reused for the same record within the signed-in session. The explanation element includes `data-insight-mode` and `data-insight-duration-ms` for browser testing.

Routine and cognitive-test logs on shared devices are stored by crew member. Older device-only rows without an owner stay in their original storage. The demo routine remains visible as an example until the crew member records entries.

## Benchmark

Start the app locally against a demo database with its seed accounts. Then run:

```sh
npm run benchmark:copilot
node --import tsx scripts/copilot-benchmark.ts --basic
```

Set `BASE_URL` to the local app address if needed. `PW_CHANNEL` defaults to Edge. `COPILOT_TEST_EMAIL` and `COPILOT_TEST_PASSWORD` can override the seed credentials. The benchmark sends synthetic questions and uses a synthetic Daily Check. It intercepts that browser session's write requests for messages, reports, and biometrics.

For local benchmarking with a slow network, `COPILOT_MODEL_ASSETS` can point to a directory of official Llama 3.2 1B q4f16 WebLLM model files. The benchmark labels this run as a local mirror because download timing differs from a cold browser load.

The JSON includes readiness time, first-token and total generation times, token usage, model and reply mode, selected references, and simple rubric checks. The cases cover topic switching, a follow-up, a personalized reading, study limitations, urgent symptoms, medication, and missing data. Compare model results on the same device and browser version. This is a regression and latency benchmark. Clinical accuracy requires expert review and a larger test set.
