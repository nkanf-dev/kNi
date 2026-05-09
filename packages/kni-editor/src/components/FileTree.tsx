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
    <div style="flex:1;display:flex;flex-direction:column;overflow:auto">
      <div style="padding:8px 12px;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px">
        Files
      </div>
      <For each={props.files}>
        {(file, i) => (
          <div
            onClick={() => props.onSelect(i())}
            style={`padding:6px 12px;font-size:12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:${i() === props.active ? 'rgba(130,170,255,0.1)' : 'transparent'};color:${i() === props.active ? '#82aaff' : '#aaa'};border-left:2px solid ${i() === props.active ? '#82aaff' : 'transparent'}`}
          >
            <span>{file.modified ? '* ' : ''}{file.name}</span>
            <Show when={props.files.length > 1}>
              <button
                onClick={(e) => { e.stopPropagation(); props.onDelete(i()); }}
                style="background:none;border:none;color:#555;cursor:pointer;font-size:12px;padding:0 4px"
              >×</button>
            </Show>
          </div>
        )}
      </For>
      <button
        onClick={props.onAdd}
        style="margin:8px 12px;padding:6px;background:rgba(255,255,255,0.05);border:1px dashed rgba(255,255,255,0.1);border-radius:4px;color:#666;font-size:11px;cursor:pointer"
      >
        + Add file
      </button>
    </div>
  );
}
