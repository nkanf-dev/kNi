import { onMount, onCleanup, createEffect } from 'solid-js';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { kni, kniTheme } from 'kni-lang';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onCursorChange?: (line: number, col: number) => void;
}

export function CodeEditor(props: Props) {
  let container!: HTMLDivElement;
  let view: EditorView;

  onMount(() => {
    const updateListener = EditorView.updateListener.of(update => {
      if (update.docChanged) {
        props.onChange(update.state.doc.toString());
      }
      if (update.selectionSet && props.onCursorChange) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        props.onCursorChange(line.number, pos - line.from + 1);
      }
    });

    view = new EditorView({
      state: EditorState.create({
        doc: props.value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          bracketMatching(),
          indentOnInput(),
          kni(),
          kniTheme,
          updateListener,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.theme({
            '&': { height: '100%' },
            '.cm-scroller': { overflow: 'auto' },
          }),
        ],
      }),
      parent: container,
    });
  });

  createEffect(() => {
    const newValue = props.value;
    if (view && newValue !== view.state.doc.toString()) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: newValue },
      });
    }
  });

  onCleanup(() => view?.destroy());

  return <div ref={container} style="height:100%" />;
}

// Utility: scroll to a line in the editor
export function scrollToLine(view: EditorView, lineNumber: number) {
  const line = view.state.doc.line(Math.min(lineNumber, view.state.doc.lines));
  view.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
  });
}
