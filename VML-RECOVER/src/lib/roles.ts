export const ROLES = [
  "ADMIN","DIRECTOR","COLLECTION_MANAGER","FIELD_OFFICER",
  "FINANCE","LEGAL","CLIENT","DEBTOR"
] as const;
export type AppRole = typeof ROLES[number];
export const ROLE_LABELS: Record<AppRole,string> = {
  ADMIN:"System Administrator", DIRECTOR:"Director / Executive",
  COLLECTION_MANAGER:"Collection Manager", FIELD_OFFICER:"Field Recovery Officer",
  FINANCE:"Finance & Accounts", LEGAL:"Legal Officer",
  CLIENT:"Institutional Client", DEBTOR:"Debtor"
};
export const ROLE_HOME: Record<AppRole,string> = {
  ADMIN:"/dashboard", DIRECTOR:"/dashboard", COLLECTION_MANAGER:"/dashboard",
  FIELD_OFFICER:"/dashboard", FINANCE:"/dashboard", LEGAL:"/dashboard",
  CLIENT:"/portal/client", DEBTOR:"/portal/debtor"
};
