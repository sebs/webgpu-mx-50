@integration
Feature: Combination recipes
  As a VJ or video editor,
  I want the WJ-MX50 blocks to stack into the documented "power user" recipes,
  So that I can reproduce the manual's signature looks by combining effects, transitions,
  keying, and positioning exactly as the hardware intends.

  # Grounded in the feature reference, section 16 (Combination Recipes). Each recipe below is a
  # cross-feature stack; the individual blocks are specified in their own features. See:
  #   digital-effects-filters.feature (Nega, Mosaic, Mono, Paint), digital-effect-strobe.feature,
  #   digital-effect-multi.feature, wipe-patterns.feature (Square family, Compression),
  #   wipe-edge-and-direction.feature (Border, Reverse), position-and-scene-grabber.feature,
  #   transition-mix-nam.feature (Mix), av-synchro.feature, auto-take.feature,
  #   source-selection.feature, event-memory.feature, program-output.feature.
  # Related ADRs: ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow),
  # ADR-0006 (Two-bus source model and Matte substitution rules), ADR-0009 (Compositional
  # wipe-pattern engine), ADR-0007 (GPU frame memory for freeze-family effects).
  #
  # These are @integration recipes: they assert that the composed result is correct, not the
  # inner mechanics of any one block. The fixed signal flow is:
  #   Source -> bus assignment -> Colour Correction -> Digital Effect -> Mix/Wipe -> DSK -> Fade.

  Background:
    Given Program Out is set to EFFECT so the full processed composite is shown
    And both the A-bus and B-bus have a source assigned

  # ===========================================================================
  # Recipe 1 — Auto-Take double effect
  # Same source on both buses, a different digital effect on each; with transition
  # time at MIN, AUTO TAKE snaps instantly between the two effected pictures.
  # ===========================================================================

  Scenario: Auto-Take double effect snaps between two effected versions of one picture
    Given the same source is assigned to both the A-bus and the B-bus
    And the A-bus digital effect is "Paint + Strobe"
    And the B-bus digital effect is "Nega"
    And the transition mode is MIX
    And the transition time is set to MIN
    When AUTO TAKE is triggered
    Then the program snaps from the A-bus effected picture to the B-bus effected picture without a visible dissolve
    And both pictures are the same underlying source viewed through different digital effects

  Scenario Outline: The double-effect pairing is symmetric across an Auto-Take cycle
    Given the same source is assigned to both buses
    And the A-bus digital effect is "<a_effect>"
    And the B-bus digital effect is "<b_effect>"
    And the transition time is set to MIN
    When AUTO TAKE is triggered twice
    Then the program returns to the A-bus effected picture
    And each trigger snaps instantly rather than dissolving

    Examples:
      | a_effect      | b_effect |
      | Paint + Strobe| Nega     |
      | Mosaic        | Mono     |
      | Nega          | Paint    |

  Scenario: A longer transition time turns the double effect into a dissolve rather than a snap
    Given the same source is assigned to both buses with different digital effects
    And the transition time is set above MIN
    When AUTO TAKE is triggered
    Then the two effected pictures cross-dissolve over the set transition time
    And the snap behaviour only occurs when the transition time is MIN

  # ===========================================================================
  # Recipe 2 — Mosaic Spotlight
  # Same source both buses; Mosaic on B; Square wipe + Positioner makes a movable
  # mosaic "censor block". Add Border to outline it, Reverse and/or Mono to highlight.
  # ===========================================================================

  Scenario: Mosaic Spotlight produces a movable censor block over a normal picture
    Given the same source is assigned to both the A-bus and the B-bus
    And the B-bus digital effect is "Mosaic"
    And the transition mode is WIPE
    And the "Square" wipe family variant "square" is selected
    And the wipe lever is held at a partial position so the square is inset within the frame
    When the Positioner moves the square
    Then a mosaic block appears over an otherwise normal picture
    And the block tracks the Positioner so it can be placed over any region

  Scenario: Border outlines the mosaic censor block
    Given a Mosaic Spotlight is active with a Square wipe
    When BORDER is enabled on the wipe edge
    Then the mosaic block is outlined by a border
    And the border colour follows the Matte/border setting

  Scenario Outline: Reverse and Mono highlight the spotlight region further
    Given a Mosaic Spotlight is active with a Square wipe
    When "<modifier>" is applied
    Then the spotlight region is highlighted by "<effect>"

    Examples:
      | modifier | effect                                                             |
      | Reverse  | swapping which side of the square shows the mosaic versus the clean picture |
      | Mono     | rendering the mosaic block in monochrome against the colour picture |

  Scenario: The spotlight square resizes with the wipe lever
    Given a Mosaic Spotlight is active with a Square wipe
    When the wipe lever is moved toward its full-B position
    Then the mosaic square grows larger
    And when the lever is moved toward its full-A position the mosaic square shrinks

  # ===========================================================================
  # Recipe 3 — After Image
  # Same source both buses, Strobe + Mix, tuning Strobe TIME and lever position makes
  # motion leave ghost after-images; A/V Synchro pulses it with the music.
  # ===========================================================================

  Scenario: After Image leaves motion ghosts behind moving subjects
    Given the same source is assigned to both the A-bus and the B-bus
    And the A-bus digital effect is "Strobe"
    And the transition mode is MIX
    And the wipe lever is held at a partial position mixing A over B
    When the source contains motion
    Then moving elements leave ghost after-images trailing behind them
    And the ghost density is tuned by the Strobe TIME and the lever position

  Scenario Outline: Lever position and Strobe TIME control the after-image strength
    Given an After Image is active with Strobe on the A-bus and MIX
    When the Strobe TIME is "<time>" and the lever is at "<lever>"
    Then the after-image trail is "<strength>"

    Examples:
      | time  | lever   | strength                          |
      | short | centre  | many faint, closely spaced ghosts |
      | long  | centre  | fewer, more widely spaced ghosts  |
      | long  | near-A  | subtle ghosting over a mostly live picture |

  Scenario: A/V Synchro pulses the after image in time with the music
    Given an After Image is active with Strobe and MIX
    When A/V SYNCHRO is enabled and driven by the audio input
    Then the Strobe re-samples on audio peaks
    And the ghost after-images pulse in time with the music

  # ===========================================================================
  # Recipe 4 — Multi / Live mixing
  # Multi + Compression + Square wipe + Strobe: a live picture inset over a grid of
  # still images, positioned via the joystick.
  # ===========================================================================

  Scenario: Multi/Live mixing insets a live picture over a grid of stills
    Given the B-bus digital effect is "Multi"
    And COMPRESSION is engaged on the wipe
    And the transition mode is WIPE
    And the "Square" wipe family variant "square" is selected
    And STROBE is engaged
    When the recipe is composed
    Then the B-bus shows a grid of still images produced by Multi
    And a compressed live picture is inset over the grid through the Square wipe
    And the Positioner moves the live inset around the grid

  Scenario: The live inset stays live while the grid remains frozen
    Given a Multi/Live mixing recipe is active
    Then the grid tiles hold still frames captured by Multi
    And the inset picture continues to update from its live source

  Scenario: Removing Strobe leaves a clean live inset over the still grid
    Given a Multi/Live mixing recipe is active
    When STROBE is disengaged
    Then the still grid and the compressed live inset remain
    And the inset no longer strobes

  # ===========================================================================
  # Recipe 5 — Picture-in-Picture (PiP)
  # Square wipe + Compression + Positioner; the lever sets the inset size; Scene Grabber
  # freezes the inset. Only the square-wipe PiP is storable to Event Memory.
  # ===========================================================================

  Scenario: Picture-in-Picture insets a compressed B picture over the A picture
    Given the transition mode is WIPE
    And the "Square" wipe family variant "square" is selected
    And COMPRESSION is engaged so the incoming scene wipes in as a whole scaled-down picture
    When the recipe is composed
    Then the B-bus picture appears as a compressed inset over the full A-bus picture
    And the Positioner moves the inset anywhere within the frame

  Scenario: The wipe lever sets the size of the PiP inset
    Given a Picture-in-Picture is active with a Square wipe and Compression
    When the wipe lever is moved toward its full-B position
    Then the inset grows larger
    And when the lever is moved toward its full-A position the inset shrinks

  Scenario: Scene Grabber freezes the PiP inset
    Given a Picture-in-Picture is active
    When SCENE GRABBER is triggered on the inset source
    Then the inset holds a frozen still
    And the surrounding A-bus picture continues to update live

  Scenario: Only a square-wipe PiP can be stored to Event Memory
    Given a Picture-in-Picture is active with a Square wipe and Compression
    When the panel state is stored to an Event Memory slot
    Then the PiP configuration is saved and can be recalled

  Scenario: A PiP built on a non-square wipe cannot be stored to Event Memory
    Given a Picture-in-Picture-like inset is built on a non-square wipe family
    When storage to an Event Memory slot is attempted
    Then the configuration is not stored as a recallable PiP
    And only the square-wipe PiP is documented as storable
