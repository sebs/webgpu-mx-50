Feature: Audio Follow
  As a VJ mixing live audio and video together
  I want the A-bus and B-bus audio levels to track the Mix/Wipe lever automatically
  So that a video transition carries its audio with it, hands-free, while music and narration stay put

  Audio Follow (reference section 12) ties only the two bus audio levels to the
  Mix/Wipe lever position: lever at A gives full A-bus audio, centre gives both
  buses, at B gives full B-bus audio. Aux 1 and Mic/Aux 2 are deliberately
  excluded so their sources remain constant across any transition. See
  transition-mix-nam.feature and auto-take.feature for the video side of the
  lever, and audio-mixer.feature for the standing fader model.

  Background:
    Given the audio mixer is running
    And a source with distinct audio is assigned to the A-bus
    And a source with distinct audio is assigned to the B-bus
    And Aux 1 and Mic/Aux 2 each carry their own independent audio

  Scenario: Audio Follow is off by default and buses obey their own faders
    Given Audio Follow is not engaged
    When the Mix/Wipe lever moves from the A position to the B position
    Then the A-bus audio level stays at its fader setting
    And the B-bus audio level stays at its fader setting

  Scenario: Engaging Audio Follow ties the bus levels to the lever
    Given the Mix/Wipe lever is at the A position
    When I press AUDIO FOLLOW
    Then Audio Follow becomes engaged
    And the A-bus audio is at full level
    And the B-bus audio is silent

  Scenario Outline: Bus audio levels track the lever position proportionally
    Given Audio Follow is engaged
    When the Mix/Wipe lever is at the <position> position
    Then the A-bus audio level is <a_level>
    And the B-bus audio level is <b_level>

    Examples:
      | position | a_level    | b_level    |
      | A        | full       | silent     |
      | centre   | both mixed | both mixed |
      | B        | silent     | full       |

  Scenario: Audio crossfades continuously as the lever sweeps
    Given Audio Follow is engaged
    And the Mix/Wipe lever is at the A position
    When the lever sweeps smoothly toward the B position
    Then the A-bus audio level falls continuously toward silence
    And the B-bus audio level rises continuously toward full
    And at every intermediate lever position both buses contribute in proportion to the lever

  Scenario: Aux 1 and Mic/Aux 2 are excluded from Audio Follow
    Given Audio Follow is engaged
    When the Mix/Wipe lever moves from the A position to the B position
    Then the Aux 1 audio level stays at its own fader setting throughout
    And the Mic/Aux 2 audio level stays at its own fader setting throughout
    And the Aux and Mic sources remain constant across the whole transition

  @integration
  Scenario: Auto Take drives an automatic audio crossfade
    Given Audio Follow is engaged
    And the Mix/Wipe lever is at the A position
    When Auto Take runs the transition to the B position
    Then the bus audio crossfades hands-free from full A-bus to full B-bus
    And the crossfade completes together with the video transition
    And Aux 1 and Mic/Aux 2 remain at their fader settings the entire time

  Scenario: Disengaging Audio Follow returns buses to their standing faders
    Given Audio Follow is engaged
    And the Mix/Wipe lever is at the centre position
    When I press AUDIO FOLLOW to disengage it
    Then Audio Follow becomes disengaged
    And the A-bus audio returns to its own fader setting
    And the B-bus audio returns to its own fader setting
    And subsequent lever movement no longer changes the bus audio levels
