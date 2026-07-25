Feature: Wipe edge and direction
  As a VJ / video editor
  I want to shape the wipe boundary with a border or soft edge and control the direction of travel
  So that transitions read cleanly, carry an accent colour, and move the way the shot demands

  # Grounded in reference section 9.4 (Wipe, D-3), the "Wipe Edge",
  # "Wipe Direction", and "Aspect control" paragraphs.
  # The wipe pattern catalogue itself (Straight, Corner, Diagonal, Triangle,
  # Split, Mosaic, Square, and the Modify buttons) lives in wipe-patterns.feature.
  # This feature covers only the boundary treatment and the direction / aspect
  # of an already-selected wipe. See ADR-0009 (Compositional wipe-pattern engine)
  # and ADR-0006 (Two-bus source model and Matte substitution rules) for the
  # Matte colour source used by BORDER.

  Background:
    Given a WIPE transition is active between the A-bus and the B-bus
    And a wipe pattern is selected
    And the wipe boundary is currently a hard, uncoloured edge

  Rule: BORDER cycles narrow, wide, off and draws a coloured line at the boundary

    Scenario: First BORDER press draws a narrow coloured border
      Given the wipe edge treatment is off
      When I press BORDER
      Then the wipe boundary is drawn as a narrow coloured line between the two images

    Scenario: Second BORDER press widens the border
      Given the wipe boundary is a narrow border
      When I press BORDER
      Then the wipe boundary is drawn as a wide coloured line between the two images

    Scenario: Third BORDER press turns the border off
      Given the wipe boundary is a wide border
      When I press BORDER
      Then the wipe boundary returns to a hard, uncoloured edge

    Scenario: BORDER cycles back to narrow on a fourth press
      Given the wipe edge treatment is off
      When I press BORDER
      And I press BORDER
      And I press BORDER
      And I press BORDER
      Then the wipe boundary is drawn as a narrow coloured line between the two images

  Rule: The border colour is the complementary colour of the selected Matte colour

    Scenario Outline: BORDER paints the complement of the current Matte colour
      Given the selected Matte colour is "<matte>"
      When I press BORDER to enable a narrow border
      Then the border line is rendered in "<complement>"

      Examples:
        | matte   | complement |
        | Yellow  | Blue       |
        | Blue    | Yellow     |
        | Cyan    | Red        |
        | Red     | Cyan       |
        | Green   | Magenta    |
        | Magenta | Green      |
        | White   | Black      |
        | Black   | White      |

    Scenario: Changing the Matte colour recolours an active border
      Given a narrow border is active
      And the border line is rendered in the complement of the current Matte colour
      When I change the selected Matte colour with the Matte SELECT buttons
      Then the border line is recoloured to the complement of the newly selected Matte colour

  Rule: SOFT feathers the boundary in narrow or wide with no colour

    Scenario: First SOFT press applies a narrow feathered edge
      Given the wipe edge treatment is off
      When I press SOFT
      Then the wipe boundary is a narrow feathered edge
      And no border colour is applied to the boundary

    Scenario: Second SOFT press widens the feathered edge
      Given the wipe boundary is a narrow soft edge
      When I press SOFT
      Then the wipe boundary is a wide feathered edge
      And no border colour is applied to the boundary

    Scenario: SOFT ignores the Matte colour entirely
      Given the selected Matte colour is "Red"
      When I press SOFT to apply a soft edge
      Then the wipe boundary is a feathered blend between the two images
      And no colour is drawn at the boundary

    Scenario: BORDER and SOFT are mutually exclusive edge treatments
      Given a narrow border is active
      When I press SOFT
      Then the wipe boundary is a feathered edge
      And the coloured border is no longer drawn

  Rule: Wipe direction is governed by ONE-WAY and REVERSE

    Scenario: By default the wipe alternates direction each lever swing
      Given ONE-WAY is off
      And REVERSE is off
      When I swing the lever from A to B
      Then the wipe travels in one direction
      When I swing the lever from B to A
      Then the wipe travels in the opposite direction

    Scenario: ONE-WAY makes every swing travel the same direction
      Given ONE-WAY is engaged
      And REVERSE is off
      When I swing the lever from A to B
      Then the wipe travels in a given direction
      When I swing the lever from B to A
      Then the wipe travels in the same direction

    Scenario: REVERSE mirrors the direction of travel
      Given ONE-WAY is off
      And REVERSE is off
      And I note the direction the wipe travels on a swing
      When I engage REVERSE
      And I swing the lever
      Then the wipe travels in the mirrored direction

    Scenario: ONE-WAY combined with REVERSE produces symmetrical wiping
      Given ONE-WAY is engaged
      And REVERSE is engaged
      When I swing the lever
      Then the wipe expands and contracts symmetrically across the screen

  Rule: ASPECT stretches Square-family patterns; other pattern families ignore it

    Scenario Outline: ASPECT stretches a Square-family pattern along one axis
      Given a "<pattern>" wipe pattern from the Square family is selected
      When I set the ASPECT control toward "<axis>"
      Then the wipe shape is stretched "<axis>"

      Examples:
        | pattern | axis       |
        | circle  | vertical   |
        | circle  | horizontal |
        | oval    | vertical   |
        | oval    | horizontal |
        | square  | vertical   |
        | square  | horizontal |
        | diamond | vertical   |
        | diamond | horizontal |

    Scenario: ASPECT centred leaves the Square-family pattern unstretched
      Given a "circle" wipe pattern from the Square family is selected
      When I set the ASPECT control to its centre position
      Then the wipe shape keeps its native, unstretched proportions

    Scenario Outline: ASPECT has no effect on non-Square wipe families
      Given a "<pattern>" wipe pattern is selected
      When I set the ASPECT control toward vertical
      Then the wipe shape is unchanged

      Examples:
        | pattern  |
        | Straight |
        | Corner   |
        | Diagonal |
        | Triangle |
        | Split    |
        | Mosaic   |

  @integration
  Scenario: A soft-edged, one-way, aspect-stretched square wipe
    Given a "square" wipe pattern from the Square family is selected
    And ONE-WAY is engaged
    When I press SOFT to apply a narrow feathered edge
    And I set the ASPECT control toward horizontal
    And I swing the lever from A to B
    Then the wipe grows as a horizontally stretched square with a feathered boundary
    And a following swing from B to A travels in the same direction
