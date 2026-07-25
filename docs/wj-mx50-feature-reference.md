# Panasonic WJ-MX50 Digital AV Mixer — Complete Feature Reference

A structured breakdown of every feature in the WJ-MX50, with explanations of how each one works, based on the official Operating Instructions.

---

## 1. Core Architecture

The WJ-MX50 is a two-bus digital audio/video mixer. Every effect in the unit is built on the same foundation:

- **A-bus and B-bus.** Two independent signal paths. You assign any of the four source inputs (or the internal Matte color) to each bus using the A-bus and B-bus source buttons. All transitions, keys, and effects operate between these two buses.
- **Built-in Frame Synchronizers (one per bus).** This is the feature that makes the whole unit possible with consumer/prosumer gear. Ordinary VTRs and cameras are not genlocked to each other, so their video timing drifts apart. The frame synchronizers digitize each bus and re-time it internally, so two completely unsynchronized sources can be mixed, wiped, or keyed glitch-free.
- **Digital processing.** Video is sampled at 4:1:1 (Y = 14.3 MHz) with 8-bit component processing, which is what enables the freeze, strobe, multi-image, and trail effects — they all rely on the internal frame memory.
- **Signal flow.** Source → bus assignment → Color Correction → Digital Effect block → Mix/Wipe block → Downstream Key → Fade Control → Program Out. Understanding this order matters: e.g., the DSK is "downstream" of everything, so titles stay sharp on top of any effect, and the Fade is last, so it can fade the entire composite.

---

## 2. Inputs & Outputs

### Source Inputs (×4)
Each of the four sources has:
- **Composite input** (BNC, 1.0 Vp-p/75 Ω NTSC)
- **S-Video (Y/C) input** (Mini DIN 4)
- **Audio inputs** — Sources 1/2 use balanced XLR (+4 dBm/600 Ω); Sources 3/4 use unbalanced RCA pin jacks (−6 dBs/20 kΩ)

**How input priority works:** If both composite and S-Video are connected to the same source, the S-Video signal automatically takes priority and the composite feed is ignored. Mono handling: feeding only the L-channel audio routes it internally to both channels (mono mode); feeding both channels keeps them discrete.

### Other Inputs
- **External Camera In (composite + Y/C):** dedicated key-source input for the Downstream Key. Caution from the manual: this signal is also used as a reference sync for the unit, so a jittery VTR playback signal here can disturb synchronization.
- **Aux Audio In 1 & 2** (RCA pairs), **Microphone jack** (front, −60 dBv), with a front-panel switch selecting Mic or Aux-2 for that fader.
- **Title Input (10-pin):** for the optional WJ-KB50 / WJ-KB15 / WV-KB12A character generators. Carries character video in, sync out, and +9 V power to the keyboard.
- **GPI Input (BNC, make-contact):** external trigger for Auto Take.
- **Editing Controller port (RS422/RS232C selectable)** for the AG-A800 edit controller or a modem/PC.

### Outputs
- **Program Out 1:** composite + S-Video, audio on balanced XLR (+4 dBs).
- **Program Out 2:** composite + S-Video, audio on unbalanced RCA (−6 dBs).
- **Preview Out (composite):** always carries the *effected* video regardless of which Program Out mode is selected — so you can monitor the effect while sending clean source to program.
- **Black Burst Out:** system sync reference for the edit controller.
- **Advance Sync Out (×2)** and **Advance Reference Out (×2):** timing outputs for A/B-roll editing. Advance Sync feeds playback VTRs *without* a built-in Time Base Corrector; Advance Reference feeds VTRs *with* a TBC. The manual notes these signals are required for accurate editing and are necessary for the Compression and Trail functions when recording to VTR.
- **Headphone jack** with level control (headphone audio is deliberately not affected by fades).

### Program Out Selection — how it works
Three buttons decide what actually leaves the unit:
- **A Button:** sends the A-bus source *directly* (bypassing effects). Audio out = A-bus + Aux1 + Aux2/Mic mix.
- **B Button:** sends the B-bus source directly. Audio out = B-bus + Aux1 + Aux2/Mic mix.
- **EFFECT Button:** sends the fully processed final signal (effects, keys, fades) with the complete Audio Mix under the Master fader.

If Matte is selected on a bus and you press that bus's direct-out button, the Matte can't be output — the unit instead outputs the source whose button is blinking.

---

## 3. Source Selection (B-1)

