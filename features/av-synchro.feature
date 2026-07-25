Feature: A/V Synchro (audio-triggered effects)
  As a VJ,
  I want the incoming audio to pulse the selected digital effects in time with the sound,
  So that the picture reacts to the music automatically without me riding the effect controls by hand.

  # Grounded in reference section 8.9 (A/V Synchro).
  # A/V Synchro is a modulator over the Digital Effect stage of the signal flow:
  #   Source -> bus assignment -> Colour Correction -> Digital Effect -> Mix/Wipe -> DSK -> Fade -> Program Out
  # The audio that drives it is the sound fed to the mixer; see audio-mixer.feature.
  # It does not introduce a new effect: it gates one or more of the existing digital
  # effects (Nega, Mosaic, Mono, Paint, Still, Strobe) on and off in step with the audio.
  # Related ADRs: ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow),
  #               ADR-0010 (Audio engine on the Web Audio API),
  #               ADR-0011 (Single unidirectional panel state store),
  #               ADR-0012 (Render loop and transition timing model).
  # Related features: digital-effects-filters.feature, digital-effect-still.feature,
  #                   digital-effect-strobe.feature, digital-effect-trail.feature,
  #                   audio-mixer.feature, audio-follow.feature.

  Background:
    Given the mixer is running with a moving source on the A-bus
    And audio is being fed to the mixer

  # --- Triggering behaviour (section 8.9) ---
  # A/V Synchro holds the selected effect off until the audio crosses the threshold,
  # then applies it for as long as the audio stays above the threshold.

  Scenario: Below-threshold audio leaves the picture untreated
    Given A/V Synchro is armed with the Nega effect selected
    When the audio stays below the trigger threshold
    Then the Nega effect is not applied
    And the A-bus shows the untreated picture

  Scenario: Audio crossing the threshold pulses the effect on
    Given A/V Synchro is armed with the Nega effect selected
    When the audio rises above the trigger threshold
    Then the Nega effect is applied
    And the effect stays on while the audio remains above the threshold

  Scenario: The effect releases when the audio falls back below threshold
    Given A/V Synchro is armed with the Nega effect selected
    And the audio has risen above the trigger threshold so the effect is on
    When the audio falls back below the trigger threshold
    Then the Nega effect is released
    And the A-bus returns to the untreated picture

  Scenario: A rhythmic audio track pulses the effect in time with the sound
    Given A/V Synchro is armed with the Mosaic effect selected
    When the audio delivers a steady series of beats crossing the threshold
    Then the Mosaic effect pulses on and off in step with the beats

  # --- LEVEL control sets the trigger threshold (section 8.9) ---
  # Toward MAX only loud peaks trigger; toward MIN even quiet sounds trigger.

  Scenario Outline: The LEVEL control sets how loud the audio must be to trigger
    Given A/V Synchro is armed with the Paint effect selected
    And the LEVEL control is set toward <setting>
    When the audio delivers a <loudness> sound
    Then the Paint effect <result>

    Examples:
      | setting | loudness | result       |
      | MAX     | quiet    | is not applied |
      | MAX     | loud     | is applied     |
      | MIN     | quiet    | is applied     |
      | MIN     | loud     | is applied     |

  Scenario: Turning LEVEL toward MAX rejects all but the loudest peaks
    Given A/V Synchro is armed with the Nega effect selected
    And the LEVEL control is set toward MAX
    When the audio delivers only moderate sounds with occasional loud peaks
    Then the Nega effect pulses only on the loud peaks
    And the moderate sounds leave the picture untreated

  Scenario: Turning LEVEL toward MIN lets quiet sounds trigger too
    Given A/V Synchro is armed with the Nega effect selected
    And the LEVEL control is set toward MIN
    When the audio delivers a continuous quiet sound above that threshold
    Then the Nega effect stays applied for the duration of the sound

  # --- Hold time (section 8.9) ---
  # For Nega/Mosaic/Mono/Paint/Still the effect holds as long as audio stays above
  # threshold; for Strobe the hold is governed by the Effect Interval Timer instead.

  Scenario Outline: Hold time for the non-Strobe effects equals the time above threshold
    Given A/V Synchro is armed with the <effect> effect selected
    When the audio stays above the trigger threshold for a sustained note
    Then the <effect> effect holds for the full duration the audio stays above threshold
    And it releases as soon as the audio drops below the threshold

    Examples:
      | effect |
      | Nega   |
      | Mosaic |
      | Mono   |
      | Paint  |
      | Still  |

  Scenario: Strobe hold time is governed by the Effect Interval Timer, not the audio duration
    # Reference 8.9: for Strobe the hold time comes from the Effect Interval Timer.
    Given A/V Synchro is armed with the Strobe effect selected
    When the audio rises above the trigger threshold
    Then the Strobe effect is triggered
    And its hold time is governed by the Effect Interval Timer
    And it is not extended by how long the audio stays above threshold

  # --- Combining effects (section 8.9) ---
  # Any combination of Nega, Mosaic, Mono, Paint, Still, or Strobe may be pulsed together.

  Scenario: Any combination of the eligible effects can be pulsed together
    Given A/V Synchro is armed with the Nega, Mosaic, and Paint effects selected together
    When the audio rises above the trigger threshold
    Then the Nega, Mosaic, and Paint effects are all applied together
    And they release together when the audio falls below the threshold

  Scenario Outline: Each eligible effect can be driven by A/V Synchro
    Given A/V Synchro is armed with the <effect> effect selected
    When the audio rises above the trigger threshold
    Then the <effect> effect is applied

    Examples:
      | effect |
      | Nega   |
      | Mosaic |
      | Mono   |
      | Paint  |
      | Still  |
      | Strobe |

  # --- Restrictions (sections 8.8 and 8.9) ---

  Scenario: A/V Synchro cannot be combined with Trail
    # Reference 8.8/8.9: A/V Synchro can't be combined with Trail.
    Given the Trail effect is active
    When I try to arm A/V Synchro
    Then A/V Synchro is refused while Trail is active

  Scenario: Arming A/V Synchro is unavailable once Trail is engaged
    Given A/V Synchro is armed with the Nega effect selected
    When the Trail effect is engaged
    Then A/V Synchro is disengaged
    And only one of A/V Synchro and Trail can be active at a time

  # --- Silence (section 8.9) ---

  Scenario: Silence holds every armed effect off
    Given A/V Synchro is armed with the Nega and Strobe effects selected together
    When the audio is silent
    Then no armed effect is applied
    And the A-bus shows the untreated picture
