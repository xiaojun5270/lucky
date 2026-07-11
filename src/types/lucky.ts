export type LuckyRecord = Record<string, unknown>;

export type LuckyResponse<T extends LuckyRecord = LuckyRecord> = T & {
  ret: number;
  msg?: string;
};

export type LuckyLoginInput = {
  baseUrl: string;
  account: string;
  password: string;
  twoFACode?: string;
};

export type LuckyListItem = LuckyRecord & {
  Key?: string;
  key?: string;
  id?: string;
  Name?: string;
  name?: string;
  TaskName?: string;
  Enable?: boolean;
  enable?: boolean;
  status?: string;
  Status?: string;
};

export type LuckyModule = LuckyListItem & {
  module?: string;
  Module?: string;
  description?: string;
};

export type LuckyDashboard = {
  status: LuckyRecord;
  info: LuckyRecord;
  modules: LuckyModule[];
};

export type LuckyServiceKind = 'webservice' | 'ddns' | 'docker' | 'ssl';
