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

export type LuckyStatusSample = {
  time: number;
  systemCpuPercent: number;
  processCpuPercent: number;
  totalMem: number;
  usedMem: number;
  netInTransfer: number;
  netOutTransfer: number;
  netInSpeed: number;
  netOutSpeed: number;
};

export type LuckyLiveStatus = {
  totalMem: number;
  usedMem: number;
  usedCpu: number;
  currentProcessUsedCpu: number;
  goroutine: number;
  processUsedMem: number;
  netIn: number;
  netOut: number;
  lastNetInSpeed: number;
  lastNetOutSpeed: number;
  handleCount: number;
  numGc: number;
  heapInuse: number;
  runTime: string;
  queryTime: string;
  history: LuckyStatusSample[];
};

export type LuckyServiceKind = 'webservice' | 'ddns' | 'docker' | 'ssl';

export type LuckyHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type LuckyEndpointDefinition = {
  id: string;
  path: string;
  methods: LuckyHttpMethod[];
  module: string;
  source: string;
  notes: string;
  requiresSuffix: boolean;
  pathVariables: string[];
};

export type LuckyModuleDefinition = {
  key: string;
  label: string;
  endpointCount: number;
  methodCount: number;
};

export type LuckyEndpointCall = {
  endpoint: LuckyEndpointDefinition;
  method: LuckyHttpMethod;
  pathValues?: Record<string, string>;
  suffix?: string;
  query?: LuckyRecord | unknown[];
  body?: unknown;
  retryAuth?: boolean;
  signal?: AbortSignal;
};
