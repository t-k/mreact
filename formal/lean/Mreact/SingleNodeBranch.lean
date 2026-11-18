namespace Mreact.SingleNodeBranch

abbrev NodeId := Nat
abbrev ScopeId := Nat

/-- A candidate is eligible when each normalized branch produces exactly one node. -/
def selectSingletonBranches (whenTrue whenFalse : List NodeId) : Option (NodeId × NodeId) :=
  match whenTrue, whenFalse with
  | [first], [second] => some (first, second)
  | _, _ => none

theorem selectSingletonBranches_spec
    (whenTrue whenFalse : List NodeId) (first second : NodeId) :
    selectSingletonBranches whenTrue whenFalse = some (first, second) ↔
      whenTrue = [first] ∧ whenFalse = [second] := by
  constructor
  · intro selected
    unfold selectSingletonBranches at selected
    split at selected <;> simp_all
  · rintro ⟨rfl, rfl⟩
    rfl

inductive Operation where
  | disposeScope (scope : ScopeId)
  | removeNode (node : NodeId)
  | insertNode (node : NodeId)
  deriving BEq, Repr

/-- A successful render with an attached marker, or clearing the current branch. -/
inductive Input where
  | render (node : NodeId) (scope : Option ScopeId)
  | dispose

structure ListState where
  nodes : List NodeId := []
  scope : Option ScopeId := none

structure SingleState where
  node : Option NodeId := none
  scope : Option ScopeId := none

def toListState (state : SingleState) : ListState :=
  ⟨state.node.toList, state.scope⟩

private def disposeScope (scope : Option ScopeId) : List Operation :=
  scope.toList.map Operation.disposeScope

/-- Models the list comparison and DOM operations in insertBranch. -/
def stepList (state : ListState) (input : Input) : ListState × List Operation :=
  let remove := state.nodes.map Operation.removeNode
  match input with
  | .render node scope =>
    let next := [node]
    let change := if state.nodes == next then [] else remove ++ next.map Operation.insertNode
    (⟨next, scope⟩, disposeScope state.scope ++ change)
  | .dispose => ({}, disposeScope state.scope ++ remove)

/-- Models a candidate that tracks one node and compares its identity directly. -/
def stepSingle (state : SingleState) (input : Input) : SingleState × List Operation :=
  let remove := state.node.toList.map Operation.removeNode
  match input with
  | .render node scope =>
    let change := if state.node == some node then [] else remove ++ [.insertNode node]
    (⟨some node, scope⟩, disposeScope state.scope ++ change)
  | .dispose => ({}, disposeScope state.scope ++ remove)

theorem step_preserves (state : SingleState) (input : Input) :
    stepList (toListState state) input =
      (toListState (stepSingle state input).1, (stepSingle state input).2) := by
  cases state with
  | mk node scope =>
    cases node <;> cases input <;> simp [stepList, stepSingle, toListState]

structure Result (State : Type) where
  state : State
  operations : List Operation

private def run (step : State → Input → State × List Operation)
    (state : State) (inputs : List Input) : Result State :=
  match inputs with
  | [] => ⟨state, []⟩
  | input :: rest =>
    let (next, operations) := step state input
    let result := run step next rest
    ⟨result.state, operations ++ result.operations⟩

def runList := run stepList

def runSingle := run stepSingle

/-- Every finite sequence preserves both node identity and the ordered DOM/cleanup operations. -/
theorem trace_preserves (state : SingleState) (inputs : List Input) :
    runList (toListState state) inputs =
      ⟨toListState (runSingle state inputs).state, (runSingle state inputs).operations⟩ := by
  induction inputs generalizing state with
  | nil => rfl
  | cons input rest ih =>
    simp only [runList, runSingle, run]
    rw [step_preserves]
    rw [show run stepList (toListState (stepSingle state input).1) rest = _ from
      ih (stepSingle state input).1]
    rfl

end Mreact.SingleNodeBranch
