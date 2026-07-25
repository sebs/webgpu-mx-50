Feature: Wipe pattern system
  As a VJ or video editor,
  I want a compositional wipe engine that builds hundreds of patterns from a small set of
  base families and stackable modifiers,
  So that I can choose or externally recall any WJ-MX50 wipe transition and read its number
  from the Wipe Pattern Indicator.

  # Grounded in the feature reference, sections 9.4 (Wipe) and 9.7 (Pattern Table & external
  # control). The engine is compositional: 7 base families, each cycling 4 variants, plus the
  # stackable modifiers Compression, Slide, Multi, Pairing, and Blinds. See ADR-0009
  # (Compositional wipe-pattern engine) and features wipe-edge-and-direction.feature,
  # transition-mix-nam.feature, program-output.feature.
  #
  # The transition itself is driven by the Mix/Wipe lever or by Auto Take; this feature
  # concerns only how a pattern is composed, validated, numbered, and displayed.

  Background:
    Given the transition mode is WIPE
    And the A-bus and B-bus each have a source assigned
    And the Wipe Pattern Indicator is visible

  # ---------------------------------------------------------------------------
  # Base families: 7 Pattern Select buttons, each cycling 4 variants
  # ---------------------------------------------------------------------------

  Scenario Outline: Each Pattern Select button cycles through its variants
    Given the "<family>" Pattern Select button is chosen
    When the button is pressed repeatedly
    Then it cycles through <variant_count> variants and wraps back to the first
    And the selected variant describes "<variant_theme>"

    Examples:
      | family     | variant_count | variant_theme                                  |
      | Straight   | 4             | straight-line wipes from each screen edge      |
      | Corner     | 4             | a square growing from each of the 4 corners    |
      | Diagonal   | 4             | diagonal-line wipes                            |
      | Triangle   | 4             | a triangle from each edge                      |
      | Split      | 4             | image splits open from centre (V, H, cross)    |
      | Mosaic     | 4             | mosaic-block / staircase / random-block edges  |
      | Square     | 4             | centred shape growing outward                  |

  Scenario Outline: The Square family grows a shape outward from centre
    Given the "Square" Pattern Select button is chosen
    When the variant "<variant>" is selected
    Then a centred "<shape>" grows outward as the wipe progresses

    Examples:
      | variant | shape   |
      | 1       | square  |
      | 2       | circle  |
      | 3       | oval    |
      | 4       | diamond |

  Scenario: Selecting a base family with no modifiers yields a plain wipe
    When the "Straight" family variant 1 is selected with no modifiers active
    Then the wipe boundary is a plain hard edge
    And no modifier LED is lit

  # ---------------------------------------------------------------------------
  # Modifiers stack on top of the base pattern
  # ---------------------------------------------------------------------------

  Scenario: Compression pressed once compresses only the incoming scene
    Given a base wipe pattern is selected
    When the COMPRESSION button is pressed once
    Then the incoming (B) scene wipes in as a whole picture scaled down inside the wipe shape
    And the outgoing scene is not compressed
    And the COMPRESSION LED shows the single-press state

  Scenario: Compression pressed twice compresses both scenes
    Given a base wipe pattern is selected
    When the COMPRESSION button is pressed twice
    Then both the A and B scenes are compressed and wipe in and out together
    And the COMPRESSION LED shows the double-press state

  Scenario: Slide pressed once slides the incoming image over the other
    Given a base wipe pattern is selected
    When the SLIDE button is pressed once
    Then one image slides over the other into frame
    And the SLIDE LED shows the single-press state

  Scenario: Slide pressed twice slides both images over each other
    Given a base wipe pattern is selected
    When the SLIDE button is pressed twice
    Then both images slide in and out over each other
    And the SLIDE LED shows the double-press state

  Scenario Outline: Multi repeats the wipe pattern up to six times
    Given a base wipe pattern is selected
    When the MULTI button selects multi mode <mode>
    Then the wipe pattern is repeated into <mode> vertical or horizontal tiles
    And the MULTI LED is lit

    Examples:
      | mode |
      | 1    |
      | 2    |
      | 3    |
      | 4    |
      | 5    |
      | 6    |

  Scenario: Multi offers at most six modes
    Given a base wipe pattern is selected
    When the MULTI button is cycled past its last mode
    Then it does not exceed 6 multi modes and wraps back to the first

  Scenario: Pairing creates a mirrored wipe scene
    Given a base wipe pattern is selected
    When the PAIRING button is engaged
    Then the wipe is rendered as a paired, mirrored scene
    And the PAIRING LED is lit

  Scenario: Pairing combines with Multi
    Given a base wipe pattern is selected
    And the MULTI button selects multi mode 4
    When the PAIRING button is engaged
    Then both the PAIRING and MULTI LEDs are lit
    And the wipe is rendered as paired, mirrored, repeated tiles

  Scenario Outline: Blinds render the wipe as venetian-blind strips on compatible families
    Given the "<family>" family is selected
    When the BLINDS button is engaged
    Then the wipe happens as venetian-blind strips
    And the BLINDS LED is lit

    Examples:
      | family   |
      | Straight |
      | Corner   |
      | Diagonal |
      | Triangle |
      | Split    |

  # ---------------------------------------------------------------------------
  # Illegal combinations are auto-handled
  # ---------------------------------------------------------------------------

  Scenario: Blinds on an unsupported family is rejected
    Given the "Square" family is selected
    When the BLINDS button is engaged
    Then the combination is illegal
    And the BLINDS LED goes out
    And the resulting pattern falls back to the Straight Wipe

  Scenario Outline: Illegal modifier combinations drop the offending modifier LED
    Given a wipe pattern that cannot legally take the "<modifier>" modifier
    When the "<modifier>" button is engaged
    Then the "<modifier>" LED goes out
    And the wipe either drops the modifier or falls back to the Straight Wipe

    Examples:
      | modifier    |
      | COMPRESSION |
      | SLIDE       |
      | MULTI       |
      | PAIRING     |
      | BLINDS      |

  Scenario: A valid combination keeps every engaged modifier LED lit
    Given the "Straight" family variant 1 is selected
    When the SLIDE button is pressed once
    And the MULTI button selects multi mode 2
    Then the combination is legal
    And both the SLIDE and MULTI LEDs remain lit

  # ---------------------------------------------------------------------------
  # Pattern numbering oracle: 001-255 on the indicator, +128 = reversed
  # ---------------------------------------------------------------------------

  Scenario: A composed pattern shows its number on the Wipe Pattern Indicator
    When a valid wipe pattern is composed
    Then the Wipe Pattern Indicator shows a number in the range 001 to 255

  Scenario: Pattern 001 is the normal straight wipe
    When the pattern numbered 001 is recalled
    Then the "Straight" family variant 1 is selected with no modifiers
    And the wipe travels in its normal direction

  Scenario Outline: Adding 128 to a pattern number reverses that same wipe
    When the pattern numbered <base> is recalled
    And the pattern numbered <reversed> is recalled
    Then both numbers select the same composed wipe shape
    And pattern <reversed> plays that wipe reversed relative to pattern <base>

    Examples:
      | base | reversed |
      | 001  | 129      |
      | 002  | 130      |
      | 042  | 170      |
      | 100  | 228      |
      | 127  | 255      |

  Scenario Outline: The reverse of a pattern is its number plus 128
    Given the base pattern number is <base>
    When its reversed variant is requested
    Then the resulting pattern number equals <base> plus 128

    Examples:
      | base |
      | 001  |
      | 050  |
      | 099  |
      | 127  |

  # ---------------------------------------------------------------------------
  # External control addressing (section 9.7)
  # ---------------------------------------------------------------------------

  Scenario Outline: RS422 can address pattern numbers 001 through 255
    When the RS422 protocol requests pattern number <number>
    Then the request is <result>

    Examples:
      | number | result                              |
      | 001    | accepted and the pattern is selected |
      | 255    | accepted and the pattern is selected |
      | 256    | rejected as out of RS422 range       |
      | 287    | rejected as out of RS422 range       |

  Scenario Outline: The AG-A800 edit controller can only call patterns 01 through 99
    When the AG-A800 controller calls pattern <number>
    Then the outcome is "<outcome>"

    Examples:
      | number | outcome                                                        |
      | 01     | the pattern numbered 001 is selected                           |
      | 42     | the pattern numbered 042 is selected                           |
      | 99     | the pattern currently set up on the mixer is triggered as-is   |

  @wip
  Scenario: Panel-only patterns are marked but cannot be called externally
    Given a pattern that the manual marks as panel-only
    When an external controller requests it by number
    Then the pattern is not selectable over the external interface
    But it remains selectable from the panel

  @wip
  Scenario: Invalid table cells are not selectable at all
    Given a modifier combination that the Pattern Table leaves blank
    When it is requested from the panel or an external controller
    Then no pattern is produced
    And the engine reports the combination as invalid
