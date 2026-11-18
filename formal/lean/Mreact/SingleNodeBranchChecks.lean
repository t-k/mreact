import Mreact.SingleNodeBranch

namespace Mreact.SingleNodeBranch

#guard selectSingletonBranches [7] [8] == some (7, 8)
#guard selectSingletonBranches [] [8] == none
#guard selectSingletonBranches [7] [] == none
#guard selectSingletonBranches [7, 8] [9] == none
#guard selectSingletonBranches [7] [8, 9] == none

#guard (runSingle {} [.render 7 (some 10)]).operations == [.insertNode 7]
#guard (runSingle {} [.render 7 (some 10), .render 7 (some 11), .dispose]).operations ==
  [.insertNode 7, .disposeScope 10, .disposeScope 11, .removeNode 7]
#guard (runSingle {} [.render 7 (some 10), .render 8 none]).operations ==
  [.insertNode 7, .disposeScope 10, .removeNode 7, .insertNode 8]
#guard (runSingle {} [.render 7 (some 10), .dispose, .dispose]).operations ==
  [.insertNode 7, .disposeScope 10, .removeNode 7]

#guard (runSingle {} [.render 7 none, .render 8 none]).state.node == some 8
#guard (runSingle {} [.render 7 none, .dispose]).state.node == none

end Mreact.SingleNodeBranch
