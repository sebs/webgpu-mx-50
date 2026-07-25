Feature: Luminance Key
  As a VJ / video editor
  I want to key the B-bus over the A-bus based on brightness
  So that I can drop white titles or bright graphics onto a background without a separate keyer

  # Grounded in reference section 9.5 (Luminance Key, D-4).
  # Luminance Key is a transition-family key that lives at the Mix/Wipe stage of the
  # fixed signal flow (Source -> bus assignment -> Colour Correction -> Digital Effect ->
  # Mix/Wipe -> DSK -> Fade). The B-bus is the key (foreground) source and the A-bus is
  # the background revealed through the transparent parts. It is engaged by parking the
  # Mix/Wipe lever fully at B and pressing LUM KEY; the SLICE control sets the luminance
  # threshold. This is the mid-chain key, distinct from the Downstream Key (DSK), which
  # sits after all effects (see downstream-key.feature). Chroma Key (chroma-key.feature)
  # is the sibling key that slices on colour instead of brightness. Colour Correction is
  # applied to each bus before this stage, so its output feeds the luminance measurement.

  Background:
    Given a source is assigned to the A-bus as the background
    And a source is assigned to the B-bus as the key
    And Luminance Key measures brightness on the Colour-Corrected B-bus signal
    And the LUM KEY button carries an LED that indicates its state

  Rule: Luminance Key is armed by parking the lever fully at B and pressing LUM KEY

    Scenario: Engaging Luminance Key with the lever fully at B
      Given the Mix/Wipe lever is fully at B-bus
      When I press LUM KEY
      Then Luminance Key becomes active
      And the LUM KEY LED is lit
      And the B-bus is treated as the key source over the A-bus background

    Scenario: The B-bus is always the key source and the A-bus is always the background
      Given Luminance Key is active
      Then bright regions of the B-bus image are keyed in as foreground
      And dark regions of the B-bus image are replaced by the A-bus
      And the A-bus is never keyed over the B-bus

    Scenario: Disengaging Luminance Key returns to an ordinary transition
      Given Luminance Key is active
      When I press LUM KEY again
      Then Luminance Key becomes inactive
      And the LUM KEY LED turns off
      And the lever once again performs an ordinary Mix/Wipe transition between the buses

  Rule: The SLICE control sets the luminance threshold that divides transparent from opaque

    Scenario: Pixels darker than the slice level become transparent
      Given Luminance Key is active
      And the lever is fully at B-bus
      When the SLICE control is set to a luminance threshold
      Then every B-bus pixel darker than the slice level becomes transparent
      And the A-bus background shows through those transparent pixels
      And every B-bus pixel at or brighter than the slice level stays opaque

    Scenario: A white title on a black field keys cleanly over the A-bus
      Given the B-bus carries a bright title over a black field
      And Luminance Key is active with the lever fully at B-bus
      When the SLICE control is set between the black field and the bright title
      Then the black field becomes transparent and reveals the A-bus
      And the bright title remains solid over the A-bus background

    Scenario Outline: Raising the slice level keys out progressively brighter detail
      Given Luminance Key is active with the lever fully at B-bus
      When the SLICE control is set to <slice level>
      Then B-bus regions below that level are transparent
      And B-bus regions at or above that level remain opaque
      And the visible extent of the keyed foreground is <keyed extent>

      Examples:
        | slice level | keyed extent                                  |
        | low         | most of the B-bus image keys in as foreground |
        | mid         | only the mid-tones and highlights key in      |
        | high        | only the brightest highlights key in          |

    Scenario: Lowering the slice toward black keys the whole B-bus image in
      Given Luminance Key is active with the lever fully at B-bus
      When the SLICE control is turned to its lowest luminance threshold
      Then almost no B-bus pixel falls below the slice level
      And the B-bus image is shown opaque over the A-bus with little of the A-bus visible

    Scenario: Raising the slice toward white keys almost the whole B-bus image out
      Given Luminance Key is active with the lever fully at B-bus
      When the SLICE control is turned to its highest luminance threshold
      Then almost every B-bus pixel falls below the slice level
      And the A-bus background is shown almost everywhere with only the brightest B-bus detail retained

  Rule: Easing the lever back toward A mixes the keyed result for a translucent key

    Scenario: The lever fully at B shows the key at full opacity
      Given Luminance Key is active
      When the lever is fully at B-bus
      Then the keyed B-bus foreground is composited over the A-bus at full opacity
      And no additional A-bus bleed-through is added beyond the transparent regions

    Scenario: Easing the lever toward A makes the whole keyed foreground translucent
      Given Luminance Key is active with the lever fully at B-bus
      When the lever is eased partway back toward A-bus
      Then the opaque keyed foreground is mixed with the A-bus background
      And the keyed foreground appears translucent, letting the A-bus show through it
      And the already-transparent regions continue to reveal the A-bus

    Scenario Outline: Lever position controls the opacity of the keyed foreground
      Given Luminance Key is active with the SLICE control set to a fixed threshold
      When the lever is positioned at <lever position>
      Then the keyed B-bus foreground is composited at <foreground opacity>

      Examples:
        | lever position    | foreground opacity                     |
        | fully at B        | full opacity                           |
        | slightly toward A | mostly opaque, faintly translucent     |
        | midway            | half opacity, clearly translucent      |
        | mostly toward A   | faint, mostly showing the A-bus        |

    Scenario: Returning the lever fully to A dissolves the key away entirely
      Given Luminance Key is active and the lever is eased toward A-bus
      When the lever is moved fully to A-bus
      Then the keyed foreground fades out completely
      And only the A-bus background remains on Program Out

  Rule: The slice threshold and the lever opacity are independent controls

    Scenario: Changing the slice reshapes the key without changing its opacity
      Given Luminance Key is active with the lever eased partway toward A-bus
      When the SLICE control is adjusted
      Then which B-bus regions are transparent versus opaque changes accordingly
      And the translucency set by the lever position is unchanged

    Scenario: Changing the lever changes opacity without changing which regions are keyed
      Given Luminance Key is active with the SLICE control set to a fixed threshold
      When the lever is moved between B-bus and A-bus
      Then the boundary between transparent and opaque B-bus regions stays fixed
      And only the opacity of the opaque foreground changes
