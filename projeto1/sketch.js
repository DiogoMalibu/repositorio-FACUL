// =============================================
// MIC → TEXT INTERATIVO
// p5.js + p5.sound + Web Speech API
//
// INTERATIVIDADE:
//  • Hover  → palavra cresce, muda de cor e vibra
//  • Click  → explosão de partículas + bounce
//  • Drag   → arrasta palavras pelo canvas
//  • Duplo-click → palavra explode e desaparece
//  • Volume alto  → todas as palavras pulsam
//  • ESPAÇO / clique fora → ativa/desativa mic
// =============================================

let mic, fft, amplitude;
let recognition;
let words       = [];
let particles   = [];
let interimText = '';
let isListening = false;
const MAX_WORDS = 35;
let glitchTimer = 0;
let scanlineY   = 0;
let dragging    = null;   // palavra a ser arrastada
let dragOffX    = 0, dragOffY = 0;
let lastClickTime = 0;

// ── Classe Palavra ─────────────────────────────────────────────
class Word {
  constructor(txt) {
    this.text    = txt;
    this.baseSize = random(22, 42);
    this.size    = this.baseSize;
    this.x       = random(60, width  - 60);
    this.y       = random(90, height - 150);
    this.vx      = random(-1.2, 1.2);
    this.vy      = random(-1.2, 1.2);
    this.alpha   = 0;           // fade-in
    this.hovered = false;
    this.clicked = false;
    this.clickTimer = 0;
    this.glitch  = random() > 0.8;
    this.hue     = random(100, 160); // verde terminal, varia um pouco
    this.angle   = random(-0.08, 0.08);
    this.angleV  = 0;
    this.dead    = false;
    this.born    = frameCount;
  }

  update(vol) {
    // Fade-in
    this.alpha = min(255, this.alpha + 8);

    // Deriva suave
    if (!dragging || dragging !== this) {
      this.x += this.vx;
      this.y += this.vy;

      // Bounce nas bordas
      if (this.x < 30 || this.x > width  - 30) this.vx *= -1;
      if (this.y < 70 || this.y > height - 140) this.vy *= -1;
      this.x = constrain(this.x, 30, width  - 30);
      this.y = constrain(this.y, 70, height - 140);
    }

    // Rotação amortecida
    this.angleV *= 0.9;
    this.angle  += this.angleV;

    // Hover: verifica se o rato está em cima
    textSize(this.size);
    const hw = textWidth(this.text) / 2;
    const hh = this.size / 2;
    this.hovered = (mouseX > this.x - hw - 6 && mouseX < this.x + hw + 6 &&
                    mouseY > this.y - hh - 4 && mouseY < this.y + hh + 4);

    // Tamanho reativo ao hover e volume
    const volBoost = map(vol, 0, 0.4, 0, 14);
    const target   = this.hovered ? this.baseSize * 1.6 : this.baseSize + volBoost;
    this.size      = lerp(this.size, target, 0.12);

    // Click bounce decay
    if (this.clickTimer > 0) this.clickTimer--;
  }

  draw() {
    if (this.dead) return;
    push();
    translate(this.x, this.y);
    rotate(this.angle);

    textAlign(CENTER, CENTER);
    textSize(this.size);

    // Sombra / glow
    const glowA = this.hovered ? 80 : 30;
    for (let s = 3; s >= 1; s--) {
      fill(0, this.hue + 40, 60, glowA / s);
      noStroke();
      text(this.text, s, s);
    }

    // Glitch cromático no hover
    if (this.hovered || (this.glitch && glitchTimer > 0 && frameCount % 3 === 0)) {
      fill(255, 40, 40, 120);
      text(this.text, random(-4, 4), random(-2, 2));
      fill(0, 200, 255, 100);
      text(this.text, random(-3, 3), 0);
    }

    // Cor principal
    const bright = this.hovered ? 255 : 180;
    const g      = this.hovered ? 255 : this.hue + 60;
    fill(0, g, bright * 0.3, this.alpha);
    if (this.hovered) {
      stroke(0, 255, 120, 160);
      strokeWeight(0.5);
    } else {
      noStroke();
    }
    text(this.text, 0, 0);

    // Sublinhado no hover
    if (this.hovered) {
      const tw = textWidth(this.text);
      stroke(0, 255, 80, 200);
      strokeWeight(1.5);
      line(-tw / 2, this.size * 0.55, tw / 2, this.size * 0.55);
    }

    pop();
  }

