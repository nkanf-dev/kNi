import { For, Show, createMemo } from 'solid-js';
import type { KniAST } from 'kni-core';

interface SceneEntry {
  name: string;
  kind: 'scene' | 'logic';
  isStart: boolean;
}

interface Props {
  ast: KniAST | null;
  selectedScene: string | null;
  onSelect: (name: string, kind: 'scene' | 'logic') => void;
}

export function SceneTree(props: Props) {
  const entries = createMemo<SceneEntry[]>(() => {
    const ast = props.ast;
    if (!ast) return [];

    const startScene = ast.config?.start
      ? ast.config.start.replace(/^scene\./, '')
      : null;

    const items: SceneEntry[] = [];

    for (const name of Object.keys(ast.scenes)) {
      items.push({ name, kind: 'scene', isStart: name === startScene });
    }
    for (const name of Object.keys(ast.logic)) {
      items.push({ name, kind: 'logic', isStart: false });
    }

    return items;
  });

  return (
    <div class="sidebar-section" style="flex:1;overflow:hidden">
      <div class="sidebar-header">
        <span>Scenes</span>
        <span style="font-size:10px;font-weight:normal;text-transform:none;letter-spacing:0">
          {entries().length}
        </span>
      </div>
      <div class="sidebar-list">
        <For each={entries()}>
          {(entry) => (
            <div
              class={`scene-item ${entry.kind === 'logic' ? 'is-logic' : ''} ${entry.isStart ? 'is-start' : ''} ${props.selectedScene === entry.name ? 'active' : ''}`}
              onClick={() => props.onSelect(entry.name, entry.kind)}
            >
              <span class="scene-item-icon">
                {entry.isStart ? '\u25B6' : entry.kind === 'logic' ? '\u25C7' : '\u25A1'}
              </span>
              <span class="scene-item-name">{entry.name}</span>
            </div>
          )}
        </For>
        <Show when={entries().length === 0}>
          <div style="padding:12px;font-size:11px;color:var(--ink-text-muted);text-align:center">
            No scenes found
          </div>
        </Show>
      </div>
    </div>
  );
}
