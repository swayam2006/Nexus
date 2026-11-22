// NEXUS A.I. frontend: voice in -> Flask -> voice out
const $ = id => document.getElementById(id);
const core = $('core'), mic = $('mic'), input = $('textInput'), power = $('power');
const LABELS = {idle: 'IDLE – Waiting for commands', listening: 'LISTENING – Listening to you',
                processing: 'PROCESSING – Working on it', speaking: 'SPEAKING – Responding'};
let online = true, listening = false, count = 0, finalText = '';

function setState(s) { core.dataset.state = s; $('stateLabel').textContent = LABELS[s]; }

function setOnline(on) {
  online = on;
  const t = on ? 'ONLINE' : 'OFFLINE';
  $('statusText').textContent = t; $('sysStatus').textContent = t;
  $('status').classList.toggle('off', !on); core.classList.toggle('off', !on);
  power.querySelector('span').textContent = on ? 'Shutdown NEXUS' : 'Activate NEXUS';
  setState('idle');
}

// ---------- Clock ----------
function tick() {
  const n = new Date();
  $('clock').textContent = n.toLocaleTimeString();
  $('sysTime').textContent = n.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  $('date').textContent = n.toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
}
tick(); setInterval(tick, 1000);

// ---------- History ----------
function log(cmd, res, status) {
  const ul = $('history'); ul.querySelector('.empty')?.remove();
  const li = document.createElement('li');
  const ok = status === 'Executed';
  li.innerHTML = `<div class="meta"><span>${new Date().toLocaleTimeString()}</span><span class="${ok ? 'ok' : 'bad'}"></span></div>
    <div class="cmd"></div><div class="res"></div>`;
  li.querySelector('.meta span:last-child').textContent = status;
  li.querySelector('.cmd').textContent = '> ' + cmd;   // textContent avoids HTML injection
  li.querySelector('.res').textContent = res;
  ul.prepend(li);
}

// ---------- Speech output ----------
function speak(text) {
  if (!('speechSynthesis' in window)) return setState('idle');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-IN';
  u.onstart = () => setState('speaking');
  u.onend = u.onerror = () => setState('idle');
  speechSynthesis.speak(u);
}

// ---------- Command logic (JavaScript port of app.py, so no server is needed) ----------
const SITES = {youtube: 'https://www.youtube.com', google: 'https://www.google.com',
               wikipedia: 'https://www.wikipedia.org', spotify: 'https://open.spotify.com'};
// NOTE: replace these lists with the ones from your original script.
const GREETINGS = ['Hello! NEXUS at your service.', 'Hi there! How can I help you today?', 'Hello! All systems are ready.'];
const HOW_ARE_YOU = ["I'm running at full capacity, thank you for asking!", 'All systems are smooth. How are you?'];
const SAD = ["I'm sorry you feel low. Tough times pass, and I'm here if you want to talk.", "Take a deep breath. Things will get better, and I'm right here with you."];
const JOKES = ['Why do programmers prefer dark mode? Because light attracts bugs.', "There are 10 types of people: those who understand binary and those who don't.", 'Why was the computer cold? It left its Windows open.'];
const GOODBYE = 'Goodbye! Shutting down my interface. Call me anytime.';
const UNKNOWN = "Sorry, I didn't understand that. Try 'open YouTube', 'what's the time' or 'play Believer'.";
const pick = a => a[Math.floor(Math.random() * a.length)];
const reply = (response, url = null, ok = true, shutdown = false) =>
  ({response, url, shutdown, status: ok ? 'Executed' : 'Not understood'});

function processCommand(command) {
  const t = command.toLowerCase().replace(/[^\w\s']/g, '').trim();
  if (t.includes('thank you nexus') || t.includes('turn off your system') || t.includes('shutdown nexus'))
    return reply(GOODBYE, null, true, true);
  let m = t.match(/^play (.+)/);
  if (m) {
    const song = m[1].replace(/\s+on spotify$/, '').trim();
    return reply(`Searching Spotify for ${song}.`, 'https://open.spotify.com/search/' + encodeURIComponent(song));
  }
  m = t.match(/open (youtube|google|wikipedia|spotify)/);
  if (m) return reply(`Opening ${m[1][0].toUpperCase() + m[1].slice(1)}.`, SITES[m[1]]);
  if (t.includes('time'))
    return reply('The time is ' + new Date().toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'}));
  if (t.includes('how are you')) return reply(pick(HOW_ARE_YOU));
  if (t.includes('sad')) return reply(pick(SAD));
  if (t.includes('joke')) return reply(pick(JOKES));
  if (/\b(hello|hi|hey)\b/.test(t)) return reply(pick(GREETINGS));
  return reply(UNKNOWN, null, false);
}

// ---------- Run a command ----------
async function send(text) {
  text = text.trim();
  if (!text) return;
  $('heard').textContent = text;
  if (!online) { $('reply').textContent = 'NEXUS is offline. Press Activate NEXUS.'; return; }
  setState('processing');
  try {
    const d = processCommand(text);
    $('reply').textContent = d.response;
    log(text, d.response, d.status);
    $('count').textContent = ++count;
    if (d.url) window.open(d.url, '_blank');
    if (d.shutdown) setOnline(false);
    speak(d.response);
  } catch (e) {
    $('reply').textContent = 'Something went wrong: ' + e.message;
    setState('idle');
  }
}

// ---------- Speech input ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) {
  mic.disabled = true;
  $('voiceStatus').textContent = 'Unavailable – use typed commands';
} else {
  const rec = new SR();
  rec.lang = 'en-IN'; rec.interimResults = true;
  rec.onstart = () => { listening = true; finalText = ''; mic.classList.add('on'); setState('listening'); $('voiceStatus').textContent = 'Listening'; };
  rec.onresult = e => {
    const t = [...e.results].map(r => r[0].transcript).join('');
    $('heard').textContent = t;
    if (e.results[e.results.length - 1].isFinal) finalText = t;
  };
  rec.onerror = e => {
    const msgs = {'not-allowed': 'Microphone permission denied. Allow it in your browser settings.',
                  'no-speech': 'No speech detected. Try again.', 'audio-capture': 'No microphone found.',
                  'network': 'Speech service needs an internet connection (Chrome/Edge).'};
    $('reply').textContent = msgs[e.error] || 'Voice error: ' + e.error;
    $('voiceStatus').textContent = 'Error';
  };
  rec.onend = () => {
    listening = false; mic.classList.remove('on');
    if ($('voiceStatus').textContent === 'Listening') $('voiceStatus').textContent = 'Ready';
    if (finalText) send(finalText); else setState('idle');
  };
  mic.onclick = () => {
    if (listening) return rec.stop();
    if (!online) return send('hello');
    speechSynthesis.cancel();
    try { rec.start(); } catch (e) { /* already started */ }
  };
}

// ---------- Typed input and buttons ----------
input.addEventListener('keydown', e => { if (e.key === 'Enter') { send(input.value); input.value = ''; } });
document.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => send(b.dataset.cmd));
power.onclick = () => {
  if (online) send('you can turn off your system now');
  else { setOnline(true); $('reply').textContent = 'NEXUS reactivated.'; speak('NEXUS is back online.'); }
};
