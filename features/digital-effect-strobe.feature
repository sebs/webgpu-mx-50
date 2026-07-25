Feature: Digital effect: Strobe
  As a VJ mixing live video,
  I want to freeze a bus into a stop-motion sequence of held frames,
  So that moving footage plays back as a rhythmic strobe of stepped stills.

  # Grounded in reference section 8.6 (Strobe) and 8.5 (Still interactions).
  # Strobe sits in the Digital Effect stage of the signal flow
  # (Source -> bus assignment -> Colour Correction -> Digital Effect -> Mix/Wipe -> DSK -> Fade -> Program Out).
  # It repeatedly captures the current frame and holds it for the TIME interval,
  # producing a stop-motion look. See ADR-0007 (GPU frame memory for freeze-family effects).

  Background:
    Given a live moving source is assigned to the A-bus
    And the Digital Effect stage on the A-bus is idle

  Scenario: Engaging Strobe steps the bus through frozen frames
    When I engage Strobe on the A-bus
    Then the A-bus output holds a frozen frame for the current TIME interval
    And at the end of each interval the held frame is replaced by a freshly captured frame
    And motion on the bus is rendered as a stop-motion sequence

  Scenario: Disengaging Strobe returns the bus to live motion
    Given Strobe is engaged on the A-bus
    When I disengage Strobe on the A-bus
    Then the A-bus output resumes continuous live motion
    And no frame is held between captures

  Scenario Outline: The TIME control sets the freeze interval across its range
    When I engage Strobe on the A-bus
    And I set the Strobe TIME control to <position>
    Then the freeze interval is approximately <interval>
    And each captured frame is held for that interval before the next capture

    Examples:
      | position     | interval |
      | minimum      | 0.03 s   |
      | one quarter  | 0.55 s   |
      | midpoint     | 1.05 s   |
      | maximum      | 2.1 s    |

  Scenario: The TIME control is clamped to the supported interval range
    When I engage Strobe on the A-bus
    Then the freeze interval cannot be set shorter than approximately 0.03 s
    And the freeze interval cannot be set longer than approximately 2.1 s

  Scenario: Adjusting TIME while Strobe runs changes the interval live
    Given Strobe is engaged on the A-bus with the TIME control at minimum
    When I set the Strobe TIME control to maximum
    Then subsequent frames are held for approximately 2.1 s
    And the strobing continues without being interrupted

  Scenario: Strobe and Still are mutually exclusive on a bus
    Given Still is engaged on the A-bus
    When I engage Strobe on the A-bus
    Then Still switches off on the A-bus
    And Strobe becomes the active freeze-family effect on the A-bus

  Scenario: Engaging Still cancels a running Strobe
    Given Strobe is engaged on the A-bus
    When I engage Still on the A-bus
    Then Strobe switches off on the A-bus
    And the A-bus holds a single frozen frame

  Scenario: Compression is unavailable while Strobe is active
    Given Strobe is engaged on the A-bus
    When I attempt to use the Compression Wipe
    Then Compression is temporarily disabled
    And Strobe continues to run on the A-bus

  Scenario: Strobe runs independently per bus
    Given a live moving source is assigned to the B-bus
    When I engage Strobe on the A-bus
    Then the A-bus output steps through frozen frames
    And the B-bus output continues in live motion

  @integration
  Scenario: Strobe can be triggered by audio via A/V Synchro
    Given A/V Synchro is selecting Strobe on the A-bus
    When the incoming audio rises above the trigger threshold
    Then Strobe pulses on the A-bus
    And the hold time is governed by the Effect Interval Timer rather than the TIME control

  @deferred
  Scenario: Frame field-versus-frame mode has no visible effect on Strobe output
    Given the fidelity model is clean-modern full-resolution RGBA
    When I toggle the Frame field-versus-frame button while Strobe is active
    Then the Strobe output is unchanged
    # Frame/field emulation is deferred; see ADR-0005 and frame-field-mode.feature.
