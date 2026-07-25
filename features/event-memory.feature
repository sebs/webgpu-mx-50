Feature: Event Memory
  As a VJ or video editor
  I want to store complete panel setups in numbered memories and recall them on demand
  So that I can snap back to prepared looks and step through a show without rebuilding each setup by hand

  # Reference: section 13 (Event Memory, H-1).
  # Eight memories, each a complete panel snapshot (source/bus assignment, colour
  # correction, digital-effect selection, wipe/mix setup, key setup, DSK, matte
  # colour, fade enables, audio levels).
  #   Store:  press MEMORY, then an EVENT NO. button (1-4; hold SHIFT for 5-8).
  #           The event LED blinks 3 times to confirm.
  #   Recall: press the EVENT NO. button (SHIFT first for 5-8), then AUTO TAKE.
  #   Sequential playback: repeated AUTO TAKE presses step through stored memories
  #           in numerical order, skipping empty slots.
  #   Clear all: power off, then hold MEMORY + SHIFT while powering on.
  # Persistence and the storage tiers map to ADR-0015 (Persistence for Event
  # Memory and settings); the snapshot is a projection of the store in
  # ADR-0011 (Single unidirectional panel state store). Recall dispatches through
  # the normal store update path, so the UI and render loop react as to any manual
  # change. See auto-take.feature, special-modes.feature, program-output.feature,
  # position-and-scene-grabber.feature.

  Background:
    Given the mixer is powered on with the signal graph active
    And the eight Event Memory slots numbered 1 through 8 are available
    And a persistence module owns all browser-storage access on the app's behalf

  # --- Store ---------------------------------------------------------------

  Scenario: Storing a panel setup into a memory captures the complete snapshot
    Given the panel is set up with Source 1 on the A-bus, Source 2 on the B-bus, a wipe transition and colour correction
    When I press MEMORY
    And I press EVENT NO. 3
    Then the current panel snapshot is written to slot 3
    And the snapshot includes the source and bus assignment, colour correction, digital-effect selection, wipe and mix setup, key and DSK setup, matte colour, fade enables and audio levels
    But the snapshot excludes volatile runtime state such as GPU frame memory, transition progress and timers

  Scenario: The event LED blinks three times to confirm a successful store
    Given the panel is set up as desired
    When I press MEMORY
    And I press EVENT NO. 2
    Then the event LED for slot 2 blinks exactly 3 times to confirm the store

  Scenario Outline: EVENT NO. buttons 1 to 4 address memories 1 to 4 without SHIFT
    Given the panel is set up as desired
    When I press MEMORY
    And I press EVENT NO. <button>
    Then the panel snapshot is written to slot <slot>

    Examples:
      | button | slot |
      | 1      | 1    |
      | 2      | 2    |
      | 3      | 3    |
      | 4      | 4    |

  Scenario Outline: Holding SHIFT while pressing an EVENT NO. button addresses memories 5 to 8
    Given the panel is set up as desired
    When I press MEMORY
    And I hold SHIFT and press EVENT NO. <button>
    Then the panel snapshot is written to slot <slot>

    Examples:
      | button | slot |
      | 1      | 5    |
      | 2      | 6    |
      | 3      | 7    |
      | 4      | 8    |

  Scenario: Storing into an occupied slot overwrites the previous snapshot
    Given slot 4 already holds a stored panel snapshot
    And the panel is set up with a different look
    When I press MEMORY
    And I press EVENT NO. 4
    Then slot 4 holds the new panel snapshot
    And the previous contents of slot 4 are discarded

  # --- Recall --------------------------------------------------------------

  Scenario: Recalling a stored memory rehydrates the panel from its snapshot
    Given slot 3 holds a stored panel snapshot
    When I press EVENT NO. 3
    And I press AUTO TAKE
    Then the panel state is restored from the slot 3 snapshot
    And the restore dispatches through the normal store update path so the UI and render loop react as to a manual change

  Scenario Outline: Recalling memories 5 to 8 requires SHIFT before the EVENT NO. button
    Given slot <slot> holds a stored panel snapshot
    When I hold SHIFT and press EVENT NO. <button>
    And I press AUTO TAKE
    Then the panel state is restored from the slot <slot> snapshot

    Examples:
      | button | slot |
      | 1      | 5    |
      | 2      | 6    |
      | 3      | 7    |
      | 4      | 8    |

  Scenario: Selecting an EVENT NO. without AUTO TAKE arms but does not execute the recall
    Given slot 2 holds a stored panel snapshot
    When I press EVENT NO. 2
    Then slot 2 is armed for recall
    But the panel state is unchanged until I press AUTO TAKE

  Scenario: Recalling an empty slot performs no change
    Given slot 6 is empty
    When I hold SHIFT and press EVENT NO. 2
    And I press AUTO TAKE
    Then the panel state is unchanged

  # --- Sequential playback -------------------------------------------------

  Scenario: Repeated AUTO TAKE presses step through stored memories in numerical order
    Given slots 1, 2 and 3 each hold a stored panel snapshot
    And sequential playback is armed at the start of the bank
    When I press AUTO TAKE three times in succession
    Then slot 1 is recalled, then slot 2, then slot 3 in that order

  Scenario: Sequential playback skips empty slots
    Given slots 1, 4 and 7 hold stored panel snapshots
    And slots 2, 3, 5, 6 and 8 are empty
    And sequential playback is armed at the start of the bank
    When I press AUTO TAKE three times in succession
    Then slot 1 is recalled, then slot 4, then slot 7 in that order
    And no empty slot is recalled

  Scenario: Sequential playback ends after the last stored memory
    Given only slots 1 and 2 hold stored panel snapshots
    And slot 2 has just been recalled by sequential playback
    When I press AUTO TAKE again
    Then no further stored memory remains in the sequence for this pass

  # --- Clear all -----------------------------------------------------------

  Scenario: Holding MEMORY and SHIFT through a power cycle clears all eight memories
    Given several Event Memory slots hold stored panel snapshots
    When I power the mixer off
    And I hold MEMORY and SHIFT while powering the mixer on
    Then all eight Event Memory slots are cleared
    And every slot reports as empty

  Scenario: A normal power cycle does not clear the memories
    Given slots 1 and 5 hold stored panel snapshots
    When I power the mixer off and on without holding MEMORY and SHIFT
    Then slots 1 and 5 still hold their stored panel snapshots

  # --- Persistence (maps to ADR-0015) --------------------------------------

  Scenario: Stored memories persist across a reload
    Given slot 2 holds a stored panel snapshot
    When the application is reloaded
    Then slot 2 still holds its stored panel snapshot
    And the snapshot is read back synchronously from local storage at boot

  # Small scalar snapshots live in localStorage; heavy captured pixels live in
  # IndexedDB, referenced by slot id and loaded lazily on recall. See ADR-0015.
  @integration
  Scenario: Storing a memory that carries a captured still keeps the two storage tiers consistent
    Given the panel setup includes a Scene Grabber still the user chose to store
    When I press MEMORY
    And I press EVENT NO. 5
    Then the still pixels are written to IndexedDB under the slot 5 key first
    And then the panel snapshot carrying only a still-reference id is committed to local storage
    And slot 5 references its still consistently across both backends

  @integration
  Scenario: Recalling a memory that references a still reloads the pixels onto the GPU
    Given slot 5 holds a snapshot that references a captured still in IndexedDB
    When I press EVENT NO. 5
    And I press AUTO TAKE
    Then the panel state is restored from the slot 5 snapshot
    And the referenced still blob is loaded from IndexedDB and re-uploaded to a GPU texture

  # The hardware kept memories only via a short-lived backup battery (a few days
  # off AC). The clean-modern app persists them durably in browser storage, so we
  # do not emulate battery decay or timed expiry. See ADR-0015.
  @deferred
  Scenario: Battery-backed decay of stored memories is not emulated
    Given slot 1 holds a stored panel snapshot
    When a long period passes with the application closed
    Then slot 1 still holds its stored panel snapshot
    And no timed battery-decay expiry is simulated
