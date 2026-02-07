# FruitRx

### *Reimagining the Prescription Experience Through Organic Digital Wellness*

> *"Where technology meets nature, and savings bloom like wildflowers across an infinite azure desktop."*

---

**[Launch the Experience](https://williamsharkey.github.io/fruitigerAeroRx/)**

---

## The Vision

FruitRx represents a holistic brand-wide redesign of the prescription savings platform, grounded in principles of **transparency**, **organic computing**, and **aquatic serenity**. Every pixel has been crafted to evoke the feeling of sunlight filtering through crystal-clear water onto a brushed titanium surface.

Our design language draws from the golden era of human-computer harmony — when interfaces breathed, when glass was real, and when every gradient told a story about the relationship between the user and their wellness journey.

## Platform Architecture

```mermaid
graph TD
    A["User Arrives"] --> B["Ambient Piano Awakens"]
    B --> C["Eevee Materializes"]
    C --> D{"User Explores"}
    D --> E["Browse Medications"]
    D --> F["Receive Presidential Correspondence"]
    D --> G["Encounter the Knowledge Web"]
    E --> H["Glass Panels Reveal Savings"]
    F --> I["Coupon Codes Manifest"]
    G --> J["Words Spiral Around Cursor"]
    H --> K["Cart Fills With Wellness"]
    I --> K
    J --> K
    K --> L["Inner Peace Achieved"]

    style A fill:#e8f4fd,stroke:#4a90d9,color:#1a3660
    style L fill:#e8f9e8,stroke:#5a9e2a,color:#1a5c1a
    style C fill:#fdf8d0,stroke:#d4c478,color:#6b5a1e
```

## Eevee: Your Wellness Companion

Eevee is a next-generation AI wellness guide powered by dual-layer vocal synthesis. She communicates through a proprietary blend of **SAM.js formant synthesis** and **neural TTS**, layered simultaneously to produce an ethereal vocal texture reminiscent of cathedral acoustics.

Her voice is routed through a custom Web Audio signal chain:

```mermaid
graph LR
    A["SAM.js<br/>Formant Engine"] --> B["Pitch Mapper<br/>MIDI Sync"]
    B --> C["Gain Stage"]
    C --> D["Convolver<br/>4.5s Cathedral IR"]
    C --> E["Feedback Delay<br/>350ms / 40%"]
    E --> D
    D --> F["Wet Mix 70%"]
    C --> G["Dry Mix 25%"]
    F --> H["Output"]
    G --> H
    I["ResponsiveVoice<br/>TTS Layer"] --> H

    style A fill:#f0e8ff,stroke:#8a6cc4
    style D fill:#e8f0ff,stroke:#4a7cc4
    style H fill:#e8ffe8,stroke:#4a9e4a
```

Each word Eevee speaks is pitched to match the currently playing MIDI note, creating a singing effect that harmonizes with the ambient piano. The result is simultaneously intelligible and dreamlike.

## Audio Ecosystem

The ambient soundscape features classical piano rendered through a real-time MIDI engine with GM soundfont synthesis. The playlist rotates through carefully curated compositions:

| | Composer | Work |
|---|---|---|
| 1 | Satie | Gymnopedie No. 1 |
| 2 | Debussy | Clair de Lune |
| 3 | Chopin | Nocturne Op.9 No.2 |
| 4 | Chopin | Raindrop Prelude |
| 5 | Bach | Prelude in C Minor |
| 6 | Rachmaninov | Variation 18 (Paganini) |
| 7 | Satie | Gymnopedie (Cello) |
| 8 | Satie | Gymnopedie (Flute) |
| 9 | Satie | Gymnopedie (Violin) |

All MIDI data is embedded as base64 to ensure zero-latency playback with no external dependencies.

## Interactive Design System

```mermaid
graph TD
    subgraph Drug Cards
        A["Background Image Layer<br/>Parallax: shifts opposite to cursor"] --- B["Glass Overlay<br/>blur 10px + saturate 1.3"]
        B --- C["Text Layer<br/>Follows cursor up to 10px"]
    end

    subgraph Hover Response
        D["Mouse Enter"] --> E["Noise Whoosh SFX"]
        D --> F["Background Parallax Activates"]
        D --> G["Glass Follows Cursor"]
        D --> H["Eevee Narrates"]
    end

    style A fill:#d4e8f4,stroke:#4a7ca0
    style B fill:#ffffff88,stroke:#ccc
    style C fill:#fff,stroke:#4a7ca0
```

Drug cards feature a three-layer depth system. The background image shifts in the opposite direction of the cursor. The frosted glass overlay tracks the cursor position proportionally. The combined effect produces a physical sensation of looking through a window into a verdant pharmaceutical landscape.

## Presidential Communications Module

Periodic email notifications arrive from the Executive Office, rendered in the classic Outlook 2007 notification style. Each message is read aloud by a dedicated male voice synthesis engine while Eevee provides commentary. The notification includes an official portrait and a unique algorithmically-generated coupon code.

```mermaid
sequenceDiagram
    participant S as System
    participant E as Eevee
    participant T as Presidential Voice
    participant U as User

    S->>E: Notification triggered
    E->>U: "You have a new email from the President."
    Note over E: Sung with reverb
    E-->>T: Speech complete
    T->>U: Reads full email subject + body
    Note over T: Male voice, uninterruptible
    T-->>S: Reading complete
    Note over U: Coupon code revealed
```

## Technology

| Layer | Implementation |
|---|---|
| Voice Synthesis | SAM.js + ResponsiveVoice (simultaneous) |
| Audio Engine | Web Audio API, Soundfont-player, MIDI-player-js |
| Reverb | Synthetic impulse response, 4.5s decay |
| Echo | Feedback delay network, 350ms |
| Visual FX | CSS backdrop-filter, requestAnimationFrame parallax |
| Fish | Autonomous ecosystem with predation, growth, and reproduction |

## Development

```bash
# Serve locally
python3 -m http.server 8888

# Visit
open http://localhost:8888
```

No build step. No bundler. No node_modules. Just glass, gradients, and the sound of piano keys falling like rain on a sun-drenched ocean.

---

<p align="center">
  <i>FruitRx: Because your health journey deserves a soundtrack.</i>
</p>
