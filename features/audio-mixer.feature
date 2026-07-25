Feature: Audio mixer
  As a VJ or video editor performing a live A/V mix,
  I want independent faders for each audio input feeding a master level with a 0 dB indicator,
  So that I can balance the programme sound to match the video transition I am performing.

  # Grounded in reference section 5 (Audio Mixer, B-3).
  # Seven inputs are mixed: Source 1/2/3/4 (routed via bus selection), Aux 1, Aux 2 and Mic.
  # The mixer follows the same Program Out selection as the video path
  # (see program-output.feature and ADR-0010 (Audio engine on the Web Audio API)).

  Background:
    Given the audio mixer is running
    And the A Fader controls the audio of the source selected on the A-bus
    And the B Fader controls the audio of the source selected on the B-bus
    And the AUX1 Fader controls the Aux 1 input
    And the MIC/AUX2 Fader controls either the Mic or the Aux 2 input
    And the MASTER Fader sets the final mixed output level
    And the Audio Level Indicator shows the programme level in LED steps around 0 dB

  Scenario: A Fader follows the source assigned to the A-bus
    Given source 2 is assigned to the A-bus
    When I raise the A Fader
    Then the audio of source 2 rises in the mix
    When I reassign source 4 to the A-bus
    Then the A Fader now controls the audio of source 4

  Scenario: B Fader follows the source assigned to the B-bus
    Given source 3 is assigned to the B-bus
    When I raise the B Fader
    Then the audio of source 3 rises in the mix

  Scenario: Master Fader scales the entire mix
    Given the A, B, AUX1 and MIC/AUX2 Faders are set to nominal levels
    When I pull the MASTER Fader to minimum
    Then no audio reaches Program Out
    When I return the MASTER Fader to nominal
    Then the full balanced mix reaches Program Out at its previous level

  Scenario: Balancing the input faders around 0 dB
    Given the four input faders A, B, AUX1 and MIC/AUX2 are contributing to the mix
    When I balance them so the average programme level sits around 0 dB
    Then the Audio Level Indicator hovers around its 0 dB LED
    And brief peaks may rise above 0 dB without the mix being considered clipped

  Scenario Outline: Mic-versus-Aux2 switch chooses the shared fader source
    Given the front-panel Mic/Aux2 switch is set to "<position>"
    When I raise the MIC/AUX2 Fader
    Then the "<active input>" signal rises in the mix
    And the "<muted input>" signal does not contribute through that fader

    Examples:
      | position | active input | muted input |
      | Mic      | Mic          | Aux 2       |
      | Aux2     | Aux 2        | Mic         |

  Scenario: EFFECT Program Out passes the full mixed audio
    Given the Mic/Aux2 switch is set to "Mic"
    And the A, B, AUX1 and MIC/AUX2 Faders are all raised
    When I select EFFECT as the Program Out
    Then the audio output contains the A-bus source, the B-bus source, Aux 1 and the Mic
    And the mix is scaled by the MASTER Fader

  Scenario Outline: Direct A/B Program Out passes only that bus plus aux and mic
    Given the A-bus source and the B-bus source both have audio
    And the AUX1 and MIC/AUX2 Faders are raised
    When I select "<program out>" as the Program Out
    Then the audio output contains the "<bus source>" plus Aux 1 and the Mic/Aux 2 input
    And the "<excluded source>" audio is not present in the output

    Examples:
      | program out | bus source   | excluded source |
      | A           | A-bus source | B-bus source    |
      | B           | B-bus source | A-bus source    |

  Scenario: Full mix requires the EFFECT selection
    Given the A-bus and B-bus sources both have audio
    When I select A as the Program Out
    Then the B-bus audio is absent from the output
    When I then select EFFECT as the Program Out
    Then both bus sources are present in the output together with Aux 1 and the Mic/Aux 2 input

  Scenario: Aux and Mic pass through on every Program Out selection
    Given the AUX1 and MIC/AUX2 Faders are raised
    When I switch the Program Out between A, B and EFFECT
    Then the Aux 1 and Mic/Aux 2 audio remains present in the output for each selection
