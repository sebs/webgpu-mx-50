Feature: Matte generator
  As a VJ / video editor
  I want an internal colour generator with selectable colours, level, and gradient
  So that I can produce backgrounds, borders, key fills, and fade targets without an external source

  # Grounded in reference section 4 (Matte Generator, B-2).
  # The Matte is one of the 5 selectable sources (with the 4 external inputs);
  # bus assignment is covered in source-selection.feature and ADR-0006
  # (Two-bus source model and Matte substitution rules).
  # The Matte's palette order, cycling, and controls are defined here.

  Background:
    Given the Matte generator is available as an internal source
    And the Matte palette contains the 9 colours in order:
      | position | colour    |
      | 1        | Colour Bar |
      | 2        | White     |
      | 3        | Yellow    |
      | 4        | Cyan      |
      | 5        | Green     |
      | 6        | Magenta   |
      | 7        | Red       |
      | 8        | Blue      |
      | 9        | Black     |
    And an LED indicator shows the currently selected Matte colour

  Rule: SELECT ∧/∨ steps through the 9 colours, wrapping so Black follows Colour Bar

    Scenario: SELECT ∧ cycles upward through the palette
      Given the selected Matte colour is "Colour Bar"
      When I press SELECT ∧
      Then the selected Matte colour is "White"

    Scenario: SELECT ∧ wraps from the last colour back to the first
      Given the selected Matte colour is "Black"
      When I press SELECT ∧
      Then the selected Matte colour is "Colour Bar"

    Scenario: Black follows Colour Bar when cycling upward
      Given the selected Matte colour is "Blue"
      When I press SELECT ∧
      Then the selected Matte colour is "Black"
      When I press SELECT ∧
      Then the selected Matte colour is "Colour Bar"

    Scenario: SELECT ∨ reverses the direction
      Given the selected Matte colour is "Yellow"
      When I press SELECT ∨
      Then the selected Matte colour is "White"

    Scenario: SELECT ∨ wraps from the first colour back to the last
      Given the selected Matte colour is "Colour Bar"
      When I press SELECT ∨
      Then the selected Matte colour is "Black"

  Rule: LEVEL adjusts chroma, except for the fixed and brightness cases

    Scenario Outline: LEVEL adjusts the chroma of a chromatic colour
      Given the selected Matte colour is "<colour>"
      When I set the LEVEL control to <level> percent
      Then the Matte chroma level is <level> percent of full saturation
      And the Matte brightness is unchanged

      Examples:
        | colour  | level |
        | Yellow  | 100   |
        | Cyan    | 75    |
        | Green   | 50    |
        | Magenta | 25    |
        | Red     | 60    |
        | Blue    | 40    |

    Scenario Outline: Colour Bar and Black ignore the LEVEL control
      Given the selected Matte colour is "<colour>"
      When I set the LEVEL control to <level> percent
      Then the rendered Matte output is unchanged
      And the LEVEL control has no effect on the "<colour>" Matte

      Examples:
        | colour     | level |
        | Colour Bar | 20    |
        | Colour Bar | 90    |
        | Black      | 20    |
        | Black      | 90    |

    Scenario Outline: For White, LEVEL adjusts brightness instead of chroma
      Given the selected Matte colour is "White"
      When I set the LEVEL control to <level> percent
      Then the Matte brightness is <level> percent, ranging from black at 0 to full white at 100
      And the Matte chroma is not adjusted

      Examples:
        | level |
        | 0     |
        | 50    |
        | 100   |

  Rule: GRADATION turns the flat matte into a vertical gradient

    Scenario: GRADATION produces a top-to-bottom vertical gradient
      Given the selected Matte colour is "Blue"
      And the LEVEL control is set to 100 percent
      When I enable GRADATION
      Then the Matte is rendered as a vertical gradient
      And the top of the screen is least intense
      And the intensity increases downward to the set level at the bottom of the screen

    Scenario: The gradient bottom tracks the LEVEL setting
      Given the selected Matte colour is "Red"
      And GRADATION is enabled
      When I set the LEVEL control to 50 percent
      Then the bottom of the gradient reaches 50 percent intensity
      And the top of the gradient remains least intense

    Scenario: Disabling GRADATION restores a flat matte
      Given the selected Matte colour is "Green"
      And GRADATION is enabled
      When I disable GRADATION
      Then the Matte is rendered as a flat, uniform colour

    @wip
    Scenario: GRADATION interaction with White uses the brightness axis
      Given the selected Matte colour is "White"
      And the LEVEL control is set to 100 percent
      When I enable GRADATION
      Then the Matte is rendered as a vertical gradient
      And the top of the screen is darkest, increasing to full white at the bottom
