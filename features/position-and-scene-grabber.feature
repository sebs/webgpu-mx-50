Feature: Position control and Scene Grabber
  As a VJ compositing live sources,
  I want to place a resizable wipe inset on screen and freeze the image inside it,
  So that I can build picture-in-picture insets and drag a grabbed still around
  independently of the live video behind it.

  Positioning works only with Square-family wipe patterns (circle, oval, square,
  diamond). The Positioner ON button doubles the current wiped size on activation;
  the Mix/Wipe lever then sets the inset size and the Positioner joystick places it.
  Scene Grabber freezes the image inside the inset so the joystick moves the still
  alone. Grounded in reference section 7 (Position Control & Scene Grabber) and
  section 9.4 (Square pattern family, ASPECT).

  Background:
    Given Program Out is set to EFFECT
    And a Wipe transition is active between A-bus and B-bus

  Rule: The Positioner requires a Square-family wipe pattern

    Scenario Outline: Positioner engages only with Square-family patterns
      Given the selected wipe pattern is "<pattern>"
      When I press the Positioner ON button
      Then the Positioner becomes <state>

      Examples: Square-family patterns support positioning
        | pattern | state    |
        | circle  | active   |
        | oval    | active   |
        | square  | active   |
        | diamond | active   |

      Examples: Non-square patterns do not support positioning
        | pattern  | state       |
        | straight | unavailable |
        | corner   | unavailable |
        | diagonal | unavailable |
        | triangle | unavailable |
        | split    | unavailable |
        | mosaic   | unavailable |

    Scenario: Switching away from a Square-family pattern disengages the Positioner
      Given the selected wipe pattern is "circle"
      And the Positioner is active
      When I select the "straight" wipe pattern
      Then the Positioner becomes unavailable
      And any active Scene Grabber is cancelled

  Rule: ASPECT sets the pattern ratio only when its ON button is lit

    Scenario: ASPECT shapes the Square pattern when lit
      Given the selected wipe pattern is "square"
      And the ASPECT ON button is lit
      When I set the ASPECT control toward vertical
      Then the wipe pattern is stretched vertically
      When I set the ASPECT control toward horizontal
      Then the wipe pattern is stretched horizontally

    Scenario: ASPECT has no effect when its ON button is unlit
      Given the selected wipe pattern is "square"
      And the ASPECT ON button is unlit
      When I set the ASPECT control toward vertical
      Then the wipe pattern keeps its default 1:1 ratio

  Rule: Activating the Positioner doubles the wiped size

    Scenario: The wiped size doubles when the Positioner is switched on
      Given the selected wipe pattern is "circle"
      And the current wiped size is 20 percent of the screen
      When I press the Positioner ON button
      Then the Positioner becomes active
      And the wiped size becomes 40 percent of the screen

  Rule: The Mix/Wipe lever sets the inset size and the joystick places it

    Background:
      Given the selected wipe pattern is "circle"
      And the Positioner is active

    Scenario: The Mix/Wipe lever controls the size of the inset
      When I move the Mix/Wipe lever toward B-bus
      Then the wiped inset grows
      When I move the Mix/Wipe lever toward A-bus
      Then the wiped inset shrinks

    Scenario Outline: The joystick places the inset anywhere on screen
      When I move the Positioner joystick <direction>
      Then the wiped inset moves <direction>
      And the live video continues to update inside the inset

      Examples:
        | direction   |
        | up          |
        | down        |
        | left        |
        | right       |
        | up and left |

  Rule: Scene Grabber freezes the inset image and lets the joystick move the still

    Background:
      Given the selected wipe pattern is "oval"
      And the Positioner is active
      And the wiped inset is placed near the centre of the screen

    Scenario: Pressing SCENE GRABBER freezes the image inside the inset
      When I press SCENE GRABBER
      Then the image inside the inset is frozen as a grabbed still
      And the video behind the inset continues to play live

    Scenario: After grabbing, the joystick moves the still independently of the live video
      Given SCENE GRABBER has frozen the image inside the inset
      When I move the Positioner joystick right
      Then the grabbed still moves right
      And the grabbed still does not update with the live source
      And the live video behind the still keeps playing

    Scenario: The grabbed still holds its size while being moved
      Given SCENE GRABBER has frozen the image inside the inset
      When I move the Positioner joystick down
      Then the grabbed still keeps the size it had at the moment of grabbing

  Rule: Turning the Positioner OFF cancels Scene Grabber

    Scenario: Switching the Positioner off releases a grabbed still
      Given the selected wipe pattern is "diamond"
      And the Positioner is active
      And SCENE GRABBER has frozen the image inside the inset
      When I press the Positioner ON button to switch it off
      Then the Positioner becomes inactive
      And the Scene Grabber is cancelled
      And the grabbed still is discarded

  @integration
  Scenario: Build a moving picture-in-picture inset then freeze it
    Given the selected wipe pattern is "square"
    And the ASPECT ON button is lit
    When I set the ASPECT control to a 4:3 ratio
    And I press the Positioner ON button
    And I set the wiped size with the Mix/Wipe lever to a small inset
    And I move the Positioner joystick to the upper-right corner
    Then a small live inset appears in the upper-right corner
    When I press SCENE GRABBER
    And I move the Positioner joystick to the lower-left corner
    Then the frozen inset travels to the lower-left corner over the live background
