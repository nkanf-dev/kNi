import { onMount, onCleanup, createEffect } from 'solid-js';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { kni, kniTheme } from 'kni-lang';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function CodeEditor(props: Props) {
  let container!: HTMLDivElement;
  let view: EditorView;

  onMount(() => {
    const updateListener = EditorView.updateListener.of(update => {
      if (update.docChanged) {
        props.onChange(update.state.doc.toString());
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
            '.cm-content': { fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: '13px' },
            '.cm-gutters': { background: '#1a1a2e', borderRight: '1px solid rgba(255,255,255,0.06)' }
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