- Each bus has five buttons: **Source 1–4** and **Matte**.
- Selecting a source on a bus selects both its video *and* its audio; that audio is then governed by the corresponding A-bus or B-bus fader in the Audio Mix section.
- **Matte as a source:** the Matte color can act as an alternate source for Wipe, Mix, and NAM. However, it *cannot* be used with Luminance Key, Chroma Key, Downstream Key, or Fade Control — in those cases the unit automatically substitutes the blinking source button's video instead.

---

## 4. Matte Generator (B-2)

The internal color generator used for backgrounds, borders, key fills, and fade targets.

**How it works:**
- **9 colors:** Color Bar, White, Yellow, Cyan, Green, Magenta, Red, Blue, Black. You step through them with the SELECT ∧/∨ buttons; the current color shows on an LED indicator (∧ cycles upward, with Black following Color Bar; ∨ reverses).
- **LEVEL control:** adjusts the chroma level of the selected color. Exceptions: C/L BAR and BLACK are fixed; for WHITE the control adjusts *brightness* from black up to full white instead of chroma.
- **GRADATION button:** turns the flat matte into a vertical gradient — less intense at the top of the screen, increasing to the set level at the bottom.

---

## 5. Audio Mixer (B-3)

**Inputs mixed:** 7 total — Source 1/2/3/4 (via the bus selection), Aux 1, Aux 2, and Mic.

**How it works:**
- **A Fader** controls the audio of whatever source is selected on the A-bus; **B Fader** likewise for the B-bus.
- **AUX1 Fader** controls Aux input 1; **MIC/AUX2 Fader** controls either the mic or Aux 2, chosen by the front-panel switch.
- **MASTER Fader** sets the final mixed output level. The manual advises balancing the four input faders so the average program level sits around 0 dB on the LED **Audio Level Indicator**.
- The **EFFECT** Program Out button must be active to get the full mixed audio; the A/B direct-out buttons only pass their bus audio plus the aux/mic inputs.

---

## 6. Color Correction (B-4)

Independent color processing per bus, applied before the effects.

**How it works (per bus, using the A button as the example):**
1. **Press A once** → LED blinks → only the **CHROMA control** is active, adjusting color saturation of the A-bus (center = original level).
2. **Press A twice** → LED solid → the **RGB Joystick** becomes active in addition to CHROMA. Moving the joystick off-center shifts the hue/color balance; center = original color.
3. **Press A a third time** → correction off.

**Tricks and limits:**
- Turning CHROMA fully to MIN gives a **black-and-white image**; from there, moving the RGB joystick casts a **single mono tint** (R/G/B toned image) over the whole scene.
- No effect on a source that is already black/white; the MONO digital effect must be off; and the manual recommends applying identical correction to both buses so a transition doesn't visibly shift color.
- Warning: maxing CHROMA on an already saturated signal can record noise to tape.

---

## 7. Position Control & Scene Grabber (B-5)

**Positioner Joystick — how it works:**
1. Select a **Square Wipe** pattern (circle, oval, square, or diamond — the only patterns that support positioning). Optionally set the aspect ratio with the ASPECT control (ON button must be lit).
2. Press the Positioner **ON** button (the wiped size doubles when activated).
3. Set the wipe size with the **Mix/Wipe Lever**, then move the **Joystick** to place the wiped inset anywhere on screen.

**Scene Grabber — how it works:** With the Positioner active, pressing **SCENE GRABBER** freezes ("grabs") the image inside the wipe pattern. The joystick then moves that grabbed still around the screen independently of the live video behind it. Turning the Positioner ON button off also cancels the Scene Grabber.

---

## 8. Digital Effect Block (C)

Effects here are applied per-bus: press **A** or **B** to choose which bus receives the effect, then **ON** to make it live. Effects can be applied to only one bus at a time, and nothing happens until ON is pressed.

### 8.1 Nega (Negative)
Inverts the image like a film negative. Color Correction can be stacked on top of it (e.g., to tint the negative).

### 8.2 Mosaic
Breaks the picture into solid-colored squares. The **SIZE control** varies the block size continuously through **31 increments**, so you can animate the pixelation live.

### 8.3 Mono
Converts the bus to black-and-white. Note: Mono takes priority over Color Correction — while Mono is on, color correction on that bus is overridden.

### 8.4 Paint
Posterizes the image to resemble an oil painting. The **LEVEL control** adjusts the gradation (how coarse the paint effect is), continuously.

