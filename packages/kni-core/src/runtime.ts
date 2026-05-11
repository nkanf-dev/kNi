import type {
  KniAST, DefineBlock, SceneDef, LogicDef, ASTNode,
  ActionNode, Condition, RuntimeEvent, Modifier, OptionNode,
  SpritePosition, TransitionDef, TransitionType, AudioChannel, AudioAction
} from './types.js';

// ──────────────────────────────────────────────
// Game State
// ──────────────────────────────────────────────

export interface SpriteState {
  id: string;                // character id
  position: SpritePosition;
  expression: string;
  visible: boolean;
  opacity: number;
  zIndex: number;
}

export interface AudioChannelState {
  playing: boolean;
  track: string;
  volume: number;
  loop: boolean;
}

export interface GameState {
  vars: Record<string, unknown>;
  flags: string[];
  inventory: Set<string>;
  currentScene: string | null;
  sceneStack: string[];
  callStack: CallFrame[];         // for call/return subroutine support
  ended: boolean;
  // Layer state
  sprites: Record<string, SpriteState>;
  bgImage: string;
  // Audio state
  audio: Record<AudioChannel, AudioChannelState>;
  // Persistent vars (survive across playthroughs)
  persistVars: Record<string, unknown>;
  // Choice memory (track which choices the player has selected)
  choiceHistory: string[];
}

export interface CallFrame {
  sceneName: string;
  nodeIndex: number;
  remainingNodes: ASTNode[];
}

// ──────────────────────────────────────────────
// State Snapshot (for save/load and rollback)
// ──────────────────────────────────────────────

export interface StateSnapshot {
  vars: Record<string, unknown>;
  flags: string[];
  inventory: string[];
  currentScene: string | null;
  sceneStack: string[];
  callStack: CallFrame[];
  ended: boolean;
  sprites: Record<string, SpriteState>;
  bgImage: string;
  audio: Record<string, AudioChannelState>;
  choiceHistory: string[];
  // Dialog history entry at this point
  dialogIndex: number;
}

export interface DialogHistoryEntry {
  char?: string;
  charName?: string;
  text: string;
  color?: string;
  isNarration: boolean;
}

// ──────────────────────────────────────────────
// Init
// ──────────────────────────────────────────────

function initState(define: DefineBlock | null): GameState {
  const vars: Record<string, unknown> = {};
  const flags: string[] = [];
  const persistVars: Record<string, unknown> = {};

  if (define) {
    for (const [k, v] of Object.entries(define.vars)) {
      vars[k] = v;
    }
    for (const [charId, charDef] of Object.entries(define.chars)) {
      for (const [stat, val] of Object.entries(charDef.stats)) {
        vars[`${charId}.stats.${stat}`] = val;
      }
    }
    for (const [k, v] of Object.entries(define.persistVars)) {
      persistVars[k] = v;
    }
  }

  return {
    vars,
    flags,
    inventory: new Set(),
    currentScene: null,
    sceneStack: [],
    callStack: [],
    ended: false,
    sprites: {},
    bgImage: '',
    audio: {
      bgm: { playing: false, track: '', volume: 1, loop: true },
      se:  { playing: false, track: '', volume: 1, loop: false },
      voice: { playing: false, track: '', volume: 1, loop: false },
    },
    persistVars,
    choiceHistory: [],
  };
}

// ──────────────────────────────────────────────
// Transition helpers
// ──────────────────────────────────────────────

function parseTransitionArgs(args: string[]): TransitionDef {
  // args: ["with", "dissolve", "0.5"] or ["dissolve", "0.5"] or ["fade"] or []
  let type: TransitionType = 'none';
  let duration = 0.3;

  const filtered = args.filter(a => a !== 'with');
  if (filtered.length >= 1) {
    type = filtered[0] as TransitionType;
  }
  if (filtered.length >= 2) {
    const d = parseFloat(filtered[1]);
    if (!isNaN(d)) duration = d;
  }
  return { type, duration };
}

