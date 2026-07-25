Feature: Special modes
  As a VJ chaining transitions live,
  I want the eight factory-preset effect macros of the Special Mode bank,
  So that I can trigger complex compressed-image transitions with a single Event button and the Mix/Wipe lever.

  # Grounded in reference section 14 (Special Modes, H-2).
  # Special Mode is entered by pressing MEMORY + SHIFT simultaneously (MEMORY LED blinks),
  # then selecting one of the 8 macros via an Event button (SHIFT for 5-8).
  # Each macro runs via the Mix/Wipe lever, Auto Take, or an external GPI/RS422 controller.
  # Exit by pressing MEMORY + SHIFT again.

  Background:
    Given the mixer is powered and idle
    And the A-bus and B-bus each have a live source assigned
    And Special Mode is not active

  Scenario: Entering Special Mode
    When I press MEMORY and SHIFT simultaneously
    Then Special Mode becomes active
    And the MEMORY LED blinks to indicate Special Mode is active

  Scenario: Selecting a macro with a plain Event button
    Given Special Mode is active
    When I press Event button 3
    Then the "Cork Screw" macro is armed

  Scenario: Selecting a high-numbered macro requires SHIFT
    Given Special Mode is active
    When I press SHIFT together with Event button 3
    Then the "Vibrate" macro is armed

  Scenario: Exiting Special Mode
    Given Special Mode is active
    When I press MEMORY and SHIFT simultaneously
    Then Special Mode becomes inactive
    And the MEMORY LED stops blinking

  Scenario Outline: Arming each of the eight macros
    Given Special Mode is active
    When I select Event <event> using <selector>
    Then the "<macro>" macro is armed
    And the macro can be run by the Mix/Wipe lever or Auto Take

    Examples:
      | event | selector           | macro       |
      | 1     | the Event button   | Mosaic Mix  |
      | 2     | the Event button   | Stream      |
      | 3     | the Event button   | Cork Screw  |
      | 4     | the Event button   | Bounce      |
      | 5     | SHIFT + the button | Flip        |
      | 6     | SHIFT + the button | Shutter     |
      | 7     | SHIFT + the button | Vibrate     |
      | 8     | SHIFT + the button | Satellite   |

  Scenario Outline: Macro transition character
    Given Special Mode is active
    And the "<macro>" macro is armed
    When I run the transition with the Mix/Wipe lever
    Then the transition behaves as "<description>"

    Examples:
      | macro      | description                                                            |
      | Mosaic Mix | the mix itself becomes mosaic-pixelated mid-transition                  |
      | Stream     | a compressed image zooms in from a corner                              |
      | Cork Screw | a compressed image corkscrews in from a corner                         |
      | Bounce     | a compressed image drops in and bounces                                |
      | Flip       | a vertical split compressed wipe reveals over the Matte colour         |

  Scenario: Stream corner is chosen with the Positioner Joystick
    Given Special Mode is active
    And the "Stream" macro is armed
    When I set the Positioner Joystick toward a selectable corner
    Then the compressed image zooms in from that corner
    And two corners are selectable via the joystick

  Scenario: Flip and Shutter reveal the Matte colour
    Given Special Mode is active
    And the Matte colour is configured
    And the "Flip" macro is armed
    When I run the transition with the Mix/Wipe lever
    Then the compressed wipe splits over the Matte colour

  # --- Special preconditions: Shutter, Vibrate, and Satellite need the lever at B first ---

  Scenario: Shutter runs a horizontal split from B-bus to the Matte colour
    Given Special Mode is active
    And the Mix/Wipe lever is fully at B
    And the "Shutter" macro is armed
    When I run the transition
    Then a horizontal split wipe reveals the Matte colour from the B-bus image

  Scenario: Shutter becomes a Circle Wipe variant when Square Wipe is active
    Given Special Mode is active
    And the Mix/Wipe lever is fully at B
    And the Square Wipe button is active
    And the "Shutter" macro is armed
    When I run the transition
    Then the Shutter reveal follows a Circle Wipe variant instead of a horizontal split

  Scenario: Shutter requires the lever at B before starting
    Given Special Mode is active
    And the Mix/Wipe lever is not at B
    And the "Shutter" macro is armed
    When I attempt to run the transition
    Then the Shutter macro does not start
    And I am prompted to move the lever to B first

  Scenario: Vibrate shakes the B-bus horizontally for 64 frames
    Given Special Mode is active
    And the Mix/Wipe lever is fully at B
    And the "Vibrate" macro is armed
    When I run the macro
    Then the B-bus image shakes horizontally
    And the shake lasts 64 video frames before settling

  Scenario: Vibrate requires the lever at B before starting
    Given Special Mode is active
    And the Mix/Wipe lever is not at B
    And the "Vibrate" macro is armed
    When I attempt to run the macro
    Then the Vibrate macro does not start
    And I am prompted to move the lever to B first

  Scenario: Satellite orbits the compressed B-bus inside the A-bus image
    Given Special Mode is active
    And the Mix/Wipe lever is fully at B
    And the "Satellite" macro is armed
    When I start the macro with Auto Take
    Then the compressed B-bus image orbits inside the A-bus image

  Scenario: Satellite keeps orbiting until another mode or function is selected
    Given the "Satellite" macro is running
    When no other mode or function is selected
    Then the compressed B-bus image continues to orbit indefinitely
    When I select a different mode or function
    Then the Satellite orbit stops

  Scenario: Satellite can be started and stopped with Auto Take or GPI
    Given Special Mode is active
    And the Mix/Wipe lever is fully at B
    And the "Satellite" macro is armed
    When I trigger Auto Take
    Then the Satellite orbit starts
    When I trigger Auto Take again
    Then the Satellite orbit stops

  Scenario: Satellite requires the lever at B before starting
    Given Special Mode is active
    And the Mix/Wipe lever is not at B
    And the "Satellite" macro is armed
    When I attempt to start the macro
    Then the Satellite macro does not start
    And I am prompted to move the lever to B first

  @integration
  Scenario: Special Mode macros are driven by the same run controls as normal transitions
    Given Special Mode is active
    And the "Bounce" macro is armed
    When I run the transition using Auto Take
    Then the macro executes identically to running it with the Mix/Wipe lever
