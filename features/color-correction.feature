Feature: Colour correction
  As a VJ or video editor
  I want independent per-bus colour correction with a tri-state control, CHROMA saturation, and an RGB tint joystick
  So that I can grade or de-saturate a source before it reaches the effect and transition stages without shifting colour across a Mix or Wipe

  # Grounded in reference section 6 (Color Correction, B-4).
  # Colour correction is applied per bus, in the signal flow after bus assignment and before the Digital Effect stage:
  # Source -> bus assignment -> Colour Correction -> Digital Effect -> Mix/Wipe -> DSK -> Fade -> Program Out.
  # See also: source-selection.feature, digital-effects-filters.feature (Mono override),
  # transition-mix-nam.feature and wipe-patterns.feature (matched-correction recommendation).

  Background:
    Given a full-colour source is assigned to the A-bus
    And a full-colour source is assigned to the B-bus
    And colour correction is off on both buses

  Scenario: First press activates CHROMA only
    When I press the colour-correction button for the A-bus once
    Then colour correction on the A-bus enters the CHROMA-only state
    And the A-bus CHROMA control is active
    And the A-bus RGB joystick is not yet active
    And the button LED blinks to indicate the CHROMA-only state

  Scenario: Second press adds the RGB joystick
    Given colour correction on the A-bus is in the CHROMA-only state
    When I press the colour-correction button for the A-bus a second time
    Then colour correction on the A-bus enters the CHROMA-plus-joystick state
    And the A-bus CHROMA control remains active
    And the A-bus RGB joystick becomes active in addition to CHROMA
    And the button LED is solid to indicate the CHROMA-plus-joystick state

  Scenario: Third press turns correction off
    Given colour correction on the A-bus is in the CHROMA-plus-joystick state
    When I press the colour-correction button for the A-bus a third time
    Then colour correction on the A-bus is off
    And the A-bus CHROMA control is inactive
    And the A-bus RGB joystick is inactive
    And the button LED is unlit

  Scenario Outline: The button cycles through the three states in order
    Given colour correction on the A-bus is in the <start> state
    When I press the colour-correction button for the A-bus once
    Then colour correction on the A-bus is in the <next> state

    Examples:
      | start                | next                 |
      | off                  | chroma-only          |
      | chroma-only          | chroma-plus-joystick |
      | chroma-plus-joystick | off                  |

  Scenario: CHROMA at centre preserves the original saturation
    Given colour correction on the A-bus is in the CHROMA-only state
    When the A-bus CHROMA control is at its centre position
    Then the A-bus image retains its original colour saturation

  Scenario: Lowering CHROMA de-saturates toward black-and-white
    Given colour correction on the A-bus is in the CHROMA-only state
    When I turn the A-bus CHROMA control below centre
    Then the A-bus image is de-saturated
    And its saturation is reduced compared with the original

  Scenario: CHROMA at MIN yields a black-and-white image
    Given colour correction on the A-bus is in the CHROMA-only state
    When I turn the A-bus CHROMA control fully to MIN
    Then the A-bus image is rendered in black and white

  Scenario: From black-and-white the joystick casts a single mono tint
    Given colour correction on the A-bus is in the CHROMA-plus-joystick state
    And the A-bus CHROMA control is fully at MIN so the image is black and white
    When I move the A-bus RGB joystick off centre
    Then the whole A-bus scene takes on a single mono tint toned toward the joystick colour

  Scenario Outline: The joystick direction determines the mono tint colour
    Given colour correction on the A-bus is in the CHROMA-plus-joystick state
    And the A-bus CHROMA control is fully at MIN so the image is black and white
    When I move the A-bus RGB joystick toward <direction>
    Then the whole A-bus scene is toned as a <tint> monochrome image

    Examples:
      | direction | tint  |
      | red       | red   |
      | green     | green |
      | blue      | blue  |

  Scenario: The RGB joystick at centre preserves the original colour balance
    Given colour correction on the A-bus is in the CHROMA-plus-joystick state
    And the A-bus CHROMA control is at its centre position
    When the A-bus RGB joystick is at its centre position
    Then the A-bus image retains its original colour balance

  Scenario: The joystick shifts hue and colour balance when CHROMA is above MIN
    Given colour correction on the A-bus is in the CHROMA-plus-joystick state
    And the A-bus CHROMA control is at its centre position
    When I move the A-bus RGB joystick off centre
    Then the A-bus image's hue and colour balance shift toward the joystick colour
    And the image is not a single mono tint because CHROMA is above MIN

  Scenario: No effect on a source that is already black and white
    Given a black-and-white source is assigned to the A-bus
    And colour correction on the A-bus is in the CHROMA-plus-joystick state
    When I turn the A-bus CHROMA control fully to MIN
    Then the A-bus image is unchanged
    When I move the A-bus RGB joystick off centre
    Then the A-bus image is unchanged

  Scenario: The Mono digital effect overrides colour correction
    Given colour correction on the A-bus is in the CHROMA-plus-joystick state
    And the Mono digital effect is active on the A-bus signal path
    When I adjust the A-bus CHROMA control and RGB joystick
    Then the colour-correction adjustments have no visible effect on the output
    And the Mono digital effect determines the resulting colour
    # The manual notes the Mono digital effect must be off for colour correction to apply.
    # See digital-effects-filters.feature.

  Scenario: The two buses correct independently
    When I press the colour-correction button for the A-bus once
    Then colour correction on the A-bus is in the chroma-only state
    And colour correction on the B-bus is off
    When I turn the A-bus CHROMA control fully to MIN
    Then the A-bus image is rendered in black and white
    And the B-bus image retains its original colour

  Scenario: Identical correction on both buses keeps a transition free of colour shift
    Given colour correction on the A-bus is in the CHROMA-plus-joystick state
    And colour correction on the B-bus is set identically to the A-bus
    When a Mix or Wipe transition runs from the A-bus to the B-bus
    Then the corrected colour does not visibly shift across the transition
    # The manual recommends applying identical correction to both buses so a
    # transition doesn't visibly shift colour. See transition-mix-nam.feature and wipe-patterns.feature.

  Scenario: Mismatched correction produces a visible colour shift across a transition
    Given colour correction on the A-bus is in the CHROMA-plus-joystick state
    And the B-bus has different colour correction from the A-bus
    When a Mix or Wipe transition runs from the A-bus to the B-bus
    Then the output colour visibly shifts as the transition crosses between the buses
