import {
  addEdge,
  BaseEdge,
  Background,
  Controls,
  EdgeToolbar,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  MarkerType,
  NodeToolbar,
  NodeResizer,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  getSmoothStepPath,
  reconnectEdge,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { ReactFlowFixture } from "./types.js";

type BasicNodeData = { label: string };
type DecisionNodeData = { label: string; status: string };
type DecisionNode = Node<DecisionNodeData, "decision">;
type ResizeNodeData = { label: string };
type ResizeNode = Node<ResizeNodeData, "resizable">;
type LabelEdgeData = Record<string, unknown> & { label: string };
type LabelEdge = Edge<LabelEdgeData, "labeled">;
type ToolbarNodeData = Record<string, unknown> & { label: string; onAction: () => void };
type ToolbarNode = Node<ToolbarNodeData, "toolbar">;

const basicNodes: Node<BasicNodeData>[] = [
  {
    id: "start",
    type: "input",
    position: { x: 40, y: 70 },
    data: { label: "Start" },
  },
  {
    id: "review",
    position: { x: 300, y: 70 },
    data: { label: "Review" },
  },
  {
    id: "ship",
    type: "output",
    position: { x: 560, y: 70 },
    data: { label: "Ship" },
  },
];

const basicEdges: Edge[] = [
  {
    id: "start-review",
    source: "start",
    target: "review",
    label: "draft",
    type: "smoothstep",
  },
  {
    id: "review-ship",
    source: "review",
    target: "ship",
    label: "approve",
    type: "smoothstep",
  },
];

const customNodes: DecisionNode[] = [
  {
    id: "ingest",
    type: "decision",
    position: { x: 90, y: 95 },
    data: { label: "Ingest", status: "ready" },
  },
  {
    id: "classify",
    type: "decision",
    position: { x: 390, y: 95 },
    data: { label: "Classify", status: "active" },
  },
];

const customEdges: Edge[] = [
  {
    id: "ingest-classify",
    source: "ingest",
    sourceHandle: "success",
    target: "classify",
    targetHandle: "input",
    label: "success",
    type: "default",
    animated: false,
  },
];

const controlledNodes: Node<BasicNodeData>[] = [
  {
    id: "source",
    type: "input",
    position: { x: 70, y: 120 },
    data: { label: "Source" },
  },
  {
    id: "processor",
    position: { x: 340, y: 120 },
    data: { label: "Processor" },
  },
];

const controlledEdges: Edge[] = [
  {
    id: "source-processor",
    source: "source",
    target: "processor",
    label: "queued",
    type: "smoothstep",
  },
];

const draggableNodes: Node<BasicNodeData>[] = [
  {
    id: "draggable",
    position: { x: 80, y: 125 },
    data: { label: "Drag me" },
  },
  {
    id: "anchor",
    type: "output",
    position: { x: 390, y: 125 },
    data: { label: "Anchor" },
  },
];

const draggableEdges: Edge[] = [
  {
    id: "draggable-anchor",
    source: "draggable",
    target: "anchor",
    type: "smoothstep",
    label: "tracks",
  },
];

const connectionNodes: DecisionNode[] = [
  {
    id: "draft",
    type: "decision",
    position: { x: 95, y: 130 },
    data: { label: "Draft", status: "source" },
  },
  {
    id: "publish",
    type: "decision",
    position: { x: 430, y: 130 },
    data: { label: "Publish", status: "target" },
  },
];

const reconnectNodes: Node<BasicNodeData>[] = [
  {
    id: "source",
    type: "input",
    position: { x: 70, y: 150 },
    data: { label: "Source" },
  },
  {
    id: "review",
    position: { x: 340, y: 80 },
    data: { label: "Review" },
  },
  {
    id: "ship",
    type: "output",
    position: { x: 340, y: 230 },
    data: { label: "Ship" },
  },
];

const reconnectEdges: Edge[] = [
  {
    id: "source-next",
    source: "source",
    target: "review",
    type: "smoothstep",
    label: "target:review",
  },
];

const resizableNodes: ResizeNode[] = [
  {
    id: "resize",
    type: "resizable",
    position: { x: 230, y: 130 },
    width: 150,
    height: 86,
    selected: true,
    data: { label: "Resize me" },
  },
];

const keyboardNodes: Node<BasicNodeData>[] = [
  {
    id: "delete-me",
    position: { x: 90, y: 140 },
    data: { label: "Delete me" },
  },
  {
    id: "keep-me",
    type: "output",
    position: { x: 410, y: 140 },
    data: { label: "Keep me" },
  },
];

const keyboardEdges: Edge[] = [
  {
    id: "delete-keep",
    source: "delete-me",
    target: "keep-me",
    type: "smoothstep",
    label: "removable",
  },
];

const viewportNodes: Node<BasicNodeData>[] = [
  {
    id: "viewport-a",
    type: "input",
    position: { x: 40, y: 100 },
    data: { label: "Viewport A" },
  },
  {
    id: "viewport-b",
    type: "output",
    position: { x: 520, y: 260 },
    data: { label: "Viewport B" },
  },
];

const customEdgeNodes: Node<BasicNodeData>[] = [
  {
    id: "custom-source",
    type: "input",
    position: { x: 100, y: 160 },
    data: { label: "Source" },
  },
  {
    id: "custom-target",
    type: "output",
    position: { x: 520, y: 160 },
    data: { label: "Target" },
  },
];

const customEdgeEdges: LabelEdge[] = [
  {
    id: "custom-labeled-edge",
    source: "custom-source",
    target: "custom-target",
    type: "labeled",
    markerEnd: { type: MarkerType.ArrowClosed, color: "#2f4d67" },
    data: { label: "portal label" },
  },
];

const initializedNodes: Node<BasicNodeData>[] = [
  {
    id: "init-a",
    position: { x: 120, y: 120 },
    data: { label: "Init A" },
  },
  {
    id: "init-b",
    position: { x: 420, y: 220 },
    data: { label: "Init B" },
  },
];

const selectionNodes: Node<BasicNodeData>[] = [
  {
    id: "select-a",
    position: { x: 120, y: 130 },
    data: { label: "Select A" },
  },
  {
    id: "select-b",
    position: { x: 380, y: 180 },
    data: { label: "Select B" },
  },
  {
    id: "select-c",
    type: "output",
    position: { x: 650, y: 300 },
    data: { label: "Outside" },
  },
];

const edgeDeleteNodes: Node<BasicNodeData>[] = [
  {
    id: "edge-source",
    type: "input",
    position: { x: 120, y: 170 },
    data: { label: "Edge Source" },
  },
  {
    id: "edge-target",
    type: "output",
    position: { x: 520, y: 170 },
    data: { label: "Edge Target" },
  },
];

const edgeDeleteEdges: Edge[] = [
  {
    id: "delete-edge",
    source: "edge-source",
    target: "edge-target",
    type: "smoothstep",
  },
];

const parentChildNodes: Node<BasicNodeData>[] = [
  {
    id: "group",
    type: "group",
    position: { x: 130, y: 100 },
    width: 390,
    height: 260,
    data: { label: "Group" },
    style: { width: 390, height: 260 },
  },
  {
    id: "child-a",
    parentId: "group",
    extent: "parent",
    position: { x: 42, y: 72 },
    data: { label: "Child A" },
  },
  {
    id: "child-b",
    parentId: "group",
    extent: "parent",
    position: { x: 218, y: 138 },
    data: { label: "Child B" },
  },
];

function FlowFrame(props: { children: ReactNode }) {
  return <section className="react-flow-frame">{props.children}</section>;
}

function DecisionNodeComponent(props: NodeProps<DecisionNode>) {
  return (
    <div className="decision-node" data-decision-status={props.data.status}>
      <Handle id="input" type="target" position={Position.Left} />
      <div className="decision-node__label">{props.data.label}</div>
      <div className="decision-node__status">{props.data.status}</div>
      <Handle id="success" type="source" position={Position.Right} />
      <Handle id="fallback" type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = {
  decision: DecisionNodeComponent,
  resizable: ResizableNodeComponent,
  toolbar: ToolbarNodeComponent,
};

const edgeTypes = {
  labeled: LabeledEdgeComponent,
};

function ResizableNodeComponent(props: NodeProps<ResizeNode>) {
  return (
    <div className="resizable-node">
      <NodeResizer
        isVisible
        minWidth={120}
        minHeight={70}
        maxWidth={260}
        maxHeight={180}
        color="#2f4d67"
        handleClassName="resize-test-handle"
        lineClassName="resize-test-line"
      />
      <Handle id="input" type="target" position={Position.Left} />
      <strong>{props.data.label}</strong>
      <span>{Math.round(props.width ?? 0)} x {Math.round(props.height ?? 0)}</span>
      <Handle id="output" type="source" position={Position.Right} />
    </div>
  );
}

function LabeledEdgeComponent(props: EdgeProps<LabelEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });

  return (
    <>
      <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="edge-portal-label"
          data-edge-portal-label
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
        >
          {props.data.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function ToolbarNodeComponent(props: NodeProps<ToolbarNode>) {
  return (
    <div className="toolbar-node">
      <NodeToolbar isVisible nodeId={props.id} position={Position.Top}>
        <button
          className="react-flow-lab-button"
          data-testid="react-flow-node-toolbar-button"
          type="button"
          onClick={props.data.onAction}
        >
          Node action
        </button>
      </NodeToolbar>
      <Handle type="target" position={Position.Left} />
      <strong>{props.data.label}</strong>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function BasicCanvasFixture() {
  return (
    <ReactFlowProvider>
      <FlowFrame>
        <ReactFlow
          nodes={basicNodes}
          edges={basicEdges}
          fitView
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <Controls showInteractive={false} />
          <MiniMap pannable={false} zoomable={false} />
          <Panel position="top-left">Basic canvas ready</Panel>
        </ReactFlow>
      </FlowFrame>
    </ReactFlowProvider>
  );
}

function CustomNodeHandlesFixture() {
  return (
    <ReactFlowProvider>
      <FlowFrame>
        <ReactFlow
          nodes={customNodes}
          edges={customEdges}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <Panel position="top-left">Custom handles registered</Panel>
        </ReactFlow>
      </FlowFrame>
    </ReactFlowProvider>
  );
}

function ControlledInteractionFixture() {
  const [nodes, setNodes, onNodesChange] = useNodesState(controlledNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(controlledEdges);
  const selectedNode = nodes.find((node) => node.selected);

  return (
    <ReactFlowProvider>
      <FlowFrame>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_event, clickedNode) => {
            setNodes((currentNodes) =>
              currentNodes.map((node) => ({
                ...node,
                selected: node.id === clickedNode.id,
                data:
                  node.id === clickedNode.id
                    ? { label: `${node.data.label} selected` }
                    : node.data,
              })),
            );
            setEdges((currentEdges) =>
              currentEdges.map((edge) => ({
                ...edge,
                animated: edge.source === clickedNode.id,
                label: edge.source === clickedNode.id ? "selected" : edge.label,
              })),
            );
          }}
          fitView
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <Controls showInteractive={false} />
          <Panel position="top-left">
            Selected: <span data-selected-node>{selectedNode?.id ?? "none"}</span>
          </Panel>
        </ReactFlow>
      </FlowFrame>
    </ReactFlowProvider>
  );
}

function NodeDragPositionFixture() {
  const [positionText, setPositionText] = useState("80,125");

  return (
    <ReactFlowProvider>
      <FlowFrame>
        <ReactFlow
          defaultNodes={draggableNodes}
          defaultEdges={draggableEdges}
          onNodeDragStop={(_event, node) => {
            setPositionText(`${Math.round(node.position.x)},${Math.round(node.position.y)}`);
          }}
          fitView
          nodesConnectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <Panel position="top-left">
            Position: <span data-node-position>{positionText}</span>
          </Panel>
        </ReactFlow>
      </FlowFrame>
    </ReactFlowProvider>
  );
}

function ConnectOnClickFixture() {
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const onConnect = (connection: Connection) => {
    setEdges((currentEdges) =>
      addEdge({ ...connection, id: "draft-publish", label: "created", type: "smoothstep" }, currentEdges),
    );
  };

  return (
    <ReactFlowProvider>
      <FlowFrame>
        <ReactFlow
          nodes={connectionNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onConnect={onConnect}
          onEdgesChange={onEdgesChange}
          connectOnClick
          fitView
          elementsSelectable={false}
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <Panel position="top-left">
            Edges: <span data-edge-count>{edges.length}</span>
          </Panel>
        </ReactFlow>
      </FlowFrame>
    </ReactFlowProvider>
  );
}

function ControlledReconnectFixture() {
  const [edges, setEdges, onEdgesChange] = useEdgesState(reconnectEdges);
  const target = edges[0]?.target ?? "unknown";

  return (
    <ReactFlowProvider>
      <FlowFrame>
        <ReactFlow
          nodes={reconnectNodes}
          edges={edges}
          onEdgesChange={onEdgesChange}
          fitView
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <Panel position="top-left">
            Target: <span data-edge-target>{target}</span>
            <button
              className="react-flow-lab-button nodrag"
              data-testid="react-flow-reconnect-button"
              type="button"
              onClick={() => {
                setEdges((currentEdges) =>
                  reconnectEdge(
                    currentEdges[0],
                    { source: "source", sourceHandle: null, target: "ship", targetHandle: null },
                    currentEdges,
                  ).map((edge) => ({
                    ...edge,
                    label: edge.id === "source-next" ? "target:ship" : edge.label,
                  })),
                );
              }}
            >
              Reconnect to ship
            </button>
          </Panel>
        </ReactFlow>
      </FlowFrame>
    </ReactFlowProvider>
  );
}

function NodeResizerFixture() {
  return (
    <ReactFlowProvider>
      <FlowFrame>
        <ReactFlow
          defaultNodes={resizableNodes}
          edges={[]}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <Panel position="top-left">
            <span data-node-size>Resize fixture ready</span>
          </Panel>
        </ReactFlow>
      </FlowFrame>
    </ReactFlowProvider>
  );
}

function KeyboardDeleteFixture() {
  const [nodes, _setNodes, onNodesChange] = useNodesState(keyboardNodes);
  const [edges, _setEdges, onEdgesChange] = useEdgesState(keyboardEdges);
  const [deleted, setDeleted] = useState("none");

  return (
    <ReactFlowProvider>
      <FlowFrame>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodesDelete={(deletedNodes) => {
            setDeleted(deletedNodes.map((node) => node.id).join(","));
          }}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <Panel position="top-left">
            Nodes: <span data-node-count>{nodes.length}</span>
            Deleted: <span data-deleted-nodes>{deleted}</span>
          </Panel>
        </ReactFlow>
      </FlowFrame>
    </ReactFlowProvider>
  );
}

function ViewportHooksPanel() {
  const flow = useReactFlow();
  const viewport = useViewport();
  const viewportText = `${Math.round(viewport.x)},${Math.round(viewport.y)},${viewport.zoom.toFixed(2)}`;

  return (
    <Panel position="top-left">
      Viewport: <span data-viewport-state>{viewportText}</span>
      <button
        className="react-flow-lab-button nodrag"
        data-testid="react-flow-viewport-button"
        type="button"
        onClick={() => {
          void flow.setViewport({ x: 84, y: 42, zoom: 1.35 }, { duration: 0 });
        }}
      >
        Set viewport
      </button>
    </Panel>
  );
}

function ViewportHooksFixture() {
  return (
    <ReactFlowProvider>
      <FlowFrame>
        <ReactFlow
          defaultNodes={viewportNodes}
          defaultEdges={[]}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <ViewportHooksPanel />
        </ReactFlow>
      </FlowFrame>
    </ReactFlowProvider>
  );
}

function CustomEdgeLabelsFixture() {
  return (
    <ReactFlowProvider>
      <FlowFrame>
        <ReactFlow
          nodes={customEdgeNodes}
          edges={customEdgeEdges}
          edgeTypes={edgeTypes}
          fitView
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <Panel position="top-left">Custom edge ready</Panel>
        </ReactFlow>
      </FlowFrame>
    </ReactFlowProvider>
  );
}

function NodesInitializedPanel() {
  const initialized = useNodesInitialized();

  return (
    <Panel position="top-left">
      Initialized: <span data-nodes-initialized>{initialized ? "yes" : "no"}</span>
    </Panel>
  );
}

function NodesInitializedFixture() {
  return (
    <ReactFlowProvider>
      <FlowFrame>
        <ReactFlow
          defaultNodes={initializedNodes}
          defaultEdges={[]}
          fitView
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <NodesInitializedPanel />
        </ReactFlow>
      </FlowFrame>
    </ReactFlowProvider>
  );
}

function SelectionBoxFixture() {
  const [selection, setSelection] = useState("none");

  return (
    <ReactFlowProvider>
      <FlowFrame>
        <ReactFlow
          defaultNodes={selectionNodes}
          defaultEdges={[]}
          fitView
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          onSelectionChange={({ nodes }) => {
            setSelection(nodes.map((node) => node.id).sort().join(",") || "none");
          }}
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <Panel position="top-left">
            Selection: <span data-selection-summary>{selection}</span>
          </Panel>
        </ReactFlow>
      </FlowFrame>
    </ReactFlowProvider>
  );
}

function EdgeKeyboardDeleteFixture() {
  const [edges, _setEdges, onEdgesChange] = useEdgesState(edgeDeleteEdges);
  const [deleted, setDeleted] = useState("none");

  return (
    <ReactFlowProvider>
      <FlowFrame>
        <ReactFlow
          nodes={edgeDeleteNodes}
          edges={edges}
          onEdgesChange={onEdgesChange}
          onEdgesDelete={(deletedEdges) => {
            setDeleted(deletedEdges.map((edge) => edge.id).join(","));
          }}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <Panel position="top-left">
            Edges: <span data-edge-count>{edges.length}</span>
            Deleted edge: <span data-deleted-edges>{deleted}</span>
          </Panel>
        </ReactFlow>
      </FlowFrame>
    </ReactFlowProvider>
  );
}

function NodeEdgeToolbarFixture() {
  const [actions, setActions] = useState<string[]>([]);
  const pushAction = useCallback((action: string) => {
    setActions((currentActions) => [...currentActions, action]);
  }, []);
  const nodes: ToolbarNode[] = useMemo(
    () => [
      {
        id: "toolbar-node-a",
        type: "toolbar",
        position: { x: 120, y: 165 },
        data: { label: "Toolbar A", onAction: () => pushAction("node") },
      },
      {
        id: "toolbar-node-b",
        type: "toolbar",
        position: { x: 520, y: 165 },
        data: { label: "Toolbar B", onAction: () => pushAction("unused") },
      },
    ],
    [pushAction],
  );
  const edges: Edge[] = useMemo(
    () => [
      {
        id: "toolbar-edge",
        source: "toolbar-node-a",
        target: "toolbar-node-b",
        type: "smoothstep",
      },
    ],
    [],
  );

  return (
    <ReactFlowProvider>
      <FlowFrame>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <EdgeToolbar edgeId="toolbar-edge" x={330} y={200} isVisible>
            <button
              className="react-flow-lab-button"
              data-testid="react-flow-edge-toolbar-button"
              type="button"
              onClick={() => pushAction("edge")}
            >
              Edge action
            </button>
          </EdgeToolbar>
          <Panel position="top-left">
            Toolbar: <span data-toolbar-actions>{actions.join(",") || "none"}</span>
          </Panel>
        </ReactFlow>
      </FlowFrame>
    </ReactFlowProvider>
  );
}

function ParentChildExtentFixture() {
  return (
    <ReactFlowProvider>
      <FlowFrame>
        <ReactFlow
          defaultNodes={parentChildNodes}
          defaultEdges={[]}
          fitView
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <Panel position="top-left">
            Parent: <span data-parent-child-summary>group:2</span>
          </Panel>
        </ReactFlow>
      </FlowFrame>
    </ReactFlowProvider>
  );
}

export const reactFlowFixtures: ReactFlowFixture[] = [
  {
    id: "react-flow-basic-canvas",
    packageName: "@xyflow/react",
    title: "React Flow basic canvas",
    description: "Renders nodes, edges, Background, Controls, MiniMap, and Panel in a fixed viewport.",
    features: ["ReactFlow nodes and edges", "Background, Controls, MiniMap, and Panel"],
    riskTags: ["svg-edge-rendering", "layout-measurement", "viewport-transform", "context-store"],
    viewport: { width: 920, height: 620 },
    render: () => <BasicCanvasFixture />,
  },
  {
    id: "react-flow-custom-node-handles",
    packageName: "@xyflow/react",
    title: "React Flow custom node handles",
    description: "Renders a custom node type with target and multiple source handles.",
    features: ["Custom node with Handle and Position", "ReactFlow nodes and edges"],
    riskTags: ["custom-node", "handle-registration", "svg-edge-rendering", "context-store"],
    viewport: { width: 920, height: 620 },
    render: () => <CustomNodeHandlesFixture />,
  },
  {
    id: "react-flow-controlled-interaction",
    packageName: "@xyflow/react",
    title: "React Flow controlled interaction",
    description: "Uses controlled nodes and edges, then updates selection and edge state from pointer interaction.",
    features: [
      "useNodesState and useEdgesState controlled updates",
      "ReactFlow nodes and edges",
      "Background, Controls, MiniMap, and Panel",
    ],
    riskTags: ["controlled-state", "pointer-interaction", "viewport-transform", "context-store"],
    viewport: { width: 920, height: 620 },
    render: () => <ControlledInteractionFixture />,
    interactions: [
      {
        name: "click-first-node",
        description: "Select the first node and update controlled node and edge state.",
        run: "clickFirstNode",
      },
      {
        name: "click-fit-view",
        description: "Use the React Flow Controls fit view button.",
        run: "clickFitView",
      },
    ],
  },
  {
    id: "react-flow-node-drag-position",
    packageName: "@xyflow/react",
    title: "React Flow node drag position",
    description: "Drags a controlled node and verifies the position state and edge layer remain stable.",
    features: ["Node drag position updates", "ReactFlow nodes and edges"],
    riskTags: ["node-drag", "pointer-interaction", "controlled-state", "svg-edge-rendering"],
    viewport: { width: 920, height: 620 },
    render: () => <NodeDragPositionFixture />,
    interactions: [
      {
        name: "drag-first-node",
        description: "Drag the first node to produce controlled position changes.",
        run: "dragFirstNode",
      },
    ],
  },
  {
    id: "react-flow-connect-on-click",
    packageName: "@xyflow/react",
    title: "React Flow connect on click",
    description: "Creates a new controlled edge by clicking source and target handles.",
    features: ["connectOnClick and addEdge controlled updates", "Custom node with Handle and Position"],
    riskTags: ["connection", "handle-registration", "controlled-state", "pointer-interaction"],
    viewport: { width: 920, height: 620 },
    render: () => <ConnectOnClickFixture />,
    interactions: [
      {
        name: "connect-source-to-target-by-click",
        description: "Click a source handle and then a target handle to add an edge.",
        run: "connectSourceToTargetByClick",
      },
    ],
  },
  {
    id: "react-flow-controlled-reconnect",
    packageName: "@xyflow/react",
    title: "React Flow controlled reconnect",
    description: "Uses reconnectEdge from a user action and verifies the controlled edge target rerenders.",
    features: ["reconnectEdge controlled target updates", "ReactFlow nodes and edges"],
    riskTags: ["edge-reconnect", "controlled-state", "svg-edge-rendering", "pointer-interaction"],
    viewport: { width: 920, height: 620 },
    render: () => <ControlledReconnectFixture />,
    interactions: [
      {
        name: "click-reconnect-edge-button",
        description: "Reconnect the controlled edge to a different target node.",
        run: "clickReconnectEdgeButton",
      },
    ],
  },
  {
    id: "react-flow-node-resizer",
    packageName: "@xyflow/react",
    title: "React Flow node resizer",
    description: "Renders NodeResizer handles and drags a resize control for a measured node.",
    features: ["NodeResizer dimension updates", "Custom node with Handle and Position"],
    riskTags: ["node-resize", "controlled-state", "pointer-interaction", "layout-measurement"],
    viewport: { width: 920, height: 620 },
    render: () => <NodeResizerFixture />,
    interactions: [
      {
        name: "drag-resize-handle",
        description: "Drag the bottom-right resize handle to update node dimensions.",
        run: "dragResizeHandle",
      },
    ],
  },
  {
    id: "react-flow-keyboard-delete",
    packageName: "@xyflow/react",
    title: "React Flow keyboard delete",
    description: "Selects a node and deletes it with the keyboard while controlled nodes and edges update.",
    features: ["Keyboard deletion and onNodesDelete", "useNodesState and useEdgesState controlled updates"],
    riskTags: ["keyboard-interaction", "controlled-state", "context-store"],
    viewport: { width: 920, height: 620 },
    render: () => <KeyboardDeleteFixture />,
    interactions: [
      {
        name: "press-delete-key",
        description: "Select the first node and press Delete to remove it.",
        run: "pressDeleteKey",
      },
    ],
  },
  {
    id: "react-flow-viewport-hooks",
    packageName: "@xyflow/react",
    title: "React Flow viewport hooks",
    description: "Uses useReactFlow and useViewport to update and observe viewport state.",
    features: ["useReactFlow and useViewport updates", "ReactFlow nodes and edges"],
    riskTags: ["viewport-hook", "viewport-transform", "context-store"],
    viewport: { width: 920, height: 620 },
    render: () => <ViewportHooksFixture />,
    interactions: [
      {
        name: "click-viewport-button",
        description: "Set the viewport through the React Flow instance and read it through useViewport.",
        run: "clickViewportButton",
      },
    ],
  },
  {
    id: "react-flow-custom-edge-labels",
    packageName: "@xyflow/react",
    title: "React Flow custom edge labels",
    description: "Renders a custom edge component with BaseEdge, marker definitions, and EdgeLabelRenderer.",
    features: ["Custom edge with EdgeLabelRenderer and marker", "ReactFlow nodes and edges"],
    riskTags: ["custom-edge", "edge-label-renderer", "svg-edge-rendering"],
    viewport: { width: 920, height: 620 },
    render: () => <CustomEdgeLabelsFixture />,
  },
  {
    id: "react-flow-nodes-initialized",
    packageName: "@xyflow/react",
    title: "React Flow nodes initialized hook",
    description: "Uses useNodesInitialized to verify measured node initialization state.",
    features: ["useNodesInitialized measurement state", "ReactFlow nodes and edges"],
    riskTags: ["node-initialization", "layout-measurement", "context-store"],
    viewport: { width: 920, height: 620 },
    render: () => <NodesInitializedFixture />,
  },
  {
    id: "react-flow-selection-box",
    packageName: "@xyflow/react",
    title: "React Flow selection box",
    description: "Selects multiple nodes with the pane selection rectangle and reads onSelectionChange.",
    features: ["Selection box and onSelectionChange", "ReactFlow nodes and edges"],
    riskTags: ["selection-interaction", "pointer-interaction", "context-store"],
    viewport: { width: 920, height: 620 },
    render: () => <SelectionBoxFixture />,
    interactions: [
      {
        name: "drag-selection-box",
        description: "Drag a selection rectangle over two nodes.",
        run: "dragSelectionBox",
      },
    ],
  },
  {
    id: "react-flow-edge-keyboard-delete",
    packageName: "@xyflow/react",
    title: "React Flow edge keyboard delete",
    description: "Selects an edge and deletes it with the keyboard while controlled edges update.",
    features: ["Edge keyboard deletion and onEdgesDelete", "useNodesState and useEdgesState controlled updates"],
    riskTags: ["edge-delete", "keyboard-interaction", "controlled-state", "svg-edge-rendering"],
    viewport: { width: 920, height: 620 },
    render: () => <EdgeKeyboardDeleteFixture />,
    interactions: [
      {
        name: "press-delete-edge-key",
        description: "Select the rendered edge and press Delete to remove it.",
        run: "pressDeleteEdgeKey",
      },
    ],
  },
  {
    id: "react-flow-node-edge-toolbar",
    packageName: "@xyflow/react",
    title: "React Flow node and edge toolbar",
    description: "Renders NodeToolbar and EdgeToolbar portals and dispatches button actions.",
    features: ["NodeToolbar and EdgeToolbar portal controls", "Custom edge with EdgeLabelRenderer and marker"],
    riskTags: ["toolbar-portal", "custom-node", "custom-edge", "pointer-interaction"],
    viewport: { width: 920, height: 620 },
    render: () => <NodeEdgeToolbarFixture />,
    interactions: [
      {
        name: "click-toolbar-buttons",
        description: "Click visible NodeToolbar and EdgeToolbar buttons.",
        run: "clickToolbarButtons",
      },
    ],
  },
  {
    id: "react-flow-parent-child-extent",
    packageName: "@xyflow/react",
    title: "React Flow parent child extent",
    description: "Renders a group node with child nodes constrained to the parent extent.",
    features: ["Parent child nodes with constrained extent", "ReactFlow nodes and edges"],
    riskTags: ["parent-child", "layout-measurement", "context-store"],
    viewport: { width: 920, height: 620 },
    render: () => <ParentChildExtentFixture />,
  },
];
