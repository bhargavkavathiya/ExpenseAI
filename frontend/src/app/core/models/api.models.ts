// Mirrors the DTOs in Uc10.Application. Keep shapes in sync when the backend changes.

export interface EmployeeProfileDto {
  employeeId: string | null;
  fullName: string | null;
  mobile: string | null;
  department: string | null;
  managerName: string | null;
  band: string | null;
  registrationSource: string | null;
  location: string | null;
  costCenter: string | null;
}

export interface UserDto {
  id: string;
  email: string;
  roles: string[];
  createdAt: string;
  profile: EmployeeProfileDto | null;
}

export interface EmployeeBandDto {
  code: string;
  name: string;
  description: string;
  rankOrder: number;
  active: boolean;
  allowances: Record<string, number>;
}

export interface BandAllowances {
  dailyLimit: number;
  mealsLimit: number;
  hotelLimit: number;
  fuelLimit: number;
  mgrReviewThreshold: number;
}

export interface EmployeeBandWithAllowancesDto {
  code: string;
  name: string;
  description: string;
  rankOrder: number;
  active: boolean;
  allowances: BandAllowances;
}

export interface UpdateAllBandAllowancesRequest {
  bands: { code: string; allowances: BandAllowances }[];
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string;
  user: UserDto;
}

export interface ExpenseSubmissionResponse {
  refId: string;
  status: string;          // 'processing'
  submittedAt: string;
}

export type ExpenseStatus =
  | 'processing' | 'approved' | 'needs_review' | 'rejected' | 'failed';

export interface ModuleResultDto {
  modelVersion: string;
  promptVersion: string | null;
  score: number;
  summary: string | null;
  details: any;
}

export interface PerModuleDto {
  ocr: ModuleResultDto;
  duplicate: ModuleResultDto;
  anomaly: ModuleResultDto;
  policy: ModuleResultDto;
}

export interface ReceiptItemDto {
  description: string;
  quantity: number;
  unitPrice: number | null;
  total: number | null;
}

export interface ExpenseResultDto {
  vendor: string | null;
  gstin: string | null;
  gstinVerified: boolean | null;
  date: string | null;
  total: number | null;
  currency: string;
  items: ReceiptItemDto[];
  overallConfidence: number;
  decisionStatus: string;
  explanation: string | null;
  perModule: PerModuleDto;
  needsReview: boolean;
  reviewReason: string | null;
}

export interface FindingDto {
  severity: 'info' | 'warn' | 'error';
  message: string;
}

export interface ModuleExecutionDto {
  module: string;
  status: 'ok' | 'warn' | 'failed' | 'skipped';
}

export interface ExpenseDecisionResponse {
  refId: string;
  status: ExpenseStatus;
  submittedAt: string;
  completedAt: string | null;
  overallConfidence: number | null;
  needsReview: boolean;
  reviewReason: string | null;
  category: string | null;
  paymentMode: string | null;
  purpose: string | null;
  city: string | null;
  claimedAmount: number | null;
  claimedDate: string | null;
  claimedMerchant: string | null;
  claimedGstin: string | null;
  employeeName: string | null;
  department: string | null;
  result: ExpenseResultDto | null;
  findings: FindingDto[];
  modulesExecuted: ModuleExecutionDto[];
}

export interface GstinVerifyResponse {
  gstin: string;
  verified: boolean;
  status: string;        // 'active (simulated)' | 'active' | 'invalid_format' | 'http_404' | ...
  legalName: string | null;
  stateCode: string | null;
  state: string | null;
  circuitOpen: boolean;
}

export interface SubmissionMetadata {
  category?: string;
  paymentMode?: string;
  purpose?: string;
  city?: string;
  claimedAmount?: number;
  claimedDate?: string;
  claimedMerchant?: string;
  claimedGstin?: string;
  employeeName?: string;
  department?: string;
}

export interface ExpenseSummaryDto {
  refId: string;
  status: ExpenseStatus;
  submittedAt: string;
  overallConfidence: number | null;
  vendor: string | null;
  total: number | null;
  currency: string;
}

// --- admin ---
export interface KpiCards {
  submissionsLast1h: number;
  submissionsLast24h: number;
  errorRatePercent: number;
  pendingReviews: number;
}

export interface ConfidenceBucketDto {
  bucketStart: number;
  bucketEnd: number;
  count: number;
}

export interface ModuleHealthDto {
  module: string;
  invocations: number;
  successRate: number;
  averageConfidence: number;
  averageDurationMs: number;
}

export interface IntegrationDto {
  name: string;
  health: 'up' | 'degraded' | 'down' | 'unknown';
  circuitState: 'closed' | 'half_open' | 'open';
  lastChecked: string | null;
  lastError: string | null;
}

export interface DashboardResponse {
  kpis: KpiCards;
  confidenceHistogram: ConfidenceBucketDto[];
  moduleHealth: ModuleHealthDto[];
  integrations: IntegrationDto[];
}

export interface ReviewQueueItemDto {
  id: string;
  expenseRefId: string;
  userEmail: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  overallConfidence: number | null;
  vendor: string | null;
  total: number | null;
  currency: string;
}

export interface ThresholdDto {
  key: string;
  value: number;
  description: string;
  updatedAt: string;
}

export interface PolicyRuleDto {
  id: string;
  code: string;
  name: string;
  description: string;
  type: string;
  params: any;
  active: boolean;
  severity: 'low' | 'medium' | 'high';
  updatedAt: string;
}

export interface AuditLogRow {
  seq: number;
  ts: string;
  userId: string | null;
  expenseId: string | null;
  module: string;
  modelVersion: string;
  promptVersion: string | null;
  inputRef: string | null;
  confidence: number | null;
  prevHash: string;
  hash: string;
}

export interface AuditVerifyResponse {
  intact: boolean;
  divergences: { seq: number; expectedHash: string; actualHash: string }[];
}
