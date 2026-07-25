Feature: Inputs and device binding
  As a VJ or video editor
  I want to bind each of the mixer's inputs to a real browser device, file, or generated source
  So that the two-bus signal graph is fed by concrete media I can pick and re-pick at runtime

  # Grounded in reference section 2 (Inputs & Outputs), reinterpreted for the browser.
  # The hardware exposes four Source Inputs (composite + S-Video + audio each), a
  # dedicated External Camera In used as the Downstream Key source, and auxiliary
  # audio: Aux Audio In 1, Aux Audio In 2, and a Microphone jack (a front-panel
  # switch selects Mic or Aux-2 for that fader).
  # Clean-modern reinterpretation (ADR-0005, ADR-0008):
  #  - There is no composite-vs-S-Video priority to emulate; each source has ONE
  #    active binding to a browser media provider instead of two physical jacks.
  #  - A binding is one of: a camera device, a video file, an image, or an
  #    internally generated source (e.g. the Matte).
  #  - The External Camera In becomes a chosen device (or file) used only as the
  #    DSK key source, not as a bus source.
  #  - Aux1, Aux2, and Mic bind to audio input devices or audio files.
  # Related: inputs feed source-selection.feature; the DSK key feeds
  # downstream-key.feature; audio bindings feed audio-mixer.feature.

  Background:
    Given the mixer exposes four source inputs numbered 1 to 4
    And each source input holds exactly one active binding
    And a binding target is one of a camera device, a video file, an image, or a generated source
    And the browser has enumerated the available media input devices

  Rule: Each of the four sources can be bound to any single media provider

    Scenario Outline: Binding a source input to a media provider
      When I bind Source <n> to a <target_kind>
      Then Source <n> supplies video from that <target_kind>
      And Source <n> exposes one active binding only
      And the bound provider is available for selection on either bus

      Examples:
        | n | target_kind      |
        | 1 | camera device    |
        | 2 | video file       |
        | 3 | image            |
        | 4 | generated source |

    Scenario: Rebinding a source replaces its previous provider
      Given Source 1 is bound to a video file
      When I bind Source 1 to a camera device
      Then Source 1 supplies video from the camera device
      And the previously bound video file no longer feeds Source 1

    Scenario: An image binding presents as a still video frame
      When I bind Source 3 to an image
      Then Source 3 supplies a single unchanging frame from that image
      And Source 3 carries no audio

    Scenario: The same media provider may back more than one source
      When I bind Source 2 to a camera device
      And I bind Source 4 to the same camera device
      Then both Source 2 and Source 4 supply video from that camera device

  Rule: Selecting a camera device chooses among the enumerated hardware cameras

    Scenario: Choosing a specific camera for a source
      Given more than one camera device is enumerated
      When I bind Source 1 to a camera device
      And I choose a specific camera from the enumerated list
      Then Source 1 supplies video from the chosen camera
      And I can re-choose a different camera without changing Source 1's other settings

    Scenario: A source with no bound provider produces no video
      Given Source 4 has no active binding
      When Source 4 is selected on the A-bus
      Then the A-bus receives no video from Source 4
      And selecting a provider for Source 4 restores its video

    Scenario: Losing a camera device leaves the source unbound
      Given Source 1 is bound to a camera device
      When that camera device is disconnected
      Then Source 1 reports its binding as unavailable
      And Source 1 produces no video until it is rebound

  Rule: The External Camera In is a chosen device used only as the DSK key source

    Scenario: Binding the External Camera In as the DSK key
      When I bind the External Camera In to a camera device
      Then the External Camera In supplies the Downstream Key source
      And the External Camera In is not offered as a bus source for Source 1 to 4

    Scenario: The External Camera In may also be bound to a file
      When I bind the External Camera In to a video file
      Then the video file supplies the Downstream Key source

    Scenario: A missing External Camera binding disables the DSK key source
      Given the External Camera In has no active binding
      When the Downstream Key stage requests its key source
      Then no key source is available
      And the Downstream Key cannot key until the External Camera In is bound

  Rule: Auxiliary audio inputs bind to audio input devices or audio files

    Scenario Outline: Binding an auxiliary audio input
      When I bind <aux_input> to a <audio_target>
      Then <aux_input> supplies audio from that <audio_target>
      And <aux_input> feeds the Audio Mix section independently of the bus faders

      Examples:
        | aux_input   | audio_target          |
        | Aux Audio 1 | microphone device     |
        | Aux Audio 1 | audio file            |
        | Aux Audio 2 | line-in audio device  |
        | Aux Audio 2 | audio file            |

    Scenario Outline: The Mic-or-Aux2 fader selects one active audio source
      # Mirrors the hardware front-panel switch choosing Mic or Aux-2 for that fader.
      Given the Microphone is bound to a microphone device
      And Aux Audio 2 is bound to an audio file
      When the shared fader is switched to <selected>
      Then the shared fader governs the audio of <selected>
      And the audio of <not_selected> does not reach the mix through that fader

      Examples:
        | selected    | not_selected |
        | Microphone  | Aux Audio 2  |
        | Aux Audio 2 | Microphone   |

    Scenario: Choosing a specific microphone device
      Given more than one audio input device is enumerated
      When I bind the Microphone to a microphone device
      And I choose a specific microphone from the enumerated list
      Then the Microphone supplies audio from the chosen device

  Rule: Device access requires browser permission and reflects availability

    Scenario: Camera enumeration requires granted permission
      Given camera permission has not yet been granted
      When I attempt to choose a camera device for a source
      Then the browser prompts for camera permission
      And the enumerated camera list is populated only after permission is granted

    Scenario: Microphone enumeration requires granted permission
      Given microphone permission has not yet been granted
      When I attempt to choose a microphone device for the Microphone input
      Then the browser prompts for microphone permission
      And the enumerated microphone list is populated only after permission is granted

    Scenario: The device list updates when hardware changes
      Given Source 2 is bound to a camera device
      When a new camera device is connected
      Then the newly connected camera appears in the enumerated list
      And existing bindings remain unchanged
