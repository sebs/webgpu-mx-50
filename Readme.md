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
framework (ADR-0003). Current status: **Phase 3 (in progress)** — two buses + Matte
substitution, Program Out (A/B/EFFECT), Mix/NAM + the compositional wipe engine, the Matte
generator, and now per-bus colour correction + the four filter digital effects
(Nega/Mosaic/Mono/Paint); freeze family (Still/Strobe/Multi/Trail) is next. See
[docs/ROADMAP.md](docs/ROADMAP.md) for the build plan and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
for how to run and test.
