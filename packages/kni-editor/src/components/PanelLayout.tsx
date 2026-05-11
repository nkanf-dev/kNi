import { createSignal, onMount, onCleanup, JSX } from 'solid-js';

interface Props {
  leftWidth?: number;
  rightWidth?: number;
  bottomHeight?: number;
  minLeft?: number;
  minRight?: number;
  minBottom?: number;
  left?: JSX.Element;
  center: JSX.Element;
  right?: JSX.Element;
  bottom?: JSX.Element;
  toolbar?: JSX.Element;
  statusbar?: JSX.Element;
}

const STORAGE_KEY = 'kni-panel-sizes';

function loadSizes(): { left: number; right: number; bottom: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSizes(left: number, right: number, bottom: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ left, right, bottom }));
  } catch {}
}

export function PanelLayout(props: Props) {
  const saved = loadSizes();
  const [leftW, setLeftW] = createSignal(saved?.left ?? props.leftWidth ?? 240);
  const [rightW, setRightW] = createSignal(saved?.right ?? props.rightWidth ?? 400);
  const [bottomH, setBottomH] = createSignal(saved?.bottom ?? props.bottomHeight ?? 0);
  const [dragging, setDragging] = createSignal<'left' | 'right' | 'bottom' | null>(null);

  const minL = props.minLeft ?? 180;
  const minR = props.minRight ?? 280;
  const minB = props.minBottom ?? 120;

  let startX = 0;
  let startY = 0;
  let startVal = 0;

  function onMouseDown(handle: 'left' | 'right' | 'bottom', e: MouseEvent) {
    e.preventDefault();
    setDragging(handle);
    startX = e.clientX;
    startY = e.clientY;
    if (handle === 'left') startVal = leftW();
    else if (handle === 'right') startVal = rightW();
    else startVal = bottomH();
  }

  function onMouseMove(e: MouseEvent) {
    const d = dragging();
    if (!d) return;
    if (d === 'left') {
      const delta = e.clientX - startX;
      setLeftW(Math.max(minL, startVal + delta));
    } else if (d === 'right') {
      const delta = startX - e.clientX;
      setRightW(Math.max(minR, startVal + delta));
    } else if (d === 'bottom') {
      const delta = startY - e.clientY;
      setBottomH(Math.max(minB, startVal + delta));
    }
  }

  function onMouseUp() {
    if (dragging()) {
      saveSizes(leftW(), rightW(), bottomH());
      setDragging(null);
    }
  }

  onMount(() => {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  onCleanup(() => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  });

  return (
    <div class="panel-layout" style={{ cursor: dragging() ? (dragging() === 'bottom' ? 'row-resize' : 'col-resize') : undefined }}>
      {props.toolbar}

      <div class="panel-body">
        {/* Left sidebar */}
        {props.left && (
          <>
            <div class="sidebar" style={{ width: `${leftW()}px` }}>
              {props.left}
            </div>
            <div
              class={`resize-handle resize-handle-h ${dragging() === 'left' ? 'dragging' : ''}`}
              onMouseDown={(e) => onMouseDown('left', e)}
            />
          </>
        )}

        {/* Center + Bottom */}
        <div style="flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden">
          <div style="flex:1;display:flex;min-height:0;overflow:hidden">
            {/* Center panel */}
            <div class="panel-center">
              {props.center}
            </div>

            {/* Right resize handle + panel */}
            {props.right && (
              <>
                <div
                  class={`resize-handle resize-handle-h ${dragging() === 'right' ? 'dragging' : ''}`}
                  onMouseDown={(e) => onMouseDown('right', e)}
                />
                <div class="panel-right" style={{ width: `${rightW()}px` }}>
                  {props.right}
                </div>
              </>
            )}
          </div>

          {/* Bottom panel */}
          {props.bottom && bottomH() > 0 && (
            <>
              <div
                class={`resize-handle resize-handle-v ${dragging() === 'bottom' ? 'dragging' : ''}`}
                onMouseDown={(e) => onMouseDown('bottom', e)}
              />
              <div class="panel-bottom" style={{ height: `${bottomH()}px` }}>
                {props.bottom}
              </div>
            </>
          )}
        </div>
      </div>

      {props.statusbar}
    </div>
  );
}
