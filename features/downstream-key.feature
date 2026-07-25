Feature: Downstream Key (DSK)
  As a VJ or video editor
  I want to superimpose titles and characters over the finished composite with adjustable key window, fill, edge and polarity
  So that lettering from a character generator or camera title card stays sharp on top of any effect

  # Reference: section 10 (Downstream Key — DSK).
  # The DSK is downstream of everything: it sits after the Digital Effect and
  # Mix/Wipe blocks and before Fade (signal flow, section 1). Because it keys on
  # top of the finished composite, titles stay crisp over any effect underneath.
  # Two luminance sliders — Low Level Key and High Level Key — define the window
  # that counts as "title". The Mix/Wipe Lever is placed at the B-bus for keying.
  # Fill is MATTE (selected matte colour) or WHITE. Key source is EXT. CAMERA or
  # the A/B bus itself. ON reveals the fill in the keyed characters. Trim Low for
  # white-on-black cards, High for black-on-white. EDGE cycles five styles;
  # REVERSE inverts key polarity.
  # See ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow),
  # ADR-0006 (Two-bus source model and Matte substitution rules) and
  # ADR-0009 (Compositional wipe-pattern engine).
  # Related features: matte-generator.feature, luminance-key.feature,
  # fade-control.feature, source-selection.feature, program-output.feature.

  Background:
    Given the mixer is powered on with the signal graph active
    And the program output is set to EFFECT so the composite is visible
    And the DSK stage sits downstream of the Digital Effect and Mix/Wipe blocks
    And the Mix/Wipe Lever is at the B-bus position
    And a title source carries white lettering on a black card

  # --- Position in the signal chain (section 10) ---

  Scenario: The DSK keys on top of the finished composite
    Given a digital effect is applied to the composite beneath the key
    When I turn the DSK ON
    Then the keyed characters are superimposed over the effected composite
    And the characters stay sharp regardless of the effect underneath
    And the DSK acts after both the Digital Effect and Mix/Wipe stages

  Scenario: The DSK is upstream of the Fade stage
    Given the DSK is ON with a title superimposed
    When the Fade stage fades the program out
    Then the title fades together with the composite beneath it
    And the Fade stage acts on the full composite including the key

  # --- Basic keying workflow (section 10) ---

  Scenario: Turning the DSK ON reveals the fill in the keyed characters
    Given the DSK fill is set to WHITE
    And the key source is EXT. CAMERA
    When I turn the DSK ON
    Then the fill colour appears inside the keyed characters
    And the composite beneath shows through everywhere outside the characters

  Scenario: With the DSK OFF the key is not applied
    Given the DSK is OFF
    Then no title is superimposed on the composite
    And the composite is passed through the DSK stage unchanged

  # --- Luminance window: Low and High Level Key sliders (section 10) ---

  Scenario: The two key-level sliders define the luminance window for the title
    Given the Low Level Key slider is at the bottom
    And the High Level Key slider is at the top
    When I turn the DSK ON
    Then luminance values within the window are treated as characters and filled
    And luminance values outside the window let the composite show through

  Scenario: Trimming the Low Level slider cleans white lettering on a black card
    Given the title source carries white lettering on a black card
    And the DSK is ON
    When I adjust the Low Level Key slider
    Then the character edges resolve to a clean key against the black background

  Scenario: Trimming the High Level slider cleans black lettering on a white card
    Given the title source carries black lettering on a white card
    And the DSK is ON
    When I adjust the High Level Key slider
    Then the character edges resolve to a clean key against the white background

  Scenario: A character generator keyboard uses both sliders at the low end
    Given the title source is the WJ-KB50 character generator
    When I set both the Low Level and High Level Key sliders to the low end
    And I turn the DSK ON
    Then the keyboard characters key cleanly with the fill colour

  # --- Fill selection: MATTE or WHITE (section 10) ---

  Scenario Outline: Choosing the fill sets the colour inside the keyed characters
    Given the DSK fill is set to <fill>
    And the key source is EXT. CAMERA
    When I turn the DSK ON
    Then the keyed characters are filled with <result>

    Examples:
      | fill  | result                              |
      | WHITE | white                               |
      | MATTE | the selected Matte Generator colour |

  Scenario: The MATTE fill follows the selected Matte Generator colour
    Given the DSK fill is set to MATTE
    And the Matte Generator colour is changed
    When the DSK is ON
    Then the keyed characters take on the newly selected matte colour

  # --- Key source selection: EXT. CAMERA or the A/B bus (section 10) ---

  Scenario Outline: Choosing the key source selects where the title luminance comes from
    Given the key source is set to <source>
    And the DSK is ON
    Then the key window is derived from the luminance of <source>

    Examples:
      | source      |
      | EXT. CAMERA |
      | the A-bus   |
      | the B-bus   |

  Scenario: EXT. CAMERA supplies the dedicated title input
    Given the key source is set to EXT. CAMERA
    And the external camera input carries a title card
    When I turn the DSK ON
    Then the title card luminance defines the keyed characters

  # --- EDGE styles (section 10) ---

  Scenario Outline: The EDGE button cycles through the five edge styles in order
    Given the current DSK edge style is <current>
    When I press EDGE
    Then the DSK edge style becomes <next>

    Examples:
      | current       | next          |
      | Normal        | Narrow Border |
      | Narrow Border | Wide Border   |
      | Wide Border   | Narrow Shadow |
      | Narrow Shadow | Wide Shadow   |
      | Wide Shadow   | Drop Shadow   |
      | Drop Shadow   | Normal        |

  Scenario: The Normal edge style adds no border or shadow
    Given the DSK is ON
    And the DSK edge style is Normal
    Then the keyed characters have no added border or shadow

  Scenario: A white key allows the edge to be coloured with a matte colour
    Given the DSK fill is set to WHITE
    And the DSK edge style is Wide Border
    When I set the edge colour to one of the 9 matte colours
    Then the character edge takes on the selected matte colour

  Scenario: The white-key edge can be graded with GRADATION
    Given the DSK fill is set to WHITE
    And the DSK edge style is Wide Border
    When I enable GRADATION on the edge colour
    Then the character edge is filled with a graded matte colour

  Scenario: A matte-colour key forces the edge to black
    Given the DSK fill is set to MATTE
    And the DSK edge style is Drop Shadow
    Then the character edge is always black
    And the edge colour cannot be set to a matte colour

  # --- REVERSE polarity (section 10) ---

  Scenario: REVERSE inverts the key polarity
    Given the title source carries white lettering on a black card
    And the DSK is ON
    When I press REVERSE
    Then the luminance range treated as characters swaps with the range treated as background
    And the lettering is knocked out of the background instead of filled

  Scenario: Pressing REVERSE again restores the original polarity
    Given the DSK is ON with REVERSE engaged
    When I press REVERSE
    Then the key returns to its original polarity
    And the keyed characters are filled as before

  # --- Integration ---

  @integration
  Scenario: A title keyed over a wipe transition stays sharp through the move
    Given the A-bus and B-bus are running a wipe transition
    And the DSK is ON with a title superimposed
    When the wipe progresses across the frame
    Then the title stays sharp and in place above the moving wipe
    And the DSK keys over the composite rather than either bus alone

  @integration
  Scenario: The DSK fade enable fades the title with the program
    Given the DSK is ON with a title superimposed
    And the Fade stage has its DSK enable lit
    When the Fade Control lever is moved from IN to OUT
    Then the title fades out together with the enabled composite
