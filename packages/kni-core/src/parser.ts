import type {
  KniAST, KniConfig, DefineBlock, CharDef, ItemDef,
  SceneDef, LogicDef, ASTNode, ActionNode, Condition,
  BinaryCondition, Modifier, ConditionalBranch
} from './types.js';

// ── Lexer ──

type Token =
  | { kind: 'SECTION'; name: string }
  | { kind: 'KEY_VALUE'; key: string; value: string; indent: number }
  | { kind: 'DIALOG'; char: string; text: string; modifiers: string }
  | { kind: 'NARRATION'; text: string; modifiers: string }
  | { kind: 'CHOICE_PROMPT'; prompt: string }
  | { kind: 'OPTION'; text: string }
  | { kind: 'CONDITION'; raw: string }
  | { kind: 'JUMP'; target: string }
  | { kind: 'ACTION'; raw: string }
  | { kind: 'WAIT' }
  | { kind: 'BLANK' }
  | { kind: 'EOF' };

function* tokenize(input: string): Generator<Token> {
  const lines = input.split('\n');
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === '') { yield { kind: 'BLANK' }; continue; }
    if (line.trimStart().startsWith('//')) continue;

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // Section headers
    if (trimmed.startsWith('@')) {
      const parts = trimmed.slice(1).split(/\s+/);
      yield { kind: 'SECTION', name: parts.join(' ') };
      continue;
    }

    // Conditions: [if ...], [elif ...], [else]
    if (trimmed.startsWith('[if ') || trimmed.startsWith('[elif ') || trimmed === '[else]') {
      yield { kind: 'CONDITION', raw: trimmed.slice(1, -1).trim() };
      continue;
    }

    // Inline actions: [action args]
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      yield { kind: 'ACTION', raw: trimmed.slice(1, -1).trim() };
      continue;
    }

    // Jump: -> target
    if (trimmed.startsWith('->')) {
      yield { kind: 'JUMP', target: trimmed.slice(2).trim() };
      continue;
    }

    // Wait: ---
    if (trimmed === '---') {
      yield { kind: 'WAIT' };
      continue;
    }

    // Choice prompt: ? "text"
    if (trimmed.startsWith('?')) {
      const prompt = trimmed.slice(1).trim().replace(/^"|"$/g, '');
      yield { kind: 'CHOICE_PROMPT', prompt };
      continue;
    }

    // Option: > "text"
    if (trimmed.startsWith('>')) {
      const text = trimmed.slice(1).trim().replace(/^"|"$/g, '');
      yield { kind: 'OPTION', text };
      continue;
    }

    // Narration: :: (modifier) text
    const narrationMatch = trimmed.match(/^::\s*(?:\(([^)]*)\)\s*)?(.+)$/);
    if (narrationMatch) {
      yield { kind: 'NARRATION', text: narrationMatch[2].trim(), modifiers: narrationMatch[1] || '' };
      continue;
    }

    // Dialog: Char :: (modifier) text
    const dialogMatch = trimmed.match(/^(.+?)\s*::\s*(?:\(([^)]*)\)\s*)?(.+)$/);
    if (dialogMatch) {
      const [, char, modifiers, text] = dialogMatch;
      yield { kind: 'DIALOG', char: char.trim(), text: text.trim(), modifiers: modifiers || '' };
      continue;
    }

    // Define keywords: char <id>:, item <id>:
    const charMatch = trimmed.match(/^char\s+(\w+)\s*:?\s*$/);
    if (charMatch) {
      yield { kind: 'KEY_VALUE', key: 'char', value: charMatch[1], indent };
      continue;
    }
    const itemMatch = trimmed.match(/^item\s+(\w+)\s*:?\s*$/);
    if (itemMatch) {
      yield { kind: 'KEY_VALUE', key: 'item', value: itemMatch[1], indent };
      continue;
    }

    // Variable: var <name>: <value>
    const varMatch = trimmed.match(/^var\s+(\w+)\s*:\s*(.+)$/);
    if (varMatch) {
      yield { kind: 'KEY_VALUE', key: 'var', value: `${varMatch[1]}: ${varMatch[2].trim()}`, indent };
      continue;
    }

    // Key-value
    const kvMatch = trimmed.match(/^([\w.]+)\s*:\s*(.+)$/);
    if (kvMatch) {
      yield { kind: 'KEY_VALUE', key: kvMatch[1], value: kvMatch[2].trim(), indent };
      continue;
    }

    // Key-only (e.g. "stats:")
    const keyOnlyMatch = trimmed.match(/^([\w.]+)\s*:$/);
    if (keyOnlyMatch) {
      yield { kind: 'KEY_VALUE', key: keyOnlyMatch[1], value: '', indent };
      continue;
    }

    // Fallback: narration
    yield { kind: 'NARRATION', text: trimmed, modifiers: '' };
  }
  yield { kind: 'EOF' };
}

