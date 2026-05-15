export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          industry: string | null;
          website: string | null;
          size: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          industry?: string | null;
          website?: string | null;
          size?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          industry?: string | null;
          website?: string | null;
          size?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          org_id: string;
          email: string;
          full_name: string | null;
          role: "owner" | "admin" | "member";
          created_at: string;
        };
        Insert: {
          id: string;
          org_id: string;
          email: string;
          full_name?: string | null;
          role?: "owner" | "admin" | "member";
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          email?: string;
          full_name?: string | null;
          role?: "owner" | "admin" | "member";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "users_org_id_fkey";
            columns: ["org_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          org_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          status: "active" | "past_due" | "canceled" | "trialing";
          plan: "free" | "starter" | "growth" | "enterprise";
          current_period_start: string | null;
          current_period_end: string | null;
          proposals_used: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          status?: "active" | "past_due" | "canceled" | "trialing";
          plan?: "free" | "starter" | "growth" | "enterprise";
          current_period_start?: string | null;
          current_period_end?: string | null;
          proposals_used?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          status?: "active" | "past_due" | "canceled" | "trialing";
          plan?: "free" | "starter" | "growth" | "enterprise";
          current_period_start?: string | null;
          current_period_end?: string | null;
          proposals_used?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey";
            columns: ["org_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_docs: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          file_url: string;
          file_type: "pdf" | "docx";
          file_size_bytes: number;
          status: "queued" | "processing" | "ready" | "failed";
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          file_url: string;
          file_type: "pdf" | "docx";
          file_size_bytes: number;
          status?: "queued" | "processing" | "ready" | "failed";
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          file_url?: string;
          file_type?: "pdf" | "docx";
          file_size_bytes?: number;
          status?: "queued" | "processing" | "ready" | "failed";
          error_message?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_docs_org_id_fkey";
            columns: ["org_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      doc_chunks: {
        Row: {
          id: string;
          doc_id: string;
          org_id: string;
          content: string;
          token_count: number;
          chunk_index: number;
          embedding: number[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          doc_id: string;
          org_id: string;
          content: string;
          token_count: number;
          chunk_index: number;
          embedding?: number[] | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          doc_id?: string;
          org_id?: string;
          content?: string;
          token_count?: number;
          chunk_index?: number;
          embedding?: number[] | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "doc_chunks_doc_id_fkey";
            columns: ["doc_id"];
            referencedRelation: "knowledge_docs";
            referencedColumns: ["id"];
          },
        ];
      };
      rfp_projects: {
        Row: {
          id: string;
          org_id: string;
          title: string;
          client_name: string | null;
          deadline: string | null;
          notes: string | null;
          rfp_raw_text: string | null;
          status: "draft" | "in_review" | "submitted" | "won" | "lost";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          title: string;
          client_name?: string | null;
          deadline?: string | null;
          notes?: string | null;
          rfp_raw_text?: string | null;
          status?: "draft" | "in_review" | "submitted" | "won" | "lost";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          title?: string;
          client_name?: string | null;
          deadline?: string | null;
          notes?: string | null;
          rfp_raw_text?: string | null;
          status?: "draft" | "in_review" | "submitted" | "won" | "lost";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rfp_projects_org_id_fkey";
            columns: ["org_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      rfp_sections: {
        Row: {
          id: string;
          project_id: string;
          title: string;
          position: number;
          rfp_content: string | null;
          ai_draft: string | null;
          final_content: string | null;
          status: "pending" | "generating" | "generated" | "approved";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          title: string;
          position: number;
          rfp_content?: string | null;
          ai_draft?: string | null;
          final_content?: string | null;
          status?: "pending" | "generating" | "generated" | "approved";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          title?: string;
          position?: number;
          rfp_content?: string | null;
          ai_draft?: string | null;
          final_content?: string | null;
          status?: "pending" | "generating" | "generated" | "approved";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rfp_sections_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "rfp_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      gen_logs: {
        Row: {
          id: string;
          section_id: string;
          org_id: string;
          model: string;
          tokens_input: number;
          tokens_output: number;
          tokens_used: number;
          custom_instruction: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          section_id: string;
          org_id: string;
          model: string;
          tokens_input: number;
          tokens_output: number;
          tokens_used: number;
          custom_instruction?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          section_id?: string;
          org_id?: string;
          model?: string;
          tokens_input?: number;
          tokens_output?: number;
          tokens_used?: number;
          custom_instruction?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gen_logs_section_id_fkey";
            columns: ["section_id"];
            referencedRelation: "rfp_sections";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          id: string;
          org_id: string;
          email: string;
          role: "admin" | "member";
          token: string;
          invited_by: string;
          status: "pending" | "accepted" | "revoked" | "expired";
          expires_at: string;
          created_at: string;
          accepted_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          email: string;
          role?: "admin" | "member";
          token?: string;
          invited_by: string;
          status?: "pending" | "accepted" | "revoked" | "expired";
          expires_at?: string;
          created_at?: string;
          accepted_at?: string | null;
        };
        Update: {
          id?: string;
          org_id?: string;
          email?: string;
          role?: "admin" | "member";
          token?: string;
          invited_by?: string;
          status?: "pending" | "accepted" | "revoked" | "expired";
          expires_at?: string;
          created_at?: string;
          accepted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_org_id_fkey";
            columns: ["org_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_invited_by_fkey";
            columns: ["invited_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      current_org_id: {
        Args: Record<never, never>;
        Returns: string;
      };
      match_doc_chunks: {
        Args: {
          query_embedding: number[];
          match_count?: number;
        };
        Returns: {
          id: string;
          doc_id: string;
          content: string;
          chunk_index: number;
          similarity: number;
        }[];
      };
      claim_next_queued_doc: {
        Args: Record<never, never>;
        Returns: {
          id: string;
          file_type: string;
          org_id: string;
        }[];
      };
      increment_proposals_if_under_limit: {
        Args: { p_org_id: string; p_limit: number };
        Returns: number;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
