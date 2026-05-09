import { createSignal, createEffect, Show, For, on } from 'solid-js';
import { parse, createRuntime } from 'kni-core';
import type { RuntimeEvent } from 'kni-core';

interface Props {
  content: string;
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

  // Current display state
  const [speaker, setSpeaker] = createSignal('');
  const [speakerColor, setSpeakerColor] = createSignal('#ffffff');
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
        setSpeakerColor(ev.color || '#ffffff');
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
        processToDisplay(idx + 1, evts);
        break;
      case 'ACTION':
        if (ev.type === 'bg') setBgImage(ev.target);
        processToDisplay(idx + 1, evts);
        break;
      case 'WAIT':
        setTimeout(() => processToDisplay(idx + 1, evts), 500);
        break;
      case 'END':
        setText('~ Fin ~');
        setSpeaker('');
        setWaitingClick(false);
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
    const evts = events();
    processToDisplay(displayIndex() + 1, evts);
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
    <div
      style="flex:1;display:flex;flex-direction:column;background:#0d0d1a;overflow:hidden"
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('.choices-area')) advance();
      }}
    >
      <Show when={error()}>
        <div style="padding:16px;color:#ff6b6b;font-size:12px;font-family:monospace;white-space:pre-wrap;overflow:auto;max-height:200px">
          {error()}
        </div>
      </Show>

      <Show when={!error()}>
        {/* Background */}
        <div style={`flex:1;background:${bgImage() ? `url(${bgImage()}) center/cover` : '#0d0d1a'};position:relative`}>
          {/* Dialog box */}
          <div style="position:absolute;bottom:16px;left:16px;right:16px;background:rgba(0,0,0,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:16px 20px;min-height:80px">
            <Show when={speaker()}>
              <div style={`font-weight:bold;font-size:13px;margin-bottom:4px;color:${speakerColor()}`}>
                {speaker()}
              </div>
            </Show>
            <div style="font-size:14px;line-height:1.6;color:#e0e0e0;white-space:pre-wrap">
              {text()}
            </div>
          </div>

          {/* Choices */}
          <Show when={waitingChoice()}>
            <div class="choices-area" style="position:absolute;bottom:120px;left:16px;right:16px;display:flex;flex-direction:column;gap:6px">
              <Show when={choicePrompt()}>
                <div style="background:rgba(0,0,0,0.7);padding:10px 14px;border-radius:6px;font-size:13px;color:#aaa;margin-bottom:4px">
                  {choicePrompt()}
                </div>
              </Show>
              <For each={choiceOptions()}>
                {(opt, i) => (
                  <button
                    disabled={!opt.enabled}
                    onClick={(e) => { e.stopPropagation(); selectOption(i()); }}
                    style={`padding:10px 16px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#e0e0e0;font-size:13px;cursor:${opt.enabled ? 'pointer' : 'not-allowed'};text-align:left;opacity:${opt.enabled ? 1 : 0.4}`}
                  >
                    {opt.text}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Controls */}
        <div style="padding:8px 12px;background:#16162a;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:8px">
          <button
            onClick={restart}
            style="padding:4px 12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#888;font-size:11px;cursor:pointer"
          >Restart</button>
          <span style="flex:1" />
          <span style="font-size:10px;color:#555">
            {waitingClick() ? 'Click to continue' : waitingChoice() ? 'Choose an option' : ''}
          </span>
        </div>
      </Show>
    </div>
  );
}
