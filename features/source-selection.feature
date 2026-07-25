Feature: Source selection
  As a VJ or video editor
  I want to assign one of Source 1-4 or the internal Matte to each bus
  So that I can choose what video and audio feeds the A-bus and B-bus before any effects, keys, or transitions

  # Grounded in reference section 3 (Source Selection, B-1).
  # Each bus (A-bus, B-bus) exposes five mutually exclusive source buttons:
  # Source 1, Source 2, Source 3, Source 4, and Matte.
  # Selecting a source claims both its video and its audio.
  # Matte is a legal source only for the Wipe/Mix/NAM transition stages; where a
  # function needs real video (Lum Key, Chroma Key, DSK, Fade) the unit
  # substitutes the blinking source button's video instead.

  Background:
    Given the mixer has four external sources numbered 1 to 4
    And the internal Matte generator is available as a fifth source
    And each bus provides mutually exclusive source buttons for Source 1-4 and Matte

  Scenario Outline: Assigning an external source to a bus
    When I select <source> on the <bus>
    Then the <bus> video signal is <source>
    And the <bus> audio signal is the audio of <source>
    And that audio is governed by the <bus> fader in the Audio Mix section
    And no other source button on the <bus> remains selected

    Examples:
      | bus   | source   |
      | A-bus | Source 1 |
      | A-bus | Source 2 |
      | A-bus | Source 3 |
      | A-bus | Source 4 |
      | B-bus | Source 1 |
      | B-bus | Source 2 |
      | B-bus | Source 3 |
      | B-bus | Source 4 |

  Scenario: Selecting a source binds its audio to the matching bus fader
    Given Source 2 is selected on the A-bus
    When I raise the A-bus fader in the Audio Mix section
    Then the audio of Source 2 is heard louder
    And moving the B-bus fader does not affect the audio of Source 2

  Scenario: The two buses hold sources independently
    When I select Source 1 on the A-bus
    And I select Source 3 on the B-bus
    Then the A-bus video signal is Source 1
    And the B-bus video signal is Source 3

  Scenario: Reselecting on the same bus replaces the previous source
    Given Source 1 is selected on the A-bus
    When I select Source 4 on the A-bus
    Then the A-bus video signal is Source 4
    And Source 1 is no longer selected on the A-bus

  Scenario: The same external source may feed both buses at once
    When I select Source 2 on the A-bus
    And I select Source 2 on the B-bus
    Then the A-bus video signal is Source 2
    And the B-bus video signal is Source 2

  Scenario Outline: Matte is a valid source for transition stages
    Given Matte is selected on the <bus>
    When the signal reaches the <stage> stage
    Then the <bus> contribution to <stage> is the Matte colour
    And no source substitution occurs

    Examples:
      | bus   | stage |
      | A-bus | Mix   |
      | A-bus | NAM   |
      | A-bus | Wipe  |
      | B-bus | Mix   |
      | B-bus | NAM   |
      | B-bus | Wipe  |

  Scenario Outline: Matte is substituted where a function needs real video
    Given Matte is selected on the <bus>
    And a source button on the <bus> is blinking to indicate the substitute source
    When the signal reaches the <function> stage
    Then the Matte cannot be used at the <function> stage
    And the unit substitutes the blinking source button's video for the <bus>

    Examples:
      | bus   | function      |
      | A-bus | Luminance Key |
      | A-bus | Chroma Key    |
      | A-bus | Downstream Key|
      | A-bus | Fade Control  |
      | B-bus | Luminance Key |
      | B-bus | Chroma Key    |
      | B-bus | Downstream Key|
      | B-bus | Fade Control  |

  Scenario: The blinking button identifies which real source stands in for Matte
    Given Matte is selected on the A-bus
    And Source 3 is the blinking substitute source on the A-bus
    When a Chroma Key is applied to the A-bus
    Then the video used for the key is Source 3, not the Matte colour

  Scenario: Selecting Matte does not disturb the bus audio routing
    # Matte carries no audio; the bus still owns whatever audio was last selected.
    Given Source 1 is selected on the A-bus
    When I select Matte on the A-bus
    Then the A-bus video signal is the Matte colour
    And the A-bus audio fader still governs the A-bus audio path