function parseSpritePosition(pos: string): SpritePosition {
  const positions: Record<string, SpritePosition> = {
    left: 'left', center: 'center', right: 'right',
    far_left: 'far_left', far_right: 'far_right',
  };
  if (positions[pos]) return positions[pos];
  // Try numeric: "0.3,0.5" → {x:0.3, y:0.5}
  const parts = pos.split(',');
  if (parts.length === 2) {
    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    if (!isNaN(x) && !isNaN(y)) return { x, y };
  }
  return 'center';
}

// ──────────────────────────────────────────────
// Runtime
// ──────────────────────────────────────────────

export function createRuntime(ast: KniAST) {
  const state = initState(ast.define);
  let pendingChoice: { options: OptionNode[]; prompt?: string | null } | null = null;
  let pendingNodes: ASTNode[] = [];
  let pendingSceneStack: string[] = [];

  // ── History & Rollback ──
  const dialogHistory: DialogHistoryEntry[] = [];
  const snapshots: StateSnapshot[] = [];
  const MAX_SNAPSHOTS = 100;

  // ── Variable helpers ──
  function getVar(path: string): unknown {
    // Check persistent vars first, then regular vars
    if (path in state.persistVars) return state.persistVars[path];
    return state.vars[path];
  }

  function setVar(path: string, value: unknown) {
    if (path in state.persistVars) {
      state.persistVars[path] = value;
    } else {
      state.vars[path] = value;
    }
  }

  function hasFlag(flag: string): boolean {
    return state.flags.includes(flag);
  }

  function hasItem(id: string): boolean {
    return state.inventory.has(id);
  }

  // ── Snapshot ──
  function takeSnapshot(): StateSnapshot {
    return {
      vars: { ...state.vars },
      flags: [...state.flags],
      inventory: Array.from(state.inventory),
      currentScene: state.currentScene,
      sceneStack: [...state.sceneStack],
      callStack: state.callStack.map(f => ({ ...f, remainingNodes: [...f.remainingNodes] })),
      ended: state.ended,
      sprites: JSON.parse(JSON.stringify(state.sprites)),
      bgImage: state.bgImage,
      audio: JSON.parse(JSON.stringify(state.audio)),
      choiceHistory: [...state.choiceHistory],
      dialogIndex: dialogHistory.length,
    };
  }

  function restoreSnapshot(snap: StateSnapshot) {
    state.vars = { ...snap.vars };
    state.flags = [...snap.flags];
    state.inventory = new Set(snap.inventory);
    state.currentScene = snap.currentScene;
    state.sceneStack = [...snap.sceneStack];
    state.callStack = snap.callStack.map(f => ({ ...f, remainingNodes: [...f.remainingNodes] }));
    state.ended = snap.ended;
    state.sprites = JSON.parse(JSON.stringify(snap.sprites));
    state.bgImage = snap.bgImage;
    state.audio = JSON.parse(JSON.stringify(snap.audio));
    state.choiceHistory = [...snap.choiceHistory];
    // Trim dialog history to snapshot point
    dialogHistory.length = snap.dialogIndex;
  }

  function pushSnapshot() {
    snapshots.push(takeSnapshot());
    if (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
  }

  // ── Condition evaluator ──
  function evalCondition(cond: Condition): boolean {
    switch (cond.kind) {
      case 'has_flag':
        return hasFlag(cond.flag);
      case 'has_item':
        return hasItem(cond.item);
      case 'choice_selected':
        return state.choiceHistory.includes(cond.choiceId);
      case 'binary': {
        const left = getVar(cond.left);
        const right = cond.right;
        switch (cond.op) {
          case '>=': return Number(left) >= Number(right);
          case '>':  return Number(left) > Number(right);
          case '<=': return Number(left) <= Number(right);
          case '<':  return Number(left) < Number(right);
          case '=':  return left == right;
          case '!=': return left != right;
        }
      }
      // falls through
      case 'and':
        return evalCondition(cond.left) && evalCondition(cond.right);
      case 'or':
        return evalCondition(cond.left) || evalCondition(cond.right);
      case 'not':
        return !evalCondition(cond.inner);
    }
  }

  // ── Action executor ──
  function execAction(action: ActionNode): RuntimeEvent[] {
    const events: RuntimeEvent[] = [];

    switch (action.type) {
      case 'give':
        state.inventory.add(action.target.replace('item.', ''));
        events.push({ kind: 'ACTION', type: action.type, target: action.target });
        break;
      case 'remove':
        state.inventory.delete(action.target.replace('item.', ''));
        events.push({ kind: 'ACTION', type: action.type, target: action.target });
        break;
      case 'set': {
        const rawValue = action.value;
        if (rawValue == null) break;
        const v = rawValue.trim();
        if (v.startsWith('+=') || v.startsWith('-=')) {
          const delta = parseFloat(v.slice(2));
          if (!isNaN(delta)) {
            const sign = v.startsWith('-=') ? -1 : 1;
            setVar(action.target, Number(getVar(action.target) || 0) + sign * delta);
          }
        } else if (v.startsWith('+') || v.startsWith('-')) {
          const delta = parseFloat(v);
          if (!isNaN(delta)) {
            setVar(action.target, Number(getVar(action.target) || 0) + delta);
          }
        } else {
          setVar(action.target, parseVarValue(v));
        }
        events.push({ kind: 'ACTION', type: 'set', target: action.target, value: action.value });
        break;
      }
      case 'add_flag':
        if (!state.flags.includes(action.target)) state.flags.push(action.target);
        events.push({ kind: 'ACTION', type: action.type, target: action.target });
        break;
      case 'del_flag':
        state.flags = state.flags.filter(f => f !== action.target);
        events.push({ kind: 'ACTION', type: action.type, target: action.target });
        break;

      // ── Sprite/Layer system ──
      case 'show': {
        const args = action.args || [];
        const posArg = args[0] || 'center';
        const position = parseSpritePosition(posArg);
        const withIdx = args.indexOf('with');
        const transition = withIdx >= 0 ? parseTransitionArgs(args.slice(withIdx)) : { type: 'none' as TransitionType, duration: 0 };

        // Expression support: [show Aria happy center]
        const charDef = ast.define?.chars[action.target];
        const expression = (charDef && args.length > 0 && !['left','center','right','far_left','far_right','with'].includes(args[0]))
          ? args[0] : '';

        state.sprites[action.target] = {
          id: action.target,
          position,
          expression,
          visible: true,
          opacity: 1,
          zIndex: Object.keys(state.sprites).length,
        };
        events.push({ kind: 'SHOW', target: action.target, position, transition, expression: expression || undefined });
        break;
      }
      case 'hide': {
        const args = action.args || [];
        const transition = parseTransitionArgs(args);
        if (state.sprites[action.target]) {
          state.sprites[action.target].visible = false;
        }
        events.push({ kind: 'HIDE', target: action.target, transition });
        break;
      }
      case 'move': {
        const args = action.args || [];
        const position = parseSpritePosition(args[0] || 'center');
        const duration = args[1] ? parseFloat(args[1]) : 0.5;
        if (state.sprites[action.target]) {
          state.sprites[action.target].position = position;
        }
        events.push({ kind: 'MOVE', target: action.target, position, duration });
        break;
      }

      // ── Transition ──
      case 'transition': {
        const args = action.args || [];
        const type = (action.target || 'fade') as TransitionType;
        const duration = args[0] ? parseFloat(args[0]) : 0.5;
        events.push({ kind: 'TRANSITION', transition: { type, duration } });
        break;
      }

      // ── Background ──
      case 'bg': {
        const args = action.args || [];
        const transition = parseTransitionArgs(args);
        state.bgImage = action.target;
        events.push({ kind: 'BG', target: action.target, transition });
        break;
      }

      // ── Audio channels ──
      case 'bgm':
      case 'se':
      case 'voice': {
        const channel: AudioChannel = action.type;
        const audioAction = (action.value || 'play') as AudioAction;
        const channelState = state.audio[channel];

        switch (audioAction) {
          case 'play':
            channelState.playing = true;
            channelState.track = action.target;
            break;
          case 'stop':
            channelState.playing = false;
            channelState.track = '';
            break;
          case 'pause':
            channelState.playing = false;
            break;
          case 'resume':
            channelState.playing = true;
            break;
          case 'crossfade':
            channelState.playing = true;
            channelState.track = action.target;
            break;
          case 'volume': {
            const vol = parseFloat(action.target);
            if (!isNaN(vol)) channelState.volume = Math.max(0, Math.min(1, vol));
            break;
          }
        }

        const durationArg = action.args?.[0];
        events.push({
          kind: 'AUDIO',
          channel,
          action: audioAction,
          target: action.target || undefined,
          duration: durationArg ? parseFloat(durationArg) : undefined,
          volume: channelState.volume,
        });
        break;
      }

      // legacy music alias
      case 'music': {
        state.audio.bgm.playing = true;
        state.audio.bgm.track = action.target;
        events.push({ kind: 'AUDIO', channel: 'bgm', action: 'play', target: action.target });
        break;
      }

      // ── Visual effects ──
      case 'sfx':
        events.push({ kind: 'AUDIO', channel: 'se', action: 'play', target: action.target });
        break;
      case 'shake': {
        const duration = action.args?.[0] ? parseFloat(action.args[0]) : 0.4;
        events.push({ kind: 'SHAKE', target: action.target, duration });
        break;
      }
      case 'flash': {
        const duration = action.args?.[0] ? parseFloat(action.args[0]) : 0.3;
        const color = action.args?.[1];
        events.push({ kind: 'FLASH', duration, color });
        break;
      }

      // ── Wait ──
      case 'wait': {
        if (action.target === 'click') {
          events.push({ kind: 'WAIT', waitType: 'click' });
        } else if (action.target === 'transition') {
          events.push({ kind: 'WAIT', waitType: 'transition' });
        } else if (action.target === 'animation') {
          events.push({ kind: 'WAIT', waitType: 'animation' });
        } else {
          const d = parseFloat(action.target);
          events.push({ kind: 'WAIT', waitType: !isNaN(d) ? 'time' : undefined, duration: !isNaN(d) ? d : undefined });
        }
        break;
      }

      // ── Call (logic block) ──
      case 'call': {
        const target = resolveTarget(action.target);
        // Check if it's a logic block
        const logic = ast.logic[target];
        if (logic) {
          const logicEvents = runNodes(logic.body);
          events.push(...(logicEvents || []));
        } else {
          // Try as a scene call (with return support)
          const scene = ast.scenes[target];
          if (scene) {
            // Push current position onto call stack
            events.push({ kind: 'JUMP', target });
            const sceneEvents = enterScene(target, false);
            events.push(...sceneEvents);
          } else {
            events.push({ kind: 'ERROR', message: `Call target "${action.target}" not found` });
          }
        }
        break;
      }
    }

    return events;
  }

  function execActions(actions: ActionNode[]): RuntimeEvent[] {
    const events: RuntimeEvent[] = [];
    for (const action of actions) {
      events.push(...execAction(action));
    }
    return events;
  }

  // ── Resolve target ──
  function resolveTarget(target: string): string {
    if (target.startsWith('scene.')) return target.slice(6);
    if (target.startsWith('logic.')) return target.slice(6);
    return target;
  }

  // ── Run nodes ──
  function runNodes(nodes: ASTNode[]): RuntimeEvent[] | null {
    const events: RuntimeEvent[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      switch (node.kind) {
        case 'dialog': {
          const charDef = ast.define?.chars[node.char];
          const charName = charDef?.name || node.char;
          const color = charDef?.color || '#ffffff';

          // Record in dialog history
          dialogHistory.push({
            char: node.char,
            charName,
            text: node.text,
            color,
            isNarration: false,
          });

          events.push({
            kind: 'DIALOG',
            char: node.char,
            charName,
            text: node.text,
            segments: node.segments || [],
            modifiers: node.modifiers,
            portrait: charDef?.portrait || '',
            color,
            voice: node.voice || (charDef?.voice ? `${charDef.voice}${dialogHistory.length}.ogg` : undefined),
          });

          // Auto-play voice if specified
          if (node.voice) {
            state.audio.voice.playing = true;
            state.audio.voice.track = node.voice;
            events.push({ kind: 'AUDIO', channel: 'voice', action: 'play', target: node.voice });
          }
          break;
        }
        case 'narration':
          dialogHistory.push({
            text: node.text,
            isNarration: true,
          });
          events.push({ kind: 'NARRATION', text: node.text, segments: node.segments || [], modifiers: node.modifiers });
          break;
        case 'wait':
          events.push({ kind: 'WAIT', waitType: node.waitType, duration: node.duration });
          break;
        case 'choice': {
          pushSnapshot(); // snapshot before choice for rollback
          const enabledOptions = node.options.map(opt => ({
            text: opt.text,
            enabled: opt.condition ? evalCondition(opt.condition) : true,
            selected: state.choiceHistory.includes(opt.text),
          }));
          events.push({ kind: 'CHOICE', prompt: node.prompt, options: enabledOptions, timed: node.timed });
          pendingChoice = { options: node.options, prompt: node.prompt };
          pendingNodes = nodes.slice(i + 1);
          pendingSceneStack = [...state.sceneStack];
          return events;
        }
        case 'jump': {
          const target = resolveTarget(node.target);
          events.push({ kind: 'JUMP', target });
          const targetEvents = enterScene(target, false);
          events.push(...targetEvents);
          return events;
        }
        case 'return': {
          // Pop from call stack and return to caller
          if (state.callStack.length > 0) {
            const frame = state.callStack.pop()!;
            state.currentScene = frame.sceneName;
            if (frame.remainingNodes.length > 0) {
              const restEvents = runNodes(frame.remainingNodes);
              events.push(...(restEvents || []));
            }
          }
          return events;
        }
        case 'action':
          events.push(...execAction(node));
          break;
        case 'conditional': {
          let matched = false;
          for (const branch of node.branches) {
            if (branch.condition === null) {
              if (!matched) {
                const branchEvents = runNodes(branch.body);
                events.push(...(branchEvents || []));
                matched = true;
              }
            } else if (evalCondition(branch.condition)) {
              matched = true;
              const branchEvents = runNodes(branch.body);
              events.push(...(branchEvents || []));
              break;
            }
          }
          break;
        }
      }
    }

    return events;
  }

  // ── Enter scene ──
  function enterScene(sceneName: string, resetStack = true): RuntimeEvent[] {
    const scene = ast.scenes[sceneName];
    if (!scene) {
      return [{ kind: 'ERROR', message: `Scene "${sceneName}" not found` }, { kind: 'END' }];
    }

    if (resetStack) {
      state.sceneStack = [];
    }
    state.sceneStack.push(sceneName);
    state.currentScene = sceneName;

    // Handle scene-level properties
    const events: RuntimeEvent[] = [];
    if (scene.bg) {
      state.bgImage = scene.bg;
      const transition = scene.transition ? parseTransitionArgs(scene.transition.split(/\s+/)) : { type: 'none' as TransitionType, duration: 0 };
      events.push({ kind: 'BG', target: scene.bg, transition });
    }
    if (scene.music && scene.music !== state.audio.bgm.track) {
      state.audio.bgm.playing = true;
      state.audio.bgm.track = scene.music;
      events.push({ kind: 'AUDIO', channel: 'bgm', action: 'crossfade', target: scene.music, duration: 1.0 });
    }

    const bodyEvents = runNodes(scene.body) || [];
    events.push(...bodyEvents);

    if (pendingChoice) {
      return events;
    }

    events.push({ kind: 'END' });
    state.ended = true;
    return events;
  }

  function enterLogic(logicName: string): RuntimeEvent[] | null {
    const logic = ast.logic[logicName];
    if (!logic) {
      return [{ kind: 'ERROR', message: `Logic "${logicName}" not found` }];
    }
    return runNodes(logic.body);
  }

  // ──────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────

  function start(sceneName?: string): RuntimeEvent[] {
    const startScene = sceneName || ast.config?.start?.replace('scene.', '') || '';
    if (!startScene) {
      return [{ kind: 'ERROR', message: 'No start scene defined' }, { kind: 'END' }];
    }
    pushSnapshot(); // initial snapshot
    return enterScene(startScene);
  }

  function selectOption(index: number): RuntimeEvent[] | null {
    if (!pendingChoice) {
      return [{ kind: 'ERROR', message: 'No pending choice' }];
    }

    const option = pendingChoice.options[index];
    if (!option) {
      return [{ kind: 'ERROR', message: `Invalid option index: ${index}` }];
    }

    // Record choice in history
    state.choiceHistory.push(option.text);

    const events: RuntimeEvent[] = execActions(option.actions);

    if (option.target) {
      const target = resolveTarget(option.target);
      events.push({ kind: 'JUMP', target });
      pendingChoice = null;
      const targetEvents = enterScene(target, false);
      events.push(...targetEvents);
      return events;
    }

    pendingChoice = null;
    const remaining = pendingNodes;
    pendingNodes = [];

    if (remaining.length === 0) {
      events.push({ kind: 'END' });
      state.ended = true;
      return events;
    }

    const restEvents = runNodes(remaining);
    events.push(...(restEvents || []));
    return events;
  }

  function hasPendingChoice(): boolean {
    return pendingChoice !== null;
  }

  function getState(): GameState {
    return state;
  }

  // ── Save / Load ──

  function serializeState(): string {
    return JSON.stringify({
      ...takeSnapshot(),
      persistVars: state.persistVars,
      dialogHistory: dialogHistory.slice(),
    });
  }

  function loadState(json: string) {
    const data = JSON.parse(json);
    restoreSnapshot(data);
    if (data.persistVars) {
      Object.assign(state.persistVars, data.persistVars);
    }
    if (data.dialogHistory) {
      dialogHistory.length = 0;
      dialogHistory.push(...data.dialogHistory);
    }
  }

  // ── Rollback ──

  function rollback(steps = 1): boolean {
    for (let i = 0; i < steps; i++) {
      if (snapshots.length === 0) return false;
      const snap = snapshots.pop()!;
      restoreSnapshot(snap);
    }
    pendingChoice = null;
    pendingNodes = [];
    return true;
  }

  function canRollback(): boolean {
    return snapshots.length > 0;
  }

  function getRollbackDepth(): number {
    return snapshots.length;
  }

  // ── Dialog History ──

  function getDialogHistory(): DialogHistoryEntry[] {
    return dialogHistory.slice();
  }

  // ── Persistent vars (survive across createRuntime calls) ──

  function getPersistVars(): Record<string, unknown> {
    return { ...state.persistVars };
  }

  function setPersistVars(vars: Record<string, unknown>) {
    Object.assign(state.persistVars, vars);
  }

  // ── Existing API ──

  function getScene(name: string): SceneDef | undefined {
    return ast.scenes[name];
  }

  function getSceneNames(): string[] {
    return Object.keys(ast.scenes);
  }

  function getCharNames(): string[] {
    return Object.keys(ast.define?.chars || {});
  }

  function getAST(): KniAST {
    return ast;
  }

  return {
    start,
    selectOption,
    hasPendingChoice,
    getState,
    getScene,
    getSceneNames,
    getCharNames,
    getAST,
    evalCondition,
    enterScene,
    enterLogic,
    // New engine APIs
    serializeState,
    loadState,
    rollback,
    canRollback,
    getRollbackDepth,
    getDialogHistory,
    getPersistVars,
    setPersistVars,
  };
}

// ── Helpers ──

function parseVarValue(v: string): string | number | boolean | string[] {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'none') return 'none';
  if (v === '[]') return [];
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, ''));
  }
  const n = parseFloat(v);
  if (!isNaN(n) && v.trim() === String(n)) return n;
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  return v;
}
