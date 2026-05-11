import { For, Show } from 'solid-js';

interface FileEntry {
  name: string;
  content: string;
  modified: boolean;
}

interface Props {
  files: FileEntry[];
  active: number;
  onSelect: (idx: number) => void;
  onAdd: () => void;
  onDelete: (idx: number) => void;
}

export function FileTree(props: Props) {
  return (
    <div class="sidebar-section" style="overflow:hidden">
      <div class="sidebar-header">
        <span>Files</span>
        <button class="sidebar-header-btn" onClick={props.onAdd} title="New file">+</button>
      </div>
      <div class="sidebar-list">
        <For each={props.files}>
          {(file, i) => (
            <div
              class={`file-item ${i() === props.active ? 'active' : ''}`}
              onClick={() => props.onSelect(i())}
            >
              <span class="file-item-name">
                <span class="file-item-icon">{file.name.endsWith('.kni') ? '\u2727' : '\u2022'}</span>
                <span class="file-item-label">
                  {file.modified ? '* ' : ''}{file.name}
                </span>
              </span>
              <Show when={props.files.length > 1}>
                <button
                  class="file-item-delete"
                  onClick={(e) => { e.stopPropagation(); props.onDelete(i()); }}
                  title="Delete file"
                >&times;</button>
              </Show>
            </div>
          )}
        </For>
        <button class="file-add-btn" onClick={props.onAdd}>
          + Add file
        </button>
      </div>
    </div>
  );
}