  // Explosão ao ser clicado
  burst(strong) {
    const n = strong ? 40 : 18;
    for (let i = 0; i < n; i++) {
      particles.push(new Particle(this.x, this.y, this.hue, strong));
    }
    this.clickTimer = 12;
    this.angleV     = random(-0.3, 0.3);
    if (strong) this.dead = true;
  }

  contains(px, py) {
    textSize(this.size);
    const hw = textWidth(this.text) / 2;
    const hh = this.size / 2;
    return (px > this.x - hw - 6 && px < this.x + hw + 6 &&
            py > this.y - hh - 4 && py < this.y + hh + 4);
  }
}

// ── Classe Partícula ───────────────────────────────────────────
class Particle {
  constructor(x, y, hue, strong) {
    this.x    = x + random(-10, 10);
    this.y    = y + random(-10, 10);
    const spd = strong ? random(4, 12) : random(1, 6);
    const a   = random(TWO_PI);
    this.vx   = cos(a) * spd;
    this.vy   = sin(a) * spd - random(1, 3);
    this.life = 255;
    this.decay= strong ? random(6, 12) : random(4, 8);
    this.size = strong ? random(3, 8)  : random(2, 5);
    this.hue  = hue + random(-20, 20);
    this.char = random(['0','1','█','▓','▒','░','#','@','*']) ;
  }
  update() {
    this.x    += this.vx;
    this.y    += this.vy;
    this.vy   += 0.25;
    this.vx   *= 0.95;
    this.life -= this.decay;
  }
  draw() {
    noStroke();
    fill(0, this.hue + 80, 60, this.life);
    textSize(this.size * 2.5);
    textAlign(CENTER, CENTER);
    text(this.char, this.x, this.y);
  }
  isDead() { return this.life <= 0; }
}

// ── Setup ──────────────────────────────────────────────────────
function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont('monospace');

  mic       = new p5.AudioIn();
  fft       = new p5.FFT(0.85, 64);
  amplitude = new p5.Amplitude();
  fft.setInput(mic);
  amplitude.setInput(mic);

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    words.push(new Word('SPEECH'));
    words.push(new Word('NOT'));
    words.push(new Word('SUPPORTED'));
    return;
  }

  recognition = new SR();
  recognition.lang          = 'pt-PT';
  recognition.continuous    = true;
  recognition.interimResults = true;

  recognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        t.trim().split(/\s+/).forEach(w => {
          if (w) {
            words.push(new Word(w.toUpperCase()));
            if (words.length > MAX_WORDS) {
              words.shift();
            }
          }
        });
        glitchTimer = 15;
      } else {
        interim = t;
      }
    }
    interimText = interim.toUpperCase();
  };

  recognition.onerror = (e) => {
    if (e.error !== 'no-speech')
      words.push(new Word('[ERR:' + e.error + ']'));
  };

  recognition.onend = () => { if (isListening) recognition.start(); };
}

// ── Interação ──────────────────────────────────────────────────
function toggleListen() {
  if (!isListening) {
    mic.start();
    if (recognition) recognition.start();
    isListening = true;
  } else {
    mic.stop();
    if (recognition) recognition.stop();
    isListening = false;
    interimText = '';
  }
}

function mousePressed() {
  // Verifica duplo clique (< 300ms)
  const now = millis();
  const dbl = (now - lastClickTime) < 300;
  lastClickTime = now;

  // Procura palavra clicada (de trás para a frente)
  for (let i = words.length - 1; i >= 0; i--) {
    if (words[i].contains(mouseX, mouseY)) {
      if (dbl) {
        // Duplo clique → explode e remove
        words[i].burst(true);
        words.splice(i, 1);
      } else {
        // Clique simples → burst + arrasta
        words[i].burst(false);
        dragging  = words[i];
        dragOffX  = mouseX - words[i].x;
        dragOffY  = mouseY - words[i].y;
      }
      return;
    }
  }

  // Clique no vazio → toggle mic
  toggleListen();
}

function mouseDragged() {
  if (dragging) {
    dragging.x = mouseX - dragOffX;
    dragging.y = mouseY - dragOffY;
    dragging.vx = (mouseX - pmouseX) * 0.4;
    dragging.vy = (mouseY - pmouseY) * 0.4;
  }
}

function mouseReleased() { dragging = null; }

