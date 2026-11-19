namespace Mreact.VirtualRowLayout

def rowOffsets (step : Offset → Size → Offset) (offset : Offset) : List Size → List Offset
  | [] => []
  | size :: rest => offset :: rowOffsets step (step offset size) rest

def layout (step : Offset → Size → Offset) (offset : Offset) :
    List Size → List Offset × Offset
  | [] => ([], offset)
  | size :: rest =>
    let (offsets, total) := layout step (step offset size) rest
    (offset :: offsets, total)

/-- A single scan preserves each row start and the final left-fold total for any step. -/
theorem layout_preserves (step : Offset → Size → Offset) (offset : Offset) (sizes : List Size) :
    layout step offset sizes = (rowOffsets step offset sizes, sizes.foldl step offset) := by
  induction sizes generalizing offset with
  | nil => rfl
  | cons size rest ih => simp [layout, rowOffsets, ih, List.foldl_cons]

end Mreact.VirtualRowLayout
