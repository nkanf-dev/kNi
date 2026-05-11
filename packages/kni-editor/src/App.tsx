import { createSignal, createEffect, createMemo, Show, For, on } from 'solid-js';
import { parse } from 'kni-core';
import type { KniAST } from 'kni-core';
import { PanelLayout } from './components/PanelLayout';
import { Toolbar, type ViewMode } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import { SceneTree } from './components/SceneTree';
import { FileTree } from './components/FileTree';
import { CodeEditor } from './components/CodeEditor';
import { Preview } from './components/Preview';
import { NodeGraph } from './components/NodeGraph';

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
  // ── File state ──
  const [files, setFiles] = createSignal<FileEntry[]>([
    { name: 'demo.kni', content: DEMO_SCRIPT, modified: false }
  ]);
  const [activeFile, setActiveFile] = createSignal(0);

  // ── View state ──
  const [viewMode, setViewMode] = createSignal<ViewMode>('code');
  const [showPreview, setShowPreview] = createSignal(true);
  const [showConsole, setShowConsole] = createSignal(false);

  // ── Cursor state ──
  const [cursorLine, setCursorLine] = createSignal(1);
  const [cursorCol, setCursorCol] = createSignal(1);

  // ── Scene state ──
  const [selectedScene, setSelectedScene] = createSignal<string | null>(null);
  const [currentPlayScene, setCurrentPlayScene] = createSignal('');

  // ── Derived ──
  const currentContent = () => files()[activeFile()]?.content ?? '';
  const currentFile = () => files()[activeFile()];

  // Parse AST reactively
  const ast = createMemo<KniAST | null>(() => {
    try {
      return parse(currentContent());
    } catch {
      return null;
    }
  });

  // Parse error
  const parseError = createMemo<string | null>(() => {
    try {
      parse(currentContent());
      return null;
    } catch (e: any) {
      return e.message;
    }
  });

  // Word count
  const wordCount = createMemo(() => {
    const content = currentContent();
    return content.trim() ? content.trim().split(/\s+/).length : 0;
  });

  // Scene count
  const sceneCount = createMemo(() => {
    const a = ast();
    return a ? Object.keys(a.scenes).length + Object.keys(a.logic).length : 0;
  });

  // ── Actions ──

  function updateContent(content: string) {
    setFiles(prev => prev.map((f, i) =>
      i === activeFile() ? { ...f, content, modified: true } : f
    ));
  }

  function addFile() {
    const name = prompt('File name:', 'new.kni');
    if (!name) return;
    setFiles(prev => [...prev, {
      name,
      content: '@config\n  title: "Untitled"\n  start: scene.main\n\n@scene main\n  :: Hello world.\n',
      modified: false
    }]);
    setActiveFile(files().length - 1);
  }

  function deleteFile(idx: number) {
    if (files().length <= 1) return;
    setFiles(prev => prev.filter((_, i) => i !== idx));
    if (activeFile() >= files().length - 1) setActiveFile(Math.max(0, files().length - 2));
  }

  function onSceneSelect(name: string, kind: 'scene' | 'logic') {
    setSelectedScene(name);
    // In code view, could scroll to the scene definition
    // For now just highlight it
  }

  function onNodeDoubleClick(id: string) {
    setViewMode('code');
    setSelectedScene(id);
    // Could scroll code editor to the scene
  }

  function onCursorChange(line: number, col: number) {
    setCursorLine(line);
    setCursorCol(col);
  }

  // Restart trigger (bumped to force Preview to restart)
  const [restartKey, setRestartKey] = createSignal(0);
  function triggerRestart() {
    setRestartKey(k => k + 1);
  }

  // ── Render ──

  return (
    <PanelLayout
      toolbar={
        <Toolbar
          fileName={currentFile()?.name ?? ''}
          modified={currentFile()?.modified ?? false}
          viewMode={viewMode()}
          onViewModeChange={setViewMode}
          showPreview={showPreview()}
          onTogglePreview={() => setShowPreview(p => !p)}
          onToggleConsole={() => setShowConsole(p => !p)}
          onRestart={triggerRestart}
        />
      }
      left={
        <>
          <SceneTree
            ast={ast()}
            selectedScene={selectedScene()}
            onSelect={onSceneSelect}
          />
          <div style="border-top:1px solid var(--ink-border)">
            <FileTree
              files={files()}
              active={activeFile()}
              onSelect={setActiveFile}
              onAdd={addFile}
              onDelete={deleteFile}
            />
          </div>
        </>
      }
      center={
        <>
          {/* File tabs */}
          <div class="tab-bar">
            <For each={files()}>
              {(file, i) => (
                <button
                  class={`tab ${i() === activeFile() ? 'active' : ''}`}
                  onClick={() => setActiveFile(i())}
                >
                  {file.modified && <span class="tab-modified">&bull;</span>}
                  {file.name}
                </button>
              )}
            </For>
          </div>

          {/* Main content area */}
          <div class="panel-center-content">
            <Show when={viewMode() === 'code'}>
              <CodeEditor
                value={currentContent()}
                onChange={updateContent}
                onCursorChange={onCursorChange}
              />
            </Show>
            <Show when={viewMode() === 'graph'}>
              <NodeGraph
                ast={ast()}
                selectedNode={selectedScene()}
                onSelectNode={setSelectedScene}
                onDoubleClickNode={onNodeDoubleClick}
              />
            </Show>
          </div>
        </>
      }
      right={
        showPreview() ? (
          <Preview
            content={currentContent()}
            onSceneChange={setCurrentPlayScene}
          />
        ) : undefined
      }
      bottom={
        showConsole() ? (
          <div class="console-panel">
            <div class="console-header">
              <span>Console</span>
              <button class="sidebar-header-btn" onClick={() => setShowConsole(false)}>&times;</button>
            </div>
            <div class="console-body">
              <Show when={parseError()}>
                <div class="console-entry error">{parseError()}</div>
              </Show>
              <Show when={!parseError()}>
                <div class="console-entry" style="color:var(--ink-jade)">Parse OK — {sceneCount()} scenes</div>
              </Show>
            </div>
          </div>
        ) : undefined
      }
      bottomHeight={showConsole() ? 160 : 0}
      statusbar={
        <StatusBar
          currentScene={currentPlayScene() || selectedScene() || ''}
          cursorLine={cursorLine()}
          cursorCol={cursorCol()}
          wordCount={wordCount()}
          sceneCount={sceneCount()}
          parseOk={!parseError()}
          errorCount={parseError() ? 1 : 0}
        />
      }
    />
  );
}
