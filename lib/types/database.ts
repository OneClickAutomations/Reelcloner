/**
 * Database types, kept in sync by hand with supabase/migrations/.
 *
 * TODO: once the project is linked, replace this file with
 * `supabase gen types typescript --linked > lib/types/database.ts`.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ReferenceVideoStatus = "pending" | "ready" | "failed";
export type GenerationJobType = "analysis" | "recreation";
export type GenerationJobStatus = "queued" | "running" | "succeeded" | "failed";
export type CreativeKind = "keyframe" | "video";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; credits: number; created_at: string };
        Insert: { id: string; credits?: number; created_at?: string };
        Update: { credits?: number };
        Relationships: [];
      };
      projects: {
        Row: { id: string; user_id: string; name: string; created_at: string };
        Insert: { id?: string; user_id: string; name: string; created_at?: string };
        Update: { name?: string };
        Relationships: [];
      };
      reference_videos: {
        Row: {
          id: string;
          project_id: string;
          storage_path: string | null;
          source_url: string | null;
          duration_seconds: number | null;
          status: ReferenceVideoStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          storage_path?: string | null;
          source_url?: string | null;
          duration_seconds?: number | null;
          status?: ReferenceVideoStatus;
          created_at?: string;
        };
        Update: {
          storage_path?: string | null;
          source_url?: string | null;
          duration_seconds?: number | null;
          status?: ReferenceVideoStatus;
        };
        Relationships: [];
      };
      analyses: {
        Row: {
          id: string;
          reference_video_id: string;
          json: Json;
          model: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          reference_video_id: string;
          json: Json;
          model: string;
          created_at?: string;
        };
        Update: { json?: Json; model?: string };
        Relationships: [];
      };
      characters: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          ref_image_paths: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          ref_image_paths?: string[];
          created_at?: string;
        };
        Update: { name?: string; ref_image_paths?: string[] };
        Relationships: [];
      };
      generation_jobs: {
        Row: {
          id: string;
          project_id: string;
          type: GenerationJobType;
          status: GenerationJobStatus;
          input: Json;
          output: Json | null;
          error: string | null;
          credits_charged: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          type: GenerationJobType;
          status?: GenerationJobStatus;
          input?: Json;
          output?: Json | null;
          error?: string | null;
          credits_charged?: number;
        };
        Update: {
          status?: GenerationJobStatus;
          input?: Json;
          output?: Json | null;
          error?: string | null;
          credits_charged?: number;
        };
        Relationships: [];
      };
      creatives: {
        Row: {
          id: string;
          project_id: string;
          generation_job_id: string | null;
          storage_path: string;
          kind: CreativeKind;
          meta: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          generation_job_id?: string | null;
          storage_path: string;
          kind: CreativeKind;
          meta?: Json;
          created_at?: string;
        };
        Update: { meta?: Json };
        Relationships: [];
      };
      credits_ledger: {
        Row: {
          id: string;
          user_id: string;
          delta: number;
          reason: string;
          ref_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          delta: number;
          reason: string;
          ref_id?: string | null;
          created_at?: string;
        };
        Update: { reason?: string; ref_id?: string | null };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      reference_video_status: ReferenceVideoStatus;
      generation_job_type: GenerationJobType;
      generation_job_status: GenerationJobStatus;
      creative_kind: CreativeKind;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicTables = Database["public"]["Tables"];
export type Row<T extends keyof PublicTables> = PublicTables[T]["Row"];
export type Insert<T extends keyof PublicTables> = PublicTables[T]["Insert"];

export type Profile = Row<"profiles">;
export type Project = Row<"projects">;
export type ReferenceVideo = Row<"reference_videos">;
export type AnalysisRow = Row<"analyses">;
export type Character = Row<"characters">;
export type GenerationJob = Row<"generation_jobs">;
export type Creative = Row<"creatives">;
export type CreditsLedgerEntry = Row<"credits_ledger">;
