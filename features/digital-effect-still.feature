Feature: Digital effect: Still (freeze)
  As a VJ / video editor
  I want to freeze the current frame of a bus instantly
  So that I can hold a picture as a live still and combine it selectively with other effects

  # Grounded in reference section 8.5 (Still).
  # Still is one of the per-bus digital effects in the fixed signal flow
  # (Source -> bus assignment -> Colour Correction -> Digital Effect -> Mix/Wipe -> DSK -> Fade).
  # It captures the incoming frame once and holds it. The freeze buffer itself is
  # covered by ADR-0007 (GPU frame memory for freeze-family effects); the sibling
  # freeze-family effects are in digital-effect-strobe.feature and digital-effect-multi.feature.
  # This file defines Still's own behaviour and its mutual exclusion with
  # Strobe / Multi / Compression, plus its co-operative behaviour with Trail.

  Background:
    Given a live moving source is assigned to the bus
    And the Digital Effect stage is applied to that bus
    And the Still button carries an LED that indicates its state

  Rule: Still freezes the current frame the instant it is engaged and holds it

    Scenario: Engaging Still captures and holds the current frame
      Given Still is off and the source is moving
      When I engage Still
      Then the frame present at the moment of engagement is captured
      And the bus output holds that captured frame
      And the held frame does not update while the live source keeps moving
      And the Still LED is lit steadily

    Scenario: The freeze is instantaneous, not a gradual capture
      Given Still is off
      When I engage Still on a fast-moving source
      Then the very next output frame already shows the frozen picture
      And no intermediate blend between live and frozen frames is shown

    Scenario: Disengaging Still returns the bus to the live source
      Given Still is engaged and holding a captured frame
      When I disengage Still
      Then the bus output resumes following the live moving source
      And the Still LED turns off

    Scenario: Re-engaging Still captures a fresh frame
      Given Still is engaged and holding an earlier captured frame
      When I disengage Still
      And I let the live source advance
      And I engage Still again
      Then the newly captured frame replaces the earlier one
      And the bus output holds the newly captured frame

  Rule: Strobe, Multi, and Compression cannot run while Still is active; engaging any of them switches Still off automatically

    Scenario Outline: Engaging a conflicting effect switches Still off automatically
      Given Still is engaged and holding a captured frame
      When I engage <effect>
      Then Still switches off automatically
      And the Still LED turns off
      And <effect> becomes active on the bus

      Examples:
        | effect      |
        | Strobe      |
        | Multi       |
        | Compression |

    Scenario Outline: Still cannot be engaged on top of a conflicting effect
      Given <effect> is active on the bus
      When I engage Still
      Then Still and <effect> are never active at the same time
      And only one of the two remains active

      Examples:
        | effect      |
        | Strobe      |
        | Multi       |
        | Compression |

    Scenario: Still and Strobe are mutually exclusive
      Given Still is engaged
      When I engage Strobe
      Then Strobe runs its frozen-frame sequence on the bus
      And Still is no longer active

  Rule: Trail can run together with Still, and the Still LED blinks to signal the combined mode

    Scenario: Engaging Trail while Still is active keeps both running
      Given Still is engaged and holding a captured frame
      When I engage Trail
      Then Still remains active
      And Trail is also active on the bus
      And the Still LED blinks to indicate Still is combined with Trail

    Scenario: The Still LED blink distinguishes Still-with-Trail from Still alone
      Given Still is engaged and holding a captured frame
      And the Still LED is lit steadily
      When I engage Trail
      Then the Still LED changes from steady to blinking

    Scenario: Disengaging Trail returns the Still LED to steady
      Given Still and Trail are both active and the Still LED is blinking
      When I disengage Trail
      Then Still remains active
      And the Still LED returns to lit steadily

    Scenario: Engaging Still while Trail is already running combines them
      Given Trail is active on the bus
      When I engage Still
      Then both Still and Trail are active
      And the Still LED blinks