### 8.5 Still
Freezes the current frame instantly. Interactions:
- Strobe, Multi, and Compression **cannot** run while Still is active (Still switches off automatically if you engage them).
- Trail *can* run during Still (the Still button's LED blinks in Trail mode).

### 8.6 Strobe
Plays a series of frozen frames — motion becomes a stop-motion sequence. The **TIME control** sets the freeze interval from ~0.03 s to 2.1 s. Still and Compression can't be used during Strobe (Strobe turns off / Compression is temporarily disabled).

### 8.7 Multi
Splits the screen into multiple copies of the video:
- Press once → **4 images**, twice → **9 images**, three times → **16 images**, fourth press → back to single.
- The **TIME control** (~0.07–2.1 s) sets how quickly the unit steps through capturing each tile.
- **ONCE button:** each tile is captured one time through the grid, then freezes. **REPEAT button:** the unit cycles through the tiles continuously.

### 8.8 Trail
A compressed (shrunken) image leaves a trail of progressively larger copies behind it — up to **16 images**. The start corner (upper-left or upper-right) is chosen with the Positioner Joystick; the interval is set by the TIME control (~0.07–2.1 s). Notes: moving the joystick mid-trail creates a "staggered" image series; the Compression Wipe doesn't work properly during Trail; A/V Synchro can't be combined with Trail.

### 8.9 A/V Synchro
Audio-triggered effects: the sound fed to the mixer pulses the selected digital effect(s) — any combination of Nega, Mosaic, Mono, Paint, Still, or Strobe — in time with the music.
- The **LEVEL control** sets the trigger threshold: turned toward MAX, only loud peaks trigger; toward MIN, quiet sounds trigger too.
- For Nega/Mosaic/Mono/Paint/Still, the effect holds for the duration the audio stays above threshold; for Strobe, the hold time is governed by the Effect Interval Timer instead.

### 8.10 Frame Button (field/frame mode)
Switches the digital effect output between **1-field (reduced resolution)** and **2-field frame (standard resolution)**. Applies to Still, Strobe, Multi, and Trail. Frame mode gives full vertical resolution but can show interlace "vibration" on motion — this button is the tool to trade one against the other.

---

## 9. Mix and Wipe Block (D)

Five transition/composite functions live here: **Mix, NAM, Wipe, Luminance Key, Chroma Key.** All are driven by the **Mix/Wipe Lever** or by Auto Take.

### 9.1 The Mix/Wipe Lever & LEDs
- Moving the lever from A to B performs the selected transition; the relative lever position = the relative proportion of each bus.
- The **Mix/Wipe LEDs** report state: solid A = A fully on screen; blinking = transition partially complete (the manual defines blink patterns for stronger/weaker or before/after-halfway states); solid B = B fully on screen.

### 9.2 Mix (D-1)
A straightforward cross-dissolve. Press **MIX**, pick sources on both buses (Matte allowed), move the lever. Image A fades out as B fades in, proportional to lever travel.

### 9.3 NAM — Non-Additive Mix (D-2)
Press **NAM** and park the lever at **center**. Instead of averaging the two pictures like Mix does, NAM compares them by brightness: at each point on screen, the **lighter** of the two images wins and replaces the darker one. The result is a luminance-based composite — bright titles, lights, or highlights from one source punch through the dark areas of the other. Moving the lever off-center biases which bus dominates; the manual notes that at center-lever you see "the brighter part of each respective scene," as opposed to Mix which just blends everything.

### 9.4 Wipe (D-3)

The deepest feature of the unit: **287 wipe pattern combinations**, all built compositionally.

**Basic operation:** press **WIPE**, select A and B sources, choose a pattern, move the lever (or Auto Take). 

**The pattern system — how the 287 patterns are built:**
- **7 Pattern Select buttons** (each cycles through 4 variants when pressed repeatedly):
  1. **Straight** — straight-line wipes from each screen edge
  2. **Corner** — square growing from each of the 4 corners
  3. **Diagonal** — diagonal-line wipes
  4. **Triangle** — triangle from each edge
  5. **Split** — image splits open from center (3 variants: V, H, cross)
  6. **Mosaic Wipe** — wipe boundary made of mosaic blocks / staircase / random-block patterns
  7. **Square** — centered shape growing outward: square → circle → oval → diamond
- **Modify buttons** stack on top of the base pattern:
  - **COMPRESSION** — pressed once: the incoming scene is *compressed* (fully visible, scaled down) inside the wipe shape rather than cropped, so it wipes in as a shrinking/growing whole picture. Pressed twice: **both** A and B are compressed and wipe in/out together.
  - **SLIDE** — pressed once: one image *slides* over the other into frame. Pressed twice: both images slide in/out over each other.
  - **MULTI (wipe)** — multiplies the wipe pattern into vertical or horizontal repeats, up to 6 variations per pattern (6 multi modes).
  - **PAIRING** — creates a paired/mirrored wipe scene; combinable with Multi.
  - **BLINDS** — the wipe happens as venetian-blind strips; works with Split, Triangle, Diagonal, Corner, and Straight patterns.
- **Illegal combinations** are handled automatically: the Modify LED goes out, or the unit falls back to the Straight Wipe.
- Every valid combination has a number (001–255 displayable) shown on the **Wipe Pattern Indicator**, and the full matrix is printed in the manual's Pattern Table. Reading the table: 001 = normal wipe, adding 128 (e.g., 129) = the same wipe reversed.

**Wipe Edge — how it works:**
- **BORDER button:** 1st press = narrow border line between the two images, 2nd = wide border, 3rd = off. The border color is the **complementary color** of the currently selected Matte color (choose with the Matte SELECT buttons).
- **SOFT button:** narrow or wide *soft* (feathered) edge instead — no color involved.

**Wipe Direction — how it works:**
- **ONE-WAY:** normally the wipe alternates direction each time you swing the lever; with One-Way engaged, it travels the same direction every time.
- **REVERSE:** mirrors the wipe's direction of movement.
- **ONE-WAY + REVERSE together:** produces symmetrical screen wiping.

**Aspect control:** for Square-family patterns, the ASPECT knob stretches the pattern vertically (Aspect V) or horizontally (Aspect H).

### 9.5 Luminance Key (D-4)
Keys the B-bus onto the A-bus based on brightness.

**How it works:**
1. Move the lever fully to **B-bus**.
2. Press **LUM KEY**.
3. Turn the **SLICE control** to set the luminance threshold: everything in the B-bus image darker than the slice level becomes transparent, revealing the A-bus behind it (classic white-title-on-black keying).
4. Bonus: easing the lever back toward A mixes the keyed result with the background for a translucent-key effect.

### 9.6 Chroma Key (D-5)
Keys the B-bus onto the A-bus based on a chosen color (e.g., green-screen).

**How it works:**
1. Lever fully to **B-bus**; press **CHROMA KEY**.
2. Set **SLICE** to center as a starting point.
3. Turn **HUE** to dial in the exact color to be removed from the B-bus image.
4. Fine-tune **SLICE** for a clean key edge.
- The B-bus is always the key source. The manual strongly recommends a well-lit, stable subject on the key bus; lever-toward-A again yields a mix of keyed and unkeyed images.

### 9.7 Pattern Table & external control (D-6)
- 287 patterns exist, but the RS422 protocol can only address numbers 001–255, and the AG-A800 edit controller can only call patterns 01–99 (calling "99" triggers whatever pattern is currently set up on the mixer — a clever escape hatch).
- Functions are also addressable as pseudo-pattern numbers from the controller: Special Modes 1–5 = 055–059 (reverses 184–186), NAM = 060, LUM KEY = 061, CHROMA KEY = 062.
- Patterns marked ○ in the table work on the panel but can't be called externally; blank boxes are invalid combinations.

---

## 10. Downstream Key — DSK (E)

The DSK sits after all other effects and is purpose-built for superimposing titles/characters (a "telopper"), typically from the optional WJ-KB50 Character Generator or a camera shooting a title card.

**How it works, step by step:**
1. Start with **Low Level Key slide** at bottom, **High Level Key slide** at top (these two sliders set the luminance window that defines what counts as "title").
2. Mix/Wipe lever to the **B-bus** position.
3. Choose the **fill**: **MATTE** (fills the keyed characters with the selected Matte Generator color) or **WHITE** (fills with white).
4. Choose the **key source**: **EXT. CAMERA** (the dedicated external camera input), or the **A / B bus** itself.
5. Press **ON** — the fill color appears in the keyed characters.
6. Trim the **Low Level** slider (and High Level as needed) until the character edges are clean.

**Title card technique:** white lettering on a black card → adjust the *Low* level control for a clean edge; black lettering on a white card → adjust the *High* level control. When using the WJ-KB50 keyboard, set both key level sliders to the low end.

**Extras:**
- **EDGE button:** cycles through two edge types (shadow, border) in five styles total — Normal → Narrow Border → Wide Border → Narrow Shadow → Wide Shadow → Drop Shadow. When the key is white, the edge can be colored with any of the 9 matte colors (solid or graded via GRADATION); when the key fill is a matte color, the edge is always black.
- **REVERSE button:** inverts key polarity, swapping which luminance range is treated as characters vs. background (e.g., white-on-black card becomes dark text knocked out of the background).

---

## 11. Fade Control (F)

Fades are the final stage. The design principle: **Video, DSK, and Audio each have their own enable button**, and any combination fades together from one lever move.

**How it works:**
- **Enable buttons:** VIDEO (80), DSK (82), AUDIO (84). Whichever are lit will fade; if none are lit the fade section is disabled.
- **Fade target buttons** choose what the video fades *to*: **MATTE** (selected matte color), **WHITE**, **BLACK**, **A** (uneffected A-bus video), or **B** (uneffected B-bus video).
- **Manual fade:** slide the **Fade Control lever** from IN to OUT. The IN/OUT LEDs blink while a fade is incomplete and go solid when fully in/out.
- **Auto Fade:** set the **TRANSITION control** (0–510 frames in 2-frame steps, shown on the Auto Fade Time indicator), press **AUTO FADE**. Pressing it again mid-fade pauses (the enabled button's LED blinks); pressing again resumes.

**Behavioral details worth knowing:**
- Fading to MATTE/WHITE/BLACK silences the program audio if Audio fade is enabled — but fading to **A or B** keeps that bus's audio (plus Aux 1/2) running.
- Selective fading enables tricks: fade VIDEO only while DSK stays un-faded → the picture disappears but the title remains on screen.
- Fading everything to B-bus = the entire effected composite melts back to clean B video/audio (Aux/mic audio persists unless also faded).
- Headphone monitoring never fades.

---

## 12. Audio Follow (G)

Automates the audio crossfade during transitions.

**How it works:** press **AUDIO FOLLOW**, and the A-bus/B-bus audio levels are automatically mixed in proportion to the **Mix/Wipe Lever** position — lever at A = full A audio, at center = both, at B = full B audio. So a video wipe/mix carries its audio with it, hands-free. Aux 1 and Mic/Aux 2 are deliberately excluded: they stay under their own faders so music or narration remains constant across the transition.

---

## 13. Event Memory (H-1)

Stores complete panel states — 8 memories.

**How it works:**
- **Store:** set up the panel exactly as desired → press **MEMORY** → press an **EVENT NO. button** (1–4; hold SHIFT for memories 5–8). The event LED blinks 3 times to confirm.
- **Recall:** press the EVENT NO. button (SHIFT first for 5–8), then **AUTO TAKE** to execute.
- **Sequential playback:** repeated presses of AUTO TAKE step through the stored memories in numerical order, skipping empty slots — a simple show-automation feature.
- **Clear all:** power off, then hold **MEMORY + SHIFT** while powering on.
- **Persistence:** battery-backed for only a few days with the Main Power switch off; general button states persist about 1 week.

---

## 14. Special Modes (H-2)

Eight factory-preset effect macros, accessed by pressing **MEMORY + SHIFT simultaneously** (MEMORY LED blinks = Special Mode active), then an Event button (SHIFT for 5–8). Each runs via the Mix/Wipe Lever, Auto Take, or an external GPI/RS422 controller:

1. **Mosaic Mix** — the transition itself becomes mosaic-pixelated mid-mix.
2. **Stream** — a compressed image zooms in from a corner (two corners selectable via the Positioner Joystick).
3. **Cork Screw** — compressed image corkscrews in from a corner.
4. **Bounce** — compressed image drops in and bounces.
5. **Flip** — vertical split compressed wipe over the Matte color.
6. **Shutter** — horizontal split wipe from B-bus to Matte color (becomes a Circle Wipe variant if the Square Wipe button is active). Lever must be at B before starting.
7. **Vibrate** — horizontal shake of the B-bus lasting 64 video frames. Lever at B first.
8. **Satellite** — the compressed B-bus image orbits inside the A-bus image; started/stopped with Auto Take or GPI. Lever at B first; the mode stays engaged until another mode/function is selected.

Exit Special Mode by pressing MEMORY + SHIFT again.

---

## 15. Auto Take (H-3)

Motorless "lever move" — executes the selected transition automatically.

- **Standard Auto Take:** set up the wipe pattern/digital effect, choose the transition type (NAM/MIX/WIPE/LUM KEY/CHROMA KEY), dial the **TRANSITION control** (0–510 frames, 2-frame steps), press **AUTO TAKE**. Press again mid-take to pause (bus LEDs blink), again to resume.
- **Memory Auto Take:** recall an Event memory, press AUTO TAKE to perform it; the next event number is armed automatically, so successive presses walk through the stored show.

---

## 16. Combination Recipes (H-4)

The manual documents several "power user" stacks that show how the blocks combine:

- **Auto-Take double effect:** same source on both buses, different digital effects on each (e.g., Paint+Strobe on A, Nega on B), transition time at MIN → AUTO TAKE instantly snaps between two effected versions of the same picture.
- **Mosaic Spotlight:** same source both buses; Mosaic on B; Square wipe + Positioner → a movable mosaic "censor block"/spotlight region within a normal picture. Add BORDER to outline it, REVERSE and/or MONO to highlight further.
- **After Image:** same source both buses, STROBE + MIX, tune TIME + lever position → motion leaves ghost after-images; add A/V SYNCHRO to pulse it with music.
- **Multi/Live mixing:** MULTI + COMPRESSION + Square wipe + STROBE → a live picture inset over a grid of still images, position via joystick.
- **Picture-in-Picture:** Square wipe + COMPRESSION + Positioner; lever sets the inset size; SCENE GRABBER freezes the inset. Only the square wipe PiP can be stored to Event Memory.

---

## 17. Editing System Interface

### GPI (General Purpose Interface)
A single BNC contact input that fires **Auto Take** on the **falling edge** of the pulse. Enabling it requires opening the case and setting internal DIP switch SW702-1 (factory OFF).

### RS422
For the AG-A800 Editing Controller. Selected with the rear RS422/RS232C switch. The controller can trigger transitions and call wipe patterns 01–99 (with pattern 99 = "whatever is currently set on the mixer"). Event Memory can be tied to the controller's **DSK IN/OUT points**: at DSK-IN the event starts, at DSK-OUT it finishes — with rules: regular DSK and Event Memory can't be used simultaneously, KEY IN/OUT transition time must be 0, and the event's transition time must be shorter than the DSK IN→OUT window.

### RS232C
For a modem/PC. Internal DIP switches (SW701) configure bit length (7/8), stop bits (1/2), parity (on/off, odd/even), and baud rate (2.4/4.8/9.6/19.2 kbps). The manual provides the 25-pin↔9-pin DCE wiring table.

### A/B-Roll timing outputs
Black Burst, Advance Sync (for VTRs without TBC), and Advance Reference (for VTRs with TBC) keep the two players, recorder, and mixer frame-locked. The manual repeatedly warns that without these, edit accuracy suffers and Compression/Trail effects won't record properly.

---

## 18. System & Housekeeping Features

- **Reset ON/OFF switch (rear):** ON = every power-up returns to factory preset (recommended; guards against odd states after power failure). OFF = "field preset" — the unit remembers its state at power-off (except Still, Strobe, Special functions) and restores it.
- **Demo switch:** ON runs a preprogrammed demonstration of the mixer's effects on the attached monitor.
- **Memory backup:** all button modes held ~1 week without AC power.
- **Standby architecture:** rear MAIN POWER switch puts the unit in standby; the front POWER button wakes it. If Reset is OFF and main power was off >a few days, the unit powers straight on with main power. Powering on can also be triggered by the AG-A800.
- **Power-off order with AG-A800:** turn the AG-A800 off *first*; the MX50 can't be turned off by itself while the controller is on.

---

## 19. Specifications Snapshot

| Item | Value |
|---|---|
| Video standard | NTSC, 1.0 Vp-p/75 Ω |
| Sampling | 4:1:1, Y = 14.3 MHz, 8-bit component |
| Frequency response | Y/C & composite 4.5 MHz (−3 dB); audio 20 Hz–20 kHz (−3 dB) |
| S/N | 56 dB (S-Video), 50 dB (composite), 70 dB (audio @ 1 kHz) |
| Wipe patterns | 287 |
| Digital effects | Nega, Mosaic, Mono, Paint, Still, Strobe, Multi, Trail, A/V Synchro, Frame |
| Matte colors | 9 |
| Power | 120 V AC 60 Hz; ~45 W operating, ~5 W standby |
| Dimensions / weight | 480 × 164 × 396 mm; 6.8 kg (15 lbs) |
