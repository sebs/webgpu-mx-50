Feature: Auto Take
  As a VJ or video editor
  I want the mixer to perform the selected transition automatically over a set number of frames
  So that I can trigger clean, repeatable transitions and step through a stored show hands-free — a motorless "lever move"

  # Reference: section 15 (Auto Take, H-3). Auto Take executes the currently
  # selected transition automatically instead of by moving the Mix/Wipe lever.
  # Standard Auto Take: set up the wipe pattern / digital effect, choose the
  # transition type (NAM / MIX / WIPE / LUM KEY / CHROMA KEY), dial the TRANSITION
  # control (0-510 frames in 2-frame steps), then press AUTO TAKE. Pressing AUTO
  # TAKE again mid-take PAUSES the transition (the bus LEDs blink); pressing again
  # RESUMES it toward completion. Memory Auto Take: recall an Event memory, press
  # AUTO TAKE to perform it; the next stored event number is armed automatically so
  # successive presses walk through the show in numerical order (see section 14 and
  # feature event-memory.feature). An external GPI contact (section 17) or an RS422
  # controller fires Auto Take on the trigger edge; both arrive through the control
  # input mapping layer, ADR-0014 (Control input mapping layer).
  # See ADR-0012 (Render loop and transition timing model), ADR-0004 (Explicit
  # signal-graph pipeline mirroring the hardware flow), ADR-0011 (Single
  # unidirectional panel state store) and feature files transition-mix-nam.feature,
  # wipe-patterns.feature, luminance-key.feature, chroma-key.feature,
  # event-memory.feature, fade-control.feature, inputs-and-devices.feature.

  Background:
    Given the mixer is powered on with the signal graph active
    And A-bus and B-bus each have a source assigned
    And a transition type is selected for the Mix/Wipe block
    And the Mix/Wipe lever is fully at the A position

  # --- Standard Auto Take: the TRANSITION time control ---

  Rule: The TRANSITION control sets the take duration in frames

    Scenario Outline: The TRANSITION control accepts durations from 0 to 510 frames in 2-frame steps
      When I set the TRANSITION control to <frames> frames
      Then the take duration is accepted as <frames> frames
      And the Transition Time indicator shows <frames> frames

      Examples:
        | frames |
        | 0      |
        | 2      |
        | 60     |
        | 254    |
        | 510    |

    Scenario Outline: An odd or out-of-range frame count is quantised into the valid grid
      When I request a TRANSITION time of <requested> frames
      Then the take duration is clamped and snapped to <effective> frames

      Examples:
        | requested | effective |
        | 1         | 0         |
        | 3         | 2         |
        | 61        | 60        |
        | 600       | 510       |

  # --- Standard Auto Take: execution ---

  Rule: Pressing AUTO TAKE performs the selected transition over the set duration

    Scenario: A finite-time Auto Take drives the lever from A to B automatically
      Given the TRANSITION control is set to 60 frames
      When I press AUTO TAKE
      Then the transition advances automatically from the A position toward the B position
      And it completes after 60 frames
      And the effective Mix/Wipe position ends fully at B
      And no manual lever movement is required

    Scenario: A zero-frame Auto Take snaps instantly between the buses
      Given the TRANSITION control is set to 0 frames
      When I press AUTO TAKE
      Then the transition completes on the next rendered frame
      And the effective Mix/Wipe position ends fully at B

    Scenario: Auto Take honours the selected transition type
      Given the selected transition type is WIPE with a chosen pattern
      And the TRANSITION control is set to 40 frames
      When I press AUTO TAKE
      Then the automatic take renders the selected wipe pattern progressing from A toward B
      But it does not perform a MIX dissolve

    Scenario: Auto Take starts from wherever the lever currently rests
      Given the Mix/Wipe lever is resting halfway between A and B
      And the TRANSITION control is set to 60 frames
      When I press AUTO TAKE
      Then the automatic take advances from the current position toward the far end
      And it completes at the B position

  # --- Standard Auto Take: pause and resume ---

  Rule: Pressing AUTO TAKE during a take pauses it, and pressing again resumes it

    Scenario: Pressing AUTO TAKE mid-take pauses the transition with blinking bus LEDs
      Given the TRANSITION control is set to 100 frames
      And I have pressed AUTO TAKE and the take is in progress at frame 40
      When I press AUTO TAKE again
      Then the transition pauses and holds at its current position
      And the bus LEDs blink to indicate the paused, incomplete take

    Scenario: Pressing AUTO TAKE while paused resumes toward completion
      Given an Auto Take is paused partway through at frame 40 of 100
      When I press AUTO TAKE again
      Then the transition resumes from the held position
      And it advances through the remaining 60 frames
      And it completes fully at B
      And the bus LEDs stop blinking once the take completes

    Scenario: A completed Auto Take is settled and not paused
      Given a 30-frame Auto Take has run to completion
      Then the effective Mix/Wipe position is fully at B
      And the bus LEDs are not blinking

  # --- Memory Auto Take: sequential show playback ---

  Rule: Memory Auto Take performs a recalled event and arms the next one

    Scenario: Recalling an event and pressing AUTO TAKE performs that event
      Given Event Memory slot 2 holds a stored panel snapshot
      When I recall Event Memory slot 2
      And I press AUTO TAKE
      Then the transition stored in event 2 is performed automatically
      And event 3 is armed as the next event

    Scenario: Successive AUTO TAKE presses step through stored events in numerical order
      Given Event Memory slots 1, 2 and 3 hold stored snapshots
      And event 1 is the armed event
      When I press AUTO TAKE three times, each after the prior take completes
      Then event 1 is performed, then event 2, then event 3
      And each press arms the following event automatically

    Scenario: Sequential playback skips empty event slots
      Given Event Memory slots 1 and 4 hold stored snapshots
      And slots 2 and 3 are empty
      And event 1 is the armed event
      When I press AUTO TAKE to perform event 1
      Then event 4 is armed next, skipping the empty slots 2 and 3

  # --- External triggers via the control input mapping layer ---

  Rule: External GPI and controller triggers fire Auto Take

    @integration
    Scenario: A GPI contact pulse fires Auto Take
      Given GPI triggering is enabled
      And the TRANSITION control is set to 60 frames
      When a GPI trigger edge is received
      Then an Auto Take begins exactly as if the AUTO TAKE button were pressed
      And it completes after 60 frames

    @integration
    Scenario: A GPI edge received mid-take pauses the take like a button press
      Given GPI triggering is enabled
      And an Auto Take is in progress
      When a GPI trigger edge is received
      Then the take pauses with the bus LEDs blinking

    @integration
    Scenario Outline: Any mapped control source can fire Auto Take
      Given the control input "<source>" is mapped to the Auto Take action
      When that control emits a trigger
      Then an Auto Take begins with the current TRANSITION time and transition type

      Examples:
        | source              |
        | GPI contact input   |
        | RS422 controller    |
        | keyboard shortcut   |
        | on-screen button    |

  # --- Integration recipe ---

  @integration
  Scenario: Auto-Take double effect snaps instantly between two effected versions of one picture
    Given the same source is assigned to A-bus and B-bus
    And A-bus has the Paint and Strobe digital effects and B-bus has the Nega effect
    And the TRANSITION control is set to the minimum of 0 frames
    When I press AUTO TAKE
    Then the program instantly switches between the two differently effected versions of the same picture
    And no intermediate blend is shown
