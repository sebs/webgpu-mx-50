// Shared TRANSITION-control steps (reference §11/§15). The TRANSITION knob is one physical
// control feeding both Auto Take and Auto Fade, so its set/request steps are registered ONCE
// here (registering them in both feature step files would be a Cucumber ambiguity error). The
// feature-specific indicator/assertion steps live in auto-take.steps.ts / fade.steps.ts.

import { Given, When } from '@cucumber/cucumber';
import type { MixerWorld } from '../support/world.js';

When(/^I set the TRANSITION control to (\d+) frames$/, function (this: MixerWorld, frames: string) {
  this.setTransitionTime(Number(frames));
});

Given(/^the TRANSITION control is set to (\d+) frames$/, function (this: MixerWorld, frames: string) {
  this.setTransitionTime(Number(frames));
});

When(/^I request a TRANSITION time of (\d+) frames$/, function (this: MixerWorld, frames: string) {
  this.setTransitionTime(Number(frames));
});
