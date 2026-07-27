# web-mx-50

A web version of the panasonic mx-50 mixer with all its features in pure webgpu. 
This is a experiment to see if we can build the features of the panasonic into a browser app using webgpu


./features = gherkin cucumber features /scenarios
./adr = architecture decsion records
./docs = architecture overview, roadmap, and the WJ-MX50 feature reference

## Getting started

```bash
npm install
npm run dev     # serve at http://127.0.0.1:8080 (needs a WebGPU browser)
npm test        # typecheck + unit + cucumber features + golden scaffolding
```

Stack: vanilla TypeScript + WebGPU + [banira](https://github.com/sebs/banira), no UI
framework (ADR-0003). Current status: **Phases 0–7 complete** — two buses + Matte
substitution, Program Out (A/B/EFFECT), Mix/NAM + the compositional wipe engine, the Matte
generator, per-bus colour correction, the four filter effects, the freeze family
(Still/Strobe/Multi/Trail), position control + Scene Grabber, the Luminance/Chroma keyers,
the Downstream Key, the **audio engine** (mixer + Audio Follow + A/V Synchro on the Web
Audio API), the **Fade stage + Auto Take/Auto Fade** (frame-counted, pausable transitions),
and **Event Memory + Special Modes + tiered persistence** (8 stored panel snapshots, the
8-macro Special bank, durable schema-versioned storage). Next: control mapping + integration
recipes + UI polish (Phase 8). See
[docs/ROADMAP.md](docs/ROADMAP.md) for the build plan and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
for how to run and test.
