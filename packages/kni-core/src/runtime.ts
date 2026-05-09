import type {
  KniAST, DefineBlock, SceneDef, LogicDef, ASTNode,
  ActionNode, Condition, RuntimeEvent, Modifier, OptionNode
} from './types.js';

// ── Game State ──

export interface GameState {
  vars: Record<string, unknown>;
  flags: string[];
  inventory: Set<string>;
  currentScene: string | null;
  sceneStack: string[];
  ended: boolean;
}

function initState(define: DefineBlock | null): GameState {
  const vars: Record<string, unknown> = {};
  const flags: string[] = [];

  if (define) {
    for (const [k, v] of Object.entries(define.vars)) {
      vars[k] = v;
    }
    for (const [charId, charDef] of Object.entries(define.chars)) {
      for (const [stat, val] of Object.entries(charDef.stats)) {
        vars[`${charId}.stats.${stat}`] = val;
      }
    }
  }

  return {
    vars,
    flags,
    inventory: new Set(),
    currentScene: null,
    sceneStack: [],
    ended: false
  };
}

// ── Pending choice state ──

interface PendingChoice {
  options: OptionNode[];
}

// ── Runtime ──

export function createRuntime(ast: KniAST) {
  const state = initState(ast.define);
  let pendingChoice: PendingChoice | null = null;
  let pendingNodes: ASTNode[] = [];
  let pendingSceneStack: string[] = [];

  // Variable helpers
  function getVar(path: string): unknown {
    return state.vars[path];
  }

  function setVar(path: string, value: unknown) {
    state.vars[path] = value;
  }

  function hasFlag(flag: string): boolean {
    return state.flags.includes(flag);
  }

  function hasItem(id: string): boolean {
    return state.inventory.has(id);
  }

  // Condition evaluator
  function evalCondition(cond: Condition): boolean {
    switch (cond.kind) {
      case 'has_flag':
        return hasFlag(cond.flag);
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

  // Action executor — mutates state, returns renderer events
  function execActions(actions: ActionNode[]): RuntimeEvent[] {
    const events: RuntimeEvent[] = [];
    for (const action of actions) {
      events.push({ kind: 'ACTION', type: action.type, target: action.target, value: action.value, args: action.args });
      switch (action.type) {
        case 'give':
          state.inventory.add(action.target.replace('item.', ''));
          break;
        case 'remove':
          state.inventory.delete(action.target.replace('item.', ''));
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
          break;
        }
        case 'add_flag':
          if (!state.flags.includes(action.target)) {
            state.flags.push(action.target);
          }
          break;
        case 'del_flag':
          state.flags = state.flags.filter(f => f !== action.target);
          break;
        // sfx, shake, bg, music, wait — renderer-only, no state change
      }
    }
    return events;
  }

  // Resolve a jump target: "scene.xxx" → "xxx"
  function resolveTarget(target: string): string {
    return target.startsWith('scene.') ? target.slice(6) : target;
  }

  // Run a list of AST nodes, returning events.
  // Returns null when a choice is encountered (caller must call selectOption).
  // Returns [] when the scene ends normally.
  function runNodes(nodes: ASTNode[]): RuntimeEvent[] | null {
    const events: RuntimeEvent[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      switch (node.kind) {
        case 'dialog': {
          const charDef = ast.define?.chars[node.char];
          events.push({
            kind: 'DIALOG',
            char: node.char,
            charName: charDef?.name || node.char,
            text: node.text,
            modifiers: node.modifiers,
            portrait: charDef?.portrait || '',
            color: charDef?.color || '#ffffff'
          });
          break;
        }
        case 'narration':
          events.push({ kind: 'NARRATION', text: node.text, modifiers: node.modifiers });
          break;
        case 'wait':
          events.push({ kind: 'WAIT' });
          break;
        case 'choice': {
          const enabledOptions = node.options.map(opt => ({
            text: opt.text,
            enabled: opt.condition ? evalCondition(opt.condition) : true
          }));
          events.push({ kind: 'CHOICE', prompt: node.prompt, options: enabledOptions });
          // Save remaining nodes for after choice
          pendingChoice = { options: node.options };
          pendingNodes = nodes.slice(i + 1);
          pendingSceneStack = [...state.sceneStack];
          return events; // Return events including CHOICE; caller checks pendingChoice
        }
        case 'jump': {
          const target = resolveTarget(node.target);
          events.push({ kind: 'JUMP', target });
          // Jump into target scene
          const targetEvents = enterScene(target, false);
          events.push(...targetEvents);
          return events;
        }
        case 'action':
          events.push(...execActions([node]));
          break;
        case 'conditional': {
          // Evaluate branches in order, execute the first matching one
          let matched = false;
          for (const branch of node.branches) {
            if (branch.condition === null) {
              // else branch
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

    // End of node list
    return events;
  }

  // Enter a scene. Returns events.
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

    const events = runNodes(scene.body) || [];

    // If a choice was encountered, don't add END
    if (pendingChoice) {
      return events;
    }

    events.push({ kind: 'END' });
    state.ended = true;
    return events;
  }

  // Run a logic block. Returns events or null if a choice is hit.
  function enterLogic(logicName: string): RuntimeEvent[] | null {
    const logic = ast.logic[logicName];
    if (!logic) {
      return [{ kind: 'ERROR', message: `Logic "${logicName}" not found` }];
    }
    return runNodes(logic.body);
  }

  // ── Public API ──

  /** Start the game from the configured start scene. */
  function start(sceneName?: string): RuntimeEvent[] {
    const startScene = sceneName || ast.config?.start?.replace('scene.', '') || '';
    if (!startScene) {
      return [{ kind: 'ERROR', message: 'No start scene defined' }, { kind: 'END' }];
    }
    return enterScene(startScene);
  }

  /**
   * Select a choice option by index. Must be called after a CHOICE event.
   * Returns the next batch of events, or null if another choice is encountered.
   */
  function selectOption(index: number): RuntimeEvent[] | null {
    if (!pendingChoice) {
      return [{ kind: 'ERROR', message: 'No pending choice' }];
    }

    const option = pendingChoice.options[index];
    if (!option) {
      return [{ kind: 'ERROR', message: `Invalid option index: ${index}` }];
    }

    // Execute the option's inline actions
    const events: RuntimeEvent[] = execActions(option.actions);

    // If the option has a target, jump there
    if (option.target) {
      const target = resolveTarget(option.target);
      events.push({ kind: 'JUMP', target });
      pendingChoice = null;
      const targetEvents = enterScene(target, false);
      events.push(...targetEvents);
      return events;
    }

    // No target — continue with remaining nodes from the original scene
    pendingChoice = null;
    const remaining = pendingNodes;
    pendingNodes = [];

    if (remaining.length === 0) {
      events.push({ kind: 'END' });
      state.ended = true;
      return events;
    }

    const restEvents = runNodes(remaining);
    events.push(...restEvents);
    return events;
  }

  /** Check if a choice is pending. */
  function hasPendingChoice(): boolean {
    return pendingChoice !== null;
  }

  /** Get current state snapshot. */
  function getState(): GameState {
    return state;
  }

  /** Get a scene by name. */
  function getScene(name: string): SceneDef | undefined {
    return ast.scenes[name];
  }

  /** Get all scene names. */
  function getSceneNames(): string[] {
    return Object.keys(ast.scenes);
  }

  /** Get all character names. */
  function getCharNames(): string[] {
    return Object.keys(ast.define?.chars || {});
  }

  /** Get the full AST. */
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
