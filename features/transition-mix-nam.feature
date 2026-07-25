Feature: Mix and NAM transitions
  As a VJ or video editor
  I want to composite the A-bus and B-bus either as a proportional cross-dissolve or as a brightness-based non-additive mix
  So that I can dissolve smoothly between two sources or punch the highlights of one picture through the dark areas of another

  # Reference: sections 9.2 (Mix) and 9.3 (NAM — Non-Additive Mix).
  # Both are centre-lever composites driven by the Mix/Wipe Lever (section 9.1)
  # and live in the Mix/Wipe block after the Digital Effect stage.
  # MIX (9.2): a cross-dissolve. A fades out as B fades in, proportional to lever travel.
  # NAM (9.3): with the lever centred, the lighter of the two images wins per pixel;
  # moving the lever off-centre biases which bus dominates.
  # Matte is an allowed source for both (section 3, Matte substitution rules).
  # See ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow),
  # ADR-0006 (Two-bus source model and Matte substitution rules),
  # ADR-0009 (Compositional wipe-pattern engine) and
  # ADR-0012 (Render loop and transition timing model).
  # Related features: wipe-patterns.feature, auto-take.feature,
  # matte-generator.feature, source-selection.feature, program-output.feature.

  Background:
    Given the mixer is powered on with the signal graph active
    And Source 1 is assigned to the A-bus
    And Source 2 is assigned to the B-bus
    And the program output is set to EFFECT so the composite is visible

  # --- MIX: proportional cross-dissolve (section 9.2) ---

  Scenario: Selecting MIX arms a cross-dissolve between the two buses
    When I select the MIX transition
    Then MIX is the active Mix/Wipe function
    And NAM, Wipe, Luminance Key and Chroma Key are inactive

  Scenario: MIX with the lever fully at A shows only the A-bus
    Given the MIX transition is selected
    When I move the Mix/Wipe Lever fully to the A position
    Then the composite is the A-bus source at full opacity
    And the B-bus source does not contribute to the composite

  Scenario: MIX with the lever fully at B shows only the B-bus
    Given the MIX transition is selected
    When I move the Mix/Wipe Lever fully to the B position
    Then the composite is the B-bus source at full opacity
    And the A-bus source does not contribute to the composite

  Scenario: MIX at lever centre averages the two pictures equally
    Given the MIX transition is selected
    When I move the Mix/Wipe Lever to the centre position
    Then each output pixel is the equal average of the A-bus and B-bus pixels

  Scenario Outline: MIX blends the two buses in proportion to lever travel
    Given the MIX transition is selected
    When I move the Mix/Wipe Lever to <travel> of the way from A to B
    Then the A-bus contributes <a_weight> of each output pixel
    And the B-bus contributes <b_weight> of each output pixel

    Examples:
      | travel        | a_weight | b_weight |
      | 0 percent     | 100%     | 0%       |
      | 25 percent    | 75%      | 25%      |
      | 50 percent    | 50%      | 50%      |
      | 75 percent    | 25%      | 75%      |
      | 100 percent   | 0%       | 100%     |

  Scenario: MIX travel drives a smooth continuous dissolve
    Given the MIX transition is selected
    When I sweep the Mix/Wipe Lever from A to B
    Then the A-bus contribution decreases monotonically from full to zero
    And the B-bus contribution increases monotonically from zero to full
    And the two contributions always sum to a full-opacity image

  # --- NAM: non-additive mix (section 9.3) ---

  Scenario: Selecting NAM arms a brightness-based composite
    When I select the NAM transition
    Then NAM is the active Mix/Wipe function
    And MIX, Wipe, Luminance Key and Chroma Key are inactive

  Scenario: NAM at lever centre keeps the brighter of the two images per pixel
    Given the NAM transition is selected
    And the Mix/Wipe Lever is at the centre position
    Then at each pixel the output takes the brighter of the A-bus and B-bus values
    And the darker of the two source pixels is replaced rather than averaged

  Scenario: NAM lets bright highlights punch through dark areas of the other source
    Given the NAM transition is selected
    And the Mix/Wipe Lever is at the centre position
    And the A-bus carries a bright title over a dark field
    And the B-bus carries a dimly lit scene
    Then the bright title from the A-bus appears wherever it is brighter than the B-bus
    And the B-bus scene shows through the dark areas of the A-bus title

  Scenario: NAM at centre is distinct from a MIX average
    Given the NAM transition is selected
    And the Mix/Wipe Lever is at the centre position
    Then the composite is the per-pixel brighter of each scene, not the average of the two

  Scenario Outline: Moving the NAM lever off-centre biases which bus dominates
    Given the NAM transition is selected
    When I move the Mix/Wipe Lever <direction> of centre
    Then the <dominant> bus is biased to dominate the composite

    Examples:
      | direction    | dominant |
      | toward A     | A-bus    |
      | toward B     | B-bus    |

  # --- Matte as a source for both composites (section 3) ---

  Scenario: A Matte colour is a valid source for MIX
    Given Matte is assigned to the A-bus
    And the MIX transition is selected
    When I move the Mix/Wipe Lever to the centre position
    Then the Matte colour is dissolved against the B-bus source in proportion to lever travel

  Scenario: A Matte colour is a valid source for NAM
    Given Matte is assigned to the B-bus
    And the NAM transition is selected
    And the Mix/Wipe Lever is at the centre position
    Then the Matte colour competes by brightness against the A-bus source per pixel

  # --- Timing and integration ---

  @integration
  Scenario: Auto Take drives a MIX to completion over the transition duration
    Given the MIX transition is selected
    And the Mix/Wipe Lever is at the A position
    And the TRANSITION control sets the duration
    When I press AUTO TAKE
    Then the composite dissolves from the A-bus to the B-bus over the set duration
    And the Mix/Wipe Lever ends at the B position

  @integration
  Scenario: MIX and NAM composite the effected buses, not the raw sources
    Given a digital effect is configured on the A-bus
    And the MIX transition is selected
    When I move the Mix/Wipe Lever to the centre position
    Then the composite blends the effected A-bus with the B-bus
    And the Mix/Wipe stage acts downstream of the Digital Effect stage
