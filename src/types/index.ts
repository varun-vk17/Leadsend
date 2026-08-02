// Type definitions for the Email Automation Agent

export enum CampaignStatus {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  COMPLETED = "COMPLETED",
}

export enum LeadStatus {
  PENDING = "PENDING",
  SENT = "SENT",
  FAILED = "FAILED",
}

export enum EmailLogStatus {
  SENT = "SENT",
  FAILED = "FAILED",
}

// Template placeholders supported in subject and body
export interface LeadData {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  website: string;
  [key: string]: string; // Allow custom fields
}

// CSV upload mapping
export interface ColumnMapping {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  website?: string;
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Campaign stats
export interface CampaignStats {
  totalLeads: number;
  sentToday: number;
  totalSent: number;
  totalFailed: number;
  remaining: number;
}
