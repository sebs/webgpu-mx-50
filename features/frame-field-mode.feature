@deferred
Feature: Frame field-versus-frame mode
  As a video editor recreating the WJ-MX50 panel,
  I want the Frame button that trades vertical resolution against motion "vibration"
  So that the control grouping is faithful even though the clean-modern build has no interlace to trade.

  # Reference: section 8.10 Frame Button (field/frame mode).
  # On the hardware the Frame button switches the digital-effect output between
  # 1-field (reduced vertical resolution, no interlace vibration on motion) and
  # 2-field frame (full vertical resolution, but interlace "vibration" on moving
  # subjects). It applies only to the frame-storing effects: Still, Strobe, Multi, Trail.
  #
  # The clean-modern decision (ADR-0005, Clean-modern RGBA video representation;
  # defer analog emulation) means video is full-resolution progressive RGBA with no
  # interlace fields. There is no field/frame distinction to reproduce, so this whole
  # feature is DEFERRED. The scenarios below document intended hardware behavior for
  # completeness; the final scenario pins the v1 no-op contract.

  Background:
    Given the Digital Effect block is engaged on a bus
    And the source feeding that effect contains visible motion

  # --- Intended hardware behavior (documentation only, not built in v1) ---

  Scenario Outline: The Frame button applies only to the frame-storing effects
    Given the "<effect>" digital effect is active
    When the operator toggles the Frame button
    Then the effect output switches between 1-field and 2-field frame mode

    Examples:
      | effect |
      | Still  |
      | Strobe |
      | Multi  |
      | Trail  |

  Scenario Outline: The Frame button has no effect on non-frame-storing effects
    Given the "<effect>" digital effect is active
    When the operator toggles the Frame button
    Then the output is unchanged regardless of Frame mode

    Examples:
      | effect |
      | Nega   |
      | Mosaic |
      | Mono   |
      | Paint  |

  Scenario: Field mode trades vertical resolution for clean motion
    Given the Still effect is active
    When the operator selects 1-field mode
    Then the frozen output shows reduced vertical resolution
    And moving detail shows no interlace vibration

  Scenario: Frame mode trades clean motion for full vertical resolution
    Given the Still effect is active
    When the operator selects 2-field frame mode
    Then the frozen output shows full vertical resolution
    And moving detail may show interlace vibration

  # --- Clean-modern v1 contract ---

  Scenario: In the clean-modern v1 build the Frame toggle has no visible effect
    Given the clean-modern v1 build is running
    And video is represented as full-resolution progressive RGBA with no interlace fields
    And any of the Still, Strobe, Multi, or Trail effects is active
    When the operator toggles the Frame button between 1-field and 2-field frame mode
    Then the effect output is pixel-identical in both positions
    And no vertical-resolution change occurs
    And no interlace vibration is introduced or removed
