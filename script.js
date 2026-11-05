// =====================================================
//  AIR PUMP VOLUME ADJUSTER 3000 - script.js
//  The balloon's inflation % IS the volume. No sliders!
// =====================================================

// ---------- 1. State: everything the app remembers ----------
let volume = 0;          // 0 - 100, the balloon size AND the sound level
let totalPumps = 0;
let totalReleased = 0;
let chaosMode = false;
let popping = false;     // blocks input during the explosion

// ---------- 2. Grab page elements ----------
const $ = (id) => document.getElementById(id);
const balloon = $("balloon"), pump = $("pump"), message = $("message");

// ---------- 3. Funny text ----------
const messages = [
  "Your balloon appreciates your effort.",
  "Neighbours have been emotionally notified.",
  "The balloon is questioning your intentions.",
  "Maximum inflation detected. Please remain calm.",
  "The balloon says this is not a personal attack.",
  "Congratulations! You have achieved absolutely nothing.",
  "A slider would have taken 0.2 seconds. Proud of you.",
  "Air is being converted into decibels. Legally."
];
const chaosMessages = [
  "CHAOS: The balloon has left the group chat.",
  "CHAOS: Physics has filed a complaint.",
  "CHAOS: Volume is now a suggestion.",
  "CHAOS: Your pump has unionised.",
  "CHAOS: Nobody knows what is happening. Great."
];
const dramaLevels = ["Calm", "Mild eyebrow raise", "Soap opera", "Telenovela", "Shakespearean", "Maximum Drama™"];
const neighbourLevels = ["None", "Curious", "Concerned", "Knocking on the wall", "Calling the landlord", "Calling the balloon police"];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// ---------- 4. Web Audio API: a test tone whose loudness follows the balloon ----------
// We NEVER touch the computer's master volume - only our own gain node.
let audioCtx = null, gainNode = null, melodyTimer = null, noteIndex = 0;

