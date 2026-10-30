// @clause/workspace — the user's layer.
//
// Two lifetimes: the product is replaced by an update, the workspace is never touched by one. This
// package is the only code that decides what "the workspace" means.

export { initWorkspace } from "./init.mjs";
export { findWorkspace, workspacePaths } from "./layout.mjs";
export {
  appendLearning,
  forgetLearning,
  LEARNING_KINDS,
  learningId,
  learningStats,
  readLearnings,
  recall,
} from "./learnings.mjs";
export { applyOverrides, checkTarget, loadOverrides } from "./overrides.mjs";