// ── Parser ──

export function parse(input: string): KniAST {
  const tokens = tokenize(input);
  const ast: KniAST = {
    config: null,
    define: null,
    scenes: {},
    logic: {}
  };

  let current: IteratorResult<Token>;
  const advance = () => { current = tokens.next(); return current.value; };
  const peek = () => current ? current.value : advance();

  advance(); // prime

  while (peek().kind !== 'EOF') {
    const t = peek();
    if (t.kind === 'BLANK') { advance(); continue; }

    if (t.kind === 'SECTION') {
      const sectionName = t.name;
      advance(); // consume the section token
      if (sectionName === 'config') parseConfig(ast, advance, peek);
      else if (sectionName.startsWith('define')) parseDefine(ast, advance, peek);
      else if (sectionName.startsWith('scene')) parseScene(ast, sectionName.replace(/^scene\s+/, '').trim(), advance, peek);
      else if (sectionName.startsWith('logic')) parseLogic(ast, sectionName.replace(/^logic\s+/, '').trim(), advance, peek);
    } else {
      advance();
    }
  }

  return ast;
}

type Advance = () => Token;
type Peek = () => Token;

// ── @config ──

function parseConfig(ast: KniAST, advance: Advance, peek: Peek) {
  const config: Record<string, string | number> = {};
  while (true) {
    const t = peek();
    if (t.kind === 'BLANK') { advance(); continue; }
    if (t.kind === 'KEY_VALUE') {
      const v = t.value.replace(/^"|"$/g, '');
      config[t.key] = t.key === 'version' ? parseFloat(v) : v;
      advance();
    } else {
      break;
    }
  }
  ast.config = config as unknown as KniConfig;
}

// ── @define ──

function parseDefine(ast: KniAST, advance: Advance, peek: Peek) {
  const define: DefineBlock = { chars: {}, items: {}, vars: {} };

  while (true) {
    const t = peek();
    if (t.kind === 'BLANK') { advance(); continue; }
    if (t.kind === 'SECTION' || t.kind === 'EOF') break;

    if (t.kind === 'KEY_VALUE') {
      if (t.key === 'char') {
        const charId = t.value;
        advance();
        define.chars[charId] = parseCharBlock(advance, peek);
        continue;
      } else if (t.key === 'item') {
        const itemId = t.value;
        advance();
        define.items[itemId] = parseItemBlock(advance, peek);
        continue;
      } else if (t.key === 'var') {
        // "var chapter: 1" → key="var", value="chapter: 1"
        const parts = t.value.split(':');
        const varName = parts[0].trim();
        const varVal = parts.length > 1 ? parts.slice(1).join(':').trim() : '';
        define.vars[varName] = parseVarValue(varVal);
        advance();
        continue;
      }
    }
    advance();
  }

  ast.define = define;
}

function parseCharBlock(advance: Advance, peek: Peek): CharDef {
  const char: CharDef = { name: '', portrait: '', color: '#ffffff', voice: '', stats: {} };

  while (true) {
    const t = peek();
    if (t.kind === 'BLANK') { advance(); continue; }
    if (t.kind === 'EOF') break;

    if (t.kind === 'KEY_VALUE') {
      if (t.key === 'name') { char.name = t.value.replace(/^"|"$/g, ''); advance(); }
      else if (t.key === 'portrait') { char.portrait = t.value; advance(); }
      else if (t.key === 'color') { char.color = t.value; advance(); }
      else if (t.key === 'voice') { char.voice = t.value; advance(); }
      else if (t.key === 'stats') {
        advance();
        // Parse indented stats block
        while (true) {
          const st = peek();
          if (st.kind === 'BLANK') { advance(); continue; }
          if (st.kind === 'KEY_VALUE' && st.indent > 2) {
            const val = parseVarValue(st.value);
            char.stats[st.key] = typeof val === 'string' && (val === 'true' || val === 'false')
              ? val === 'true'
              : val;
            advance();
          } else {
            break;
          }
        }
      }
      else { break; } // Unknown key — exit char block
    } else {
      break;
    }
  }

  return char;
}

function parseItemBlock(advance: Advance, peek: Peek): ItemDef {
  const item: ItemDef = { name: '', desc: '', icon: '', stackable: false, tags: [] };

  while (true) {
    const t = peek();
    if (t.kind === 'BLANK') { advance(); continue; }
    if (t.kind === 'EOF') break;

    if (t.kind === 'KEY_VALUE') {
      if (t.key === 'name') { item.name = t.value.replace(/^"|"$/g, ''); advance(); }
      else if (t.key === 'desc') { item.desc = t.value.replace(/^"|"$/g, ''); advance(); }
      else if (t.key === 'icon') { item.icon = t.value; advance(); }
      else if (t.key === 'stackable') { item.stackable = t.value === 'true'; advance(); }
      else if (t.key === 'tags') {
        item.tags = t.value.replace(/^\[|\]$/g, '').split(',').map(s => s.trim());
        advance();
      }
      else { break; }
    } else {
      break;
    }
  }

  return item;
}

