Feature: Fade control
  As a VJ or video editor
  I want independent Video, DSK and Audio fades to a chosen target
  So that I can dip the program to matte, white, black or a clean bus — or selectively fade parts of the picture — as the final stage before Program Out

  # Reference: section 11 (Fade Control, F). Fade is the last stage of the signal
  # flow: Source -> bus assignment -> Colour Correction -> Digital Effect ->
  # Mix/Wipe -> Downstream Key -> Fade -> Program Out.
  # Three independent enable buttons (VIDEO 80, DSK 82, AUDIO 84) decide what fades;
  # whichever are lit fade together from a single lever move. Fade target buttons
  # choose what the video fades TO: MATTE, WHITE, BLACK, A (uneffected A-bus) or
  # B (uneffected B-bus). Manual fade slides the Fade Control lever IN to OUT with
  # blinking IN/OUT LEDs while incomplete. Auto Fade uses the TRANSITION control
  # (0-510 frames in 2-frame steps) and the AUTO FADE button with pause/resume.
  # See ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow),
  # ADR-0012 (Render loop and transition timing model), ADR-0010 (Audio engine on
  # the Web Audio API) and feature files program-output.feature, downstream-key.feature,
  # matte-generator.feature, auto-take.feature, audio-mixer.feature.

  Background:
    Given the mixer is powered on with the signal graph active
    And the fully effected composite is present at the Fade stage input
    And a Downstream Key title is keyed over the composite
    And program output is set to EFFECT

  Scenario: The fade section is disabled when no enable button is lit
    Given none of the VIDEO, DSK, AUDIO enable buttons are lit
    When I move the Fade Control lever from IN to OUT
    Then the program output is unchanged
    And nothing fades

  Scenario Outline: Enabling a fade element means it participates in the fade
    Given only the <element> enable button is lit
    And the fade target is BLACK
    When I move the Fade Control lever fully to OUT
    Then the <element> element is fully faded out
    But the elements whose enable buttons are unlit are unchanged

    Examples:
      | element |
      | VIDEO   |
      | DSK     |
      | AUDIO   |

  Scenario: Multiple enabled elements fade together from one lever move
    Given the VIDEO, DSK and AUDIO enable buttons are all lit
    And the fade target is BLACK
    When I move the Fade Control lever fully to OUT
    Then the video, the DSK title and the program audio all fade out together

  # Manual fade and the IN/OUT LEDs -----------------------------------------

  Scenario: IN and OUT LEDs are solid at the lever extremes
    Given the VIDEO enable button is lit
    When the Fade Control lever is fully at IN
    Then the IN LED is solid
    And the OUT LED is off
    When the Fade Control lever is fully at OUT
    Then the OUT LED is solid
    And the IN LED is off

  Scenario: The IN/OUT LEDs blink while a manual fade is incomplete
    Given the VIDEO enable button is lit
    And the Fade Control lever is fully at IN
    When I move the Fade Control lever partway toward OUT
    Then the fade is incomplete
    And the IN and OUT LEDs blink

  Scenario: The program dips proportionally to the lever position
    Given the VIDEO enable button is lit
    And the fade target is BLACK
    When I move the Fade Control lever to the halfway position
    Then the program video is a 50 percent mix of the composite and black

  # Fade targets -------------------------------------------------------------

  Scenario Outline: The fade target chooses what the video fades to
    Given the VIDEO enable button is lit
    And the fade target is <target>
    When I move the Fade Control lever fully to OUT
    Then the program video is <result>

    Examples:
      | target | result                             |
      | MATTE  | the selected matte colour          |
      | WHITE  | full white                         |
      | BLACK  | full black                         |
      | A      | the uneffected A-bus video         |
      | B      | the uneffected B-bus video         |

  Scenario: Fading to A reveals the clean A-bus, bypassing the effect chain
    Given the VIDEO enable button is lit
    And the fade target is A
    When I move the Fade Control lever fully to OUT
    Then the program video is the A-bus source without any Digital Effect or Mix/Wipe applied

  # Audio behaviour by target -----------------------------------------------

  Scenario Outline: Fading to matte, white or black silences the program audio
    Given the AUDIO enable button is lit
    And the fade target is <target>
    When I move the Fade Control lever fully to OUT
    Then the program audio is silenced

    Examples:
      | target |
      | MATTE  |
      | WHITE  |
      | BLACK  |

  Scenario Outline: Fading to a bus keeps that bus audio plus the aux inputs
    Given the AUDIO enable button is lit
    And the fade target is <bus>
    When I move the Fade Control lever fully to OUT
    Then the <bus>-bus audio is present in the program output
    And Aux 1 and Aux 2/Mic audio are present in the program output

    Examples:
      | bus |
      | A   |
      | B   |

  @integration
  Scenario: Fading everything to B melts the composite back to clean B video and audio
    Given the VIDEO, DSK and AUDIO enable buttons are all lit
    And the fade target is B
    When I move the Fade Control lever fully to OUT
    Then the program video is the uneffected B-bus video
    And the program audio is the B-bus audio
    And Aux 1 and Aux 2/Mic audio persist in the program output

  # Selective fading tricks --------------------------------------------------

  @integration
  Scenario: Fading VIDEO only leaves the DSK title on screen
    Given only the VIDEO enable button is lit
    And the DSK enable button is unlit
    And the fade target is BLACK
    When I move the Fade Control lever fully to OUT
    Then the program video fades to black
    But the DSK title remains fully on screen

  @integration
  Scenario: Fading DSK only removes the title while the picture stays
    Given only the DSK enable button is lit
    And the VIDEO enable button is unlit
    When I move the Fade Control lever fully to OUT
    Then the DSK title fades off screen
    But the composite picture remains at full level

  # Auto Fade ----------------------------------------------------------------

  Scenario Outline: The TRANSITION control sets the Auto Fade duration in 2-frame steps
    When I set the TRANSITION control to <frames> frames
    Then the Auto Fade Time indicator shows <frames> frames

    Examples:
      | frames |
      | 0      |
      | 2      |
      | 60     |
      | 510    |

  Scenario: The TRANSITION control is quantised to 2-frame steps within 0 to 510
    When I set the TRANSITION control to 61 frames
    Then the value is quantised to a 2-frame step
    And the value is clamped to the range 0 to 510 frames

  Scenario: AUTO FADE runs the fade automatically over the transition time
    Given the VIDEO enable button is lit
    And the fade target is BLACK
    And the Fade Control lever is at IN
    And the TRANSITION control is set to 60 frames
    When I press AUTO FADE
    Then the program video fades to black over 60 frames
    And the fade completes at the OUT position

  Scenario: Pressing AUTO FADE mid-fade pauses the fade
    Given the VIDEO enable button is lit
    And an Auto Fade is in progress
    When I press AUTO FADE again mid-fade
    Then the fade pauses at its current position
    And the enabled element's LED blinks to indicate the pause

  Scenario: Pressing AUTO FADE again resumes a paused fade
    Given an Auto Fade is paused mid-fade
    When I press AUTO FADE again
    Then the fade resumes from its paused position
    And it completes over the remaining portion of the transition time

  # Invariants ---------------------------------------------------------------

  Scenario: Headphone monitoring never fades
    Given the AUDIO enable button is lit
    And the fade target is BLACK
    When I move the Fade Control lever fully to OUT
    Then the program audio is silenced
    But the headphone monitor output is unaffected by the fade

  Scenario: Fade is the final stage, applied after the Downstream Key
    Given the VIDEO enable button is lit
    And the fade target is MATTE
    When I move the Fade Control lever fully to OUT
    Then the fade is applied to the post-DSK composite
    And no stage after the Fade stage modifies the video before Program Out
