// ── Scene Graph Extraction ──
// Walks the AST and builds a directed graph of scene/logic connections.
// Used by the node graph editor to visualize story flow.

import type { KniAST, ASTNode, SceneDef, LogicDef } from './types.js';

export interface SceneEdge {
  from: string;
  to: string;
  type: 'jump' | 'choice' | 'conditional' | 'call';
  label?: string;
}

export interface SceneGraphNode {
  id: string;
  kind: 'scene' | 'logic';
  name: string;
  snippet: string;      // first dialog/narration line (for preview)
  bg: string;
  music: string;
  outEdges: SceneEdge[];
  inEdges: SceneEdge[];
}

export interface SceneGraph {
  nodes: SceneGraphNode[];
  edges: SceneEdge[];
  startScene: string | null;
}

function resolveTarget(target: string): string {
  // "scene.intro" → "intro", "logic.check" → "check"
  if (target.startsWith('scene.')) return target.slice(6);
  if (target.startsWith('logic.')) return target.slice(6);
  return target;
}

function extractSnippet(body: ASTNode[]): string {
  for (const node of body) {
    if (node.kind === 'dialog') return `${node.char}: ${node.text}`;
    if (node.kind === 'narration') return node.text;
  }
  return '';
}

function extractEdgesFromNodes(
  fromId: string,
  nodes: ASTNode[],
  edges: SceneEdge[],
  seen: Set<string>
): void {
  for (const node of nodes) {
    if (node.kind === 'jump') {
      const to = resolveTarget(node.target);
      const key = `${fromId}->${to}:jump`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ from: fromId, to, type: 'jump' });
      }
    } else if (node.kind === 'choice') {
      for (const opt of node.options) {
        if (opt.target) {
          const to = resolveTarget(opt.target);
          const key = `${fromId}->${to}:choice:${opt.text}`;
          if (!seen.has(key)) {
            seen.add(key);
            edges.push({ from: fromId, to, type: 'choice', label: opt.text });
          }
        }
        // Also extract edges from actions within options
        extractEdgesFromNodes(fromId, opt.actions, edges, seen);
      }
    } else if (node.kind === 'conditional') {
      for (const branch of node.branches) {
        extractEdgesFromNodes(fromId, branch.body, edges, seen);
      }
    } else if (node.kind === 'action' && node.type === 'call') {
      const to = resolveTarget(node.target);
      const key = `${fromId}->${to}:call`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ from: fromId, to, type: 'call' });
      }
    }
  }
}

export function extractSceneGraph(ast: KniAST): SceneGraph {
  const edges: SceneEdge[] = [];
  const seen = new Set<string>();
  const graphNodes: SceneGraphNode[] = [];

  // Process scenes
  for (const [name, scene] of Object.entries(ast.scenes)) {
    extractEdgesFromNodes(name, scene.body, edges, seen);
    graphNodes.push({
      id: name,
      kind: 'scene',
      name,
      snippet: extractSnippet(scene.body),
      bg: scene.bg || '',
      music: scene.music || '',
      outEdges: [],
      inEdges: [],
    });
  }

  // Process logic blocks
  for (const [name, logic] of Object.entries(ast.logic)) {
    extractEdgesFromNodes(name, logic.body, edges, seen);
    graphNodes.push({
      id: name,
      kind: 'logic',
      name,
      snippet: '',
      bg: '',
      music: '',
      outEdges: [],
      inEdges: [],
    });
  }

  // Wire up in/out edge references
  const nodeMap = new Map(graphNodes.map(n => [n.id, n]));
  for (const edge of edges) {
    nodeMap.get(edge.from)?.outEdges.push(edge);
    nodeMap.get(edge.to)?.inEdges.push(edge);
  }

  // Determine start scene
  let startScene: string | null = null;
  if (ast.config?.start) {
    startScene = resolveTarget(ast.config.start);
  } else if (graphNodes.length > 0) {
    startScene = graphNodes[0].id;
  }

  return { nodes: graphNodes, edges, startScene };
}

// ── Auto Layout ──
// Simple layered layout: topological sort, then arrange in columns.

export interface LayoutPosition {
  x: number;
  y: number;
}

export function autoLayout(
  graph: SceneGraph,
  nodeWidth = 220,
  nodeHeight = 120,
  gapX = 100,
  gapY = 40
): Record<string, LayoutPosition> {
  const positions: Record<string, LayoutPosition> = {};
  const nodeIds = graph.nodes.map(n => n.id);

  if (nodeIds.length === 0) return positions;

  // Build adjacency
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const id of nodeIds) {
    adj.set(id, []);
    inDeg.set(id, 0);
  }
  for (const edge of graph.edges) {
    if (adj.has(edge.from) && inDeg.has(edge.to)) {
      adj.get(edge.from)!.push(edge.to);
      inDeg.set(edge.to, (inDeg.get(edge.to) || 0) + 1);
    }
  }

  // Topological sort (Kahn's algorithm) to assign layers
  const layers: string[][] = [];
  const queue: string[] = [];
  const layerOf = new Map<string, number>();

  // Start with the designated start scene if it exists
  if (graph.startScene && inDeg.has(graph.startScene)) {
    queue.push(graph.startScene);
    inDeg.set(graph.startScene, -1); // mark processed
    layerOf.set(graph.startScene, 0);
  }

  // Then add other roots
  for (const [id, deg] of inDeg) {
    if (deg === 0) {
      queue.push(id);
      layerOf.set(id, 0);
    }
  }

  // BFS to assign layers
  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const currLayer = layerOf.get(curr)!;
    for (const next of adj.get(curr) || []) {
      const existingLayer = layerOf.get(next);
      if (existingLayer === undefined) {
        layerOf.set(next, currLayer + 1);
        queue.push(next);
      } else {
        // Push to later layer if needed (longest path)
        layerOf.set(next, Math.max(existingLayer, currLayer + 1));
      }
    }
  }

  // Assign any remaining disconnected nodes
  for (const id of nodeIds) {
    if (!layerOf.has(id)) {
      layerOf.set(id, 0);
      queue.push(id);
    }
  }

  // Group into layers
  const maxLayer = Math.max(...Array.from(layerOf.values()), 0);
  for (let i = 0; i <= maxLayer; i++) layers.push([]);
  for (const [id, layer] of layerOf) {
    layers[Math.min(layer, maxLayer)].push(id);
  }

  // Position nodes
  for (let col = 0; col < layers.length; col++) {
    const layer = layers[col];
    const totalHeight = layer.length * nodeHeight + (layer.length - 1) * gapY;
    const startY = -totalHeight / 2;
    for (let row = 0; row < layer.length; row++) {
      positions[layer[row]] = {
        x: col * (nodeWidth + gapX),
        y: startY + row * (nodeHeight + gapY),
      };
    }
  }

  return positions;
}
