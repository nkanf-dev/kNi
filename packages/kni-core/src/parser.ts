import type {
  KniAST, KniConfig, DefineBlock, CharDef, ItemDef,
  SceneDef, LogicDef, ASTNode, ActionNode, Condition,
  BinaryCondition, Modifier, ConditionalBranch, TextSegment, OptionNode
} from './types.js';

// ── Lexer ──

type Token =
  | { kind: 'SECTION'; name: string }
  | { kind: 'KEY_VALUE'; key: string; value: string; indent: number }
  | { kind: 'DIALOG'; char: string; text: string; modifiers: string; voice?: string }
  | { kind: 'NARRATION'; text: string; modifiers: string }
  | { kind: 'CHOICE_PROMPT'; prompt: string; timed?: number }
  | { kind: 'OPTION'; text: string }
  | { kind: 'CONDITION'; raw: string }
  | { kind: 'JUMP'; target: string }
  | { kind: 'RETURN' }
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

    // Return: <- or [return]
    if (trimmed === '<-' || trimmed === '[return]') {
      yield { kind: 'RETURN' };
      continue;
    }

    // Wait: ---
    if (trimmed === '---') {
      yield { kind: 'WAIT' };
      continue;
    }

    // End marker: ~ End ~ or ~ Fin ~
    if (/^~\s*(End|Fin|END|FIN)\s*~$/.test(trimmed)) {
      yield { kind: 'SECTION', name: '__end__' };
      continue;
    }

    // Choice prompt: ? "text" or ? "text" [timeout 5]
    if (trimmed.startsWith('?')) {
      const raw = trimmed.slice(1).trim();
      const timeMatch = raw.match(/\[timeout\s+(\d+(?:\.\d+)?)\]\s*$/);
      const prompt = (timeMatch ? raw.slice(0, timeMatch.index).trim() : raw).replace(/^"|"$/g, '');
      const timed = timeMatch ? parseFloat(timeMatch[1]) : undefined;
      yield { kind: 'CHOICE_PROMPT', prompt, timed };
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

    // Dialog: Char :: (modifier) text  or  Char [voice/file.ogg] :: text
    const dialogVoiceMatch = trimmed.match(/^(.+?)\s*\[voice\s+([^\]]+)\]\s*::\s*(?:\(([^)]*)\)\s*)?(.+)$/);
    if (dialogVoiceMatch) {
      const [, char, voice, modifiers, text] = dialogVoiceMatch;
      yield { kind: 'DIALOG', char: char.trim(), text: text.trim(), modifiers: modifiers || '', voice };
      continue;
    }

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

    // Persistent variable: persist <name>: <value>
    const persistMatch = trimmed.match(/^persist\s+(\w+)\s*:\s*(.+)$/);
    if (persistMatch) {
      yield { kind: 'KEY_VALUE', key: 'persist', value: `${persistMatch[1]}: ${persistMatch[2].trim()}`, indent };
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
      if (sectionName === '__end__') continue; // ~ End ~ marker
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
  const define: DefineBlock = { chars: {}, items: {}, vars: {}, persistVars: {} };

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
        const parts = t.value.split(':');
        const varName = parts[0].trim();
        const varVal = parts.length > 1 ? parts.slice(1).join(':').trim() : '';
        define.vars[varName] = parseVarValue(varVal);
        advance();
        continue;
      } else if (t.key === 'persist') {
        const parts = t.value.split(':');
        const varName = parts[0].trim();
        const varVal = parts.length > 1 ? parts.slice(1).join(':').trim() : '';
        define.persistVars[varName] = parseVarValue(varVal);
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
      else { break; }
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
          segments: parseTextSegments(t.text),
          modifiers: parseModifiers(t.modifiers),
          voice: t.voice,
        });
        advance();
        break;
      }
      case 'NARRATION': {
        nodes.push({
          kind: 'narration',
          text: t.text,
          segments: parseTextSegments(t.text),
          modifiers: parseModifiers(t.modifiers)
        });
        advance();
        break;
      }
      case 'CHOICE_PROMPT': {
        const prompt = t.prompt;
        const timed = t.timed;
        advance();
        const options = parseOptions(advance, peek);
        nodes.push({ kind: 'choice', prompt: prompt || null, options, timed });
        break;
      }
      case 'JUMP': {
        nodes.push({ kind: 'jump', target: t.target });
        advance();
        break;
      }
      case 'RETURN': {
        nodes.push({ kind: 'return' });
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
        advance();
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

    while (true) {
      const at = peek();
      if (at.kind === 'BLANK') { advance(); continue; }

      if (at.kind === 'CONDITION') {
        condition = parseCondition(at.raw.replace(/^if\s+/, ''));
        advance();
      } else if (at.kind === 'ACTION') {
        const parsed = parseAction(at.raw);
        if (parsed) optionActions.push(parsed);
        advance();
      } else if (at.kind === 'JUMP') {
        target = at.target;
        advance();
        break;
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

  const condText = raw.startsWith('if ') ? raw.slice(3) : raw.startsWith('elif ') ? raw.slice(5) : raw;
  const firstCond = raw === 'else' ? null : parseCondition(condText);
  const firstBody = collectConditionBody(advance, peek);
  branches.push({ condition: firstCond, body: firstBody });

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
    } else if (t.kind === 'RETURN') {
      nodes.push({ kind: 'return' });
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

// ── Text Segments — inline markup parsing ──
// Syntax: {b}bold{/b}, {i}italic{/i}, {ruby base|annotation}, {speed 0.5}slow{/speed}, {color #ff0000}red{/color}, {w 0.5} (inline wait)

export function parseTextSegments(text: string): TextSegment[] {
  // If no tags found, return single text segment
  if (!text.includes('{')) return [{ kind: 'text', content: text }];

  const segments: TextSegment[] = [];
  let i = 0;

  while (i < text.length) {
    const tagStart = text.indexOf('{', i);
    if (tagStart === -1) {
      if (i < text.length) segments.push({ kind: 'text', content: text.slice(i) });
      break;
    }

    // Text before tag
    if (tagStart > i) {
      segments.push({ kind: 'text', content: text.slice(i, tagStart) });
    }

    const tagEnd = text.indexOf('}', tagStart);
    if (tagEnd === -1) {
      segments.push({ kind: 'text', content: text.slice(tagStart) });
      break;
    }

    const tagContent = text.slice(tagStart + 1, tagEnd);

    // Closing tags: {/b}, {/i}, etc. — handled by parent parse
    if (tagContent.startsWith('/')) {
      i = tagEnd + 1;
      continue;
    }

    // Ruby: {ruby base|annotation}
    const rubyMatch = tagContent.match(/^ruby\s+(.+?)\|(.+)$/);
    if (rubyMatch) {
      segments.push({ kind: 'ruby', base: rubyMatch[1], annotation: rubyMatch[2] });
      i = tagEnd + 1;
      continue;
    }

    // Inline wait: {w 0.5} or {w}
    const waitMatch = tagContent.match(/^w(?:\s+(\d+(?:\.\d+)?))?$/);
    if (waitMatch) {
      segments.push({ kind: 'wait', duration: waitMatch[1] ? parseFloat(waitMatch[1]) : 0.5 });
      i = tagEnd + 1;
      continue;
    }

    // Style tags: {b}, {i}, {u}, {s}
    if (['b', 'i', 'u', 's'].includes(tagContent)) {
      const closeTag = `{/${tagContent}}`;
      const closeIdx = text.indexOf(closeTag, tagEnd + 1);
      if (closeIdx !== -1) {
        const inner = text.slice(tagEnd + 1, closeIdx);
        segments.push({
          kind: 'style',
          tag: tagContent as 'b' | 'i' | 'u' | 's',
          children: parseTextSegments(inner)
        });
        i = closeIdx + closeTag.length;
        continue;
      }
    }

    // Speed: {speed 0.5}...{/speed}
    const speedMatch = tagContent.match(/^speed\s+(\d+(?:\.\d+)?)$/);
    if (speedMatch) {
      const closeTag = '{/speed}';
      const closeIdx = text.indexOf(closeTag, tagEnd + 1);
      if (closeIdx !== -1) {
        const inner = text.slice(tagEnd + 1, closeIdx);
        segments.push({
          kind: 'speed',
          speed: parseFloat(speedMatch[1]),
          children: parseTextSegments(inner)
        });
        i = closeIdx + closeTag.length;
        continue;
      }
    }

    // Color: {color #ff0000}...{/color}
    const colorMatch = tagContent.match(/^color\s+(#[0-9a-fA-F]{3,8}|\w+)$/);
    if (colorMatch) {
      const closeTag = '{/color}';
      const closeIdx = text.indexOf(closeTag, tagEnd + 1);
      if (closeIdx !== -1) {
        const inner = text.slice(tagEnd + 1, closeIdx);
        segments.push({
          kind: 'color',
          color: colorMatch[1],
          children: parseTextSegments(inner)
        });
        i = closeIdx + closeTag.length;
        continue;
      }
    }

    // Unknown tag — treat as plain text
    segments.push({ kind: 'text', content: text.slice(tagStart, tagEnd + 1) });
    i = tagEnd + 1;
  }

  return segments;
}

// ── Conditions ──

function findLogicalOp(raw: string, op: string): number {
  let inQuote = false;
  for (let i = 0; i <= raw.length - op.length; i++) {
    if (raw[i] === '"') { inQuote = !inQuote; continue; }
    if (!inQuote && raw.slice(i, i + op.length) === op) return i;
  }
  return -1;
}

function parseCondition(raw: string): Condition {
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

  // has_item "name" or has_item item.name
  const itemMatch = raw.match(/has_item\s+(?:"([^"]+)"|(\S+))/);
  if (itemMatch) return { kind: 'has_item', item: (itemMatch[1] || itemMatch[2]).replace('item.', '') };

  // choice_selected "id"
  const choiceMatch = raw.match(/choice_selected\s+"([^"]+)"/);
  if (choiceMatch) return { kind: 'choice_selected', choiceId: choiceMatch[1] };

  // Binary comparisons
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

    // Sprite/Layer system
    // [show Aria center] [show Aria center with dissolve] [show Aria center with dissolve 0.5]
    case 'show': {
      const target = parts[1] || '';
      const args = parts.slice(2);
      return { kind: 'action', type: 'show', target, args };
    }
    // [hide Aria] [hide Aria with fade] [hide Aria with fade 0.5]
    case 'hide': {
      const target = parts[1] || '';
      const args = parts.slice(2);
      return { kind: 'action', type: 'hide', target, args };
    }
    // [move Aria right 0.5]
    case 'move': {
      const target = parts[1] || '';
      const args = parts.slice(2);
      return { kind: 'action', type: 'move', target, args };
    }

    // Transition: [transition fade 0.8]
    case 'transition':
      return { kind: 'action', type: 'transition', target: parts[1] || 'fade', args: parts.slice(2) };

    // Audio channels
    // [bgm play track.ogg] [bgm stop] [bgm crossfade track.ogg 1.0] [bgm volume 0.5]
    case 'bgm':
    case 'se':
    case 'voice':
      return { kind: 'action', type: cmd, target: parts[2] || '', value: parts[1] || 'play', args: parts.slice(3) };

    // Visual effects
    case 'sfx':
      return { kind: 'action', type: 'sfx', target: parts[1] || '', args: parts.slice(2) };
    case 'shake':
      return { kind: 'action', type: 'shake', target: parts[1] || 'screen', args: parts.slice(2) };
    case 'flash':
      return { kind: 'action', type: 'flash', target: '', args: parts.slice(1) };

    // Scene/flow
    case 'call':
      return { kind: 'action', type: 'call', target: parts[1] || '' };
    case 'return':
      return null; // handled by RETURN token
    case 'bg':
      return { kind: 'action', type: 'bg', target: parts.slice(1).join(' ') || '' };
    case 'music':
      return { kind: 'action', type: 'music', target: parts[1] || '' };

    // Wait variants: [wait], [wait 1.5], [wait click], [wait transition]
    case 'wait':
      return { kind: 'action', type: 'wait', target: parts[1] || '', args: parts.slice(2) };
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
