import fs from 'fs/promises';

interface ExportOptions {
  kniFiles: { name: string; content: string }[];
  assets: { name: string; data: string }[];
  gameData: string;
}

const PLAYER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>kNi Player</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#app{height:100%;width:100%;overflow:hidden;background:#0d0d1a;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
#screen{position:relative;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end}
#bg{position:absolute;inset:0;background-size:cover;background-position:center;z-index:0}
#dialog-box{position:relative;z-index:1;width:90%;max-width:800px;background:rgba(0,0,0,.85);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:20px 24px;margin-bottom:24px;min-height:120px;cursor:pointer;transition:opacity .2s}
#dialog-name{font-weight:bold;font-size:14px;margin-bottom:6px}
#dialog-text{font-size:16px;line-height:1.6;white-space:pre-wrap}
#choices{position:relative;z-index:2;width:90%;max-width:800px;margin-bottom:24px;display:flex;flex-direction:column;gap:8px}
.choice-btn{display:block;padding:12px 20px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:6px;color:#e0e0e0;font-size:15px;cursor:pointer;text-align:left;transition:background .15s}
.choice-btn:hover{background:rgba(255,255,255,.15)}
.choice-btn:disabled{opacity:.4;cursor:not-allowed}
#portrait{position:absolute;left:30px;bottom:60px;z-index:2;max-width:200px;max-height:300px;display:none}
.shake{animation:shake .4s ease-in-out}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
.flash{animation:flash .3s}
@keyframes flash{0%{filter:brightness(1)}50%{filter:brightness(3)}100%{filter:brightness(1)}}
</style>
</head>
<body>
<div id="app">
  <div id="screen">
    <div id="bg"></div>
    <img id="portrait" src="" alt="">
    <div id="dialog-box">
      <div id="dialog-name"></div>
      <div id="dialog-text"></div>
    </div>
    <div id="choices"></div>
  </div>
</div>
<script>
__RUNTIME__

const GAME_AST = __GAME_DATA__;
const runtime = kniCreateRuntime(GAME_AST);

const dialogName = document.getElementById('dialog-name');
const dialogText = document.getElementById('dialog-text');
const dialogBox = document.getElementById('dialog-box');
const choicesEl = document.getElementById('choices');
const portrait = document.getElementById('portrait');
const bg = document.getElementById('bg');

let eventQueue = [];
let waitingForClick = false;
let waitingForChoice = false;

function enqueue(events) {
  eventQueue.push(...events);
  processNext();
}

function processNext() {
  if (waitingForClick || waitingForChoice) return;
  if (eventQueue.length === 0) return;

  const ev = eventQueue.shift();
  handleEvent(ev);
}

function handleEvent(ev) {
  switch (ev.kind) {
    case 'DIALOG':
      choicesEl.innerHTML = '';
      dialogBox.style.display = 'block';
      dialogName.textContent = ev.charName || ev.char;
      dialogName.style.color = ev.color || '#ffffff';
      dialogText.textContent = ev.text;
      if (ev.portrait && ev.portrait !== 'none') {
        portrait.src = ev.portrait;
        portrait.style.display = 'block';
      } else {
        portrait.style.display = 'none';
      }
      applyModifiers(ev.modifiers);
      waitingForClick = true;
      break;
    case 'NARRATION':
      choicesEl.innerHTML = '';
      dialogBox.style.display = 'block';
      dialogName.textContent = '';
      dialogText.textContent = ev.text;
      portrait.style.display = 'none';
      applyModifiers(ev.modifiers);
      waitingForClick = true;
      break;
    case 'CHOICE':
      choicesEl.innerHTML = '';
      waitingForChoice = true;
      if (ev.prompt) dialogText.textContent = ev.prompt;
      ev.options.forEach(function(opt, i) {
        var btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = opt.text;
        btn.disabled = !opt.enabled;
        if (opt.enabled) {
          btn.onclick = function() { selectOption(i); };
        }
        choicesEl.appendChild(btn);
      });
      break;
    case 'JUMP':
      processNext();
      break;
    case 'ACTION':
      if (ev.type === 'bg') bg.style.backgroundImage = 'url(' + ev.target + ')';
      if (ev.type === 'sfx') { /* would play audio */ }
      if (ev.type === 'shake') { screen.classList.add('shake'); setTimeout(function(){ screen.classList.remove('shake'); }, 400); }
      processNext();
      break;
    case 'WAIT':
      setTimeout(processNext, 800);
      break;
    case 'END':
      dialogBox.style.display = 'block';
      dialogText.textContent = '~ Fin ~';
      dialogName.textContent = '';
      choicesEl.innerHTML = '';
      break;
    case 'ERROR':
      dialogText.textContent = 'Error: ' + ev.message;
      break;
  }
}

function applyModifiers(mods) {
  if (!mods) return;
  var screen = document.getElementById('screen');
  mods.forEach(function(m) {
    if (m.type === 'shake') { screen.classList.add('shake'); setTimeout(function(){ screen.classList.remove('shake'); }, 400); }
    if (m.type === 'flash') { screen.classList.add('flash'); setTimeout(function(){ screen.classList.remove('flash'); }, 300); }
    if (m.type === 'delay') {
      var ms = parseFloat(m.args[0] || '1') * 1000;
      waitingForClick = true;
      setTimeout(function() { waitingForClick = false; processNext(); }, ms);
    }
  });
}

function selectOption(index) {
  waitingForChoice = false;
  choicesEl.innerHTML = '';
  var events = runtime.selectOption(index);
  if (events && events.length > 0) enqueue(events);
}

dialogBox.addEventListener('click', function(e) {
  if (!waitingForClick) return;
  waitingForClick = false;
  processNext();
});

// Start
enqueue(runtime.start());
</script>
</body>
</html>`;

export async function exportHTML(
  kniFiles: { name: string; content: string }[],
  outputPath: string
): Promise<number> {
  const mainFile = kniFiles.find(f => f.name.endsWith('.kni')) || kniFiles[0];
  if (!mainFile) throw new Error('No .kni file found');

  const { parse } = await import('kni-core');
  const ast = parse(mainFile.content);
  const gameData = JSON.stringify(ast);

  let html = PLAYER_HTML
    .replace('__RUNTIME__', RUNTIME_SOURCE)
    .replace('__GAME_DATA__', gameData);

  await fs.writeFile(outputPath, html, 'utf-8');
  return Buffer.byteLength(html, 'utf-8');
}

// Minimal embedded runtime for standalone HTML
const RUNTIME_SOURCE = `
function kniCreateRuntime(ast) {
  var state = { vars: {}, flags: [], inventory: {}, currentScene: null, sceneStack: [], ended: false };
  var pendingChoice = null;
  var pendingNodes = [];

  if (ast.define) {
    for (var k in ast.define.vars) state.vars[k] = ast.define.vars[k];
    for (var cid in ast.define.chars) {
      var ch = ast.define.chars[cid];
      for (var s in ch.stats) state.vars[cid + '.stats.' + s] = ch.stats[s];
    }
  }

  function getVar(p) { return state.vars[p]; }
  function setVar(p, v) { state.vars[p] = v; }
  function hasFlag(f) { return state.flags.indexOf(f) !== -1; }

  function evalCondition(c) {
    switch (c.kind) {
      case 'has_flag': return hasFlag(c.flag);
      case 'binary':
        var l = getVar(c.left), r = c.right;
        switch (c.op) {
          case '>=': return Number(l) >= Number(r);
          case '>': return Number(l) > Number(r);
          case '<=': return Number(l) <= Number(r);
          case '<': return Number(l) < Number(r);
          case '=': return l == r;
          case '!=': return l != r;
        }
        return false;
      case 'and': return evalCondition(c.left) && evalCondition(c.right);
      case 'or': return evalCondition(c.left) || evalCondition(c.right);
      case 'not': return !evalCondition(c.inner);
    }
    return false;
  }

  function parseVal(v) {
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'none') return 'none';
    if (v === '[]') return [];
    if (v.charAt(0) === '"' && v.charAt(v.length-1) === '"') return v.slice(1,-1);
    var n = Number(v);
    if (!isNaN(n) && String(n) === v.trim()) return n;
    return v;
  }

  function execActions(actions) {
    var events = [];
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      events.push({ kind: 'ACTION', type: a.type, target: a.target, value: a.value, args: a.args });
      if (a.type === 'give') { state.inventory[a.target.replace('item.','')] = true; }
      else if (a.type === 'remove') { delete state.inventory[a.target.replace('item.','')]; }
      else if (a.type === 'set' && a.value != null) {
        var v = a.value.trim();
        if (v.indexOf('+=') === 0) {
          setVar(a.target, Number(getVar(a.target) || 0) + parseFloat(v.slice(2)));
        } else if (v.indexOf('-=') === 0) {
          setVar(a.target, Number(getVar(a.target) || 0) - parseFloat(v.slice(2)));
        } else if (v.charAt(0) === '+' || v.charAt(0) === '-') {
          setVar(a.target, Number(getVar(a.target) || 0) + parseFloat(v));
        } else {
          setVar(a.target, parseVal(v));
        }
      }
      else if (a.type === 'add_flag') { if (!hasFlag(a.target)) state.flags.push(a.target); }
      else if (a.type === 'del_flag') { state.flags = state.flags.filter(function(f){return f!==a.target;}); }
    }
    return events;
  }

  function resolveTarget(t) { return t.indexOf('scene.') === 0 ? t.slice(6) : t; }

  function runNodes(nodes) {
    var events = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.kind === 'dialog') {
        var cd = ast.define && ast.define.chars ? ast.define.chars[n.char] : null;
        events.push({ kind: 'DIALOG', char: n.char, charName: cd ? cd.name : n.char, text: n.text, modifiers: n.modifiers, portrait: cd ? cd.portrait : '', color: cd ? cd.color : '#ffffff' });
      } else if (n.kind === 'narration') {
        events.push({ kind: 'NARRATION', text: n.text, modifiers: n.modifiers });
      } else if (n.kind === 'wait') {
        events.push({ kind: 'WAIT' });
      } else if (n.kind === 'choice') {
        var opts = n.options.map(function(o) {
          return { text: o.text, enabled: o.condition ? evalCondition(o.condition) : true };
        });
        events.push({ kind: 'CHOICE', prompt: n.prompt, options: opts });
        pendingChoice = { options: n.options };
        pendingNodes = nodes.slice(i + 1);
        return events;
      } else if (n.kind === 'jump') {
        var tgt = resolveTarget(n.target);
        events.push({ kind: 'JUMP', target: tgt });
        var te = enterScene(tgt, false);
        if (te) events.push.apply(events, te);
        return events;
      } else if (n.kind === 'action') {
        events.push.apply(events, execActions([n]));
      } else if (n.kind === 'conditional') {
        var matched = false;
        for (var b = 0; b < n.branches.length; b++) {
          var branch = n.branches[b];
          if (branch.condition === null) {
            if (!matched) {
              var be = runNodes(branch.body);
              events.push.apply(events, be);
              matched = true;
            }
          } else if (evalCondition(branch.condition)) {
            matched = true;
            var be2 = runNodes(branch.body);
            events.push.apply(events, be2);
            break;
          }
        }
      }
    }
    return events;
  }

  function enterScene(name, reset) {
    var scene = ast.scenes[name];
    if (!scene) return [{ kind: 'ERROR', message: 'Scene "'+name+'" not found' }, { kind: 'END' }];
    if (reset !== false) state.sceneStack = [];
    state.sceneStack.push(name);
    state.currentScene = name;
    var ev = runNodes(scene.body);
    if (ev && ev.length && ev[ev.length-1].kind !== 'END' && !pendingChoice) {
      ev.push({ kind: 'END' });
      state.ended = true;
    }
    return ev;
  }

  function start(sceneName) {
    var s = sceneName || (ast.config && ast.config.start ? ast.config.start.replace('scene.','') : '');
    if (!s) return [{ kind: 'ERROR', message: 'No start scene' }, { kind: 'END' }];
    return enterScene(s) || [];
  }

  function selectOption(index) {
    if (!pendingChoice) return [{ kind: 'ERROR', message: 'No pending choice' }];
    var opt = pendingChoice.options[index];
    if (!opt) return [{ kind: 'ERROR', message: 'Invalid option' }];
    var events = execActions(opt.actions);
    if (opt.target) {
      var tgt = resolveTarget(opt.target);
      events.push({ kind: 'JUMP', target: tgt });
      pendingChoice = null;
      var te = enterScene(tgt, false);
      if (te) events.push.apply(events, te);
      return events;
    }
    pendingChoice = null;
    var rem = pendingNodes;
    pendingNodes = [];
    if (rem.length === 0) { events.push({ kind: 'END' }); state.ended = true; return events; }
    var re = runNodes(rem);
    if (re) events.push.apply(events, re);
    return events;
  }

  return { start: start, selectOption: selectOption };
}
`;
