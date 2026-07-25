Feature: Digital effect: Multi
  As a VJ or video editor,
  I want to tile the picture into a grid of captured images with controllable capture timing,
  So that I can build multi-image "video wall" looks that either freeze once or cycle continuously.

  # Grounded in reference section 8.7 (Multi), with interactions from the Digital Effect
  # Block preamble (section 8) and section 8.5 (Still, mutual exclusion).
  # Multi sits in the Digital Effect stage of the signal flow:
  #   Source -> bus assignment -> Colour Correction -> Digital Effect -> Mix/Wipe -> DSK -> Fade -> Program Out
  # Related ADRs: ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow),
  #               ADR-0007 (GPU frame memory for freeze-family effects),
  #               ADR-0011 (Single unidirectional panel state store),
  #               ADR-0012 (Render loop and transition timing model).
  # Related features: digital-effect-still.feature, digital-effect-strobe.feature,
  #                   digital-effect-trail.feature, digital-effects-filters.feature,
  #                   frame-field-mode.feature (deferred).

  Background:
    Given the mixer is running with the A-bus carrying a moving source
    And no digital effect is active on the A-bus
    And I have selected the A-bus for the digital effect

  # --- Cycling the grid count (section 8.7) ---
  # Each press of the Multi button steps the grid: single -> 4 -> 9 -> 16 -> single.

  Scenario: The first press splits the picture into 4 images
    When I press the Multi button once
    Then the A-bus is tiled into a 2 by 2 grid of 4 images

  Scenario: The second press splits the picture into 9 images
    Given the A-bus is tiled into a 2 by 2 grid of 4 images
    When I press the Multi button once
    Then the A-bus is tiled into a 3 by 3 grid of 9 images

  Scenario: The third press splits the picture into 16 images
    Given the A-bus is tiled into a 3 by 3 grid of 9 images
    When I press the Multi button once
    Then the A-bus is tiled into a 4 by 4 grid of 16 images

  Scenario: The fourth press returns to a single image and ends Multi
    Given the A-bus is tiled into a 4 by 4 grid of 16 images
    When I press the Multi button once
    Then the A-bus shows a single full-frame image
    And the Multi effect is off

  Scenario Outline: Pressing the Multi button cycles through the grid counts in order
    Given the Multi grid is currently <before>
    When I press the Multi button once
    Then the Multi grid becomes <after>

    Examples:
      | before      | after       |
      | single      | 4 images    |
      | 4 images    | 9 images    |
      | 9 images    | 16 images   |
      | 16 images   | single      |

  # --- The TIME control governs capture cadence (section 8.7) ---
  # TIME sets how quickly the unit steps through capturing each tile, roughly 0.07 s to 2.1 s.

  Scenario Outline: The TIME control sets the tile-capture interval
    Given the Multi effect is active on the A-bus with a 3 by 3 grid of 9 images
    When I set the TIME control to <setting>
    Then each tile is captured at intervals of about <interval>

    Examples:
      | setting | interval |
      | MIN     | 0.07 s   |
      | mid     | 1.1 s    |
      | MAX     | 2.1 s    |

  Scenario: A shorter TIME setting fills the grid faster
    Given the Multi effect is active on the A-bus with a 4 by 4 grid of 16 images
    And the TIME control is set toward MIN
    When the unit steps through the tiles
    Then the grid captures its tiles more quickly than at a TIME setting toward MAX

  # --- ONCE versus REPEAT capture modes (section 8.7) ---

  Scenario: ONCE captures each tile a single time through the grid, then freezes
    Given the Multi effect is active on the A-bus with a 3 by 3 grid of 9 images
    When I press ONCE
    Then the unit captures each tile once in sequence across the grid
    And once every tile has been captured the grid holds as a still image
    And no further tiles are updated until Multi is retriggered

  Scenario: REPEAT cycles through the tiles continuously
    Given the Multi effect is active on the A-bus with a 3 by 3 grid of 9 images
    When I press REPEAT
    Then the unit keeps capturing tiles in sequence around the grid without stopping
    And each tile is refreshed with a newer captured frame as the cycle comes around

  Scenario: Switching from ONCE to REPEAT resumes continuous capture
    Given the Multi effect is active on the A-bus with a 3 by 3 grid of 9 images
    And ONCE has completed and the grid is frozen
    When I press REPEAT
    Then the unit resumes cycling through the tiles continuously

  # --- Interaction with other freeze-family effects (sections 8.5, 8.7) ---

  Scenario: Engaging Multi switches Still off automatically
    Given the Still effect is active on the A-bus
    When I press the Multi button once
    Then the Multi effect becomes active on the A-bus
    And the Still effect switches off automatically

  # --- Scope: Multi affects only its bus (section 8 preamble) ---

  Scenario: Multi tiles only the bus it is assigned to
    Given the B-bus is carrying a moving source
    And the Multi effect is active on the A-bus with a 2 by 2 grid of 4 images
    Then the A-bus shows the tiled grid
    And the B-bus output is unchanged
