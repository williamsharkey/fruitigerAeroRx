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
    currentTrack: 0,
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
  function ensureAudio() {
    if (actx) return actx;
    actx = new (window.AudioContext || window.webkitAudioContext)();
    S.audioReady = true;
    return actx;
  }

  // ================================================================
  // 2. SOUND EFFECTS
  // ================================================================
  function playSfx(type) {
    if (!S.audioReady) return;
    var ctx = actx;
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
      osc = ctx.createOscillator(); gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = 600 + Math.random() * 400;
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.06);
    }
  }

  // ================================================================
  // 3. AMBIENT MUSIC ENGINE (Tone.js-free, pure Web Audio)
  // ================================================================
  var musicNodes = [];
  var SCALES = [
    [0,2,4,7,9],      // pentatonic major
    [0,2,3,7,8],      // pentatonic minor
    [0,2,4,5,7,9,11], // major
    [0,2,3,5,7,8,10], // natural minor
    [0,2,4,7,9,12,14],// wide pentatonic
  ];
  var ROOTS = [48, 50, 52, 53, 55, 57, 59, 60]; // C3..C4

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function createPad(ctx, freq, dur, vol) {
    var osc1 = ctx.createOscillator(), osc2 = ctx.createOscillator();
    var gain = ctx.createGain(), filt = ctx.createBiquadFilter();
    osc1.type = "sine"; osc1.frequency.value = freq;
    osc2.type = "triangle"; osc2.frequency.value = freq * 1.002; // slight detune
    filt.type = "lowpass"; filt.frequency.value = freq * 3;
    var now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + dur * 0.3);
    gain.gain.setValueAtTime(vol, now + dur * 0.6);
    gain.gain.linearRampToValueAtTime(0, now + dur);
    osc1.connect(filt); osc2.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
    osc1.start(now); osc2.start(now);
    osc1.stop(now + dur); osc2.stop(now + dur);
    return { stop: function () { try { osc1.stop(); osc2.stop(); } catch (e) {} } };
  }

  function generateTrack(trackIdx) {
    if (!S.audioReady) return;
    var ctx = actx;
    var scaleIdx = trackIdx % SCALES.length;
    var scale = SCALES[scaleIdx];
    var root = ROOTS[trackIdx % ROOTS.length];
    var tempo = 0.8 + (trackIdx % 5) * 0.15; // seconds per note

    // Play a sequence of 16 pad notes
    var notes = [];
    for (var i = 0; i < 16; i++) {
      var deg = scale[Math.floor(Math.random() * scale.length)];
      var octave = Math.floor(Math.random() * 2) * 12;
      notes.push(root + deg + octave);
    }

    var time = ctx.currentTime + 0.1;
    notes.forEach(function (midi, idx) {
      var freq = midiToFreq(midi);
      var dur = tempo * (1.5 + Math.random());
      setTimeout(function () {
        if (S.musicPlaying) createPad(ctx, freq, dur, 0.03);
      }, idx * tempo * 1000);
    });

    // Schedule next track
    var totalDur = notes.length * tempo * 1000;
    if (S.musicPlaying) {
      setTimeout(function () {
        S.currentTrack = (S.currentTrack + 1) % 20;
        generateTrack(S.currentTrack);
      }, totalDur);
    }
  }

  function startMusic() {
    ensureAudio();
    S.musicPlaying = true;
    generateTrack(S.currentTrack);
    updateMusicBtn();
  }
  function stopMusic() {
    S.musicPlaying = false;
    updateMusicBtn();
  }
  function nextTrack() {
    S.currentTrack = (S.currentTrack + 1) % 20;
    if (S.musicPlaying) { stopMusic(); setTimeout(startMusic, 100); }
  }
  function prevTrack() {
    S.currentTrack = (S.currentTrack + 19) % 20;
    if (S.musicPlaying) { stopMusic(); setTimeout(startMusic, 100); }
  }
  function updateMusicBtn() {
    var btn = document.getElementById("playPauseBtn");
    if (btn) btn.textContent = S.musicPlaying ? "||" : "\u25B6";
    var lbl = document.getElementById("trackLabel");
    if (lbl) lbl.textContent = "Track " + (S.currentTrack + 1) + " / 20";
  }

  // ================================================================
  // 4. EEVEE SCRIPTS DATABASE (10+ per major section)
  // ================================================================
  var SCRIPTS = {
    "parody-banner": [
      "This is a parody, of course. But the savings data is real, sourced directly from TrumpRx.gov.",
      "Every price you see here comes from the official government site. We just made it prettier.",
      "A design tribute wrapped around real prescription pricing. The best of both worlds.",
      "Parody and public service, together at last.",
      "All data is verifiable at TrumpRx.gov. We simply reimagined the presentation.",
      "Think of this as the director's cut of prescription drug savings.",
      "The numbers are real. The aesthetic is aspirational.",
      "Fair use, fair prices, fair play.",
      "Satire with substance. Every figure checks out.",
      "We believe beautiful design and accessible healthcare can coexist."
    ],
    "hero": [
      "Welcome to FruitRx. Prescription savings, reimagined for a connected world.",
      "Americans pay up to ten times more for the exact same medications. That's changing now.",
      "The same factories, the same formulas, the same dosages. Only the price is different.",
      "Most-Favored-Nation pricing means America gets the same deal as the rest of the world.",
      "One thousand percent markup on life-saving medication. That was the old normal.",
      "This is the intersection of policy and possibility.",
      "Every prescription filled at these prices is a small victory.",
      "The future of pharmacy is transparent, accessible, and beautifully simple.",
      "Imagine a world where medication costs what it should. You're looking at it.",
      "This isn't just a price list. It's a promise."
    ],
    "comparison": [
      "Gonal-F at ninety-three percent off. From fourteen hundred to one-sixty-eight dollars.",
      "The global reference price is what Canada pays. Now America matches it.",
      "Most-Favored-Nation pricing benchmarks against the lowest price in the developed world.",
      "This comparison shows the gap between what Americans paid and what they should pay.",
      "A single pen of Gonal-F cost nearly fifteen hundred dollars. Not anymore.",
      "The Canadian reference price of three-fifty-five is a fraction of the US price.",
      "Price transparency is the first step toward price fairness.",
      "When you see ninety-three percent off, you're seeing the correction of a decade of overcharging.",
      "These aren't theoretical savings. These are real prices available right now.",
      "Global benchmarking ensures no American pays more than any other developed nation."
    ],
    "trump-widgets": [
      "The Outlook contact card. A relic of the Office 2007 era. Schedule a meeting with the President.",
      "Quote of the day, delivered via Vista Sidebar gadget. Peak two-thousand-seven energy.",
      "Big Pharma price gouging: over. That's straight from the source.",
      "This is styled after Windows Vista's sidebar widgets. Remember those?",
      "The most impactful prescription price reset in American history. Bold claim.",
      "Available status on Outlook. The President is taking your call.",
      "D.C. headquarters, Prescription Pricing Division. Sounds official.",
      "Every American gets the lowest price in the developed world. That's the mission statement.",
      "Send email, add to contacts, schedule meeting. The classics.",
      "More money in Americans' pockets. Care back within reach. The vision."
    ],
    "medications": [
      "Forty-three medications and counting. Sorted by discount, the biggest savings are at the top.",
      "Wegovy Pill at one-forty-nine a month, down from thirteen-forty-nine. Eighty-nine percent off.",
      "Ozempic, Wegovy, Zepbound. The GLP-1 drugs are all here at dramatically reduced prices.",
      "Cetrotide leads the list at ninety-three percent off. Twenty-two fifty instead of three-sixteen.",
      "Each card links directly to the official TrumpRx detail page for that medication.",
      "The images behind each card are from Wikimedia Commons. Nature, oceans, aurora borealis.",
      "Zepbound by Eli Lilly at two-ninety-nine. Was over a thousand dollars.",
      "Even at fifty percent off, these savings add up to thousands per year for many patients.",
      "Every medication shown is available through participating retail pharmacies nationwide.",
      "The browse page has search and sort. Find your medication in seconds."
    ],
    "nature-panel": [
      "Next-generation prescriptions, available today. The future of accessible healthcare.",
      "This aurora image was captured over Lapland. Nature and technology in harmony.",
      "Live optimized. That's not just a tagline, it's what affordable medication enables.",
      "The northern lights remind us that the most beautiful things are also the most natural.",
      "Pharmacological breakthroughs shouldn't be reserved for the wealthy few.",
      "Behind every price reduction is a family that can now afford their medication.",
      "The intersection of nature and innovation. That's the spirit of modern medicine.",
      "These savings are as real as the aurora in this photograph.",
      "Healthcare that works for everyone. That's the goal.",
      "Affordable, accessible, available. The three A's of modern pharmacy."
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
      "New medications are added regularly. Stay connected for updates.",
      "Subscribe on TrumpRx.gov to never miss a new saving.",
      "The catalog is expanding. More drugs, more savings, more access.",
      "Forty-three is just the beginning. Watch this space.",
      "Every new medication added is another step toward universal affordability.",
      "The notification system keeps you informed the moment new prices drop.",
      "From GLP-1 drugs to antibiotics, the range keeps growing.",
      "Connected healthcare means you're always in the loop.",
      "Set it and forget it. Get notified when your medication becomes available.",
      "The future of pharmacy is proactive, not reactive."
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
    // Ethereal pad shimmer that plays alongside speech - Cocteau Twins vibe
    if (!S.audioReady) return;
    var ctx = actx;
    var now = ctx.currentTime;
    // Play 3 soft detuned shimmer tones
    var freqs = [440, 554, 660]; // A4, C#5, E5 (A major triad, dreamy)
    freqs.forEach(function(f, i) {
      var osc1 = ctx.createOscillator(), osc2 = ctx.createOscillator();
      var gain = ctx.createGain();
      var filt = ctx.createBiquadFilter();
      osc1.type = "sine"; osc1.frequency.value = f * 1.5; // up an octave for shimmer
      osc2.type = "sine"; osc2.frequency.value = f * 1.503; // slight detune = chorus
      filt.type = "lowpass"; filt.frequency.value = 2000;
      filt.Q.value = 2;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.012, now + 0.8);
      gain.gain.setValueAtTime(0.012, now + 4);
      gain.gain.linearRampToValueAtTime(0, now + 7);
      osc1.connect(filt); osc2.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
      osc1.start(now + i * 0.3); osc2.start(now + i * 0.3);
      osc1.stop(now + 7); osc2.stop(now + 7);
      reverbShimmerNodes.push({ stop: function() { try { osc1.stop(); osc2.stop(); } catch(e){} } });
    });
  }

  function stopReverbShimmer() {
    reverbShimmerNodes.forEach(function(n) { n.stop(); });
    reverbShimmerNodes = [];
  }

  function speak(text, onEnd) {
    if (S.muted || !window.speechSynthesis) { if (onEnd) onEnd(); return; }
    window.speechSynthesis.cancel();
    var utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.82;   // slower, more ethereal
    utter.pitch = 1.55;  // high, airy, Cocteau Twins
    utter.volume = 0.75;
    // Prefer a female English voice
    var voices = speechSynthesis.getVoices();
    var preferred = voices.find(function(v) { return /samantha|karen|moira|fiona|victoria/i.test(v.name); });
    if (!preferred) preferred = voices.find(function(v) { return v.lang.startsWith("en") && /female/i.test(v.name); });
    if (!preferred) preferred = voices.find(function(v) { return v.lang.startsWith("en"); });
    if (preferred) utter.voice = preferred;
    utter.onend = function () { S.speaking = false; if (onEnd) onEnd(); };
    S.speaking = true;
    // Play ethereal shimmer pad alongside the voice
    playReverbShimmer();
    speechSynthesis.speak(utter);
  }

  // ================================================================
  // 6. EEVEE BUBBLE & TYPING EFFECT
  // ================================================================
  function typeInBubble(text, cb) {
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
    var interval = setInterval(function () {
      if (idx < text.length) {
        textEl.textContent += text[idx];
        idx++;
      } else {
        clearInterval(interval);
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
    if (S.muted || S.speaking || S.speakCooldown) return;
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
    for (var i = 0; i < n; i++) {
      var angle = (i / n) * Math.PI * 2 + t * 0.3;
      var radius = 60 + Math.sin(t * 0.5 + i) * 10;
      var x = cx + Math.cos(angle) * radius - 30;
      var y = cy + Math.sin(angle) * radius - 8;
      words[i].style.cssText = "position:fixed;left:" + x + "px;top:" + y + "px;" +
        "font-size:0.82rem;font-family:Cabin,sans-serif;font-weight:700;" +
        "color:rgba(30,100,180,0.55);pointer-events:none;white-space:nowrap;" +
        "text-shadow:0 0 6px rgba(60,140,220,0.3), 0 1px 2px rgba(0,40,80,0.15);transition:none;";
    }
    // Draw connecting lines on trail canvas
    if (S.trailCtx && n > 1) {
      var ctx = S.trailCtx;
      ctx.strokeStyle = "rgba(30,100,180,0.15)";
      ctx.lineWidth = 0.8;
      for (var j = 0; j < n; j++) {
        for (var k = j + 1; k < n; k++) {
          var a1 = (j / n) * Math.PI * 2 + t * 0.3;
          var a2 = (k / n) * Math.PI * 2 + t * 0.3;
          var r1 = 60 + Math.sin(t * 0.5 + j) * 10;
          var r2 = 60 + Math.sin(t * 0.5 + k) * 10;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1);
          ctx.lineTo(cx + Math.cos(a2) * r2, cy + Math.sin(a2) * r2);
          ctx.stroke();
        }
      }
    }
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

  // Play a unique short melody for a drug (deterministic per slug)
  function playDrugMelody(slug) {
    stopDrugMelody();
    if (!S.audioReady) return;
    var ctx = actx;
    var h = hashStr(slug);
    var scale = SCALES[h % SCALES.length];
    var root = 55 + (h % 12); // variety of roots around G3-F#4
    var tempo = 0.25 + (h % 4) * 0.05;
    var waveTypes = ["sine", "triangle", "sine", "square"];
    var waveType = waveTypes[h % waveTypes.length];
    var now = ctx.currentTime;

    // 8-note phrase
    for (var i = 0; i < 8; i++) {
      var deg = scale[(h + i * 3) % scale.length];
      var oct = ((h + i) % 3 === 0) ? 12 : 0;
      var freq = midiToFreq(root + deg + oct);
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      var filt = ctx.createBiquadFilter();
      osc.type = waveType;
      osc.frequency.value = freq;
      filt.type = "lowpass";
      filt.frequency.value = 1200 + (h % 800);
      var noteStart = now + i * tempo;
      var noteDur = tempo * 1.8;
      gain.gain.setValueAtTime(0, noteStart);
      gain.gain.linearRampToValueAtTime(0.04, noteStart + 0.03);
      gain.gain.setValueAtTime(0.04, noteStart + noteDur * 0.5);
      gain.gain.linearRampToValueAtTime(0, noteStart + noteDur);
      osc.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
      osc.start(noteStart);
      osc.stop(noteStart + noteDur);
      drugMelodyNodes.push({ stop: function() { try { this.o.stop(); } catch(e){} }, o: osc });
    }
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
        playSfx("hover");
      });
      el.addEventListener("mouseleave", function () {
        el.style.transform = "";
      });
    });

    // Drug card hover -> triggers Eevee narration + unique melody
    var drugCards = document.querySelectorAll(".drug-card");
    drugCards.forEach(function (card) {
      card.addEventListener("mouseenter", function () {
        playSfx("hover");
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

        // Play unique melody for this drug
        playDrugMelody(slug);

        // Trigger Eevee narration (immediate, no cooldown check for hover)
        if (!S.muted && !S.speaking) {
          var script = pickScript(slug);
          if (script) {
            glowDiv(card);
            typeInBubble(script, function () {
              speak(script);
            });
          }
        }
      });
      card.addEventListener("mouseleave", function () {
        stopDrugMelody();
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

    // Click SFX
    document.addEventListener("click", function () {
      ensureAudio();
      playSfx("click");
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

    // First interaction -> startup sound + autostart music
    var startupPlayed = false;
    function onFirstInteraction() {
      if (startupPlayed) return;
      startupPlayed = true;
      ensureAudio();
      playSfx("startup");
      // Autostart ambient music
      setTimeout(function() { startMusic(); }, 1200);
      // Load voices for TTS
      if (speechSynthesis && speechSynthesis.getVoices) speechSynthesis.getVoices();
    }
    document.addEventListener("click", onFirstInteraction, { once: false });
    document.addEventListener("scroll", onFirstInteraction, { once: true });
    document.addEventListener("mousemove", onFirstInteraction, { once: true });
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
  // 17. SWIMMING FISH (with water sounds)
  // ================================================================
  var fishWaterInterval = null;

  function setupFish() {
    var pond = document.getElementById("fishPond");
    if (!pond) return;

    var FISH_COUNT = 8;
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

    var fishState = [];
    for (var i = 0; i < FISH_COUNT; i++) {
      var el = document.createElement("div");
      el.className = "fish";
      el.innerHTML = makeFishSVG(FISH_COLORS[i % FISH_COLORS.length]);
      // Fish hover -> splash sound (pointer-events enabled for hover detection)
      el.style.pointerEvents = "auto";
      el.addEventListener("mouseenter", function() {
        if (S.audioReady) playSplashSfx();
      });
      pond.appendChild(el);

      var goingRight = Math.random() > 0.5;
      fishState.push({
        el: el,
        x: Math.random() * (pond.offsetWidth || 800),
        y: 30 + Math.random() * 140,
        vx: (1 + Math.random() * 1.5) * (goingRight ? 1 : -1),
        phase: Math.random() * Math.PI * 2,
        freq: 0.3 + Math.random() * 0.4,
        amp: 15 + Math.random() * 25,
        size: 0.7 + Math.random() * 0.6
      });
    }

    // Ambient water sounds when fish pond is visible
    var fishObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          // Start periodic gentle water sounds
          if (!fishWaterInterval && S.audioReady) {
            fishWaterInterval = setInterval(function() {
              if (S.audioReady) playSfx("water");
            }, 1500 + Math.random() * 2000);
          }
        } else {
          if (fishWaterInterval) {
            clearInterval(fishWaterInterval);
            fishWaterInterval = null;
          }
        }
      });
    }, { threshold: 0.1 });
    fishObserver.observe(pond);

    function animateFish() {
      var w = pond.offsetWidth || 800;
      var t = Date.now() / 1000;
      for (var i = 0; i < fishState.length; i++) {
        var f = fishState[i];
        f.x += f.vx;
        var yOff = Math.sin(t * f.freq + f.phase) * f.amp;
        var displayY = f.y + yOff;

        if (f.x > w + 80) {
          f.vx = -(1 + Math.random() * 1.5);
        } else if (f.x < -80) {
          f.vx = (1 + Math.random() * 1.5);
        }

        var scaleX = f.vx > 0 ? f.size : -f.size;
        var scaleY = f.size;
        f.el.style.transform = "translate(" + f.x.toFixed(1) + "px," + displayY.toFixed(1) + "px) scale(" + scaleX.toFixed(2) + "," + scaleY.toFixed(2) + ")";
      }
      requestAnimationFrame(animateFish);
    }
    requestAnimationFrame(animateFish);
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

    if (speechSynthesis && speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = function () {};
    }
  }

  // Start when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
