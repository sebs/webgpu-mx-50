Feature: Digital effects: Nega, Mosaic, Mono, Paint
  As a VJ or video editor,
  I want to apply the filter-family digital effects (Nega, Mosaic, Mono, Paint) to a chosen bus,
  So that I can restyle a source's look live without affecting the other bus.

  # Grounded in reference sections 8.1-8.4 and the Digital Effect Block preamble (section 8).
  # These effects sit in the Digital Effect stage of the signal flow:
  #   Source -> bus assignment -> Colour Correction -> Digital Effect -> Mix/Wipe -> DSK -> Fade -> Program Out
  # Related ADRs: ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow),
  #               ADR-0011 (Single unidirectional panel state store).
  # Related features: color-correction.feature, av-synchro.feature,
  #                   digital-effect-still.feature, digital-effect-strobe.feature.

  Background:
    Given the mixer is running with the A-bus and the B-bus each carrying a moving source
    And no digital effect is active on either bus

  # --- Per-bus selection and activation (section 8 preamble) ---
  # A filter effect targets exactly one bus, and only takes hold once ON is pressed.

  Scenario: Choosing a bus alone does not change the picture
    When I select the A-bus for the digital effect
    And I choose the Nega effect
    Then the A-bus output is unchanged
    And the B-bus output is unchanged

  Scenario: The effect becomes live only when ON is pressed
    Given I have selected the A-bus for the digital effect
    And I have chosen the Nega effect
    When I press ON
    Then the Nega effect is applied to the A-bus
    And the B-bus output is unchanged

  Scenario: An effect applies to only one bus at a time
    Given the Mosaic effect is ON for the A-bus
    When I select the B-bus for the digital effect
    And I press ON
    Then the Mosaic effect is applied to the B-bus
    And the A-bus carries no digital effect

  Scenario: Turning the effect off restores the untreated bus
    Given the Paint effect is ON for the A-bus
    When I press ON to deactivate the effect
    Then the A-bus output is unchanged

  Scenario Outline: Each filter effect activates on the selected bus when ON is pressed
    Given I have selected the A-bus for the digital effect
    And I have chosen the <effect> effect
    When I press ON
    Then the <effect> effect is applied to the A-bus
    And the B-bus output is unchanged

    Examples:
      | effect |
      | Nega   |
      | Mosaic |
      | Mono   |
      | Paint  |

  # --- Nega (section 8.1) ---

  Scenario: Nega inverts the image like a film negative
    Given I have selected the A-bus for the digital effect
    And I have chosen the Nega effect
    When I press ON
    Then each pixel of the A-bus is inverted to its complementary value
    And a pure white region reads as pure black
    And a pure black region reads as pure white

  Scenario: Colour Correction stacks on top of Nega
    # Nega precedes nothing here: Colour Correction runs earlier in the flow,
    # but the reference notes it can be used together to tint the negative.
    Given colour correction on the A-bus is tinting the image
    And I have selected the A-bus for the digital effect
    And I have chosen the Nega effect
    When I press ON
    Then the A-bus shows an inverted image that also carries the colour-correction tint

  # --- Mosaic (section 8.2) ---

  Scenario: Mosaic breaks the picture into solid-coloured squares
    Given I have selected the A-bus for the digital effect
    And I have chosen the Mosaic effect
    When I press ON
    Then the A-bus is rendered as a grid of solid-coloured square blocks
    And each block takes a single colour sampled from the source

  Scenario Outline: The SIZE control varies the block size across 31 steps
    Given the Mosaic effect is ON for the A-bus
    When I set the SIZE control to step <step>
    Then the Mosaic block size corresponds to step <step> of 31

    Examples:
      | step |
      | 1    |
      | 16   |
      | 31   |

  Scenario: Sweeping the SIZE control animates the pixelation live
    Given the Mosaic effect is ON for the A-bus
    When I sweep the SIZE control from step 1 through step 31
    Then the A-bus blocks grow progressively larger without interrupting playback

  # --- Mono (section 8.3) ---

  Scenario: Mono converts the bus to black-and-white
    Given I have selected the A-bus for the digital effect
    And I have chosen the Mono effect
    When I press ON
    Then the A-bus is rendered in greyscale
    And the B-bus retains its colour

  Scenario: Mono overrides colour correction on that bus
    Given colour correction on the A-bus is adjusting hue and saturation
    And I have selected the A-bus for the digital effect
    And I have chosen the Mono effect
    When I press ON
    Then the A-bus colour correction is overridden while Mono is on
    And the A-bus remains greyscale regardless of the colour-correction settings

  Scenario: Colour correction resumes on the bus when Mono is turned off
    Given colour correction on the A-bus is adjusting hue and saturation
    And the Mono effect is ON for the A-bus
    When I press ON to deactivate the effect
    Then the A-bus colour correction takes effect again

  # --- Paint (section 8.4) ---

  Scenario: Paint posterizes the image to resemble an oil painting
    Given I have selected the A-bus for the digital effect
    And I have chosen the Paint effect
    When I press ON
    Then the A-bus is posterized into flat bands of colour

  Scenario Outline: The LEVEL control adjusts the gradation continuously
    Given the Paint effect is ON for the A-bus
    When I set the LEVEL control to <level>
    Then the Paint gradation becomes <coarseness>

    Examples:
      | level | coarseness             |
      | MIN   | the finest gradation   |
      | mid   | a moderate gradation   |
      | MAX   | the coarsest gradation |

  Scenario: Sweeping the LEVEL control animates the posterization live
    Given the Paint effect is ON for the A-bus
    When I sweep the LEVEL control from MIN to MAX
    Then the A-bus colour banding coarsens smoothly without interrupting playback