// ── @scene / @logic ──

function parseScene(ast: KniAST, sceneName: string, advance: Advance, peek: Peek) {
  const scene: SceneDef = { name: sceneName, bg: '', music: '', transition: '', body: [] };

  while (true) {
    const t = peek();
    if (t.kind === 'BLANK') { advance(); continue; }
    if (t.kind === 'KEY_VALUE') {
      if (t.key === 'bg') scene.bg = t.value;
      else if (t.key === 'music') scene.music = t.value;
      else if (t.key === 'transition') scene.transition = t.value;
      advance();
    } else {
      break;
    }
  }

  scene.body = parseBody(advance, peek);
  ast.scenes[sceneName] = scene;
}

function parseLogic(ast: KniAST, logicName: string, advance: Advance, peek: Peek) {
  ast.logic[logicName] = { name: logicName, body: parseBody(advance, peek) };
}

// ── Body parsing ──

function parseBody(advance: Advance, peek: Peek): ASTNode[] {
  const nodes: ASTNode[] = [];

  while (true) {
    const t = peek();
    if (t.kind === 'BLANK') { advance(); continue; }
    if (t.kind === 'SECTION' || t.kind === 'EOF') break;

    switch (t.kind) {
      case 'DIALOG': {
        nodes.push({
          kind: 'dialog',
          char: t.char,
          text: t.text,
          modifiers: parseModifiers(t.modifiers)
        });
        advance();
        break;
      }
      case 'NARRATION': {
        nodes.push({
          kind: 'narration',
          text: t.text,
          modifiers: parseModifiers(t.modifiers)
        });
        advance();
        break;
      }
      case 'CHOICE_PROMPT': {
        const prompt = t.prompt;
        advance();
        const options = parseOptions(advance, peek);
        nodes.push({ kind: 'choice', prompt: prompt || null, options });
        break;
      }
      case 'JUMP': {
        nodes.push({ kind: 'jump', target: t.target });
        advance();
        break;
      }
      case 'ACTION': {
        const parsed = parseAction(t.raw);
        if (parsed) nodes.push(parsed);
        advance();
        break;
      }
      case 'CONDITION': {
        // Standalone condition in a logic block (if/elif/else)
        advance(); // consume the CONDITION token
        const condNode = parseConditionBlock(t.raw, advance, peek);
        if (condNode) nodes.push(...condNode);
        break;
      }
      case 'WAIT': {
        nodes.push({ kind: 'wait' });
        advance();
        break;
      }
      default:
        advance();
    }
  }

  return nodes;
}

// Parse options after a choice prompt
function parseOptions(advance: Advance, peek: Peek): OptionNode[] {
  const options: OptionNode[] = [];

  while (true) {
    const t = peek();
    if (t.kind === 'BLANK') { advance(); continue; }
    if (t.kind !== 'OPTION') break;

    const optText = t.text;
    advance();

    let condition: Condition | null = null;
    const optionActions: ActionNode[] = [];
    let target: string | null = null;

    // Collect inline content after the option
    while (true) {
      const at = peek();
      if (at.kind === 'BLANK') { advance(); continue; }

      if (at.kind === 'CONDITION') {
        // [if ...] on the next line — applies to this option
        condition = parseCondition(at.raw.replace(/^if\s+/, ''));
        advance();
      } else if (at.kind === 'ACTION') {
        const parsed = parseAction(at.raw);
        if (parsed) optionActions.push(parsed);
        advance();
      } else if (at.kind === 'JUMP') {
        target = at.target;
        advance();
        break; // Option complete
      } else {
        break;
      }
    }

    options.push({
      kind: 'option',
      text: optText,
      condition,
      actions: optionActions,
      target
    });
  }

  return options;
}

// Parse an if/elif/else chain into a ConditionalNode
function parseConditionBlock(raw: string, advance: Advance, peek: Peek): ASTNode[] {
  const branches: ConditionalBranch[] = [];

  // Strip "if " / "elif " prefix
  const condText = raw.startsWith('if ') ? raw.slice(3) : raw.startsWith('elif ') ? raw.slice(5) : raw;
  const firstCond = raw === 'else' ? null : parseCondition(condText);
  const firstBody = collectConditionBody(advance, peek);
  branches.push({ condition: firstCond, body: firstBody });

  // Parse elif/else branches
  while (true) {
    const t = peek();
    if (t.kind === 'BLANK') { advance(); continue; }
    if (t.kind !== 'CONDITION') break;

    const branchCond = t.raw === 'else' ? null : parseCondition(t.raw.startsWith('elif ') ? t.raw.slice(5) : t.raw);
    advance();
    const branchBody = collectConditionBody(advance, peek);
    branches.push({ condition: branchCond, body: branchBody });
  }

  return [{ kind: 'conditional', branches }];
}

