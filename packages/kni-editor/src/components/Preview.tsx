import { createSignal, createEffect, Show, For, on } from 'solid-js';
import { parse, createRuntime } from 'kni-core';
import type { RuntimeEvent } from 'kni-core';

interface Props {
  content: string;
  onSceneChange?: (scene: string) => void;
}

export function Preview(props: Props) {
  const [events, setEvents] = createSignal<RuntimeEvent[]>([]);
  const [runtime, setRuntime] = createSignal<ReturnType<typeof createRuntime> | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [displayIndex, setDisplayIndex] = createSignal(0);
  const [waitingClick, setWaitingClick] = createSignal(false);
  const [waitingChoice, setWaitingChoice] = createSignal(false);
  const [choicePrompt, setChoicePrompt] = createSignal<string | null>(null);
  const [choiceOptions, setChoiceOptions] = createSignal<{ text: string; enabled: boolean }[]>([]);
  const [ended, setEnded] = createSignal(false);

  const [speaker, setSpeaker] = createSignal('');
  const [speakerColor, setSpeakerColor] = createSignal('#d4cbbf');
  const [text, setText] = createSignal('');
  const [bgImage, setBgImage] = createSignal('');

  // Parse and create runtime when content changes
  createEffect(on(() => props.content, (content) => {
    try {
      const ast = parse(content);
      const rt = createRuntime(ast);
      setRuntime(rt);
      setError(null);
      restart();
    } catch (e: any) {
      setError(e.message);
      setRuntime(null);
    }
  }, { defer: true }));

  // Initial parse
  createEffect(() => {
    try {
      const ast = parse(props.content);
      const rt = createRuntime(ast);
      setRuntime(rt);
      setError(null);
      const initialEvents = rt.start();
      setEvents(initialEvents);
      setDisplayIndex(0);
      setWaitingClick(false);
      setWaitingChoice(false);
      setEnded(false);
      processToDisplay(0, initialEvents);
    } catch (e: any) {
      setError(e.message);
    }
  });

  function restart() {
    const rt = runtime();
    if (!rt) return;
    try {
      const initialEvents = rt.start();
      setEvents(initialEvents);
      setDisplayIndex(0);
      setWaitingClick(false);
      setWaitingChoice(false);
      setEnded(false);
      setSpeaker('');
      setText('');
      setBgImage('');
      processToDisplay(0, initialEvents);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function processToDisplay(idx: number, evts: RuntimeEvent[]) {
    if (idx >= evts.length) return;

    const ev = evts[idx];
    switch (ev.kind) {
      case 'DIALOG':
        setSpeaker(ev.charName || ev.char);
        setSpeakerColor(ev.color || '#d4cbbf');
        setText(ev.text);
        setWaitingClick(true);
        setWaitingChoice(false);
        break;
      case 'NARRATION':
        setSpeaker('');
        setText(ev.text);
        setWaitingClick(true);
        setWaitingChoice(false);
        break;
      case 'CHOICE':
        setChoicePrompt(ev.prompt);
        setChoiceOptions(ev.options);
        setWaitingChoice(true);
        setWaitingClick(false);
        break;
      case 'JUMP':
        props.onSceneChange?.(ev.target);
        processToDisplay(idx + 1, evts);
        return;
      case 'BG':
        setBgImage(ev.target);
        processToDisplay(idx + 1, evts);
        return;
      case 'ACTION':
        processToDisplay(idx + 1, evts);
        return;
      case 'AUDIO':
      case 'SHOW':
      case 'HIDE':
      case 'MOVE':
      case 'TRANSITION':
      case 'SHAKE':
      case 'FLASH':
        processToDisplay(idx + 1, evts);
        return;
      case 'WAIT': {
        const dur = ev.duration ? ev.duration * 1000 : 500;
        setTimeout(() => processToDisplay(idx + 1, evts), dur);
        break;
      }
      case 'END':
        setText('~ Fin ~');
        setSpeaker('');
        setWaitingClick(false);
        setEnded(true);
        break;
      case 'ERROR':
        setText(`Error: ${ev.message}`);
        setWaitingClick(false);
        break;
    }
    setDisplayIndex(idx);
  }

  function advance() {
    if (!waitingClick()) return;
    setWaitingClick(false);
    processToDisplay(displayIndex() + 1, events());
  }

  function selectOption(index: number) {
    const rt = runtime();
    if (!rt || !waitingChoice()) return;
    setWaitingChoice(false);
    try {
      const newEvents = rt.selectOption(index);
      setEvents(newEvents);
      setDisplayIndex(0);
      processToDisplay(0, newEvents);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div class="preview-panel">
      <div class="preview-panel-header">
        <span>Preview</span>
      </div>

      <Show when={error()}>
        <div class="error-display">{error()}</div>
      </Show>

      <Show when={!error()}>
        <div
          class="preview-viewport"
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('.preview-choices')) advance();
          }}
        >
          {/* Background */}
          <div
            class="preview-bg"
            style={bgImage() ? { 'background-image': `url(${bgImage()})` } : {}}
          />

          {/* Dialog box */}
          <div class="preview-dialog">
            <Show when={speaker()}>
              <div class="preview-speaker" style={{ color: speakerColor() }}>
                {speaker()}
              </div>
            </Show>
            <div class="preview-text">{text()}</div>
            <Show when={waitingClick()}>
              <div class="preview-indicator">{'\u25BC'}</div>
            </Show>
          </div>

          {/* Choices */}
          <Show when={waitingChoice()}>
            <div class="preview-choices">
              <Show when={choicePrompt()}>
                <div class="preview-choice-prompt">{choicePrompt()}</div>
              </Show>
              <For each={choiceOptions()}>
                {(opt, i) => (
                  <button
                    class="preview-choice-btn"
                    disabled={!opt.enabled}
                    onClick={(e) => { e.stopPropagation(); selectOption(i()); }}
                  >
                    {opt.text}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Controls */}
        <div class="preview-controls">
          <button class="preview-control-btn" onClick={restart}>
            Restart
          </button>
          <span class="preview-status">
            {waitingClick() ? 'Click to continue' : waitingChoice() ? 'Choose an option' : ended() ? 'Story ended' : ''}
          </span>
        </div>
      </Show>
    </div>
  );
}
