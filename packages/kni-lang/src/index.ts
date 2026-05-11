import {
  StreamLanguage, LanguageSupport, StringStream
} from '@codemirror/language';

// kNi DSL stream-based syntax highlighter

const kniLanguage = StreamLanguage.define<{ inChoice: boolean }>({
  startState() { return { inChoice: false }; },

  token(stream: StringStream, state) {
    // Comments
    if (stream.match(/\/\/.*/)) return 'comment';

    // Section headers
    if (stream.match(/@\w+/)) {
      const kw = stream.current().slice(1);
      if (['config', 'define', 'scene', 'logic'].includes(kw)) return 'keyword';
      return 'keyword';
    }

    // Inline actions
    if (stream.match(/\[[^\]]*\]/)) {
      if (stream.current().includes('if ')) return 'typeName';
      return 'atom';
    }

    // Numbers
    if (stream.match(/\d+\.?\d*/)) return 'number';

    // Operators
    if (stream.match(/(?:>=|<=|!=|>|<|=)/)) return 'operator';

    // Strings
    if (stream.match(/"[^"]*"/)) return 'string';

    // Jump arrow
    if (stream.match(/->/)) return 'operatorKeyword';

    // Wait
    if (stream.match(/---/)) return 'meta';

    // Choice prompt and option
    if (stream.match(/\?/)) return 'typeName';
    if (stream.match(/>/)) return 'variableName';

    // Dialog separator
    if (stream.match(/::/)) return 'operator';

    // Modifier parentheses
    if (stream.match(/\([^)]*\)/)) return 'attributeName';

    // Booleans
    if (stream.match(/\b(?:true|false)\b/)) return 'bool';

    // Property keys
    const propMatch = stream.match(/\w+(?=\s*:)/);
    if (propMatch) {
      const kw = propMatch[0];
      const defKeys = ['char', 'item', 'var', 'title', 'author', 'version', 'start', 'lang', 'bg', 'music', 'transition', 'name', 'portrait', 'color', 'voice', 'stats', 'desc', 'icon', 'stackable', 'tags'];
      if (defKeys.includes(kw)) return 'definitionKeyword';
      return 'propertyName';
    }

    // Colors
    if (stream.match(/#[0-9a-fA-F]{6}/)) return 'color';

    // Keywords
    if (stream.match(/\b(?:give|remove|set|add_flag|del_flag|sfx|shake|call|bg|music|has_flag|and|or|not|if|elif|else|scene|wait)\b/)) return 'keyword';

    // Character names
    if (stream.match(/[A-Z][a-zA-Z]+(?=\s*::)/)) return 'typeName';

    stream.next();
    return null;
  }
});

// Autocomplete
import { CompletionContext } from '@codemirror/autocomplete';

function kniCompletionSource(context: CompletionContext) {
  const word = context.matchBefore(/(@\w*|\w*)/);
  if (!word) return null;
  const w = word.text;

  if (w.startsWith('@')) {
    return {
      from: word.from + 1,
      options: [
        { label: 'config', type: 'keyword', detail: 'Game configuration' },
        { label: 'define', type: 'keyword', detail: 'Characters, items, variables' },
        { label: 'scene', type: 'keyword', detail: 'Story scene' },
        { label: 'logic', type: 'keyword', detail: 'Logic function' },
      ]
    };
  }

  const line = context.state.doc.lineAt(word.from);
  const lineText = line.text;
  if (lineText.includes('[') && !lineText.includes(']')) {
    return {
      from: word.from,
      options: [
        { label: 'give', type: 'function', detail: 'Give item to player' },
        { label: 'remove', type: 'function', detail: 'Remove item from player' },
        { label: 'set', type: 'function', detail: 'Set variable value' },
        { label: 'add_flag', type: 'function', detail: 'Set a flag' },
        { label: 'del_flag', type: 'function', detail: 'Remove a flag' },
        { label: 'sfx', type: 'function', detail: 'Play sound effect' },
        { label: 'shake', type: 'function', detail: 'Screen shake effect' },
        { label: 'call', type: 'function', detail: 'Call logic function' },
        { label: 'bg', type: 'function', detail: 'Change background' },
        { label: 'music', type: 'function', detail: 'Change music' },
        { label: 'wait', type: 'function', detail: 'Pause for duration' },
      ]
    };
  }

  return null;
}

// Fold service - fold @scene and @logic sections
import { foldService } from '@codemirror/language';

const kniFoldService = foldService.of((state, lineStart, lineEnd) => {
  const line = state.doc.lineAt(lineStart);
  const trimmed = line.text.trim();
  if (trimmed.startsWith('@scene') || trimmed.startsWith('@logic') || trimmed.startsWith('@define')) {
    let end = lineEnd;
    for (let i = line.number + 1; i <= state.doc.lines; i++) {
      const l = state.doc.line(i);
      if (l.text.trim().startsWith('@')) {
        end = l.from;
        break;
      }
      end = l.to;
    }
    if (end > lineEnd) return { from: lineEnd, to: end };
  }
  return null;
});

// Highlight theme
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const kniHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#b8a1d4', fontWeight: 'bold' },       // soft violet
  { tag: tags.string, color: '#7ab89a' },                             // ink jade
  { tag: tags.comment, color: '#4a453f', fontStyle: 'italic' },       // warm muted
  { tag: tags.number, color: '#d4a46e' },                             // warm amber
  { tag: tags.operator, color: '#7aacb8' },                           // ink cyan
  { tag: tags.operatorKeyword, color: '#7aacb8', fontWeight: 'bold' },
  { tag: tags.atom, color: '#c8a46e' },                               // gold accent
  { tag: tags.typeName, color: '#c8a46e' },                           // gold accent
  { tag: tags.variableName, color: '#8aadcc' },                       // muted blue
  { tag: tags.definitionKeyword, color: '#b8a1d4' },                  // soft violet
  { tag: tags.propertyName, color: '#8aaba0' },                       // muted teal
  { tag: tags.attributeName, color: '#7ab89a' },                      // ink jade
  { tag: tags.bool, color: '#d4a46e' },                               // warm amber
  { tag: tags.color, color: '#d4a46e' },                              // warm amber
  { tag: tags.meta, color: '#5a554e' },                               // warm gray
]);

export const kniTheme = syntaxHighlighting(kniHighlightStyle);

export function kni() {
  return new LanguageSupport(kniLanguage, [
    kniLanguage.data.of({ autocomplete: kniCompletionSource }),
    kniFoldService,
  ]);
}
