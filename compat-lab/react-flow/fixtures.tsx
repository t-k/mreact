import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { ReactNode } from "react";
import type { ReactFlowFixture } from "./types.js";

type BasicNodeData = { label: string };
type DecisionNodeData = { label: string; status: string };
type DecisionNode = Node<DecisionNodeData, "decision">;

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
};

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
];
