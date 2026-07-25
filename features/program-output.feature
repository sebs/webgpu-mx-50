Feature: Program output selection
  As a VJ or video editor
  I want to choose whether the program output carries the raw A-bus, the raw B-bus, or the fully effected composite
  So that I can send a clean feed downstream while still monitoring the effect on preview

  # Reference: section 2 (Program Out selection and Preview).
  # Three mutually exclusive buttons decide what leaves the unit: A, B, EFFECT.
  # The A and B buttons are "direct-out" buttons that bypass the Digital Effect,
  # Mix/Wipe, DSK and Fade stages entirely; EFFECT sends the full processed signal.
  # See ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow),
  # ADR-0006 (Two-bus source model and Matte substitution rules) and
  # feature files source-selection.feature, matte-generator.feature, audio-mixer.feature.

  Background:
    Given the mixer is powered on with the signal graph active
    And Source 1 is assigned to the A-bus
    And Source 2 is assigned to the B-bus
    And a digital effect and a Mix/Wipe transition are configured in the signal chain

  Scenario: EFFECT is the default program output mode
    Then exactly one of the program output buttons A, B, EFFECT is active at any time

  @integration
  Scenario: The A button sends the A-bus directly, bypassing all effects
    When I select program output A
    Then the program output video is the A-bus source
    And the Digital Effect, Mix/Wipe, Downstream Key and Fade stages are bypassed
    And the program output audio is the A-bus audio mixed with Aux 1 and Aux 2/Mic
    But the Master fader does not govern the program audio level in this mode

  @integration
  Scenario: The B button sends the B-bus directly, bypassing all effects
    When I select program output B
    Then the program output video is the B-bus source
    And the Digital Effect, Mix/Wipe, Downstream Key and Fade stages are bypassed
    And the program output audio is the B-bus audio mixed with Aux 1 and Aux 2/Mic
    But the Master fader does not govern the program audio level in this mode

  @integration
  Scenario: The EFFECT button sends the fully processed composite
    When I select program output EFFECT
    Then the program output video is the full processed composite through every stage
    And the Digital Effect, Mix/Wipe, Downstream Key and Fade stages are applied
    And the program output audio is the complete 7-input Audio Mix
    And the Master fader governs the program audio level

  Scenario Outline: Direct-out buttons carry only their bus audio plus the aux/mic inputs
    When I select program output <mode>
    Then the <bus> audio is present in the program output
    And Aux 1 and Aux 2/Mic audio are present in the program output
    But the opposite bus audio is not present in the program output

    Examples:
      | mode | bus   |
      | A    | A-bus |
      | B    | B-bus |

  Scenario: Preview always shows the effected video regardless of program mode
    When I select program output A
    Then the program output video is the A-bus source
    But the Preview output shows the effected video

  Scenario: Preview shows the effected video even in EFFECT mode
    When I select program output EFFECT
    Then the Preview output shows the effected video

  @integration
  Scenario Outline: Preview lets me monitor the effect while sending a clean bus to program
    When I select program output <mode>
    Then the program output video is the <bus> source
    And the Preview output shows the effected video simultaneously

    Examples:
      | mode | bus   |
      | A    | A-bus |
      | B    | B-bus |

  # Matte cannot be output through a direct-out button; the unit substitutes the
  # video of the source whose button is blinking instead. See ADR-0006 and
  # source-selection.feature, matte-generator.feature.
  Scenario: Matte on the A-bus with direct-out A outputs the blinking source instead
    Given Matte is assigned to the A-bus
    And the substitute source button on the A-bus is blinking
    When I select program output A
    Then the program output video is the blinking source, not the Matte

  Scenario: Matte on the B-bus with direct-out B outputs the blinking source instead
    Given Matte is assigned to the B-bus
    And the substitute source button on the B-bus is blinking
    When I select program output B
    Then the program output video is the blinking source, not the Matte

  Scenario: Matte on a bus is still usable through the EFFECT output
    Given Matte is assigned to the A-bus
    When I select program output EFFECT
    Then the Matte colour participates in the processed composite as an A-bus source

  Scenario Outline: Selecting a program mode deactivates the other two
    When I select program output <chosen>
    Then program output <chosen> is active
    And program output <other_1> is inactive
    And program output <other_2> is inactive

    Examples:
      | chosen | other_1 | other_2 |
      | A      | B       | EFFECT  |
      | B      | A       | EFFECT  |
      | EFFECT | A       | B       |
