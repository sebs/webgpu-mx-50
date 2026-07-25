Feature: Digital effect: Trail
  As a VJ or video editor,
  I want a compressed source to leave a decaying trail of progressively larger copies,
  So that I can create a motion-echo effect that streaks a shrunken image across the screen.

  # Grounded in reference section 8.8 (Trail).
  # Trail sits in the Digital Effect stage of the signal flow:
  #   Source -> bus assignment -> Colour Correction -> Digital Effect -> Mix/Wipe -> DSK -> Fade -> Program Out
  # Behaviour of record:
  #   - A compressed (shrunken) image leaves a trail of progressively larger copies, up to 16.
  #   - The start corner (upper-left or upper-right) is chosen with the Positioner Joystick.
  #   - The TIME control sets the interval between copies (~0.07 s to ~2.1 s).
  #   - Moving the joystick mid-trail creates a staggered image series.
  #   - The Compression Wipe does not work properly during Trail.
  #   - A/V Synchro cannot be combined with Trail.
  # Related ADRs: ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow),
  #               ADR-0007 (GPU frame memory for freeze-family effects),
  #               ADR-0011 (Single unidirectional panel state store),
  #               ADR-0012 (Render loop and transition timing model).
  # Related features: digital-effects-filters.feature, digital-effect-still.feature,
  #                   digital-effect-strobe.feature, digital-effect-multi.feature,
  #                   av-synchro.feature, wipe-patterns.feature, position-and-scene-grabber.feature.

  Background:
    Given the mixer is running with the A-bus carrying a moving source
    And no digital effect is active on the A-bus

  # --- Activation (section 8 preamble + 8.8) ---

  Scenario: Selecting Trail without ON does not change the picture
    When I select the A-bus for the digital effect
    And I choose the Trail effect
    Then the A-bus output is unchanged

  Scenario: Trail becomes live only when ON is pressed
    Given I have selected the A-bus for the digital effect
    And I have chosen the Trail effect
    When I press ON
    Then the A-bus shows a compressed image trailing progressively larger copies of itself
    And the B-bus output is unchanged

  Scenario: Turning Trail off restores the untreated bus
    Given the Trail effect is ON for the A-bus
    When I press ON to deactivate the effect
    Then the A-bus output is unchanged

  # --- Trail geometry: shrunken lead image and enlarging copies (section 8.8) ---

  Scenario: The live image is compressed and leads the trail
    Given the Trail effect is ON for the A-bus
    Then the current source appears as the smallest, most-compressed copy
    And each older copy behind it is progressively larger

  Scenario: The trail is capped at 16 copies
    Given the Trail effect is ON for the A-bus
    When the effect has been running long enough to fill the trail
    Then no more than 16 copies are shown at once
    And the oldest copy is dropped as each new copy is spawned

  # --- Start corner chosen with the Positioner Joystick (section 8.8) ---

  Scenario Outline: The Positioner Joystick selects the start corner
    Given the Trail effect is ON for the A-bus
    When I hold the Positioner Joystick toward the <corner> corner
    Then the trail originates from the <corner> corner
    And the copies enlarge away from that corner

    Examples:
      | corner      |
      | upper-left  |
      | upper-right |

  # --- TIME control sets the interval (section 8.8: ~0.07 s to ~2.1 s) ---

  Scenario Outline: The TIME control sets the interval between copies
    Given the Trail effect is ON for the A-bus
    When I set the TIME control to <setting>
    Then a new copy is spawned every <interval>

    Examples:
      | setting | interval                          |
      | MIN     | about 0.07 seconds                |
      | mid     | a moderate interval within range  |
      | MAX     | about 2.1 seconds                 |

  Scenario: A shorter interval packs the copies more densely
    Given the Trail effect is ON for the A-bus
    When I set the TIME control toward MIN
    Then copies are spawned rapidly and overlap closely
    When I set the TIME control toward MAX
    Then copies are spawned slowly and spread further apart

  # --- Staggered series when the joystick moves mid-trail (section 8.8) ---

  Scenario: Moving the joystick mid-trail staggers the image series
    Given the Trail effect is ON for the A-bus
    And a trail is already building from the upper-left corner
    When I move the Positioner Joystick while the trail is building
    Then the already-spawned copies keep their original positions
    And newly spawned copies follow the joystick to form a staggered series

  # --- Interactions and constraints (section 8.8 notes) ---

  Scenario: A/V Synchro cannot be combined with Trail
    Given the Trail effect is ON for the A-bus
    When I attempt to enable A/V Synchro
    Then A/V Synchro is refused while Trail is active
    And the Trail effect continues unaffected

  Scenario: Trail cannot be combined with A/V Synchro
    Given A/V Synchro is active on the A-bus
    When I attempt to enable the Trail effect
    Then the two effects are not allowed to run together

  Scenario: The Compression Wipe is unreliable during Trail
    Given the Trail effect is ON for the A-bus
    When a Compression Wipe transition is used
    Then the Compression Wipe is not guaranteed to behave correctly
    And the interaction is surfaced as unsupported rather than silently broken

  # --- Per-bus scope (section 8 preamble) ---

  Scenario: Trail applies to only one bus at a time
    Given the Trail effect is ON for the A-bus
    When I select the B-bus for the digital effect
    And I choose the Trail effect
    And I press ON
    Then the Trail effect is applied to the B-bus
    And the A-bus carries no digital effect