function collectConditionBody(advance: Advance, peek: Peek): ASTNode[] {
  const nodes: ASTNode[] = [];
  while (true) {
    const t = peek();
    if (t.kind === 'BLANK') { advance(); continue; }
    if (t.kind === 'CONDITION' || t.kind === 'SECTION' || t.kind === 'EOF') break;
    if (t.kind === 'ACTION') {
      const parsed = parseAction(t.raw);
      if (parsed) nodes.push(parsed);
    } else if (t.kind === 'JUMP') {
      nodes.push({ kind: 'jump', target: t.target });
    }
    advance();
  }
  return nodes;
}

// ── Modifiers ──

function parseModifiers(raw: string): Modifier[] {
  if (!raw.trim()) return [];
  return raw.split(',').map(chunk => {
    const parts = chunk.trim().split(/\s+/);
    return { type: parts[0], args: parts.slice(1) };
  });
}

// ── Conditions ──

// Find a logical operator outside of quoted strings
function findLogicalOp(raw: string, op: string): number {
  let inQuote = false;
  for (let i = 0; i <= raw.length - op.length; i++) {
    if (raw[i] === '"') { inQuote = !inQuote; continue; }
    if (!inQuote && raw.slice(i, i + op.length) === op) return i;
  }
  return -1;
}

function parseCondition(raw: string): Condition {
  // Handle "and" / "or" FIRST (before has_flag, so compound conditions work)
  // Split on " and " / " or " but respect quoted strings
  const andIdx = findLogicalOp(raw, ' and ');
  if (andIdx > 0) {
    return {
      kind: 'and',
      left: parseCondition(raw.slice(0, andIdx).trim()),
      right: parseCondition(raw.slice(andIdx + 5).trim())
    };
  }
  const orIdx = findLogicalOp(raw, ' or ');
  if (orIdx > 0) {
    return {
      kind: 'or',
      left: parseCondition(raw.slice(0, orIdx).trim()),
      right: parseCondition(raw.slice(orIdx + 4).trim())
    };
  }

  // has_flag "name"
  const flagMatch = raw.match(/has_flag\s+"([^"]+)"/);
  if (flagMatch) return { kind: 'has_flag', flag: flagMatch[1] };

  // Binary comparisons: try longest operators first
  const ops: BinaryCondition['op'][] = ['>=', '<=', '!=', '>', '<', '='];
  for (const op of ops) {
    const idx = raw.indexOf(op);
    if (idx > 0) {
      const left = raw.slice(0, idx).trim();
      const right = raw.slice(idx + op.length).trim();
      return {
        kind: 'binary',
        left,
        op,
        right: parseVarValue(right)
      };
    }
  }

  // Fallback: flag check
  return { kind: 'has_flag', flag: raw.trim() };
}

// ── Actions ──

function parseAction(raw: string): ActionNode | null {
  const parts = raw.split(/\s+/);
  if (parts.length === 0) return null;

  const cmd = parts[0];

  switch (cmd) {
    case 'give':
      return { kind: 'action', type: 'give', target: parts[1] || '' };
    case 'remove':
      return { kind: 'action', type: 'remove', target: parts[1] || '' };
    case 'set': {
      const rest = parts.slice(1).join(' ');
      // Handle +=, -=, and = operators
      const opMatch = rest.match(/^(.+?)\s*(\+=|-=|=)\s*(.+)$/);
      if (!opMatch) return null;
      const target = opMatch[1].trim();
      const op = opMatch[2];
      const val = opMatch[3].trim();
      const value = op === '=' ? val : `${op} ${val}`;
      return { kind: 'action', type: 'set', target, value };
    }
    case 'add_flag':
      return { kind: 'action', type: 'add_flag', target: parts[1]?.replace(/^"|"$/g, '') || '' };
    case 'del_flag':
      return { kind: 'action', type: 'del_flag', target: parts[1]?.replace(/^"|"$/g, '') || '' };
    case 'sfx':
      return { kind: 'action', type: 'sfx', target: parts[1] || '', args: parts.slice(2) };
    case 'shake':
      return { kind: 'action', type: 'shake', target: parts[1] || 'screen', args: parts.slice(2) };
    case 'call':
      return { kind: 'action', type: 'call', target: parts[1] || '' };
    case 'bg':
      return { kind: 'action', type: 'bg', target: parts[1] || '' };
    case 'music':
      return { kind: 'action', type: 'music', target: parts[1] || '' };
    case 'wait':
      return { kind: 'action', type: 'wait', target: '', args: parts.slice(1) };
  }

  return null;
}

// ── Value parsing ──

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
