import { createSignal, createEffect, Show, For } from 'solid-js';
import { CodeEditor } from './components/CodeEditor';
import { Preview } from './components/Preview';
import { FileTree } from './components/FileTree';

interface FileEntry {
  name: string;
  content: string;
  modified: boolean;
}

const DEMO_SCRIPT = `@config
  title: "深海遗迹"
  author: "kNi Demo"
  version: 1.0
  start: scene.intro
  lang: zh

@define
  char Aria:
    name: "Aria"
    portrait: none
    color: #a3cfff
    stats:
      trust: 0
      alive: true

  char Narrator:
    name: ""
    portrait: none

  item keycard:
    name: "废旧门卡"
    desc: "门禁系统已经锈蚀，但这张卡或许还能用。"
    icon: none
    stackable: false
    tags: [key, metal]

  var chapter: 1
  var ending: none
  var flags: []

@scene intro
  bg: assets/bg_beach.jpg
  music: bgm/mysterious.ogg
  transition: fade 0.8

  :: 海浪拍打着锈迹斑斑的金属舱门。

  Aria :: 这里……就是坐标所指的地方？

  ---

  Aria :: 感觉不对劲。
  Aria :: (whisper) 有什么东西在里面。

  ---

  ? "你会怎么做？"
    > "推开舱门"
      -> scene.enter_hatch
    > "先环顾四周"
      -> scene.look_around
    > "原路返回"
      [if Aria.stats.trust >= 10]
      -> scene.retreat

@scene look_around
  Aria :: 四周散落着一些生锈的零件。

  [add_flag "saw_mural"]
  [give item.keycard]

  Aria :: 这是什么？一张门卡……

  -> scene.enter_hatch

@scene enter_hatch
  Aria :: 好吧，进去看看。

  [set Aria.stats.trust += 5]

  :: 舱门缓缓打开，露出一条向下的阶梯。

  [sfx door_open]
  [shake screen 0.4]

  Aria :: (whisper) 太安静了。

  -> scene.underground

@scene underground
  bg: assets/bg_underground.jpg
  music: bgm/tense.ogg

  :: 阶梯尽头是一个巨大的地下空间。

  Aria :: 这……这是什么？

  ? "你发现了什么？"
    > "调查墙壁上的壁画"
      [add_flag "saw_mural"]
      :: 壁画描绘了一座沉入海底的城市。
      -> scene.check_end
    > "检查中央的控制台"
      :: 控制台上闪烁着微弱的灯光。
      -> scene.check_end

@scene check_end
  [call logic.check_endings]

@scene retreat
  Aria :: 不行，我还不够信任这里。
  [set Aria.stats.trust -= 3]
  -> scene.intro

@scene ending_A
  :: Aria 成功揭开了深海遗迹的秘密。
  Aria :: 终于……真相大白了。
  ~ End ~

@scene ending_B
  Aria :: 我会回来的。
  :: 故事未完待续。
  ~ End ~

@scene ending_C
  Aria :: ……
  :: 一切都结束了。
  ~ End ~

@logic check_endings
  [if Aria.stats.trust >= 5 and has_flag "saw_mural"]
    [set ending = "A"]
    -> scene.ending_A
  [elif Aria.stats.alive = false]
    [set ending = "C"]
    -> scene.ending_C
  [else]
    [set ending = "B"]
    -> scene.ending_B
`;

export default function App() {
  const [files, setFiles] = createSignal<FileEntry[]>([
    { name: 'demo.kni', content: DEMO_SCRIPT, modified: false }
  ]);
  const [activeFile, setActiveFile] = createSignal(0);
  const [showPreview, setShowPreview] = createSignal(true);

  const currentContent = () => files()[activeFile()]?.content ?? '';

  function updateContent(content: string) {
    setFiles(prev => prev.map((f, i) =>
      i === activeFile() ? { ...f, content, modified: true } : f
    ));
  }

  function addFile() {
    const name = prompt('File name:', 'new.kni');
    if (!name) return;
    setFiles(prev => [...prev, { name, content: '@config\n  title: "Untitled"\n  start: scene.main\n\n@scene main\n  :: Hello world.\n', modified: false }]);
    setActiveFile(files().length - 1);
  }

  function deleteFile(idx: number) {
    if (files().length <= 1) return;
    setFiles(prev => prev.filter((_, i) => i !== idx));
    if (activeFile() >= files().length - 1) setActiveFile(files().length - 2);
  }

  return (
    <div style="display:flex;height:100%;width:100%">
      {/* Sidebar */}
      <div style="width:200px;background:#16162a;border-right:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;flex-shrink:0">
        <div style="padding:12px;font-size:13px;font-weight:bold;color:#82aaff;border-bottom:1px solid rgba(255,255,255,0.08)">
          kNi Editor
        </div>
        <FileTree
          files={files()}
          active={activeFile()}
          onSelect={setActiveFile}
          onAdd={addFile}
          onDelete={deleteFile}
        />
      </div>

      {/* Editor + Preview */}
      <div style="flex:1;display:flex;min-width:0">
        <div style="flex:1;display:flex;flex-direction:column;min-width:0">
          {/* Tabs */}
          <div style="display:flex;background:#1a1a2e;border-bottom:1px solid rgba(255,255,255,0.08)">
            <For each={files()}>
              {(file, i) => (
                <button
                  onClick={() => setActiveFile(i())}
                  style={`padding:8px 16px;font-size:12px;border:none;cursor:pointer;background:${i() === activeFile() ? '#252540' : 'transparent'};color:${i() === activeFile() ? '#e0e0e0' : '#888'};border-right:1px solid rgba(255,255,255,0.05)`}
                >
                  {file.modified ? '* ' : ''}{file.name}
                </button>
              )}
            </For>
          </div>
          {/* Code Editor */}
          <div style="flex:1;min-height:0">
            <CodeEditor
              value={currentContent()}
              onChange={updateContent}
            />
          </div>
        </div>

        {/* Preview Panel */}
        <Show when={showPreview()}>
          <div style="width:450px;border-left:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;flex-shrink:0">
            <div style="padding:8px 12px;font-size:12px;background:#16162a;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center">
              <span>Preview</span>
              <button
                onClick={() => setShowPreview(false)}
                style="background:none;border:none;color:#888;cursor:pointer;font-size:14px"
              >×</button>
            </div>
            <Preview content={currentContent()} />
          </div>
        </Show>
      </div>
    </div>
  );
}
