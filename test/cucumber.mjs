// Cucumber-js configuration (ADR-0016). Executes the real .feature files against the
// headless engine. The `name` include-list scopes the run to the scenarios whose
// behaviour Phase 1 actually implements; scenarios that need later phases — the audio
// engine (Phase 5), Auto Take (Phase 6), digital effects (Phase 3), or browser
// permission/enumeration, plus @wip — are simply not selected, so the domain-test layer
// stays green and honest. Step files are TypeScript, loaded via the tsx runtime.

export default {
  paths: [
    'features/inputs-and-devices.feature',
    'features/source-selection.feature',
    'features/program-output.feature',
    'features/transition-mix-nam.feature',
    'features/matte-generator.feature',
  ],
  import: [
    'test/features/support/world.ts',
    'test/features/steps/inputs-and-devices.steps.ts',
    'test/features/steps/mixer.steps.ts',
  ],
  name: [
    // inputs-and-devices (Rule 1)
    'Binding a source input to a media provider',
    'Rebinding a source replaces its previous provider',
    'An image binding presents as a still video frame',
    'The same media provider may back more than one source',
    // source-selection
    'Assigning an external source to a bus',
    'Selecting a source binds its audio to the matching bus fader',
    'The two buses hold sources independently',
    'Reselecting on the same bus replaces the previous source',
    'The same external source may feed both buses at once',
    'Matte is a valid source for transition stages',
    'Matte is substituted where a function needs real video',
    'The blinking button identifies which real source stands in for Matte',
    'Selecting Matte does not disturb the bus audio routing',
    // program-output
    'EFFECT is the default program output mode',
    'The A button sends the A-bus directly',
    'The B button sends the B-bus directly',
    'The EFFECT button sends the fully processed composite',
    'Direct-out buttons carry only their bus audio',
    'Preview always shows the effected video regardless of program mode',
    'Preview shows the effected video even in EFFECT mode',
    'Preview lets me monitor the effect while sending a clean bus',
    'Matte on the A-bus with direct-out A outputs the blinking source',
    'Matte on the B-bus with direct-out B outputs the blinking source',
    'Matte on a bus is still usable through the EFFECT output',
    'Selecting a program mode deactivates the other two',
    // transition-mix-nam (excludes @integration Auto Take + digital-effect)
    'Selecting MIX arms a cross-dissolve between the two buses',
    'MIX with the lever fully at A shows only the A-bus',
    'MIX with the lever fully at B shows only the B-bus',
    'MIX at lever centre averages the two pictures equally',
    'MIX blends the two buses in proportion to lever travel',
    'MIX travel drives a smooth continuous dissolve',
    'Selecting NAM arms a brightness-based composite',
    'NAM at lever centre keeps the brighter of the two images per pixel',
    'NAM lets bright highlights punch through dark areas',
    'NAM at centre is distinct from a MIX average',
    'Moving the NAM lever off-centre biases which bus dominates',
    'A Matte colour is a valid source for MIX',
    'A Matte colour is a valid source for NAM',
    // matte-generator (excludes @wip White+gradation)
    'SELECT . cycles upward through the palette',
    'SELECT . wraps from the last colour back to the first',
    'Black follows Colour Bar when cycling upward',
    'SELECT . reverses the direction',
    'SELECT . wraps from the first colour back to the last',
    'LEVEL adjusts the chroma of a chromatic colour',
    'Colour Bar and Black ignore the LEVEL control',
    'For White, LEVEL adjusts brightness instead of chroma',
    'GRADATION produces a top-to-bottom vertical gradient',
    'The gradient bottom tracks the LEVEL setting',
    'Disabling GRADATION restores a flat matte',
  ],
};
