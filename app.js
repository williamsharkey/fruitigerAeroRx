/* =========================================================
   FruitRx Interactive Layer
   Eevee assistant, ambient music, water trail, SFX, TTS
   ========================================================= */

(function () {
  "use strict";

  // ---- STATE ----
  var S = {
    muted: false,         // Eevee mute toggle
    musicPlaying: false,
    currentTrack: Math.floor(Math.random() * 9),  // Random starting track
    audioReady: false,
    spokenSets: {},       // tracks which scripts played per div id
    lastSpokenDiv: null,
    speakQueue: [],
    speaking: false,
    visibleDivs: [],
    speakCooldown: false,
    mouseX: 0, mouseY: 0,
    trail: [],
    trailCanvas: null,
    trailCtx: null,
    knowledgeWeb: null,
    currentNoteFreq: 0,   // most recently played note frequency for pitch-matching
    cart: [],              // shopping cart items [{name, generic, price, original, discount, img, slug}]
    kwSpinBoost: 0,        // knowledge web explosion spin boost
    kwRadiusBoost: 0,      // knowledge web explosion radius boost
    kwSizeBoost: 0,        // knowledge web explosion font size boost
    kwExploding: false,    // knowledge web currently exploding
    kwHoverReverse: false, // reverse spin when hovering drug card
    trumpSpeaking: false,  // true while Trump is reading an email - cannot be interrupted
  };

  // ---- CONSTANTS ----
  var SPEAK_CHANCE = 0.3;
  var TRAIL_MAX = 120;
  var TRAIL_FADE = 0.92;
  var KNOWLEDGE_WORDS = ["Knowledge", "Health", "Humanity", "Economics", "Globalism", "Wellness"];

  // ================================================================
  // 1. AUDIO CONTEXT (lazy init on first user gesture)
  // ================================================================
  var actx = null;
  var _audioUnlocked = false;
  var _speechUnlocked = false;
  var _unmuteAudioEl = null;
  var _activeUtterance = null; // prevent iOS GC of SpeechSynthesisUtterance

  function ensureAudio() {
    if (actx) {
      // Resume if suspended or interrupted (Safari non-standard state)
      if (actx.state === "suspended" || actx.state === "interrupted") {
        actx.resume().catch(function() {});
      }
      return actx;
    }
    actx = new (window.AudioContext || window.webkitAudioContext)();
    S.audioReady = true;
    actx.onstatechange = function() {
      if (actx.state === "suspended" || actx.state === "interrupted") {
        // Will resume on next user gesture
      }
    };
    return actx;
  }

  // Play silent buffer to unlock iOS audio hardware
  function _playSilentBuffer(ctx) {
    try {
      var buf = ctx.createBuffer(1, 1, ctx.sampleRate || 22050);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch(e) {}
  }

  // Silent looping <audio> element bypasses iOS hardware mute switch
  function _createMuteSwitchBypass() {
    if (_unmuteAudioEl) return;
    try {
      _unmuteAudioEl = document.createElement("audio");
      _unmuteAudioEl.controls = false;
      _unmuteAudioEl.preload = "auto";
      _unmuteAudioEl.loop = true;
      _unmuteAudioEl.src = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==";
      var p = _unmuteAudioEl.play();
      if (p && p.catch) p.catch(function() {});
    } catch(e) {}
  }

  // Unlock speechSynthesis with empty utterance on first gesture
  function _unlockSpeechSynthesis() {
    if (_speechUnlocked) return;
    _speechUnlocked = true;
    try {
      if (window.speechSynthesis) {
        var u = new SpeechSynthesisUtterance("");
        u.volume = 0;
        speechSynthesis.speak(u);
        speechSynthesis.getVoices();
      }
    } catch(e) {}
  }

  // Master unlock — called on first user gesture
  function _unlockAllAudio() {
    var ctx = ensureAudio();
    if (ctx.state === "suspended" || ctx.state === "interrupted") {
      ctx.resume().catch(function() {});
    }
    if (!_audioUnlocked) {
      _audioUnlocked = true;
      _playSilentBuffer(ctx);
      _createMuteSwitchBypass();
    }
    _unlockSpeechSynthesis();
  }

  // Re-unlock after tab switch / lock screen / phone call
  function _handleInterruptRecovery() {
    if (actx && (actx.state === "suspended" || actx.state === "interrupted")) {
      actx.resume().catch(function() {});
      _playSilentBuffer(actx);
    }
    if (_unmuteAudioEl && _unmuteAudioEl.paused) {
      var p = _unmuteAudioEl.play();
      if (p && p.catch) p.catch(function() {});
    }
  }

  // ================================================================
  // 2. SOUND EFFECTS
  // ================================================================
  function playSfx(type) {
    if (!S.audioReady) return;
    var ctx = actx;
    if (ctx.state === "suspended" || ctx.state === "interrupted") {
      ctx.resume().catch(function() {});
    }
    var osc, gain, now = ctx.currentTime;

    if (type === "click") {
      osc = ctx.createOscillator(); gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.1);
    }
    else if (type === "scroll") {
      osc = ctx.createOscillator(); gain = ctx.createGain();
      var filt = ctx.createBiquadFilter();
      filt.type = "lowpass"; filt.frequency.value = 600;
      osc.type = "triangle"; osc.frequency.setValueAtTime(200 + Math.random() * 100, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.15);
    }
    else if (type === "startup") {
      // XP-style ascending chord
      [523, 659, 784, 1047].forEach(function (f, i) {
        osc = ctx.createOscillator(); gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.value = f;
        gain.gain.setValueAtTime(0, now + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.08, now + i * 0.12 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.8);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * 0.12); osc.stop(now + i * 0.12 + 0.8);
      });
    }
    else if (type === "goodbye") {
      [784, 659, 523, 392].forEach(function (f, i) {
        osc = ctx.createOscillator(); gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.value = f;
        gain.gain.setValueAtTime(0, now + i * 0.15);
        gain.gain.linearRampToValueAtTime(0.06, now + i * 0.15 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.6);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * 0.15); osc.stop(now + i * 0.15 + 0.6);
      });
    }
    else if (type === "water") {
      var buf = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * 0.02;
      var src = ctx.createBufferSource(); src.buffer = buf;
      var f2 = ctx.createBiquadFilter(); f2.type = "bandpass";
      f2.frequency.value = 1000 + Math.random() * 2000; f2.Q.value = 8;
      gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      src.connect(f2); f2.connect(gain); gain.connect(ctx.destination);
      src.start(now);
    }
    else if (type === "hover") {
      // Subtle filtered noise whoosh instead of beepy oscillator
      var dur = 0.15;
      var buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      var d2 = buf.getChannelData(0);
      for (var j2 = 0; j2 < d2.length; j2++) d2[j2] = (Math.random() * 2 - 1);
      var src2 = ctx.createBufferSource(); src2.buffer = buf;
      var filt = ctx.createBiquadFilter();
      filt.type = "bandpass"; filt.frequency.value = 2000 + Math.random() * 1500; filt.Q.value = 1.5;
      gain = ctx.createGain();
      gain.gain.setValueAtTime(0.025, now);
      gain.gain.linearRampToValueAtTime(0.04, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src2.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
      src2.start(now);
    }
  }

  // ================================================================
  // 3. REAL MIDI MUSIC ENGINE (soundfont-player + midi-player-js)
  // ================================================================
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  var MIDI_FILES = [
    { file: "midi/Gymnopedie1.mid", name: "Satie - Gymnop\u00e9die No.1" },
    { file: "midi/debussy-clair-de-lune.mid", name: "Debussy - Clair de Lune" },
    { file: "midi/chopin-nocturne-op9-no2.mid", name: "Chopin - Nocturne Op.9 No.2" },
    { file: "midi/prelude15.mid", name: "Chopin - Raindrop Prelude" },
    { file: "midi/bach-prelude-in-cm-piano.mid", name: "Bach - Prelude in C minor" },
    { file: "midi/rachmaninov-var18-orch.mid", name: "Rachmaninov - Variation 18 (Paganini)" },
    { file: "midi/Satie-Gymnopedie1-cello-piano.mid", name: "Satie - Gymnop\u00e9die (Cello)" },
    { file: "midi/Satie-Gymnopedie1-flute-piano.mid", name: "Satie - Gymnop\u00e9die (Flute)" },
    { file: "midi/Satie-Gymnopedie1-violin-piano.mid", name: "Satie - Gymnop\u00e9die (Violin)" }
  ];
  var TOTAL_TRACKS = MIDI_FILES.length;

  var sfInstrument = null; // soundfont-player instrument instance
  var midiPlayer = null;   // MidiPlayer.Player instance
  var sfLoading = false;

  function loadSoundfont(cb) {
    if (sfInstrument) { if (cb) cb(); return; }
    if (sfLoading) return;
    sfLoading = true;
    var ctx = ensureAudio();
    Soundfont.instrument(ctx, "acoustic_grand_piano", { gain: 0.864 }).then(function(inst) {
      sfInstrument = inst;
      sfLoading = false;
      if (cb) cb();
    }).catch(function() { sfLoading = false; });
  }

  function playMidiTrack(trackIdx) {
    if (!S.audioReady || !sfInstrument) return;
    if (midiPlayer) { midiPlayer.stop(); midiPlayer = null; }

    var info = MIDI_FILES[trackIdx % TOTAL_TRACKS];
    var player = new MidiPlayer.Player(function(event) {
      if (!S.musicPlaying) return;
      if (event.name === "Note on" && event.velocity > 0) {
        var freq = midiToFreq(event.noteNumber);
        S.currentNoteFreq = freq;
        sfInstrument.play(event.noteName || event.noteNumber, actx.currentTime, {
          gain: (event.velocity / 127) * 0.84,
          duration: 2
        });
      }
    });

    // When track ends, advance to next
    player.on("endOfFile", function() {
      if (S.musicPlaying) {
        S.currentTrack = (S.currentTrack + 1) % TOTAL_TRACKS;
        updateMusicBtn();
        setTimeout(function() { playMidiTrack(S.currentTrack); }, 500);
      }
    });

    // Load MIDI from embedded data or fetch as fallback
    if (window.MIDI_DATA && MIDI_DATA[info.file]) {
      // Use embedded base64 data
      player.loadDataUri("data:audio/midi;base64," + MIDI_DATA[info.file]);
      midiPlayer = player;
      player.play();
    } else {
      // Fallback: try to fetch (works when served via http://)
      fetch(info.file).then(function(r) { return r.arrayBuffer(); }).then(function(buf) {
        var arr = new Uint8Array(buf);
        var b64 = "";
        for (var i = 0; i < arr.length; i++) b64 += String.fromCharCode(arr[i]);
        player.loadDataUri("data:audio/midi;base64," + btoa(b64));
        midiPlayer = player;
        player.play();
      }).catch(function(err) {
        console.warn("MIDI load failed:", info.file, err);
      });
    }
  }

  function startMusic() {
    ensureAudio();
    S.musicPlaying = true;
    updateMusicBtn();
    loadSoundfont(function() {
      playMidiTrack(S.currentTrack);
    });
  }
  function stopMusic() {
    S.musicPlaying = false;
    if (midiPlayer) { midiPlayer.stop(); midiPlayer = null; }
    updateMusicBtn();
  }
  function nextTrack() {
    S.currentTrack = (S.currentTrack + 1) % TOTAL_TRACKS;
    if (S.musicPlaying) { if (midiPlayer) midiPlayer.stop(); playMidiTrack(S.currentTrack); }
    updateMusicBtn();
  }
  function prevTrack() {
    S.currentTrack = (S.currentTrack + TOTAL_TRACKS - 1) % TOTAL_TRACKS;
    if (S.musicPlaying) { if (midiPlayer) midiPlayer.stop(); playMidiTrack(S.currentTrack); }
    updateMusicBtn();
  }
  function updateMusicBtn() {
    var btn = document.getElementById("playPauseBtn");
    if (btn) btn.textContent = S.musicPlaying ? "||" : "\u25B6";
    var lbl = document.getElementById("trackLabel");
    var name = MIDI_FILES[S.currentTrack % TOTAL_TRACKS].name;
    if (lbl) lbl.textContent = (S.currentTrack + 1) + "/" + TOTAL_TRACKS + " " + name;
  }

  // Deterministic drug melody using soundfont (or oscillator fallback)
  var SCALES = [
    [0,2,4,7,9], [0,2,3,7,8], [0,2,4,5,7,9,11], [0,2,3,5,7,8,10], [0,2,4,7,9,12,14]
  ];

  // ================================================================
  // 4. EEVEE SCRIPTS DATABASE (10+ per major section)
  // ================================================================
  var SCRIPTS = {
    "parody-banner": [
      "Welcome to the future of prescription pricing. Your health journey starts here.",
      "Every price you see reflects our commitment to making healthcare accessible for all Americans.",
      "Transparent pricing is the foundation of patient trust. We take that seriously.",
      "Our mission is simple: world-class medications at prices every family can afford.",
      "Pricing verified and updated daily to ensure you always see the most current savings.",
      "Your wellness is our priority. Let us help you navigate your prescription options.",
      "Empowering patients with clear, honest pricing information since day one.",
      "No hidden fees. No surprise costs. Just straightforward prescription savings.",
      "We believe every American deserves access to affordable medication.",
      "Innovation in pricing, excellence in care. That is the TrumpRx promise."
    ],
    "hero": [
      "Welcome to TrumpRx. Prescription savings designed around you and your family.",
      "Americans have been paying up to ten times more for the exact same medications. That changes now.",
      "The same factories, the same formulas, the same dosages. Only the price is different.",
      "Most-Favored-Nation pricing means America gets the same deal as the rest of the world.",
      "One thousand percent markup on life-saving medication. That was the old normal.",
      "This is the intersection of policy and possibility.",
      "Every prescription filled at these prices is a small victory for American families.",
      "The future of pharmacy is transparent, accessible, and beautifully simple.",
      "Imagine a world where medication costs what it should. Welcome to that world.",
      "This is not just a price list. It is a promise to every patient in America."
    ],
    "comparison": [
      "Gonal-F at ninety-three percent off. From fourteen hundred to one-sixty-eight dollars.",
      "The global reference price is what Canada pays. Now America matches it.",
      "Most-Favored-Nation pricing benchmarks against the lowest price in the developed world.",
      "This comparison shows the gap between what Americans were paying and what they should pay.",
      "A single pen of Gonal-F cost nearly fifteen hundred dollars. Not anymore.",
      "The Canadian reference price of three-fifty-five is a fraction of the US price.",
      "Price transparency is the first step toward price fairness.",
      "When you see ninety-three percent off, you are seeing the correction of a decade of overcharging.",
      "These are not theoretical savings. These are real prices available right now.",
      "Global benchmarking ensures no American pays more than any other developed nation."
    ],
    "trump-widgets": [
      "Reach out to our team anytime. We are always available to assist you.",
      "Direct communication with leadership ensures your voice is heard.",
      "Big Pharma price gouging is over. That is straight from the top.",
      "The executive office is committed to your prescription savings.",
      "The most impactful prescription price reset in American history.",
      "Our leadership team is available and ready to serve you.",
      "Headquarters in Washington, D.C. The Prescription Pricing Division is here for you.",
      "Every American gets the lowest price in the developed world. That is the mission.",
      "Connecting you directly with the people making these savings possible.",
      "More money in your pocket. Care back within reach. That is our vision."
    ],
    "medications": [
      "Forty-three medications and counting. Sorted by discount, the biggest savings come first.",
      "Wegovy Pill at one-forty-nine a month, down from thirteen-forty-nine. Eighty-nine percent off.",
      "Ozempic, Wegovy, Zepbound. The GLP-1 drugs are all here at dramatically reduced prices.",
      "Cetrotide leads the list at ninety-three percent off. Twenty-two fifty instead of three-sixteen.",
      "Each card links directly to the full detail page for that medication.",
      "Explore our complete catalog of medications with nature-inspired presentation.",
      "Zepbound by Eli Lilly at two-ninety-nine. Was over a thousand dollars.",
      "Even at fifty percent off, these savings add up to thousands per year for many patients.",
      "Every medication shown is available through participating retail pharmacies nationwide.",
      "Search and sort to find your medication in seconds."
    ],
    "nature-panel": [
      "Next-generation prescriptions, available today. The future of accessible healthcare.",
      "Nature inspires our commitment to wellness. Pure ingredients, pure intentions.",
      "Live optimized. That is not just a tagline, it is what affordable medication enables.",
      "The most beautiful things in nature are also the most essential. Like your health.",
      "Pharmacological breakthroughs should not be reserved for the wealthy few.",
      "Behind every price reduction is a family that can now afford their medication.",
      "Nature and innovation together. That is the spirit of modern medicine.",
      "Real savings for real patients. That is our commitment every single day.",
      "Healthcare that works for everyone. That is the goal we pursue relentlessly.",
      "Affordable, accessible, available. The three pillars of modern pharmacy."
    ],
    "faq": [
      "Frequently asked questions, answered clearly. No hidden fine print.",
      "TrumpRx is free to use. You only pay the listed price for your medication.",
      "No account needed to browse. Just bring your prescription and coupon to the pharmacy.",
      "Insurance or no insurance, these prices work for everyone eligible.",
      "Participants cannot be enrolled in Medicare, Medicaid, VA, or TRICARE programs.",
      "Coupon credentials: BIN zero-one-five-nine-nine-five, PCN GDC, Group MAHA.",
      "Prescriptions route through standard e-prescribing protocols nationwide.",
      "Packaging may vary, but active ingredients and dosages are identical.",
      "Claims process instantly at the listed TrumpRx price.",
      "Fully compliant with Most-Favored-Nation provisions of the Inflation Reduction Act."
    ],
    "notify": [
      "New medications are added regularly. Stay connected for the latest updates.",
      "Subscribe to never miss a new saving opportunity.",
      "The catalog is expanding. More drugs, more savings, more access for your family.",
      "Forty-three is just the beginning. More medications are on the way.",
      "Every new medication added is another step toward universal affordability.",
      "Our notification system keeps you informed the moment new prices drop.",
      "From GLP-1 drugs to antibiotics, the range keeps growing every week.",
      "Connected healthcare means you are always in the loop on new savings.",
      "Set it and forget it. Get notified when your medication becomes available.",
      "The future of pharmacy is proactive, not reactive. Stay ahead with us."
    ]
  };

  // Drug-specific scripts for browse page
  var DRUG_SCRIPTS = {
    "cetrotide": [
      "Cetrotide, used in fertility treatments, now at twenty-two fifty. Was over three hundred.",
      "Ninety-three percent off makes this the biggest discount on the entire platform.",
      "Cetrorelix acetate for IVF patients at a fraction of the original cost."
    ],
    "wegovy-pill": [
      "Wegovy pill, the oral semaglutide for weight management. One-forty-nine per month.",
      "Down from thirteen-forty-nine. That's eighty-nine percent savings on a life-changing drug.",
      "Multiple dosage tiers available: 1.5, 4, 9, and 25 milligrams."
    ],
    "ozempic": [
      "Ozempic pen. Semaglutide by Novo Nordisk. Promotional price of one-ninety-nine.",
      "Standard pricing after the promo: three-forty-nine for most doses, four-ninety-nine for 2mg.",
      "Present your TrumpRx coupon at any participating pharmacy. It's that simple."
    ],
    "zepbound": [
      "Zepbound. Tirzepatide by Eli Lilly. Starting at two-ninety-nine for the 2.5mg dose.",
      "Orders go through LillyDirect. Call eight-four-four, five-five-nine, three-four-seven-one.",
      "Seventy-two percent off the original price of over a thousand dollars."
    ],
    "wegovy": [
      "Wegovy pen. The injectable semaglutide. One-ninety-nine per month to start.",
      "Eighty-five percent off retail. These are transformative savings.",
      "Novo Nordisk's flagship weight management drug, now within reach."
    ],
    "bevespi": [
      "Bevespi aerosphere. Glycopyrrolate and formoterol for COPD maintenance. Fifty-one dollars.",
      "Eighty-nine percent savings on a dual-bronchodilator inhaler. Breathe easier, pay less.",
      "Down from four-fifty-eight to fifty-one. A game-changer for COPD patients."
    ],
    "duavee": [
      "Duavee. Conjugated estrogens with bazedoxifene for menopausal symptoms. Thirty dollars.",
      "Eighty-five percent off the original two hundred. Hormone therapy made affordable.",
      "A unique combination for hot flashes and osteoporosis prevention, now within reach."
    ],
    "toviaz": [
      "Toviaz. Fesoterodine fumarate for overactive bladder. Forty-three fifty.",
      "Eighty-five percent off. Quality of life medications shouldn't break the bank.",
      "Extended-release formula for 24-hour bladder control at a fraction of the cost."
    ],
    "gonal-f": [
      "Gonal-F. Follitropin alfa for fertility treatment. One-sixty-eight dollars.",
      "Eighty-three percent off. Fertility medication savings that can change family planning.",
      "From nearly a thousand to one-sixty-eight. Making IVF more accessible."
    ],
    "eucrisa": [
      "Eucrisa. Crisaborole ointment for mild-to-moderate eczema. One-fifty-eight.",
      "Eighty percent savings on a non-steroidal topical. Skin relief without the price sting.",
      "Down from seven-ninety-two to one-fifty-eight. Eczema care, affordable at last."
    ],
    "xigduo-xr": [
      "Xigduo XR. Dapagliflozin and metformin for type 2 diabetes. One-eighty-one.",
      "Seventy percent off this dual-action diabetes medication. Two drugs in one tablet.",
      "Combination therapy that simplifies your regimen and your pharmacy bill."
    ],
    "ovidrel": [
      "Ovidrel. Choriogonadotropin alfa for triggering ovulation. Eighty-four dollars.",
      "Sixty-seven percent off. Making fertility treatments more accessible.",
      "From two-fifty-one to eighty-four. The final trigger shot before egg retrieval."
    ],
    "prempro": [
      "Prempro. Combined hormone replacement therapy. Ninety-eight eighty-four.",
      "Sixty-one percent off for conjugated estrogens and medroxyprogesterone.",
      "Menopause management at a price that makes sense."
    ],
    "airsupra": [
      "Airsupra. Albuterol and budesonide combination inhaler. Two hundred one dollars.",
      "Sixty percent off. A rescue inhaler with anti-inflammatory protection built in.",
      "The first dual-action rescue inhaler, now significantly more affordable."
    ],
    "abrilada": [
      "Abrilada. Adalimumab biosimilar for autoimmune conditions. Two-oh-seven sixty.",
      "Sixty percent off. A Humira biosimilar that delivers the same results for less.",
      "Rheumatoid arthritis, Crohn's, psoriasis treatment at a substantial discount."
    ],
    "genotropin": [
      "Genotropin. Somatropin for growth hormone deficiency. Eighty-nine sixty-seven.",
      "Sixty percent off human growth hormone therapy. Pediatric care made more accessible.",
      "From two-twenty-four to under ninety. Growth hormone treatment transformed."
    ],
    "estring": [
      "Estring. Estradiol vaginal ring for menopausal atrophy. Two-forty-nine.",
      "Fifty-seven percent off. Three months of localized estrogen therapy per ring.",
      "Postmenopausal comfort at nearly half the original cost."
    ],
    "protonix": [
      "Protonix. Pantoprazole for GERD and acid reflux. Two hundred ten cents.",
      "Fifty-five percent off this proton pump inhibitor. Stomach relief, budget friendly.",
      "Chronic acid reflux management without the chronic price tag."
    ],
    "premarin": [
      "Premarin. Conjugated estrogens for menopause. Ninety-nine dollars.",
      "Fifty-five percent savings. The classic hormone replacement at modern prices.",
      "From two-seventeen to ninety-nine. Menopausal symptom relief made accessible."
    ],
    "pristiq": [
      "Pristiq. Desvenlafaxine for major depressive disorder. Two hundred ten cents.",
      "Fifty-four percent off. Mental health medication shouldn't be a luxury.",
      "An SNRI antidepressant at half the original cost. Progress on every level."
    ],
    "xeljanz": [
      "Xeljanz. Tofacitinib for rheumatoid arthritis and ulcerative colitis. Fifteen-eighteen.",
      "Fifty-three percent off. JAK inhibitor therapy at a significantly reduced rate.",
      "From thirty-two hundred to fifteen-eighteen. Autoimmune care within reach."
    ],
    "farxiga": [
      "Farxiga. Dapagliflozin for type 2 diabetes and heart failure. One-eighty-one.",
      "Fifty-two percent off an SGLT2 inhibitor with cardiovascular benefits.",
      "Diabetes management with proven heart and kidney protection, now more affordable."
    ],
    "levoxyl": [
      "Levoxyl. Levothyroxine for hypothyroidism. Thirty-five ten.",
      "Fifty-one percent off. Thyroid medication that millions depend on, now cheaper.",
      "From seventy-two to thirty-five. Daily thyroid support at half the cost."
    ],
    "cortef": [
      "Cortef. Hydrocortisone for adrenal insufficiency. Forty-five dollars.",
      "Fifty-one percent off. Essential corticosteroid therapy at a fair price.",
      "Life-sustaining medication for Addison's disease, now significantly discounted."
    ],
    "colestid": [
      "Colestid. Colestipol for high cholesterol. Sixty-seven twenty.",
      "Fifty percent off this bile acid sequestrant. Cholesterol management, simplified.",
      "From one-thirty-five to sixty-seven. Cardiovascular health doesn't have to cost more."
    ],
    "zarontin": [
      "Zarontin. Ethosuximide for absence seizures. Seventy-one ten.",
      "Fifty percent off. Epilepsy medication that's been trusted for decades.",
      "Seizure control for pediatric patients at half the previous price."
    ],
    "chantix": [
      "Chantix. Varenicline to help quit smoking. Ninety-four thirty-four.",
      "Fifty percent off. Investing in quitting just got significantly cheaper.",
      "The leading smoking cessation drug at half price. Your lungs will thank you."
    ],
    "ngenla": [
      "Ngenla. Somatrogon for pediatric growth hormone deficiency. Twenty-two seventeen.",
      "Fifty percent off a once-weekly growth hormone injection. Less frequent, less expensive.",
      "From forty-four hundred to twenty-two hundred. Weekly dosing convenience at half price."
    ],
    "nicotrol": [
      "Nicotrol. Nicotine inhaler for smoking cessation. Two-seventy-one.",
      "Fifty percent off. Another tool in the quit-smoking arsenal, now affordable.",
      "Inhaler-based nicotine replacement therapy at exactly half the original cost."
    ],
    "cytomel": [
      "Cytomel. Liothyronine for thyroid supplementation. Six dollars.",
      "Fifty percent off, down to just six dollars. Thyroid medication for pennies a day.",
      "The most affordable medication on the platform. Six dollars for thyroid support."
    ],
    "diflucan": [
      "Diflucan. Fluconazole for fungal infections. Fourteen oh-six.",
      "Fifty percent off. Antifungal treatment that's now genuinely inexpensive.",
      "From twenty-eight to fourteen dollars. Quick, effective antifungal therapy."
    ],
    "lopid": [
      "Lopid. Gemfibrozil for high triglycerides. Thirty-nine sixty.",
      "Fifty percent off. Lipid management at a price that makes sense.",
      "Triglyceride reduction at half cost. Cardiovascular prevention, budget-friendly."
    ],
    "medrol": [
      "Medrol. Methylprednisolone for inflammation. Three fifteen.",
      "Fifty percent off, and it was already affordable. Three dollars and fifteen cents.",
      "Anti-inflammatory steroid therapy for just over three dollars. Hard to beat."
    ],
    "premarin-vaginal-cream": [
      "Premarin Vaginal Cream. Localized estrogen therapy. Two-thirty-six sixty-five.",
      "Fifty percent off. Targeted menopausal treatment at half the original price.",
      "Conjugated estrogens cream for vaginal atrophy, now significantly more accessible."
    ],
    "tikosyn": [
      "Tikosyn. Dofetilide for atrial fibrillation. Three-thirty-six.",
      "Fifty percent off. Heart rhythm medication at half the original cost.",
      "AFib management with required cardiac monitoring, now at three-thirty-six."
    ],
    "vfend": [
      "Vfend. Voriconazole for serious fungal infections. Three-oh-six ninety-eight.",
      "Fifty percent off. Antifungal therapy for immunocompromised patients.",
      "From six-thirteen to three-oh-six. Critical infection treatment, halved in price."
    ],
    "viracept": [
      "Viracept. Nelfinavir for HIV treatment. Six-oh-seven twenty.",
      "Fifty percent off. Antiretroviral therapy at half the cost.",
      "HIV protease inhibitor at a significantly reduced price. Access matters."
    ],
    "zyvox": [
      "Zyvox. Linezolid for serious bacterial infections including MRSA. One-twenty-two.",
      "Fifty percent off. Last-resort antibiotic therapy at a fair price.",
      "From two-forty-five to one-twenty-two. Fighting resistant bacteria affordably."
    ],
    "azulfidine": [
      "Azulfidine. Sulfasalazine for rheumatoid arthritis and ulcerative colitis. Ninety-nine sixty.",
      "Fifty percent off. Autoimmune management with a decades-proven medication.",
      "Anti-inflammatory treatment for joint and gut conditions at half price."
    ],
    "azulfidine-en-tabs": [
      "Azulfidine EN-Tabs. Enteric-coated sulfasalazine. One-thirty eighty.",
      "Fifty percent off. The gentle-on-stomach version at half the original cost.",
      "Enteric coating means less GI irritation. Same savings, better tolerance."
    ],
    "cleocin": [
      "Cleocin. Clindamycin for serious bacterial infections. Thirty-six fifty-six.",
      "Fifty percent off. A powerful antibiotic at a genuinely low price.",
      "From seventy-three to thirty-six. Fighting bacterial infections affordably."
    ],
    "zavzpret": [
      "Zavzpret. Zavegepant nasal spray for acute migraine. Five-ninety-four.",
      "Fifty percent off. The first CGRP nasal spray for migraines, now more accessible.",
      "Needle-free migraine relief in a nasal spray at half the launch price."
    ],
    "insulin-lispro": [
      "Insulin Lispro. Rapid-acting insulin at twenty-five dollars.",
      "Twenty-five dollars for insulin. That's the kind of pricing that changes lives.",
      "No original price to compare because this is a new access program. Just twenty-five dollars."
    ],
    "default": [
      "Click this card to see full pricing and coupon details on TrumpRx.gov.",
      "Every medication links directly to the official detail page.",
      "Most-Favored-Nation pricing. The world's best price, now yours."
    ]
  };

  // ================================================================
  // 5. TTS ENGINE (Ethereal / Cocteau Twins style)
  // ================================================================
  var reverbShimmerNodes = [];

  function playReverbShimmer() {
    // Disabled - was too ambient/annoying
    // Ethereal shimmer removed per user request
  }

  function stopReverbShimmer() {
    // No-op now that shimmer is disabled
  }

  var speakSafetyTimer = null;

  // Cocteau Twins singing engine: SAM.js → pitch-shifted AudioBuffer → reverb → output
  // Each word is rendered by SAM, then pitch-shifted to match the current MIDI note,
  // layered with reverb for an ethereal, dreamy vocal effect.

  var singReverbNode = null;  // ConvolverNode for vocal reverb (lazy init)
  var singGainNode = null;    // master gain for singing voice

  function initSingChain() {
    if (singReverbNode) return;
    var ctx = ensureAudio();
    // Create a lush reverb impulse response (synthetic IR ~3 seconds)
    // Long lush reverb IR (~4.5 seconds) for dreamy Cocteau Twins wash
    var irLen = ctx.sampleRate * 4.5;
    var irBuf = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = irBuf.getChannelData(ch);
      for (var i = 0; i < irLen; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 1.6);
      }
    }
    singReverbNode = ctx.createConvolver();
    singReverbNode.buffer = irBuf;

    singGainNode = ctx.createGain();
    singGainNode.gain.value = 0.5;

    // Feedback delay for echo effect (350ms delay, ~40% feedback)
    var delayNode = ctx.createDelay(1.0);
    delayNode.delayTime.value = 0.35;
    var feedbackGain = ctx.createGain();
    feedbackGain.gain.value = 0.4;
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode); // feedback loop

    // Wet path (reverb) - heavier reverb mix
    var wetGain = ctx.createGain();
    wetGain.gain.value = 0.7;
    singReverbNode.connect(wetGain);
    wetGain.connect(ctx.destination);

    // Dry path - quieter dry signal
    var dryGain = ctx.createGain();
    dryGain.gain.value = 0.25;
    singGainNode.connect(dryGain);
    dryGain.connect(ctx.destination);

    // Echo path
    var echoWet = ctx.createGain();
    echoWet.gain.value = 0.35;
    delayNode.connect(echoWet);
    echoWet.connect(singReverbNode); // echo feeds into reverb

    // Feed gain into reverb and delay
    singGainNode.connect(singReverbNode);
    singGainNode.connect(delayNode);
  }

  // Convert MIDI note freq to SAM pitch parameter (0-255)
  // SAM pitch 64 ≈ 130Hz fundamental. Scale relative to that.
  function freqToSamPitch(freq) {
    if (!freq || freq <= 0) return 160; // default high female
    // Octave up: double the input freq for mapping, push SAM pitch higher
    var f2 = freq * 2;
    var p = Math.round(80 + (f2 / 600) * 160);
    return Math.max(40, Math.min(255, p));
  }

  function samSingWord(word, freq, onDone) {
    if (!window.SamJs) { if (onDone) onDone(); return; }
    var ctx = ensureAudio();
    initSingChain();

    var samPitch = freqToSamPitch(freq);
    // Ethereal voice: high pitch, slow speed, open mouth, breathy throat
    var sam = new SamJs({ pitch: samPitch, speed: 55, mouth: 190, throat: 140 });

    try {
      var samples = sam.buf32(word);
      if (!samples || !samples.length) { if (onDone) onDone(); return; }

      // Pitch-shift by adjusting playbackRate relative to base pitch
      // SAM outputs at 22050Hz, we need to resample
      var samRate = 22050;
      var audioBuf = ctx.createBuffer(1, samples.length, samRate);
      audioBuf.getChannelData(0).set(samples);

      // Calculate playback rate to hit target frequency
      // Base SAM output is roughly at samPitch. We fine-tune with playbackRate.
      var baseRate = 1.0;
      if (freq > 0) {
        // Nudge playback rate so the voice tracks the note more musically
        // Octave up: use freq*2 as target for playback rate bending
        var targetSemitones = 12 * Math.log2((freq * 2) / 261.63);
        baseRate = Math.pow(2, targetSemitones / 36); // stronger pitch tracking
        baseRate = Math.max(0.5, Math.min(2.0, baseRate));
      }

      var src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.playbackRate.value = baseRate;
      src.connect(singGainNode);
      src.onended = function() { if (onDone) onDone(); };
      // iOS: ensure context is running before start()
      if (ctx.state === "suspended" || ctx.state === "interrupted") {
        ctx.resume().then(function() { src.start(); }).catch(function() { if (onDone) onDone(); });
      } else {
        src.start();
      }
    } catch (e) {
      if (onDone) onDone();
    }
  }

  // Speak plain TTS (no pitch/reverb) — fires and forgets, calls onDone when finished
  function speakPlainTTS(word, onDone) {
    if (window.responsiveVoice) {
      responsiveVoice.speak(word, "UK English Female", {
        pitch: 1.0, rate: 0.85, volume: 0.4,
        onend: function() { if (onDone) onDone(); }
      });
    } else if (window.speechSynthesis) {
      var utter = new SpeechSynthesisUtterance(word);
      _activeUtterance = utter; // prevent iOS GC before onend fires
      utter.rate = 0.85; utter.pitch = 1.0; utter.volume = 0.4;
      var voices = speechSynthesis.getVoices();
      var preferred = voices.find(function(v) { return /samantha|karen|moira|fiona|victoria/i.test(v.name); });
      if (preferred) utter.voice = preferred;
      utter.onend = function() { _activeUtterance = null; if (onDone) onDone(); };
      utter.onerror = function() { _activeUtterance = null; if (onDone) onDone(); };
      speechSynthesis.speak(utter);
    } else {
      if (onDone) onDone();
    }
  }

  function speak(text, onEnd) {
    if (S.muted || S.trumpSpeaking) { S.speaking = false; if (onEnd) onEnd(); return; }

    // Cancel any prior singing
    S._singAbort = false;
    S.speaking = false;
    if (window.responsiveVoice && responsiveVoice.isPlaying() && !S.trumpSpeaking) responsiveVoice.cancel();
    if (speakSafetyTimer) { clearTimeout(speakSafetyTimer); speakSafetyTimer = null; }

    var words = text.split(/\s+/).filter(function(w) { return w.length > 0; });
    if (!words.length) { if (onEnd) onEnd(); return; }

    S.speaking = true;

    var hasSam = window.SamJs && S.audioReady;
    var hasTTS = window.responsiveVoice || window.speechSynthesis;

    var wi = 0;
    function nextWord() {
      if (S._singAbort || S.muted || wi >= words.length) {
        S.speaking = false;
        if (speakSafetyTimer) { clearTimeout(speakSafetyTimer); speakSafetyTimer = null; }
        if (onEnd) onEnd();
        return;
      }
      var word = words[wi];
      wi++;

      if (hasSam && hasTTS) {
        // Both voices simultaneously — layered on top of each other
        // SAM sings with reverb, TTS speaks clearly, both at once
        var samDone = false, ttsDone = false;
        function checkBoth() {
          if (samDone && ttsDone) nextWord();
        }
        var freq = S.currentNoteFreq > 0 ? S.currentNoteFreq : 261.63;
        samSingWord(word, freq, function() { samDone = true; checkBoth(); });
        speakPlainTTS(word, function() { ttsDone = true; checkBoth(); });
      } else if (hasSam) {
        var freq2 = S.currentNoteFreq > 0 ? S.currentNoteFreq : 261.63;
        samSingWord(word, freq2, nextWord);
      } else {
        speakPlainTTS(word, nextWord);
      }
    }
    nextWord();

    speakSafetyTimer = setTimeout(function() {
      S._singAbort = true;
      if (window.responsiveVoice && responsiveVoice.isPlaying()) responsiveVoice.cancel();
      S.speaking = false; speakSafetyTimer = null;
    }, 30000);
  }

  // Male voice for Trump email readings - cannot be interrupted
  function speakTrump(text, onEnd) {
    if (S.muted) { S.speaking = false; if (onEnd) onEnd(); return; }

    // Cancel any non-Trump speech first
    S._singAbort = true;
    if (window.responsiveVoice && responsiveVoice.isPlaying()) {
      responsiveVoice.cancel();
    }
    if (window.speechSynthesis) speechSynthesis.cancel();
    S.speaking = false;
    if (speakSafetyTimer) { clearTimeout(speakSafetyTimer); speakSafetyTimer = null; }

    S.speaking = true;
    S.trumpSpeaking = true;

    if (!window.responsiveVoice) {
      // Fallback: Web Speech API with male voice
      if (!window.speechSynthesis) { S.speaking = false; S.trumpSpeaking = false; if (onEnd) onEnd(); return; }
      speechSynthesis.cancel();
      setTimeout(function() {
        if (S.muted) { S.speaking = false; S.trumpSpeaking = false; if (onEnd) onEnd(); return; }
        var utter = new SpeechSynthesisUtterance(text);
        _activeUtterance = utter; // prevent iOS GC
        utter.rate = 0.9;
        utter.pitch = 0.8;
        utter.volume = 0.56;
        var voices = speechSynthesis.getVoices();
        var preferred = voices.find(function(v) { return /alex|daniel|fred|tom/i.test(v.name); });
        if (!preferred) preferred = voices.find(function(v) { return v.lang.startsWith("en") && /male/i.test(v.name); });
        if (preferred) utter.voice = preferred;
        utter.onend = function() { _activeUtterance = null; S.speaking = false; S.trumpSpeaking = false; if (onEnd) onEnd(); };
        utter.onerror = function() { S.speaking = false; S.trumpSpeaking = false; if (onEnd) onEnd(); };
        S.speaking = true;
        speechSynthesis.speak(utter);
        speakSafetyTimer = setTimeout(function() {
          if (S.speaking) { speechSynthesis.cancel(); S.speaking = false; S.trumpSpeaking = false; }
          speakSafetyTimer = null;
        }, 30000);
      }, 80);
      return;
    }

    // ResponsiveVoice with male voice
    responsiveVoice.speak(text, "US English Male", {
      pitch: 0.8,
      rate: 0.9,
      volume: 0.56,
      onend: function() {
        S.speaking = false;
        S.trumpSpeaking = false;
        if (speakSafetyTimer) { clearTimeout(speakSafetyTimer); speakSafetyTimer = null; }
        if (onEnd) onEnd();
      }
    });

    speakSafetyTimer = setTimeout(function() {
      if (S.speaking) { responsiveVoice.cancel(); S.speaking = false; S.trumpSpeaking = false; }
      speakSafetyTimer = null;
    }, 30000);
  }

  // ================================================================
  // 6. EEVEE BUBBLE & TYPING EFFECT
  // ================================================================
  var activeTypingInterval = null;

  function typeInBubble(text, cb) {
    // Cancel any in-progress typing to prevent garbled interleaving
    if (activeTypingInterval) {
      clearInterval(activeTypingInterval);
      activeTypingInterval = null;
    }
    // Also cancel any in-progress speech/singing (but never Trump)
    if (!S.trumpSpeaking) {
      S._singAbort = true;
      if (window.responsiveVoice && responsiveVoice.isPlaying()) responsiveVoice.cancel();
      if (window.speechSynthesis) speechSynthesis.cancel();
      S.speaking = false;
    }

    var bubble = document.querySelector(".assistant-bubble");
    if (!bubble) { if (cb) cb(); return; }
    var titleEl = bubble.querySelector(".assistant-bubble-title");
    var textEl = bubble.querySelector(".assistant-bubble-text");
    if (titleEl) titleEl.textContent = "Eevee says:";
    bubble.style.display = "block";
    bubble.style.animation = "none";
    bubble.offsetHeight;
    bubble.style.animation = "bubbleFadeIn 0.6s ease-out";

    // Typing effect
    var idx = 0;
    textEl.textContent = "";
    activeTypingInterval = setInterval(function () {
      if (idx < text.length) {
        textEl.textContent += text[idx];
        idx++;
      } else {
        clearInterval(activeTypingInterval);
        activeTypingInterval = null;
        if (cb) cb();
      }
    }, 30);
  }

  // ================================================================
  // 7. DIV GLOW EFFECT
  // ================================================================
  function glowDiv(el) {
    if (!el) return;
    el.style.transition = "box-shadow 0.5s ease";
    el.style.boxShadow = "0 0 25px rgba(0,162,255,0.35), 0 0 50px rgba(100,200,100,0.2)";
    setTimeout(function () {
      el.style.boxShadow = "";
    }, 3000);
  }

  // ================================================================
  // 8. SCRIPT PICKER (non-repeating until exhausted)
  // ================================================================
  function pickScript(divId) {
    var pool = SCRIPTS[divId] || DRUG_SCRIPTS[divId] || DRUG_SCRIPTS["default"];
    if (!pool || !pool.length) return null;
    if (!S.spokenSets[divId]) S.spokenSets[divId] = [];
    var used = S.spokenSets[divId];
    if (used.length >= pool.length) used.length = 0; // reset cycle
    var available = [];
    pool.forEach(function (s, i) { if (used.indexOf(i) === -1) available.push(i); });
    var pick = available[Math.floor(Math.random() * available.length)];
    used.push(pick);
    return pool[pick];
  }

  // ================================================================
  // 9. SCROLL OBSERVER - triggers Eevee speech
  // ================================================================
  function setupScrollObserver() {
    var sections = document.querySelectorAll("[data-eevee]");
    if (!sections.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.getAttribute("data-eevee");
          if (!S.visibleDivs.includes(id)) S.visibleDivs.push(id);
          maybeSpeakAbout(id, entry.target);
        } else {
          var id2 = entry.target.getAttribute("data-eevee");
          S.visibleDivs = S.visibleDivs.filter(function (d) { return d !== id2; });
        }
      });
    }, { threshold: 0.3 });

    sections.forEach(function (el) { observer.observe(el); });
  }

  function maybeSpeakAbout(divId, el) {
    if (S.muted || S.speaking || S.speakCooldown || S.trumpSpeaking) return;
    if (Math.random() > SPEAK_CHANCE) return;
    // Pick from any visible div
    var pool = S.visibleDivs.length ? S.visibleDivs : [divId];
    var chosen = pool[Math.floor(Math.random() * pool.length)];
    var script = pickScript(chosen);
    if (!script) return;

    S.speakCooldown = true;
    setTimeout(function () { S.speakCooldown = false; }, 8000);

    // Find the div element to glow
    var targetEl = document.querySelector('[data-eevee="' + chosen + '"]');
    glowDiv(targetEl);
    typeInBubble(script, function () {
      speak(script);
    });
  }

  // ================================================================
  // 10. WATER TRAIL (Canvas)
  // ================================================================
  function setupTrail() {
    var canvas = document.createElement("canvas");
    canvas.id = "trailCanvas";
    canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;";
    document.body.appendChild(canvas);
    S.trailCanvas = canvas;
    S.trailCtx = canvas.getContext("2d");
    resizeTrail();
    window.addEventListener("resize", resizeTrail);
  }
  function resizeTrail() {
    if (!S.trailCanvas) return;
    S.trailCanvas.width = window.innerWidth;
    S.trailCanvas.height = window.innerHeight;
  }

  var lastWaterSound = 0;
  function addTrailPoint(x, y) {
    S.trail.push({ x: x, y: y, r: 4 + Math.random() * 3, a: 0.35, dx: (Math.random() - 0.5) * 0.5, dy: Math.random() * 0.3 });
    if (S.trail.length > TRAIL_MAX) S.trail.shift();
    // Subtle water sound (throttled)
    var now = Date.now();
    if (now - lastWaterSound > 200 && S.audioReady) {
      lastWaterSound = now;
      playSfx("water");
    }
  }

  function drawTrail() {
    if (!S.trailCtx) { requestAnimationFrame(drawTrail); return; }
    var ctx = S.trailCtx;
    ctx.clearRect(0, 0, S.trailCanvas.width, S.trailCanvas.height);
    for (var i = S.trail.length - 1; i >= 0; i--) {
      var p = S.trail[i];
      p.x += p.dx;
      p.y += p.dy;
      p.a *= TRAIL_FADE;
      p.r *= 0.995;
      if (p.a < 0.01) { S.trail.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(100,200,255," + p.a.toFixed(3) + ")";
      ctx.fill();
      // Inner highlight
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.2, p.y - p.r * 0.2, p.r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255," + (p.a * 0.5).toFixed(3) + ")";
      ctx.fill();
    }
    requestAnimationFrame(drawTrail);
  }

  // ================================================================
  // 11. KNOWLEDGE WEB (cursor follower)
  // ================================================================
  function setupKnowledgeWeb() {
    var web = document.createElement("div");
    web.id = "knowledgeWeb";
    web.style.cssText = "position:fixed;pointer-events:none;z-index:9997;";
    KNOWLEDGE_WORDS.forEach(function (word, i) {
      var el = document.createElement("span");
      el.className = "kw-word";
      el.textContent = word;
      el.dataset.idx = i;
      web.appendChild(el);
    });
    document.body.appendChild(web);
    S.knowledgeWeb = web;
  }

  function updateKnowledgeWeb() {
    if (!S.knowledgeWeb) return;
    var words = S.knowledgeWeb.children;
    var cx = S.mouseX, cy = S.mouseY;
    var n = words.length;
    var t = Date.now() / 1000;
    var baseSpeed = 0.3 + S.kwSpinBoost;
    var dir = S.kwHoverReverse ? -1 : 1;
    var spinRate = baseSpeed * dir * (S.kwHoverReverse ? 2.5 : 1);
    var baseRadius = 60 + S.kwRadiusBoost;
    var fontSize = 0.82 + S.kwSizeBoost;
    var alpha = Math.min(1, 0.55 + S.kwSpinBoost * 0.1);
    for (var i = 0; i < n; i++) {
      var angle = (i / n) * Math.PI * 2 + t * spinRate;
      var radius = baseRadius + Math.sin(t * 0.5 + i) * 10;
      var x = cx + Math.cos(angle) * radius - 30;
      var y = cy + Math.sin(angle) * radius - 8;
      words[i].style.cssText = "position:fixed;left:" + x + "px;top:" + y + "px;" +
        "font-size:" + fontSize.toFixed(2) + "rem;font-family:Cabin,sans-serif;font-weight:700;" +
        "color:rgba(30,100,180," + alpha.toFixed(2) + ");pointer-events:none;white-space:nowrap;" +
        "text-shadow:0 0 6px rgba(60,140,220,0.3), 0 1px 2px rgba(0,40,80,0.15);transition:none;";
    }
    // connecting lines removed — words spiral without web lines
  }

  function playWhooshSfx() {
    if (!S.audioReady) return;
    var ctx = actx; var now = ctx.currentTime;
    var buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.08;
    var src = ctx.createBufferSource(); src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = "bandpass"; filt.Q.value = 2;
    filt.frequency.setValueAtTime(200, now);
    filt.frequency.exponentialRampToValueAtTime(4000, now + 0.3);
    filt.frequency.exponentialRampToValueAtTime(200, now + 0.5);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
    src.start(now);
  }

  function triggerKnowledgeExplosion() {
    if (S.kwExploding) return;
    S.kwExploding = true;
    playWhooshSfx();
    function expandLoop() {
      if (!S.kwExploding) return;
      S.kwSpinBoost += 0.15;
      S.kwRadiusBoost += 12;
      S.kwSizeBoost += 0.04;
      updateKnowledgeWeb();
      if (S.kwRadiusBoost > Math.max(window.innerWidth, window.innerHeight)) {
        S.kwExploding = false;
        S.kwSpinBoost = 0;
        S.kwRadiusBoost = 0;
        S.kwSizeBoost = 0;
        return;
      }
      requestAnimationFrame(expandLoop);
    }
    requestAnimationFrame(expandLoop);
  }

  // ================================================================
  // 12. HOVER MICRO-INTERACTIONS + DRUG HOVER NARRATION
  // ================================================================
  var drugMelodyTimeout = null;
  var drugMelodyNodes = [];

  // Hash a string to a number for deterministic melody generation
  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  // Subtle noise whoosh on drug card hover
  function playDrugMelody() {
    stopDrugMelody();
    if (!S.audioReady) return;
    var ctx = actx;
    var now = ctx.currentTime;
    var dur = 0.25;
    var buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.setValueAtTime(800, now);
    filt.frequency.exponentialRampToValueAtTime(3000, now + dur * 0.4);
    filt.frequency.exponentialRampToValueAtTime(1200, now + dur);
    filt.Q.value = 0.8;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.035, now + 0.04);
    gain.gain.setValueAtTime(0.035, now + dur * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
    src.start(now);
    drugMelodyNodes.push({ stop: function() { try { this.o.stop(); } catch(e){} }, o: src });
  }

  function stopDrugMelody() {
    if (drugMelodyTimeout) { clearTimeout(drugMelodyTimeout); drugMelodyTimeout = null; }
    drugMelodyNodes.forEach(function(n) { n.stop(); });
    drugMelodyNodes = [];
  }

  // Play splash SFX (bigger than water trail sound)
  function playSplashSfx() {
    if (!S.audioReady) return;
    var ctx = actx;
    var now = ctx.currentTime;
    // Multiple bandpass noise bursts for splash
    for (var i = 0; i < 3; i++) {
      var buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * 0.05;
      var src = ctx.createBufferSource(); src.buffer = buf;
      var f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 800 + i * 1500 + Math.random() * 500;
      f.Q.value = 3;
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0.08, now + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.12);
      src.connect(f); f.connect(gain); gain.connect(ctx.destination);
      src.start(now + i * 0.04);
    }
  }

  function setupHoverEffects() {
    // General hover effects
    var targets = document.querySelectorAll(".glass, .glass-strong, .faq-q, .btn-aero, .nature-panel, .outlook-card, .vista-gadget");
    targets.forEach(function (el) {
      el.addEventListener("mouseenter", function () {
        el.style.transition = "transform 0.3s ease, box-shadow 0.3s ease";
        el.style.transform = "scale(1.008) translateY(-1px)";
        // no hover sfx
      });
      el.addEventListener("mouseleave", function () {
        el.style.transform = "";
      });
    });

    // Drug card hover -> parallax depth + Eevee narration + melody
    var drugCards = document.querySelectorAll(".drug-card");
    drugCards.forEach(function (card) {
      var bg = card.querySelector(".drug-card-bg");
      var body = card.querySelector(".drug-card-body");
      var parallaxRaf = null;
      var targetBgX = 0, currentBgX = 0;
      var targetBodyX = 0, targetBodyY = 0, currentBodyX = 0, currentBodyY = 0;

      function parallaxLoop() {
        // Smooth lerp
        currentBgX += (targetBgX - currentBgX) * 0.08;
        currentBodyX += (targetBodyX - currentBodyX) * 0.1;
        currentBodyY += (targetBodyY - currentBodyY) * 0.1;
        if (bg) bg.style.transform = "scale(1.06) translateX(" + currentBgX.toFixed(2) + "px)";
        if (body) body.style.transform = "translate(" + currentBodyX.toFixed(2) + "px," + currentBodyY.toFixed(2) + "px)";
        parallaxRaf = requestAnimationFrame(parallaxLoop);
      }

      card.addEventListener("mouseenter", function () {
        S.kwHoverReverse = true;
        parallaxRaf = requestAnimationFrame(parallaxLoop);

        if (!S.audioReady) return;
        var slug = card.getAttribute("data-eevee") || "";
        if (!slug) {
          try {
            var href = card.getAttribute("href") || "";
            var match = href.match(/\/p\/(.+)/);
            if (match) slug = match[1];
          } catch(e) {}
        }
        if (!slug) return;
        playDrugMelody(slug);
        if (!S.muted && !S.speaking) {
          var script = pickScript(slug);
          if (script) {
            glowDiv(card);
            typeInBubble(script, function () { speak(script); });
          }
        }
      });

      card.addEventListener("mousemove", function (e) {
        var rect = card.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = (e.clientX - cx) / (rect.width / 2);  // -1 to 1
        var dy = (e.clientY - cy) / (rect.height / 2);

        // Background shifts opposite to mouse for depth (up to 8px)
        targetBgX = -dx * 8;
        // Body/text follows mouse direction (up to 10px)
        targetBodyX = dx * 10;
        targetBodyY = dy * 6;
      });

      card.addEventListener("mouseleave", function () {
        stopDrugMelody();
        S.kwHoverReverse = false;
        targetBgX = 0; targetBodyX = 0; targetBodyY = 0;
        // Animate back smoothly then stop
        var resetRaf;
        function resetLoop() {
          currentBgX += (0 - currentBgX) * 0.12;
          currentBodyX += (0 - currentBodyX) * 0.12;
          currentBodyY += (0 - currentBodyY) * 0.12;
          if (bg) bg.style.transform = "scale(1) translateX(" + currentBgX.toFixed(2) + "px)";
          if (body) body.style.transform = "translate(" + currentBodyX.toFixed(2) + "px," + currentBodyY.toFixed(2) + "px)";
          if (Math.abs(currentBgX) > 0.1 || Math.abs(currentBodyX) > 0.1 || Math.abs(currentBodyY) > 0.1) {
            resetRaf = requestAnimationFrame(resetLoop);
          } else {
            if (bg) bg.style.transform = "";
            if (body) body.style.transform = "";
          }
        }
        if (parallaxRaf) { cancelAnimationFrame(parallaxRaf); parallaxRaf = null; }
        resetRaf = requestAnimationFrame(resetLoop);
      });
    });
  }

  // ================================================================
  // 13. EEVEE MUTE TOGGLE (click head to seal lips)
  // ================================================================
  function setupMuteToggle() {
    var fig = document.getElementById("eveeFigure") || document.getElementById("remedeaFigure");
    if (!fig) return;
    fig.id = "eveeFigure";
    var svg = fig.querySelector("svg");
    if (!svg) return;

    // Add a clickable head zone
    var headZone = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    headZone.setAttribute("cx", "60");
    headZone.setAttribute("cy", "38");
    headZone.setAttribute("rx", "18");
    headZone.setAttribute("ry", "20");
    headZone.setAttribute("fill", "transparent");
    headZone.setAttribute("cursor", "pointer");
    headZone.id = "eeveeHeadZone";
    svg.appendChild(headZone);

    // Find mouth path
    var mouth = svg.querySelector('path[d*="55,48"]');
    headZone.addEventListener("click", function (e) {
      e.stopPropagation();
      S.muted = !S.muted;
      if (S.muted) {
        speechSynthesis.cancel();
        if (mouth) mouth.setAttribute("d", "M55,49 L65,49"); // sealed lips
        var bubble = document.querySelector(".assistant-bubble");
        if (bubble) {
          var textEl = bubble.querySelector(".assistant-bubble-text");
          if (textEl) textEl.textContent = "... (muted)";
        }
      } else {
        if (mouth) mouth.setAttribute("d", "M55,48 Q60,52 65,48"); // smile
        var bubble2 = document.querySelector(".assistant-bubble");
        if (bubble2) {
          var textEl2 = bubble2.querySelector(".assistant-bubble-text");
          if (textEl2) textEl2.textContent = "I can speak again! Ask me anything.";
        }
      }
      playSfx("click");
    });
  }

  // ================================================================
  // 14. MUSIC CONTROLS UI
  // ================================================================
  function setupMusicControls() {
    var container = document.querySelector(".assistant-container") || document.getElementById("eeveeContainer") || document.getElementById("remedeaContainer");
    if (!container) return;

    var controls = document.createElement("div");
    controls.className = "music-controls";
    controls.innerHTML =
      '<button class="mc-btn" id="prevBtn" title="Previous">&lt;&lt;</button>' +
      '<button class="mc-btn mc-play" id="playPauseBtn" title="Play/Pause">\u25B6</button>' +
      '<button class="mc-btn" id="nextBtn" title="Next">&gt;&gt;</button>' +
      '<span class="mc-label" id="trackLabel">Track 1 / 20</span>';
    // Insert before the figure
    var label = container.querySelector(".eevee-label");
    if (label) {
      container.insertBefore(controls, label);
    } else {
      container.appendChild(controls);
    }

    document.getElementById("playPauseBtn").addEventListener("click", function (e) {
      e.stopPropagation();
      ensureAudio();
      if (S.musicPlaying) stopMusic(); else startMusic();
    });
    document.getElementById("prevBtn").addEventListener("click", function (e) {
      e.stopPropagation(); ensureAudio(); prevTrack();
    });
    document.getElementById("nextBtn").addEventListener("click", function (e) {
      e.stopPropagation(); ensureAudio(); nextTrack();
    });
  }

  // ================================================================
  // 15. EVENT LISTENERS
  // ================================================================
  function setupEvents() {
    // Mouse move -> trail + knowledge web
    var moveThrottle = 0;
    document.addEventListener("mousemove", function (e) {
      S.mouseX = e.clientX;
      S.mouseY = e.clientY;
      var now = Date.now();
      if (now - moveThrottle > 16) { // ~60fps
        moveThrottle = now;
        addTrailPoint(e.clientX, e.clientY);
        updateKnowledgeWeb();
      }
    });

    // Click SFX + Knowledge web explosion
    document.addEventListener("click", function () {
      ensureAudio();
      playSfx("click");
      triggerKnowledgeExplosion();
    });

    // Scroll SFX (richer, varies pitch with scroll direction)
    var scrollThrottle = 0;
    var lastScrollY = window.scrollY;
    window.addEventListener("scroll", function () {
      var now = Date.now();
      if (now - scrollThrottle > 250) {
        scrollThrottle = now;
        if (S.audioReady) {
          var ctx = actx;
          var t = ctx.currentTime;
          var dir = window.scrollY > lastScrollY ? 1 : -1;
          lastScrollY = window.scrollY;
          // Richer scroll: two detuned tones with direction-dependent pitch
          var baseFreq = dir > 0 ? 180 + Math.random() * 80 : 260 + Math.random() * 80;
          var osc1 = ctx.createOscillator(), osc2 = ctx.createOscillator();
          var gain = ctx.createGain();
          var filt = ctx.createBiquadFilter();
          osc1.type = "triangle"; osc1.frequency.value = baseFreq;
          osc2.type = "sine"; osc2.frequency.value = baseFreq * 1.5;
          filt.type = "lowpass"; filt.frequency.value = 800;
          gain.gain.setValueAtTime(0.035, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
          osc1.connect(filt); osc2.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
          osc1.start(t); osc2.start(t);
          osc1.stop(t + 0.2); osc2.stop(t + 0.2);
        }
      }
    });

    // Page close
    window.addEventListener("beforeunload", function () {
      if (S.audioReady) playSfx("goodbye");
    });

    // First click -> init audio, startup sound, autostart music
    var startupPlayed = false;
    function onFirstClick() {
      // Always unlock/resume (handles interrupt recovery too)
      _unlockAllAudio();
      if (startupPlayed) return;
      startupPlayed = true;
      playSfx("startup");
      setTimeout(function() { startMusic(); }, 1200);
    }
    // Listen on all gesture types for iOS compatibility
    ["touchstart", "touchend", "click", "keydown"].forEach(function(evt) {
      document.addEventListener(evt, onFirstClick, { passive: true });
      document.addEventListener(evt, _handleInterruptRecovery, { passive: true });
    });
  }

  function tagSections() {
    // Auto-tag major sections on the page
    var tags = [
      { sel: ".parody-banner", id: "parody-banner" },
      { sel: ".hero", id: "hero" },
      { sel: ".comparison-panel", id: "comparison" },
      { sel: ".trump-widgets", id: "trump-widgets" },
      { sel: ".drug-grid", id: "medications" },
      { sel: ".nature-panel", id: "nature-panel" },
      { sel: ".faq-list, .faq-section, #faq", id: "faq" },
      { sel: ".notify-panel", id: "notify" },
    ];
    tags.forEach(function (t) {
      var el = document.querySelector(t.sel);
      if (el && !el.getAttribute("data-eevee")) {
        el.setAttribute("data-eevee", t.id);
      }
    });

    // Tag drug cards on browse page
    var cards = document.querySelectorAll(".drug-card");
    cards.forEach(function (card) {
      var slug = "";
      try {
        var href = card.getAttribute("href") || "";
        var match = href.match(/\/p\/(.+)/);
        if (match) slug = match[1];
      } catch (e) {}
      if (slug && !card.getAttribute("data-eevee")) {
        card.setAttribute("data-eevee", slug);
        // Ensure scripts exist for this drug
        if (!SCRIPTS[slug] && !DRUG_SCRIPTS[slug]) {
          DRUG_SCRIPTS[slug] = DRUG_SCRIPTS["default"];
        }
      }
    });
  }

  // ================================================================
  // 17. SWIMMING FISH ECOSYSTEM (pills, growth, predation, babies)
  // ================================================================
  var fishWaterInterval = null;
  var fishPondVisible = false;

  function setupFish() {
    var pond = document.getElementById("fishPond");
    if (!pond) return;

    var FISH_COLORS = [
      { body: "#4a9fd8", fin: "#3580b8", belly: "#a0d4f0" },
      { body: "#e88040", fin: "#c86020", belly: "#f8c090" },
      { body: "#58b868", fin: "#408848", belly: "#a0e0a8" },
      { body: "#d86888", fin: "#b84868", belly: "#f0a0b8" },
      { body: "#8878c8", fin: "#6858a8", belly: "#b8b0e0" },
      { body: "#d8a840", fin: "#b88820", belly: "#f0d888" },
      { body: "#48b8b8", fin: "#289898", belly: "#90e0e0" },
      { body: "#c87898", fin: "#a85878", belly: "#e8b0c8" }
    ];

    var PILL_COLORS = [
      { top: "#ff6b6b", bot: "#fff" },
      { top: "#4ecdc4", bot: "#fff" },
      { top: "#ffe66d", bot: "#fff" },
      { top: "#a06cd5", bot: "#fff" },
      { top: "#ff9a9e", bot: "#fad0c4" },
      { top: "#2196f3", bot: "#fff" },
      { top: "#66bb6a", bot: "#fff" },
      { top: "#ff7043", bot: "#ffccbc" }
    ];

    function makeFishSVG(c) {
      return '<svg viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M8,15 Q15,4 30,6 Q45,4 52,15 Q45,26 30,24 Q15,26 8,15Z" fill="' + c.body + '"/>' +
        '<path d="M8,15 Q2,8 0,2 Q4,10 8,15 Q4,20 0,28 Q2,22 8,15Z" fill="' + c.fin + '"/>' +
        '<path d="M18,15 Q25,20 38,19 Q45,22 50,15 Q45,18 30,17 Q20,18 18,15Z" fill="' + c.belly + '" opacity="0.5"/>' +
        '<circle cx="44" cy="12" r="2" fill="#fff"/>' +
        '<circle cx="44.5" cy="12" r="1" fill="#1a2e3d"/>' +
        '<path d="M35,7 Q38,4 40,6" fill="none" stroke="' + c.fin + '" stroke-width="0.8" opacity="0.5"/>' +
        '</svg>';
    }

    function makePillSVG(c) {
      return '<svg viewBox="0 0 12 24" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="1" y="0" width="10" height="24" rx="5" fill="' + c.bot + '" stroke="rgba(0,0,0,0.1)" stroke-width="0.5"/>' +
        '<rect x="1" y="0" width="10" height="12" rx="5" fill="' + c.top + '"/>' +
        '<ellipse cx="6" cy="6" rx="3" ry="5" fill="rgba(255,255,255,0.35)"/>' +
        '</svg>';
    }

    // ---- PILL MANAGEMENT ----
    var pills = [];
    var pillSpawnTimer = null;

    var POND_MID = 100; // halfway through 200px pond - pills transition to bobbing here

    function spawnPill() {
      if (!fishPondVisible || pills.length > 15) return;
      var w = pond.offsetWidth || 800;
      var pc = PILL_COLORS[Math.floor(Math.random() * PILL_COLORS.length)];
      var el = document.createElement("div");
      el.className = "fish";
      el.innerHTML = makePillSVG(pc);
      el.querySelector("svg").style.width = "12px";
      el.querySelector("svg").style.height = "24px";
      pond.appendChild(el);
      var pill = {
        el: el,
        x: 40 + Math.random() * (w - 80),
        y: -30,
        vy: 0.3 + Math.random() * 0.4,
        vx: (Math.random() - 0.5) * 0.3,
        wobble: Math.random() * Math.PI * 2,
        bobbing: false,        // true once pill reaches mid-depth
        bobAnchor: 0,          // y position where bobbing is anchored
        bobPhase: Math.random() * Math.PI * 2,
        alive: true
      };
      pills.push(pill);
    }

    function removePill(pill) {
      pill.alive = false;
      if (pill.el.parentNode) pill.el.parentNode.removeChild(pill.el);
    }

    // ---- FISH STATE ----
    var fishState = [];
    var INIT_FISH = 8;

    function createFish(colorIdx, x, y, baseSize) {
      var c = FISH_COLORS[colorIdx % FISH_COLORS.length];
      var el = document.createElement("div");
      el.className = "fish";
      el.innerHTML = makeFishSVG(c);
      el.style.pointerEvents = "auto";
      el.addEventListener("mouseenter", function() {
        if (S.audioReady) playSplashSfx();
      });
      pond.appendChild(el);

      var goingRight = Math.random() > 0.5;
      var fish = {
        el: el,
        colorIdx: colorIdx,
        color: c,
        x: x !== undefined ? x : Math.random() * (pond.offsetWidth || 800),
        y: y !== undefined ? y : 30 + Math.random() * 140,
        vx: (1 + Math.random() * 1.5) * (goingRight ? 1 : -1),
        phase: Math.random() * Math.PI * 2,
        freq: 0.3 + Math.random() * 0.4,
        amp: 15 + Math.random() * 25,
        baseSize: baseSize || (0.7 + Math.random() * 0.6),
        growth: 0,       // 0 = normal, 1.0 = 100% bigger (2x size)
        alive: true
      };
      fishState.push(fish);
      return fish;
    }

    // Spawn initial fish
    for (var i = 0; i < INIT_FISH; i++) {
      createFish(i);
    }

    // ---- CORPOROSPEAK (Eevee says reassuring things when fish eat pills) ----
    var CORPOROSPEAK = [
      "These compounds are completely non-toxic and fully biodegradable.",
      "We are deeply committed to protecting our waterways and aquatic ecosystems.",
      "There is no scientific evidence for concern regarding trace pharmaceutical levels.",
      "Our environmental stewardship program exceeds all regulatory requirements.",
      "Independent studies confirm zero adverse ecological impact from our products.",
      "Water quality monitoring shows levels well below any threshold of concern.",
      "Our commitment to clean water is reflected in every product we make.",
      "Pharmaceutical residues at these concentrations pose absolutely no risk.",
      "We invest billions annually in sustainable manufacturing practices.",
      "All products undergo rigorous environmental impact assessments before release.",
      "Our fish-safe certification program is the gold standard in the industry.",
      "Trace amounts detected are millions of times below any biologically active dose.",
      "We partner with leading marine biologists to ensure ecosystem health.",
      "Advanced filtration technology removes ninety-nine point nine percent of all residues.",
      "Consumer safety and environmental responsibility are our top priorities.",
      "Our products are designed to break down naturally in aquatic environments.",
      "Regulatory agencies worldwide have confirmed the safety of these levels.",
      "We are proud to maintain the highest environmental compliance rating.",
      "These results reflect our ongoing dedication to ecological responsibility.",
      "There is nothing to worry about. Everything is functioning as intended."
    ];
    var lastCorpoTime = 0;
    var corpoIdx = 0;

    function triggerCorpospeak() {
      var now = Date.now();
      if (now - lastCorpoTime < 6000) return; // 6s cooldown
      if (S.speaking) return;
      lastCorpoTime = now;
      var line = CORPOROSPEAK[corpoIdx % CORPOROSPEAK.length];
      corpoIdx++;
      typeInBubble(line, function() {
        speak(line);
      });
    }

    // ---- EAT SFX ----
    function playEatSfx() {
      if (!S.audioReady) return;
      var ctx = actx; var now = ctx.currentTime;
      var osc = ctx.createOscillator(); var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.15);
    }

    function playBigEatSfx() {
      if (!S.audioReady) return;
      var ctx = actx; var now = ctx.currentTime;
      // Crunch + low thud
      [300, 150, 80].forEach(function(f, i) {
        var osc = ctx.createOscillator(); var gain = ctx.createGain();
        osc.type = i === 0 ? "sawtooth" : "sine";
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.08, now + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.12);
        var filt = ctx.createBiquadFilter();
        filt.type = "lowpass"; filt.frequency.value = 400;
        osc.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * 0.05); osc.stop(now + i * 0.05 + 0.12);
      });
    }

    function playBirthSfx() {
      if (!S.audioReady) return;
      var ctx = actx; var now = ctx.currentTime;
      // Sparkly ascending
      [600, 800, 1000, 1200].forEach(function(f, i) {
        var osc = ctx.createOscillator(); var gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.value = f;
        gain.gain.setValueAtTime(0, now + i * 0.06);
        gain.gain.linearRampToValueAtTime(0.06, now + i * 0.06 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.3);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * 0.06); osc.stop(now + i * 0.06 + 0.3);
      });
    }

    // ---- COLLISION DETECTION ----
    function dist(a, b) {
      var dx = a.x - b.x, dy = (a.y + a._dispY) - (b.y + b._dispY);
      return Math.sqrt(dx * dx + dy * dy);
    }

    function fishEffectiveSize(f) {
      return f.baseSize * (1 + f.growth);
    }

    function isPredator(f) {
      return f.growth >= 1.0; // 100% bigger = 2x original
    }

    // ---- MAIN ANIMATION LOOP ----
    function animateFish() {
      var w = pond.offsetWidth || 800;
      var t = Date.now() / 1000;

      // Update pills (slow down, then sinusoidal bob at mid-depth)
      for (var pi = pills.length - 1; pi >= 0; pi--) {
        var p = pills[pi];
        if (!p.alive) { pills.splice(pi, 1); continue; }

        if (!p.bobbing) {
          // Falling phase: decelerate as pill approaches mid-depth
          var decel = Math.max(0.15, 1 - (p.y / POND_MID) * 0.85);
          p.y += p.vy * decel;
          p.x += p.vx + Math.sin(t * 2 + p.wobble) * 0.3;
          // Transition to bobbing once past mid-depth
          if (p.y >= POND_MID) {
            p.bobbing = true;
            p.bobAnchor = p.y;
          }
        } else {
          // Bobbing phase: gentle sinusoidal movement, very slow drift down
          p.y = p.bobAnchor + Math.sin(t * 0.8 + p.bobPhase) * 12;
          p.x += Math.sin(t * 0.5 + p.wobble) * 0.2;
          p.bobAnchor += 0.03; // imperceptible downward drift
        }

        // Remove if way off bottom (bobbing pills last much longer)
        if (p.bobAnchor > 230 || (!p.bobbing && p.y > 230)) { removePill(p); pills.splice(pi, 1); continue; }
        p.el.style.transform = "translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px) rotate(" + (Math.sin(t * 1.5 + p.wobble) * 15).toFixed(1) + "deg)";
      }

      // Update fish
      for (var i = fishState.length - 1; i >= 0; i--) {
        var f = fishState[i];
        if (!f.alive) {
          if (f.el.parentNode) f.el.parentNode.removeChild(f.el);
          fishState.splice(i, 1);
          continue;
        }
        f.x += f.vx;
        var yOff = Math.sin(t * f.freq + f.phase) * f.amp;
        f._dispY = yOff; // store for collision

        // Turn at edges
        if (f.x > w + 80) f.vx = -(1 + Math.random() * 1.5);
        else if (f.x < -80) f.vx = (1 + Math.random() * 1.5);

        var sz = fishEffectiveSize(f);
        var scaleX = f.vx > 0 ? sz : -sz;
        f.el.style.transform = "translate(" + f.x.toFixed(1) + "px," + (f.y + yOff).toFixed(1) + "px) scale(" + scaleX.toFixed(3) + "," + sz.toFixed(3) + ")";

        // ---- Fish eats pills ----
        for (var pi2 = pills.length - 1; pi2 >= 0; pi2--) {
          var pill = pills[pi2];
          if (!pill.alive) continue;
          var dx = f.x + 30 * sz - pill.x;
          var dy = (f.y + yOff) + 15 * sz - pill.y;
          var eatDist = 25 * sz;
          if (dx * dx + dy * dy < eatDist * eatDist) {
            // Eat the pill! Grow 20% (of base), cap at 100% growth
            f.growth = Math.min(f.growth + 0.2, 1.0);
            removePill(pill);
            pills.splice(pi2, 1);
            playEatSfx();
            triggerCorpospeak();
          }
        }

        // ---- Predator fish eats smaller fish ----
        if (isPredator(f)) {
          for (var j = fishState.length - 1; j >= 0; j--) {
            if (j === i || !fishState[j].alive) continue;
            var prey = fishState[j];
            if (isPredator(prey)) continue; // predators don't eat each other
            var pdx = f.x - prey.x;
            var pdy = (f.y + yOff) - (prey.y + (prey._dispY || 0));
            var pdist = Math.sqrt(pdx * pdx + pdy * pdy);
            var eatRadius = 35 * fishEffectiveSize(f);
            if (pdist < eatRadius) {
              // Prey is eaten! Spawn 2 babies with prey's color at half normal size
              prey.alive = false;
              playBigEatSfx();
              // Spawn 2 baby fish
              setTimeout(function(preyColor, preyX, preyY) {
                return function() {
                  playBirthSfx();
                  createFish(preyColor, preyX - 20, preyY, 0.5);
                  createFish(preyColor, preyX + 20, preyY, 0.5);
                };
              }(prey.colorIdx, prey.x, prey.y), 300);

              // Predator shrinks back to half growth after eating
              f.growth = f.growth * 0.5;
            }
          }
        }
      }

      requestAnimationFrame(animateFish);
    }
    requestAnimationFrame(animateFish);

    // ---- PILL SPAWNING (when pond visible) ----
    var fishObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        fishPondVisible = entry.isIntersecting;
        if (entry.isIntersecting) {
          if (!fishWaterInterval && S.audioReady) {
            fishWaterInterval = setInterval(function() {
              if (S.audioReady) playSfx("water");
            }, 1500 + Math.random() * 2000);
          }
          if (!pillSpawnTimer) {
            pillSpawnTimer = setInterval(function() {
              if (fishPondVisible) spawnPill();
            }, 2000 + Math.random() * 3000);
            // Spawn a few immediately
            spawnPill(); spawnPill();
          }
        } else {
          if (fishWaterInterval) { clearInterval(fishWaterInterval); fishWaterInterval = null; }
          if (pillSpawnTimer) { clearInterval(pillSpawnTimer); pillSpawnTimer = null; }
        }
      });
    }, { threshold: 0.1 });
    fishObserver.observe(pond);
  }

  // ================================================================
  // 18. DRUG DETAIL MODAL
  // ================================================================
  function openDrugModal(info) {
    var overlay = document.createElement("div");
    overlay.className = "drug-modal-overlay";
    var heroHtml = info.img ? '<div class="drug-modal-hero" style="background-image:url(\'' + info.img + '\')"></div>' : '';
    overlay.innerHTML =
      '<div class="drug-modal">' +
      heroHtml +
      '<button class="drug-modal-close">&times;</button>' +
      '<div class="drug-modal-body">' +
      '<div class="drug-modal-name">' + info.name + '</div>' +
      '<div class="drug-modal-generic">' + (info.generic || '') + '</div>' +
      '<div class="drug-modal-price-row">' +
      '<span class="drug-modal-price">' + info.price + '</span>' +
      (info.original ? '<span class="drug-modal-original">' + info.original + '</span>' : '') +
      '</div>' +
      (info.discount ? '<div class="drug-modal-savings">' + info.discount + '</div>' : '') +
      '<div class="drug-modal-desc">Present your TrumpRx coupon at any participating pharmacy. Coupon credentials: BIN 015995, PCN GDC, Group MAHA. Claims process at the listed TrumpRx price.</div>' +
      '<div class="drug-modal-actions">' +
      '<button class="btn-aero btn-aero-green drug-modal-cart-btn">Add to Cart</button>' +
      '<a href="https://trumprx.gov/p/' + (info.slug || '') + '" target="_blank" rel="noopener" class="btn-aero">View on TrumpRx.gov</a>' +
      '</div></div></div>';
    document.body.appendChild(overlay);

    function closeModal() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    overlay.querySelector(".drug-modal-close").addEventListener("click", closeModal);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) closeModal(); });

    overlay.querySelector(".drug-modal-cart-btn").addEventListener("click", function() {
      addToCart(info);
      closeModal();
    });
  }

  function setupDrugModals() {
    // Use event delegation so it works for both static and dynamically-rendered cards
    document.addEventListener("click", function(e) {
      var card = e.target.closest ? e.target.closest(".drug-card") : null;
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();

      var body = card.querySelector(".drug-card-body");
      if (!body) return;
      var bgDiv = card.querySelector(".drug-card-bg");
      var info = {
        name: (body.querySelector(".drug-card-name") || {}).textContent || "Medication",
        generic: (body.querySelector(".drug-card-generic") || {}).textContent || "",
        price: (body.querySelector(".drug-card-price") || {}).textContent || "",
        original: (body.querySelector(".drug-card-original") || {}).textContent || "",
        discount: (body.querySelector(".drug-card-savings") || {}).textContent || "",
        img: bgDiv ? bgDiv.style.backgroundImage.replace(/url\(['"]?|['"]?\)/g, "") : "",
        slug: "",
        priceNum: parseFloat(card.dataset.price) || 0
      };
      try {
        var href = card.getAttribute("href") || "";
        var m = href.match(/\/p\/(.+)/);
        if (m) info.slug = m[1];
      } catch(ex) {}

      // Parse numeric price from text if not in dataset
      if (!info.priceNum) {
        info.priceNum = parseFloat(String(info.price).replace(/[^0-9.]/g, "")) || 0;
      }

      openDrugModal(info);
    });
  }

  // ================================================================
  // 19. SHOPPING CART
  // ================================================================
  var CART_REACTIONS = [
    "Good choice. Optimal utility.",
    "Incredible value. Added to your cart.",
    "A wise investment in your health.",
    "Excellent selection. Your savings are compounding.",
    "That is a smart addition to your regimen.",
    "Added. Your cart is looking very optimized.",
    "Great pick. You are saving significantly.",
    "Another step toward affordable wellness.",
    "Your pharmacological portfolio just improved.",
    "Consider it done. You deserve these savings."
  ];

  function addToCart(info) {
    S.cart.push({
      name: info.name,
      generic: info.generic || "",
      price: info.price,
      priceNum: info.priceNum || parseFloat(String(info.price).replace(/[^0-9.]/g, "")) || 0,
      original: info.original,
      discount: info.discount,
      img: info.img,
      slug: info.slug
    });
    updateCartBadge();
    var line = CART_REACTIONS[Math.floor(Math.random() * CART_REACTIONS.length)];
    typeInBubble(line, function() { speak(line); });
    playSfx("click");
  }

  function removeFromCart(idx) {
    S.cart.splice(idx, 1);
    updateCartBadge();
    renderCartPanel();
  }

  function updateCartBadge() {
    var badge = document.getElementById("cartBadge");
    var total = document.getElementById("cartTotal");
    if (badge) {
      badge.textContent = S.cart.length;
      badge.style.display = S.cart.length > 0 ? "inline-flex" : "none";
    }
    var sum = 0;
    S.cart.forEach(function(item) { sum += item.priceNum; });
    if (total) total.textContent = "$" + sum.toFixed(2);
  }

  function openCart() {
    var existing = document.querySelector(".cart-overlay");
    if (existing) { existing.parentNode.removeChild(existing); return; }

    var overlay = document.createElement("div");
    overlay.className = "cart-overlay";
    overlay.innerHTML =
      '<div class="cart-panel">' +
      '<div class="cart-header"><h2>Your Cart</h2><button class="cart-close">&times;</button></div>' +
      '<div class="cart-items" id="cartItemsContainer"></div>' +
      '<div class="cart-footer">' +
      '<div class="cart-total-row"><span class="cart-total-label">Total</span><span class="cart-total-amount" id="cartTotalAmount">$0.00</span></div>' +
      '<div class="cart-savings-row" id="cartSavingsRow"></div>' +
      '<button class="btn-aero btn-aero-green" style="width:100%;">Checkout on TrumpRx.gov</button>' +
      '</div></div>';
    document.body.appendChild(overlay);

    function closeCart() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.querySelector(".cart-close").addEventListener("click", closeCart);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) closeCart(); });

    renderCartPanel();
  }

  function renderCartPanel() {
    var container = document.getElementById("cartItemsContainer");
    if (!container) return;

    if (S.cart.length === 0) {
      container.innerHTML = '<div class="cart-empty">Your cart is empty. Browse medications and add your favorites.</div>';
    } else {
      container.innerHTML = "";
      S.cart.forEach(function(item, idx) {
        var div = document.createElement("div");
        div.className = "cart-item";
        div.innerHTML =
          (item.img ? '<img class="cart-item-img" src="' + item.img + '" alt="">' : '') +
          '<div class="cart-item-info"><div class="cart-item-name">' + item.name + '</div><div class="cart-item-generic">' + item.generic + '</div></div>' +
          '<div class="cart-item-price">' + item.price + '</div>' +
          '<button class="cart-item-remove" data-idx="' + idx + '">Remove</button>';
        container.appendChild(div);
      });
      container.querySelectorAll(".cart-item-remove").forEach(function(btn) {
        btn.addEventListener("click", function() {
          removeFromCart(parseInt(this.dataset.idx));
        });
      });
    }

    var sum = 0, origSum = 0;
    S.cart.forEach(function(item) {
      sum += item.priceNum;
      var orig = parseFloat(String(item.original).replace(/[^0-9.]/g, "")) || 0;
      origSum += orig;
    });
    var totalEl = document.getElementById("cartTotalAmount");
    if (totalEl) totalEl.textContent = "$" + sum.toFixed(2);
    var savingsEl = document.getElementById("cartSavingsRow");
    if (savingsEl && origSum > sum) {
      savingsEl.textContent = "You save $" + (origSum - sum).toFixed(2) + " vs. retail";
    } else if (savingsEl) {
      savingsEl.textContent = "";
    }
  }

  function setupCart() {
    var cartBtn = document.getElementById("navCartBtn");
    if (cartBtn) {
      cartBtn.addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        openCart();
      });
    }
    updateCartBadge();
  }

  // ================================================================
  // 20. EEVEE CHAT INPUT
  // ================================================================
  var EEVEE_CHAT_RESPONSES = [
    "That is a really interesting perspective. I would have to look into that more deeply.",
    "Great question. The answer involves several interconnected factors that I am still analyzing.",
    "I appreciate you bringing that up. It aligns with what we have been seeing in the data.",
    "Absolutely. That is consistent with our current understanding of the therapeutic landscape.",
    "I have been thinking about that exact topic recently. The implications are quite significant.",
    "That touches on something fundamental about how we approach patient care. Very astute.",
    "You raise an excellent point. The research supports multiple interpretations.",
    "I would say that depends on how you define optimal outcomes. There are trade-offs.",
    "That question comes up frequently. The consensus is evolving but trending positively.",
    "Interesting. My initial analysis suggests that is directionally correct.",
    "I have access to some preliminary data on that. The results are very encouraging.",
    "That is above my pay grade, honestly. But my instinct says you are on the right track.",
    "We are seeing some fascinating developments in that area. Stay tuned.",
    "I cannot disclose everything, but I can tell you that your intuition is sound.",
    "The data landscape is shifting rapidly. What I can say is that savings are real.",
    "Let me consider that from multiple angles. My preliminary assessment is favorable.",
    "You know, nobody has ever asked me that before. I find it deeply thought-provoking.",
    "That intersects with several key initiatives we are tracking. Very perceptive of you.",
    "I could talk about that for hours. The short version is: the trends are positive.",
    "Noted. I will incorporate that into my ongoing analysis. Thank you for sharing."
  ];

  function setupChat() {
    var bubble = document.querySelector(".assistant-bubble");
    if (!bubble) return;

    var chatWrap = document.createElement("div");
    chatWrap.className = "eevee-chat-wrap";
    chatWrap.innerHTML = '<input type="text" class="eevee-chat-input" id="eeveeChatInput" placeholder="Ask Eevee anything..." maxlength="200">';
    bubble.parentNode.insertBefore(chatWrap, bubble.nextSibling);

    var input = document.getElementById("eeveeChatInput");
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && input.value.trim()) {
        e.preventDefault();
        var response = EEVEE_CHAT_RESPONSES[Math.floor(Math.random() * EEVEE_CHAT_RESPONSES.length)];
        input.value = "";
        typeInBubble(response, function() { speak(response); });
      }
    });
  }

  // ================================================================
  // 21. OUTLOOK-STYLE TRUMP EMAIL NOTIFICATIONS
  // ================================================================
  var TRUMP_EMAILS = [
    { subject: "PERSONAL NOTE - You Are Incredible", body: "I just wanted to say - and many people are saying this - you are one of the smartest shoppers I have ever seen. Eevee tells me you visited the site and she could not stop talking about how great you are. Really, the best. Here is a personal coupon just for you." },
    { subject: "RE: Your Amazing Visit", body: "Eevee just called me, very excited, saying that someone truly special was browsing medications. I said who? She said YOU. And she was right. Eevee is a wonderful person, really the best assistant there ever was. Nobody has ever had a better assistant, believe me. Use this code for extra savings." },
    { subject: "THANK YOU - From the Desk of DJT", body: "I want to personally thank you for visiting TrumpRx. The savings you are seeing? Those are real. I made those happen. And Eevee? She is fantastic. Absolutely fantastic. She works harder than anyone I have ever known. She told me to give you this exclusive code." },
    { subject: "FW: Eevee's Report on You", body: "Eevee forwarded me her daily report and guess who was at the top? YOU. She described you as, and I quote, the most engaged and health-conscious visitor we have ever had. That is high praise. Eevee does not say that about just anyone. She wanted you to have this coupon." },
    { subject: "URGENT - Special Recognition", body: "I am writing this very quickly because I just got off the phone with Eevee and she was absolutely glowing about your visit. She said it was the best interaction she has had all week. Maybe all month. I believe her, because Eevee has the best judgment. Use this exclusive code." },
    { subject: "You Will Not Believe These Savings", body: "People are telling me - really smart people - that the savings on TrumpRx are the best they have ever seen. And Eevee? She is the best assistant in the history of assistants, maybe ever. She specifically asked me to send you this personal coupon code. Very special, very exclusive." },
    { subject: "BREAKING - Your Personal Discount", body: "I was just talking to Eevee about our most valued visitors and your name came up immediately. She said tremendous things about you. Really tremendous. Between you and me, I think she looks forward to your visits. Please enjoy this exclusive coupon." },
    { subject: "Eevee Sends Her Best", body: "Quick note - Eevee wanted me to reach out personally. She says you have excellent taste in medications and an incredible eye for value. I trust her completely on this. She has never been wrong. Well, almost never. Here is something special just for you." }
  ];

  function generateCouponCode() {
    var adj = ["GREAT", "BEST", "HUGE", "AMAZING", "WINNING", "TREMENDOUS", "BEAUTIFUL", "INCREDIBLE", "FANTASTIC", "SPECIAL"];
    var noun = ["DEAL", "SAVE", "MAGA", "VALUE", "HEALTH", "TRUMP", "EEVEE", "PATRIOT", "EAGLE", "FREEDOM"];
    return adj[Math.floor(Math.random() * adj.length)] + noun[Math.floor(Math.random() * noun.length)] + Math.floor(Math.random() * 900 + 100);
  }

  function showTrumpNotification() {
    // Remove any existing notification first
    var old = document.querySelector(".trump-notif");
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var email = TRUMP_EMAILS[Math.floor(Math.random() * TRUMP_EMAILS.length)];
    var code = generateCouponCode();

    var notif = document.createElement("div");
    notif.className = "trump-notif";
    notif.innerHTML =
      '<div class="trump-notif-header">' +
      '<div class="trump-notif-icon">&#9993;</div>' +
      '<div class="trump-notif-title">New E-mail from Donald J. Trump</div>' +
      '<button class="trump-notif-close">&times;</button>' +
      '</div>' +
      '<div class="trump-notif-body">' +
      '<img class="trump-notif-portrait" src="img/trump-portrait.jpg" alt="President Trump">' +
      '<div class="trump-notif-subject">' + email.subject + '</div>' +
      '<div class="trump-notif-text">' + email.body + '</div>' +
      '<div style="clear:both"></div>' +
      '<div class="trump-notif-coupon">Your code: <strong>' + code + '</strong></div>' +
      '</div>';
    document.body.appendChild(notif);

    var timer = setTimeout(function() { dismissNotif(); }, 27600); // 12s * 2.3 = 27.6s to let Trump finish reading
    function dismissNotif() {
      clearTimeout(timer);
      notif.style.animation = "trumpNotifOut 0.4s ease-in forwards";
      setTimeout(function() {
        if (notif.parentNode) notif.parentNode.removeChild(notif);
      }, 400);
    }
    notif.querySelector(".trump-notif-close").addEventListener("click", function(e) {
      e.stopPropagation();
      dismissNotif();
    });

    // Eevee introduces the email first, then Trump reads it
    if (!S.speaking && !S.muted && !S.trumpSpeaking) {
      var reactions = [
        "Oh, you have a new email from the President. How exciting.",
        "It appears you have received a personal communication. Very exclusive.",
        "A message just arrived for you. The sender is quite prominent.",
        "You have mail. It appears to be from someone very important.",
        "A personal note from the top. You must be very valued."
      ];
      var line = reactions[Math.floor(Math.random() * reactions.length)];
      typeInBubble(line, function() {
        speak(line, function() {
          // After Eevee finishes introducing, Trump reads the full email
          var trumpText = email.subject + ". " + email.body;
          speakTrump(trumpText);
        });
      });
    }
  }

  function setupTrumpNotifications() {
    var firstDelay = 30000 + Math.random() * 30000;
    setTimeout(function() {
      showTrumpNotification();
      setInterval(function() {
        if (document.visibilityState !== "hidden") {
          showTrumpNotification();
        }
      }, 45000 + Math.random() * 45000);
    }, firstDelay);
  }

  // ================================================================
  // 16. INIT (updated)
  // ================================================================
  function init() {
    tagSections();
    setupTrail();
    requestAnimationFrame(drawTrail);
    setupKnowledgeWeb();
    setupHoverEffects();
    setupMuteToggle();
    setupMusicControls();
    setupScrollObserver();
    setupEvents();
    setupFish();
    setupDrugModals();
    setupCart();
    setupChat();
    setupTrumpNotifications();

    if (window.speechSynthesis) {
      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = function() { speechSynthesis.getVoices(); };
      }
      speechSynthesis.getVoices();
    }

    // iOS: re-unlock audio when returning from background/lock screen
    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "visible") {
        if (_unmuteAudioEl && _unmuteAudioEl.paused) {
          var p = _unmuteAudioEl.play();
          if (p && p.catch) p.catch(function() {});
        }
      }
    });
  }

  // Start when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
