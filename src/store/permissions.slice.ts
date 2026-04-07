import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type AccessLevel = "full" | "limited" | "readonly" | "none";

export type RoleKey = "super_admin" | "qa_head" | "qc_lab_director" | "regulatory_affairs" | "csv_val_lead" | "it_cdo" | "operations_head" | "viewer";

export type ModuleKey = "dashboard" | "gap" | "capa" | "csv" | "fda483" | "evidence" | "agi" | "governance" | "settings";

export type PermissionMatrix = Record<RoleKey, Record<ModuleKey, AccessLevel>>;

const DEFAULT_MATRIX: PermissionMatrix = {
  super_admin:        { dashboard: "full", gap: "full", capa: "full", csv: "full", fda483: "full", evidence: "full", agi: "full", governance: "full", settings: "full" },
  qa_head:            { dashboard: "full", gap: "full", capa: "full", csv: "full", fda483: "full", evidence: "full", agi: "full", governance: "full", settings: "limited" },
  qc_lab_director:    { dashboard: "readonly", gap: "full", capa: "limited", csv: "full", fda483: "readonly", evidence: "full", agi: "readonly", governance: "readonly", settings: "none" },
  regulatory_affairs: { dashboard: "readonly", gap: "full", capa: "limited", csv: "readonly", fda483: "full", evidence: "full", agi: "readonly", governance: "full", settings: "none" },
  csv_val_lead:       { dashboard: "readonly", gap: "full", capa: "limited", csv: "full", fda483: "readonly", evidence: "full", agi: "limited", governance: "readonly", settings: "none" },
  it_cdo:             { dashboard: "readonly", gap: "readonly", capa: "none", csv: "full", fda483: "none", evidence: "readonly", agi: "full", governance: "readonly", settings: "none" },
  operations_head:    { dashboard: "full", gap: "readonly", capa: "none", csv: "readonly", fda483: "readonly", evidence: "readonly", agi: "readonly", governance: "full", settings: "none" },
  viewer:             { dashboard: "readonly", gap: "readonly", capa: "readonly", csv: "readonly", fda483: "readonly", evidence: "readonly", agi: "readonly", governance: "readonly", settings: "none" },
};

interface PermissionsState {
  matrix: PermissionMatrix;
}

const initialState: PermissionsState = { matrix: DEFAULT_MATRIX };

const permissionsSlice = createSlice({
  name: "permissions",
  initialState,
  reducers: {
    setPermission(state, { payload }: PayloadAction<{ role: RoleKey; module: ModuleKey; level: AccessLevel }>) {
      state.matrix[payload.role][payload.module] = payload.level;
    },
    resetPermissions(state) {
      state.matrix = DEFAULT_MATRIX;
    },
    resetRolePermissions(state, { payload }: PayloadAction<RoleKey>) {
      state.matrix[payload] = DEFAULT_MATRIX[payload];
    },
  },
});

export const { setPermission, resetPermissions, resetRolePermissions } = permissionsSlice.actions;
export default permissionsSlice.reducer;
