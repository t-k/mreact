namespace Mreact.RenderNormalization

/-- Leaves are the node sequences returned by DOM and custom normalization. A branch combines consecutive children. -/
inductive Tree (Node : Type) where
  | leaf (nodes : List Node)
  | branch (left right : Tree Node)

def flatten : Tree Node → List Node
  | .leaf nodes => nodes
  | .branch left right => flatten left ++ flatten right

def collect (output : List Node) : Tree Node → List Node
  | .leaf nodes => output ++ nodes
  | .branch left right => collect (collect output left) right

/-- Appending into the existing output preserves the order and identity of all nodes. -/
theorem collect_preserves (tree : Tree Node) (output : List Node) :
    collect output tree = output ++ flatten tree := by
  induction tree generalizing output with
  | leaf => rfl
  | branch left right ihLeft ihRight =>
    simp [collect, flatten, ihRight, ihLeft, List.append_assoc]

end Mreact.RenderNormalization
