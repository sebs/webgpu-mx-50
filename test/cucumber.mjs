// Cucumber-js configuration (ADR-0016). Phase 0 executes only the first Rule of
// inputs-and-devices.feature ("one input bound") against the headless engine; the
// `name` filter scopes the run to the scenarios that already have step definitions,
// so the domain-test layer stays green while the rest of the spec awaits later phases.
// Step files are TypeScript, loaded via the tsx runtime (see the test:features script).

export default {
  paths: ['features/inputs-and-devices.feature'],
  import: [
    'test/features/support/world.ts',
    'test/features/steps/inputs-and-devices.steps.ts',
  ],
  name: [
    'Binding a source input to a media provider',
    'Rebinding a source replaces its previous provider',
    'An image binding presents as a still video frame',
    'The same media provider may back more than one source',
  ],
};
