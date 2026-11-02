declare namespace Express {
  export interface Request {
    userId: string;
    userRole?: string;
    // Preenchidos pelo WorkspaceMiddleware
    workspaceId: string;
    workspaceRole: import("../utils/workspaces.js").WorkspaceRole;
    workspacePlan: import("../utils/plans.js").Plan;
  }
}