function keyPressed() {
  if (key === ' ') toggleListen();
  // 'C' limpa todas as palavras
  if (key === 'c' || key === 'C') {
    words.forEach(w => w.burst(true));
    setTimeout(() => words = [], 400);
  }
}

// ── Draw ───────────────────────────────────────────────────────
function draw() {
  background(0, 0, 0, 200);

  const vol = isListening ? amplitude.getLevel() : 0;

  // Scanlines
  scanlineY = (scanlineY + 2) % height;
  stroke(0, 255, 80, 12);
  strokeWeight(1);
  for (let y = 0; y < height; y += 4) line(0, y, width, y);
  noStroke();
  fill(0, 255, 80, 5);
  rect(0, scanlineY, width, 80);

  // Waveform
  if (isListening) {
    const wave = fft.waveform();
    noFill();
    stroke(0, 255, 80, 140);
    strokeWeight(1.5);
    beginShape();
    for (let i = 0; i < wave.length; i++) {
      const x = map(i, 0, wave.length, 0, width);
      const y = map(wave[i], -1, 1, height - 10, height - 110);
      vertex(x, y);
    }
    endShape();
    // Barra vol
    const bw = map(vol, 0, 0.4, 0, width * 0.5);
    noStroke();
    fill(0, 255, 80, 25); rect(width/2 - bw/2, height-16, bw, 6, 3);
    fill(0, 255, 80, 140); rect(width/2 - bw/2, height-16, bw*0.6, 6, 3);
  }

  // ── Header ──
  noStroke();
  fill(0, 255, 80, 45);
  rect(0, 0, width, 52);
  fill(0, 255, 80);
  textSize(13);
  textAlign(LEFT, CENTER);
  text('// MIC → TEXT INTERATIVO', 24, 26);
  textAlign(RIGHT, CENTER);
  if (isListening) {
    fill(255, 60, 60);
    if (sin(frameCount * 0.15) > 0) { ellipse(width - 68, 27, 9, 9); fill(0,255,80); }
    text('● REC  [CLICK VAZIO=MIC | DRAG=MOVER | 2×CLICK=EXPLODIR | C=LIMPAR]', width - 24, 26);
  } else {
    fill(0, 255, 80, 120);
    text('○ IDLE  [CLICK PARA INICIAR]', width - 24, 26);
  }

  stroke(0, 255, 80, 40); strokeWeight(1);
  line(0, 52, width, 52);
  line(0, height - 130, width, height - 130);

  // Placeholder
  if (words.length === 0) {
    noStroke();
    fill(0, 255, 80, 30);
    textSize(14);
    textAlign(CENTER, CENTER);
    text('[ AGUARDANDO INPUT DE MICROFONE ]', width/2, height/2);
  }

  // ── Palavras ──
  words = words.filter(w => !w.dead);
  words.forEach(w => { w.update(vol); w.draw(); });

  // ── Partículas ──
  particles = particles.filter(p => !p.isDead());
  particles.forEach(p => { p.update(); p.draw(); });

  // ── Texto interim ──
  if (interimText) {
    noStroke();
    const pulse = map(sin(frameCount * 0.18), -1, 1, 80, 200);
    fill(0, pulse, 50, 180);
    textSize(20);
    textAlign(CENTER, BOTTOM);
    text('› ' + interimText + ' ‹', width / 2, height - 135);
  }

  // Cursor
  if (isListening && frameCount % 40 < 20) {
    noStroke(); fill(0, 255, 80);
    rect(width / 2 - 6, height - 125, 12, 20);
  }

  if (glitchTimer > 0) glitchTimer--;

  // Cantos
  stroke(0, 255, 80, 40); strokeWeight(1); noFill();
  const cs = 20;
  line(0,cs,0,0); line(0,0,cs,0);
  line(width-cs,0,width,0); line(width,0,width,cs);
  line(0,height-cs,0,height); line(0,height,height,height);
  line(width-cs,height,width,height); line(width,height,width,height-cs);

  // Status bar
  noStroke(); fill(0,255,80,22); rect(0,height-26,width,26);
  fill(0,255,80,90); textSize(11);
  textAlign(LEFT,CENTER);
  text(`WORDS: ${words.length}/${MAX_WORDS}  |  VOL: ${nf(vol,1,3)}  |  PARTICLES: ${particles.length}  |  FPS: ${round(frameRate())}`, 16, height-13);
  textAlign(RIGHT,CENTER);
  text('HOVER · DRAG · 2×CLICK · C=CLEAR', width-16, height-13);
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }