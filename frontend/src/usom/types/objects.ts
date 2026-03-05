// USOM - Unified Semantic & Object Model
// These types define the core objects that flow through the system

// Base USOM Object Interface
export interface USOMObject {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  context?: Record<string, any>;
}

// Task Object
export interface Task extends USOMObject {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  estimatedTime?: number; // in minutes
  actualTime?: number; // in minutes
  dueDate?: Date;
  completedAt?: Date;
}

export type TaskStatus = 'draft' | 'active' | 'scheduled' | 'completed' | 'archived';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

// Habit Object
export interface Habit extends USOMObject {
  name: string;
  description?: string;
  status: HabitStatus;
  frequency: Frequency;
  timeHint?: string;
  duration?: number; // in minutes
  streak: number;
  startDate?: Date;
}

export type HabitStatus = 'draft' | 'active' | 'suspended' | 'archived';
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'custom';

// TimeBox Object
export interface TimeBox extends USOMObject {
  title: string;
  description?: string;
  status: TimeBoxStatus;
  startTime: Date;
  endTime: Date;
  duration: number; // in minutes
  taskId?: string;
  habitId?: string;
  actualStartTime?: Date;
  actualEndTime?: Date;
}

export type TimeBoxStatus = 'planned' | 'running' | 'paused' | 'ended' | 'logged';

// OKR Object
export interface OKR extends USOMObject {
  title: string;
  description?: string;
  period: string; // e.g., "2026-Q1", "monthly"
  status: OKRStatus;
  progress: number; // 0-100 percentage
  dueDate?: Date;
}

export type OKRStatus = 'draft' | 'active' | 'completed' | 'archived';

// KeyResult Object
export interface KeyResult extends USOMObject {
  okrId: string;
  title: string;
  description?: string;
  status: KeyResultStatus;
  progress: number; // 0-100 percentage
}

export type KeyResultStatus = 'draft' | 'active' | 'completed' | 'archived';

// Review Object
export interface Review extends USOMObject {
  type: ReviewType;
  period: string; // e.g., "2026-03-05", "2026-W10"
  summary?: string;
  insights?: string;
}

export type ReviewType = 'daily' | 'weekly' | 'monthly' | 'custom';

// ContextSnapshot - Unified read-only snapshot
export interface ContextSnapshot {
  version: number;
  timestamp: Date;
  tasks: Task[];
  habits: Habit[];
  timeboxes: TimeBox[];
  okrs: OKR[];
  activeTimeBox?: TimeBox;
  currentTask?: Task;
  energyLevel?: number; // 1-10
  focusMode?: boolean;
}

// Action Surface Types
export interface ActionCandidate {
  id: string;
  type: 'guide' | 'tile' | 'cue';
  category: string;
  title: string;
  description?: string;
  action: () => void;
  weight: number;
  context?: Record<string, any>;
}

export interface ActionSurfaceSuggestion {
  category: 'guide' | 'tile' | 'cue';
  weight: number;
  actions: ActionCandidate[];
}

// Intent Types
export interface StructuredIntent {
  id: string;
  type: string;
  data: Record<string, any>;
  confidence: number;
  requiredFields: string[];
  metadata?: Record<string, any>;
}

// Event Types
export interface SystemEvent {
  id: string;
  type: string;
  payload: Record<string, any>;
  timestamp: Date;
  source: 'user' | 'system' | 'external';
}

// Memory Framework Types
export interface MemoryItem {
  id: string;
  layer: 'L1_session' | 'L2_episode' | 'L3_procedural' | 'L4_semantic' | 'L5_core';
  content: string;
  metadata: Record<string, any>;
  timestamp: Date;
  tags?: string[];
}

export interface DerivedSignal {
  id: string;
  type: string;
  value: Record<string, any>;
  timestamp: Date;
  confidence?: number;
}

// Domain Manifest Types
export interface DomainManifest {
  id: string;
  name: string;
  version: string;
  supportedIntents: string[];
  requiredFields: Record<string, string[]>; // intent -> required fields
  subscribedEvents: string[];
  actionSurfaceTemplates: ActionSurfaceTemplate[];
  outboundConnectors?: OutboundConnector[];
  inboundSources?: InboundSource[];
}

export interface ActionSurfaceTemplate {
  intent: string;
  type: 'guide' | 'tile' | 'cue';
  template: string;
  weight: number;
}

export interface OutboundConnector {
  id: string;
  trigger: string;
  optional: boolean;
}

export interface InboundSource {
  primary: string;
  connectors?: string[];
  fallback: string;
}