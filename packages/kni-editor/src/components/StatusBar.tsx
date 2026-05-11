import { Show } from 'solid-js';

interface Props {
  currentScene: string;
  cursorLine: number;
  cursorCol: number;
  wordCount: number;
  sceneCount: number;
  parseOk: boolean;
  errorCount: number;
}

export function StatusBar(props: Props) {
  return (
    <div class="statusbar">
      <Show when={props.currentScene}>
        <span class="statusbar-item">
          {props.currentScene}
        </span>
        <span class="statusbar-divider" />
      </Show>

      <span class="statusbar-item">
        Ln {props.cursorLine}, Col {props.cursorCol}
      </span>

      <span class="statusbar-divider" />

      <span class="statusbar-item">
        {props.wordCount} words
      </span>

      <span class="statusbar-divider" />

      <span class="statusbar-item">
        {props.sceneCount} scenes
      </span>

      <span class="statusbar-spacer" />

      <Show when={props.parseOk} fallback={
        <span class="statusbar-item statusbar-error">
          {props.errorCount} error{props.errorCount !== 1 ? 's' : ''}
        </span>
      }>
        <span class="statusbar-item statusbar-ok">
          OK
        </span>
      </Show>

      <span class="statusbar-divider" />

      <span class="statusbar-item">kNi DSL</span>
    </div>
  );
}
