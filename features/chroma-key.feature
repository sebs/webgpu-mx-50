Feature: Chroma Key
  As a VJ or video editor
  I want to key the B-bus onto the A-bus based on a chosen colour
  So that I can drop a green-screen (or any solid-colour) background out of a subject and composite it over another source

  # Reference: section 9.6 (Chroma Key, D-5).
  # Chroma Key is one of the five transition/composite functions that live under the
  # Mix/Wipe lever (Mix, NAM, Wipe, Luminance Key, Chroma Key). It keys the B-bus over
  # the A-bus by the colour chosen with the HUE control; the SLICE control sets how
  # tightly that colour is matched. The B-bus is ALWAYS the key source (foreground),
  # and the A-bus supplies the revealed background.
  # See ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow),
  # ADR-0006 (Two-bus source model and Matte substitution rules) and
  # ADR-0009 (Compositional wipe-pattern engine).
  # Related features: luminance-key.feature, transition-mix-nam.feature,
  # wipe-patterns.feature, auto-take.feature, source-selection.feature,
  # matte-generator.feature.

  Background:
    Given the mixer is powered on with the signal graph active
    And a background source is assigned to the A-bus
    And a subject shot against a solid-colour backdrop is assigned to the B-bus
    And the Mix/Wipe lever is fully at the B-bus end

  Scenario: Engaging Chroma Key selects it as the active transition function
    When I press CHROMA KEY
    Then Chroma Key is the active transition function
    And no other transition function (Mix, NAM, Wipe, Luminance Key) is active
    And the B-bus is the key source

  Scenario: With the lever fully at B, a fully keyed composite is produced
    Given Chroma Key is engaged
    And HUE is dialled to the backdrop colour
    When the lever remains fully at the B-bus end
    Then B-bus pixels matching the keyed colour become transparent
    And the A-bus source shows through wherever the backdrop colour was removed
    And the B-bus subject that does not match the keyed colour remains opaque

  Scenario: SLICE starts at centre as the baseline before tuning
    Given Chroma Key is engaged
    When I set SLICE to its centre position
    Then SLICE provides a moderate keying tolerance as a starting point for adjustment

  Scenario: HUE selects which colour is removed from the B-bus image
    Given Chroma Key is engaged
    And SLICE is at its centre position
    When I turn HUE to the backdrop colour
    Then that colour is the one removed from the B-bus image
    And B-bus regions of other colours are unaffected

  Scenario Outline: HUE can key out any solid backdrop colour
    Given Chroma Key is engaged
    And the B-bus subject is shot against a <backdrop> backdrop
    When I turn HUE to the <backdrop> colour
    Then the <backdrop> backdrop is removed from the B-bus image
    And the A-bus source is revealed behind the subject

    Examples:
      | backdrop |
      | green    |
      | blue     |
      | red      |

  Scenario: Fine-tuning SLICE tightens the key edge
    Given Chroma Key is engaged
    And HUE is dialled to the backdrop colour
    And residual fringing remains around the subject with SLICE at centre
    When I fine-tune SLICE for a clean key edge
    Then the transition between opaque subject and transparent backdrop is sharpened
    And backdrop-colour spill around the subject edge is reduced

  Scenario Outline: SLICE controls the colour-matching tolerance of the key
    Given Chroma Key is engaged
    And HUE is dialled to the backdrop colour
    When I move SLICE toward <direction>
    Then the range of colours treated as backdrop <effect>

    Examples:
      | direction | effect                                                        |
      | narrow    | shrinks, keying only colours very close to the chosen hue     |
      | wide      | grows, keying a broader spread of colours near the chosen hue |

  Scenario: The B-bus is always the key source regardless of assignment
    Given Chroma Key is engaged
    When I inspect the composite
    Then the B-bus supplies the foreground key source
    And the A-bus supplies the background revealed through the key
    And swapping which physical input feeds the B-bus does not change which bus is the key source

  Scenario: Easing the lever toward A blends the keyed and unkeyed images
    Given Chroma Key is engaged
    And HUE is dialled to the backdrop colour
    And the lever is fully at the B-bus end producing a fully keyed composite
    When I ease the lever toward the A-bus end
    Then the output is a mix of the keyed composite and the unkeyed B-bus image
    And the keyed regions become progressively more filled by the unkeyed B-bus

  Scenario Outline: Lever position scales the blend between keyed and unkeyed images
    Given Chroma Key is engaged
    And HUE is dialled to the backdrop colour
    When the lever is positioned <position>
    Then the composite is <result>

    Examples:
      | position                | result                                                    |
      | fully at B              | a fully keyed composite                                   |
      | midway between B and A  | a partial mix of the keyed composite and the unkeyed B-bus |

  # A well-lit, stable subject on the key bus gives the cleanest key.
  # Reference section 9.6 strongly recommends this; it is guidance, not a hard rule.
  Scenario: A well-lit stable subject yields the cleanest key
    Given Chroma Key is engaged
    And HUE is dialled to the backdrop colour
    When the B-bus backdrop is evenly lit and the subject is stable
    Then the key edge is clean with minimal SLICE adjustment required

  # Matte cannot be used as a key source. Per ADR-0006 the unit substitutes the
  # video of the blinking source button on the B-bus instead. See matte-generator.feature.
  Scenario: Matte cannot serve as the Chroma Key source
    Given Matte is assigned to the B-bus
    And the substitute source button on the B-bus is blinking
    When I press CHROMA KEY
    Then the blinking source video is used as the key source, not the Matte

  @integration
  Scenario: Chroma Key output feeds the downstream stages of the signal chain
    Given Chroma Key is engaged
    And HUE is dialled to the backdrop colour
    When I select program output EFFECT
    Then the chroma-keyed composite passes into the Downstream Key and Fade stages
    And the fully processed composite is sent to Program Out

  @integration
  Scenario: Auto Take performs the Chroma Key transition automatically
    Given Chroma Key is engaged as the transition function
    And HUE is dialled to the backdrop colour
    When I press AUTO TAKE
    Then the lever movement from B toward A is performed automatically over the set transition time
    And the composite blends from fully keyed toward the unkeyed B-bus image
