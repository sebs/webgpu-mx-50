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
framework (ADR-0003). Current status: **Phases 0–8 complete — the domain model is done.**
Two buses + Matte substitution, Program Out (A/B/EFFECT), Mix/NAM + the compositional wipe
engine, the Matte generator, per-bus colour correction, the four filter effects, the freeze
family (Still/Strobe/Multi/Trail), position control + Scene Grabber, the Luminance/Chroma
keyers, the Downstream Key, the **audio engine** (mixer + Audio Follow + A/V Synchro on the
Web Audio API), the **Fade stage + Auto Take/Auto Fade** (frame-counted, pausable transitions),
**Event Memory + Special Modes + tiered persistence**, and the **control-input mapping layer**
(remappable keyboard/gamepad/MIDI/GPI + a local automation API) with the combination recipes and
cross-feature integration composed and asserted. Verified headlessly: **208 units, 536 Gherkin
scenarios (3921 steps)**; what remains deferred is pixel-rendering, browser-only surfaces, and
faithfully model-constrained scenarios — inventoried with a buildable-vs-out-of-scope split in
[docs/DEFERRED.md](docs/DEFERRED.md). See
[docs/ROADMAP.md](docs/ROADMAP.md) for the build history and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
for how to run and test.
