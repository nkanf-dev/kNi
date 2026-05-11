import { createSignal, createEffect, createMemo, For, Show, on, onMount, onCleanup } from 'solid-js';
import { extractSceneGraph, autoLayout } from 'kni-core';
import type { KniAST, SceneGraph, SceneEdge, LayoutPosition } from 'kni-core';

interface Props {
  ast: KniAST | null;
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
  onDoubleClickNode: (id: string) => void;
}

const NODE_W = 220;
const NODE_H = 110;
const HEADER_H = 28;
const PORT_R = 5;
const PORT_GAP = 18;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '\u2026';
}

// Cubic Bézier curve between two points
function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.abs(x2 - x1) * 0.5;
  const cp1x = x1 + dx;
  const cp2x = x2 - dx;
  return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;
}

export function NodeGraph(props: Props) {
  let svgRef!: SVGSVGElement;

  const [zoom, setZoom] = createSignal(1);
  const [panX, setPanX] = createSignal(0);
  const [panY, setPanY] = createSignal(0);
  const [isPanning, setIsPanning] = createSignal(false);
  const [dragNode, setDragNode] = createSignal<string | null>(null);
  const [positions, setPositions] = createSignal<Record<string, LayoutPosition>>({});

  let panStartX = 0;
  let panStartY = 0;
  let panStartPanX = 0;
  let panStartPanY = 0;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPosX = 0;
  let dragStartPosY = 0;

  // Extract graph from AST
  const graph = createMemo<SceneGraph | null>(() => {
    if (!props.ast) return null;
    return extractSceneGraph(props.ast);
  });

  // Auto-layout when graph changes
  createEffect(on(graph, (g) => {
    if (!g) return;
    const layout = autoLayout(g, NODE_W, NODE_H);
    // Center the layout
    const allPos = Object.values(layout);
    if (allPos.length > 0) {
      const minX = Math.min(...allPos.map(p => p.x));
      const minY = Math.min(...allPos.map(p => p.y));
      const maxX = Math.max(...allPos.map(p => p.x)) + NODE_W;
      const maxY = Math.max(...allPos.map(p => p.y)) + NODE_H;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      setPanX(-cx);
      setPanY(-cy);
    }
    setPositions(layout);
  }));

  // Port positions
  function getOutputPortPos(nodeId: string, portIndex: number, portCount: number): { x: number; y: number } {
    const pos = positions()[nodeId];
    if (!pos) return { x: 0, y: 0 };
    const startY = HEADER_H + 14 + portIndex * PORT_GAP;
    return { x: pos.x + NODE_W, y: pos.y + startY };
  }

  function getInputPortPos(nodeId: string): { x: number; y: number } {
    const pos = positions()[nodeId];
    if (!pos) return { x: 0, y: 0 };
    return { x: pos.x, y: pos.y + NODE_H / 2 };
  }

  // Mouse handlers for pan
  function onSvgMouseDown(e: MouseEvent) {
    if (e.button === 1 || (e.button === 0 && e.target === svgRef)) {
      setIsPanning(true);
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartPanX = panX();
      panStartPanY = panY();
      e.preventDefault();
    }
  }

  function onSvgMouseMove(e: MouseEvent) {
    if (isPanning()) {
      const dx = (e.clientX - panStartX) / zoom();
      const dy = (e.clientY - panStartY) / zoom();
      setPanX(panStartPanX + dx);
      setPanY(panStartPanY + dy);
    }
    if (dragNode()) {
      const dx = (e.clientX - dragStartX) / zoom();
      const dy = (e.clientY - dragStartY) / zoom();
      setPositions(prev => ({
        ...prev,
        [dragNode()!]: {
          x: dragStartPosX + dx,
          y: dragStartPosY + dy,
        }
      }));
    }
  }

  function onSvgMouseUp() {
    setIsPanning(false);
    setDragNode(null);
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setZoom(z => Math.min(3, Math.max(0.15, z * factor)));
  }

  // Node drag
  function onNodeMouseDown(id: string, e: MouseEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    setDragNode(id);
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const pos = positions()[id];
    dragStartPosX = pos?.x ?? 0;
    dragStartPosY = pos?.y ?? 0;
    props.onSelectNode(id);
  }

  // Click empty area to deselect
  function onSvgClick(e: MouseEvent) {
    if (e.target === svgRef) {
      props.onSelectNode(null);
    }
  }

  onMount(() => {
    document.addEventListener('mousemove', onSvgMouseMove);
    document.addEventListener('mouseup', onSvgMouseUp);
  });

  onCleanup(() => {
    document.removeEventListener('mousemove', onSvgMouseMove);
    document.removeEventListener('mouseup', onSvgMouseUp);
  });

  return (
    <svg
      ref={svgRef}
      class="node-graph"
      onMouseDown={onSvgMouseDown}
      onClick={onSvgClick}
      onWheel={onWheel}
      style={{ cursor: isPanning() ? 'grabbing' : dragNode() ? 'move' : 'grab' }}
    >
      {/* Grid pattern */}
      <defs>
        <pattern id="grid-small" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" class="node-graph-grid" stroke-width="0.5" />
        </pattern>
        <pattern id="grid-large" width="100" height="100" patternUnits="userSpaceOnUse">
          <rect width="100" height="100" fill="url(#grid-small)" />
          <path d="M 100 0 L 0 0 0 100" fill="none" class="node-graph-grid-major" stroke-width="0.5" />
        </pattern>
      </defs>

      {/* Background grid (fixed) */}
      <rect width="100%" height="100%" fill="url(#grid-large)" />

      {/* Transform group for pan/zoom */}
      <g transform={`translate(${(svgRef ? svgRef.clientWidth / 2 : 0)}, ${(svgRef ? svgRef.clientHeight / 2 : 0)}) scale(${zoom()}) translate(${panX()}, ${panY()})`}>
        {/* Edges */}
        <Show when={graph()}>
          <For each={graph()!.edges}>
            {(edge) => {
              const fromNode = () => graph()!.nodes.find(n => n.id === edge.from);
              const toNode = () => graph()!.nodes.find(n => n.id === edge.to);
              if (!fromNode() || !toNode()) return null;

              const outIdx = () => {
                const fn = fromNode()!;
                return fn.outEdges.indexOf(edge);
              };

              const from = () => getOutputPortPos(edge.from, Math.max(0, outIdx()), fromNode()!.outEdges.length);
              const to = () => getInputPortPos(edge.to);

              return (
                <path
                  class={`graph-edge type-${edge.type}`}
                  d={bezierPath(from().x, from().y, to().x, to().y)}
                />
              );
            }}
          </For>
        </Show>

        {/* Nodes */}
        <Show when={graph()}>
          <For each={graph()!.nodes}>
            {(node) => {
              const pos = () => positions()[node.id] ?? { x: 0, y: 0 };
              const isLogic = node.kind === 'logic';
              const isStart = graph()!.startScene === node.id;
              const isSelected = () => props.selectedNode === node.id;

              return (
                <g
                  class={`graph-node ${isLogic ? 'is-logic' : ''} ${isStart ? 'is-start' : ''} ${isSelected() ? 'selected' : ''}`}
                  transform={`translate(${pos().x}, ${pos().y})`}
                  onMouseDown={(e) => onNodeMouseDown(node.id, e)}
                  onDblClick={() => props.onDoubleClickNode(node.id)}
                >
                  {/* Node background */}
                  <rect class="graph-node-bg" width={NODE_W} height={NODE_H} />

                  {/* Header bar */}
                  <clipPath id={`clip-header-${node.id}`}>
                    <rect width={NODE_W} height={HEADER_H} rx={4} ry={4} />
                  </clipPath>
                  <rect
                    class="graph-node-header"
                    width={NODE_W}
                    height={HEADER_H}
                    clip-path={`url(#clip-header-${node.id})`}
                  />

                  {/* Title */}
                  <text class="graph-node-title" x={10} y={18}>
                    {isLogic ? '\u25C7 ' : isStart ? '\u25B6 ' : '\u25A1 '}
                    {node.name}
                  </text>

                  {/* Snippet */}
                  <Show when={node.snippet}>
                    <text class="graph-node-snippet" x={10} y={HEADER_H + 18}>
                      {truncate(node.snippet, 30)}
                    </text>
                  </Show>

                  {/* Metadata */}
                  <Show when={node.bg}>
                    <text class="graph-node-snippet" x={10} y={HEADER_H + 34} style="opacity:0.5">
                      bg: {truncate(node.bg, 24)}
                    </text>
                  </Show>

                  {/* Input port (left side) */}
                  <Show when={node.inEdges.length > 0}>
                    <circle
                      class="graph-node-port"
                      cx={0}
                      cy={NODE_H / 2}
                      r={PORT_R}
                    />
                  </Show>

                  {/* Output ports (right side) */}
                  <For each={node.outEdges}>
                    {(edge, i) => {
                      const py = HEADER_H + 14 + i() * PORT_GAP;
                      return (
                        <g>
                          <circle
                            class="graph-node-port"
                            cx={NODE_W}
                            cy={py}
                            r={PORT_R}
                          />
                          <Show when={edge.label}>
                            <text class="graph-node-port-label" x={NODE_W - 8} y={py + 3} text-anchor="end">
                              {truncate(edge.label!, 18)}
                            </text>
                          </Show>
                        </g>
                      );
                    }}
                  </For>
                </g>
              );
            }}
          </For>
        </Show>
      </g>

      {/* Zoom indicator */}
      <text
        x={12}
        y={svgRef ? svgRef.clientHeight - 12 : 20}
        fill="var(--ink-text-muted)"
        font-size="10"
        font-family="var(--ink-font-ui)"
      >
        {Math.round(zoom() * 100)}%
      </text>
    </svg>
  );
}
