import { Show } from 'solid-js';

export type ViewMode = 'code' | 'graph';

interface Props {
  fileName: string;
  modified: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showPreview: boolean;
  onTogglePreview: () => void;
  onToggleConsole: () => void;
  onRestart: () => void;
}

export function Toolbar(props: Props) {
  return (
    <div class="toolbar">
      <span class="toolbar-logo">kNi</span>
      <div class="toolbar-divider" />
      <span class="toolbar-filename">
        {props.modified ? '* ' : ''}{props.fileName}
      </span>

      <div class="toolbar-spacer" />

      {/* View mode switcher */}
      <div class="view-tabs">
        <button
          class={`view-tab ${props.viewMode === 'code' ? 'active' : ''}`}
          onClick={() => props.onViewModeChange('code')}
        >
          Code
        </button>
        <button
          class={`view-tab ${props.viewMode === 'graph' ? 'active' : ''}`}
          onClick={() => props.onViewModeChange('graph')}
        >
          Graph
        </button>
      </div>

      <div class="toolbar-divider" />

      <button
        class={`toolbar-btn ${props.showPreview ? 'active' : ''}`}
        onClick={props.onTogglePreview}
      >
        Preview
      </button>
      <button class="toolbar-btn" onClick={props.onToggleConsole}>
        Console
      </button>

      <div class="toolbar-divider" />

      <button class="toolbar-btn primary" onClick={props.onRestart}>
        &#9654; Play
      </button>
    </div>
  );
}