function getAudio() {
  // Browsers only allow audio after a click, so we create it lazily.
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Retro arcade tune (frequencies in Hz): 16 steps that repeat forever
const lead = [262, 330, 392, 523, 392, 330, 262, 330, 294, 370, 440, 587, 440, 370, 294, 370];

function startTone() {
  if (melodyTimer) return;                // already playing
  const ctx = getAudio();
  gainNode = ctx.createGain();            // ONE gain node = the balloon's volume knob
  gainNode.connect(ctx.destination);
  applyToneVolume();
  playStep();
  melodyTimer = setInterval(playStep, 150);   // one beat every 0.15 seconds
  setMessage("Arcade mode started. A fuller balloon plays louder and higher.");
}

function playStep() {
  const now = audioCtx.currentTime;
  const step = noteIndex % lead.length;
  noteIndex++;
  const pitch = 1 + (volume / 100) * 0.5; // fuller balloon = higher pitch

  // Lead note: a square wave (classic video-game sound) softened by a low-pass filter
  const osc = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const env = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.value = lead[step] * pitch;
  filter.type = "lowpass";
  filter.frequency.value = 1600;
  env.gain.setValueAtTime(0.3, now);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
  osc.connect(filter).connect(env).connect(gainNode);
  osc.start(now);
  osc.stop(now + 0.14);

  // Drum: a sine wave that drops in pitch = a kick drum, on every 4th step
  if (step % 4 === 0) {
    const kick = audioCtx.createOscillator();
    const kickEnv = audioCtx.createGain();
    kick.frequency.setValueAtTime(160, now);
    kick.frequency.exponentialRampToValueAtTime(40, now + 0.12);
    kickEnv.gain.setValueAtTime(0.9, now);
    kickEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    kick.connect(kickEnv).connect(gainNode);
    kick.start(now);
    kick.stop(now + 0.15);
  }
}

function stopTone() {
  if (!melodyTimer) return;
  clearInterval(melodyTimer);
  melodyTimer = null;
  gainNode.disconnect();
  gainNode = null;
  setMessage("Silence restored. The balloon is relieved.");
}

function applyToneVolume() {
  // volume 0-100 -> gain 0-0.5 (kept below 1 to protect your ears)
  if (gainNode) gainNode.gain.setTargetAtTime((volume / 100) * 0.5, audioCtx.currentTime, 0.03);
}

function playPopSound() {
  // A short burst of random noise that fades out = a "pop".
  const ctx = getAudio();
  const length = ctx.sampleRate * 0.25;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = 0.8;
  src.buffer = buffer;
  src.connect(g).connect(ctx.destination);
  src.start();
}

// ---------- 5. Updating the screen ----------
function setMessage(text) { message.textContent = text; }

function render() {
  // Balloon scale goes from 0.2 (tiny) to 1.0 (huge) in step with the volume %.
  document.documentElement.style.setProperty("--scale", 0.2 + 0.8 * (volume / 100));
  $("balloonText").textContent = Math.round(volume) + "%";
  $("statVolume").textContent = Math.round(volume) + "%";
  $("statPumps").textContent = totalPumps;
  $("statReleased").textContent = Math.round(totalReleased);
  // Drama and neighbour levels climb as the balloon fills (0-5)
  const level = Math.min(5, Math.floor(volume / 20));
  $("statDrama").textContent = dramaLevels[level];
  $("statNeighbour").textContent = neighbourLevels[level];
  balloon.classList.toggle("tense", volume >= 80);
  // Face mood: happy (default) -> nervous at 40% -> panicking at 80%
  balloon.classList.remove("mood-nervous", "mood-panic");
  if (volume >= 80) balloon.classList.add("mood-panic");
  else if (volume >= 40) balloon.classList.add("mood-nervous");
  applyToneVolume();
}

function wobble() {
  balloon.classList.remove("wobble");
  void balloon.offsetWidth;               // restarts the CSS animation
  balloon.classList.add("wobble");
}

// ---------- 6. Pump and release ----------
function pumpAir() {
  if (popping) return;
  // Normal: +5. Chaos: random 1-30.
  const amount = chaosMode ? 1 + Math.floor(Math.random() * 30) : 5;
  volume = Math.min(100, volume + amount);   // can never go above 100
  totalPumps++;

  pump.classList.add("pumping");
  setTimeout(() => pump.classList.remove("pumping"), 120);
  wobble();

  if (chaosMode) {
    setMessage(pick(chaosMessages));
    document.documentElement.style.setProperty("--hue", Math.floor(Math.random() * 360) + "deg");
  } else {
    setMessage(pick(messages));
  }
  render();
  if (volume >= 100) explode();             // pop exactly at 100%
}

function releaseAir() {
  if (popping) return;
  const before = volume;
  volume = Math.max(0, volume - 10);
  totalReleased += before - volume;
  wobble();
  setMessage(volume === 0 ? "The balloon is empty. So is the room." : "Pfffffffffft. Air has left the building.");
  render();
}

// ---------- 7. The explosion ----------
function explode() {
  popping = true;
  playPopSound();
  setMessage("POP! BOOM! BALLOON OVERLOAD DETECTED!");
  $("popOverlay").classList.add("show");
  document.body.classList.add("shake");
  launchConfetti();

  setTimeout(() => {
    totalReleased += 100;                   // all that air went somewhere
    volume = 0;                             // auto-reset to 0%
    popping = false;
    $("popOverlay").classList.remove("show");
    document.body.classList.remove("shake");
    setMessage("A new balloon has appeared. Nobody asked for this.");
    render();
  }, 1600);
}

// ---------- 8. Confetti (simple canvas animation, no libraries) ----------
function launchConfetti() {
  const canvas = $("confetti"), c = canvas.getContext("2d");
  canvas.width = innerWidth; canvas.height = innerHeight;
  const colors = ["#ff4fa3", "#ffd93d", "#4db8ff", "#7CFC8A", "#ffffff"];
  const bits = Array.from({ length: 160 }, () => ({
    x: innerWidth / 2, y: innerHeight / 2,
    vx: (Math.random() - 0.5) * 22, vy: Math.random() * -18 - 4,
    size: 6 + Math.random() * 8, color: pick(colors), spin: Math.random() * 6
  }));
  let frames = 0;
  (function step() {
    c.clearRect(0, 0, canvas.width, canvas.height);
    bits.forEach((b) => {
      b.vy += 0.5; b.x += b.vx; b.y += b.vy; b.spin += 0.2;   // gravity
      c.save(); c.translate(b.x, b.y); c.rotate(b.spin);
      c.fillStyle = b.color; c.fillRect(-b.size / 2, -b.size / 2, b.size, b.size * 0.6);
      c.restore();
    });
    if (++frames < 110) requestAnimationFrame(step);
    else c.clearRect(0, 0, canvas.width, canvas.height);
  })();
}

// ---------- 9. Chaos mode and reset ----------
function toggleChaos() {
  chaosMode = !chaosMode;
  $("chaosBtn").textContent = "CHAOS MODE: " + (chaosMode ? "ON 🔥" : "OFF");
  $("chaosBtn").classList.toggle("active", chaosMode);
  if (!chaosMode) document.documentElement.style.setProperty("--hue", "0deg");
  setMessage(chaosMode ? "Chaos Mode enabled. Pumps now do random things." : "Order restored. Boring, but safe.");
}

function resetUniverse() {
  volume = 0; totalPumps = 0; totalReleased = 0; popping = false;
  chaosMode = false;
  $("chaosBtn").textContent = "CHAOS MODE: OFF";
  $("chaosBtn").classList.remove("active");
  document.documentElement.style.setProperty("--hue", "0deg");
  $("popOverlay").classList.remove("show");
  setMessage("The universe has been reset. Please try again, but better.");
  render();
}

// ---------- 10. Connect buttons to functions ----------
$("pumpBtn").addEventListener("click", pumpAir);
$("releaseBtn").addEventListener("click", releaseAir);
$("soundBtn").addEventListener("click", startTone);
$("stopBtn").addEventListener("click", stopTone);
$("chaosBtn").addEventListener("click", toggleChaos);
$("resetBtn").addEventListener("click", resetUniverse);

render();   // draw the starting state