export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _purge_non_en_eps: {
        Row: {
          id: string
        }
        Insert: {
          id: string
        }
        Update: {
          id?: string
        }
        Relationships: []
      }
      _purge_non_en_pods: {
        Row: {
          id: string
        }
        Insert: {
          id: string
        }
        Update: {
          id?: string
        }
        Relationships: []
      }
      ai_call_audit: {
        Row: {
          confidence: number | null
          created_at: string
          error_message: string | null
          estimated_cost_usd: number | null
          id: string
          input_tokens: number | null
          job_type: string
          key_source: string | null
          latency_ms: number | null
          meta: Json
          model_used: string | null
          output_tokens: number | null
          prompt_version: string | null
          provider: string | null
          skipped_reason: string | null
          source_hash: string | null
          status: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          error_message?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_tokens?: number | null
          job_type: string
          key_source?: string | null
          latency_ms?: number | null
          meta?: Json
          model_used?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          provider?: string | null
          skipped_reason?: string | null
          source_hash?: string | null
          status: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          error_message?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_tokens?: number | null
          job_type?: string
          key_source?: string | null
          latency_ms?: number | null
          meta?: Json
          model_used?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          provider?: string | null
          skipped_reason?: string | null
          source_hash?: string | null
          status?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      ai_enrichment_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          cost_usd: number | null
          created_at: string
          id: string
          input_hash: string
          input_tokens: number | null
          kind: string
          last_error: string | null
          locked_until: string | null
          model: string | null
          output_tokens: number | null
          priority: number
          result: Json | null
          started_at: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          id?: string
          input_hash: string
          input_tokens?: number | null
          kind: string
          last_error?: string | null
          locked_until?: string | null
          model?: string | null
          output_tokens?: number | null
          priority?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          id?: string
          input_hash?: string
          input_tokens?: number | null
          kind?: string
          last_error?: string | null
          locked_until?: string | null
          model?: string | null
          output_tokens?: number | null
          priority?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      ai_spend_daily: {
        Row: {
          by_kind: Json
          calls: number
          day: string
          spend_usd: number
          updated_at: string
        }
        Insert: {
          by_kind?: Json
          calls?: number
          day: string
          spend_usd?: number
          updated_at?: string
        }
        Update: {
          by_kind?: Json
          calls?: number
          day?: string
          spend_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      beta_feedback: {
        Row: {
          created_at: string
          email: string | null
          handled: boolean
          id: string
          message: string
          page_url: string | null
          search_query: string | null
          user_agent: string | null
          user_id: string | null
          viewport: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          handled?: boolean
          id?: string
          message: string
          page_url?: string | null
          search_query?: string | null
          user_agent?: string | null
          user_id?: string | null
          viewport?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          handled?: boolean
          id?: string
          message?: string
          page_url?: string | null
          search_query?: string | null
          user_agent?: string | null
          user_id?: string | null
          viewport?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          seo_description: string | null
          seo_title: string | null
          seo_updated_at: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          seo_description?: string | null
          seo_title?: string | null
          seo_updated_at?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          seo_description?: string | null
          seo_title?: string | null
          seo_updated_at?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      discovery_queue: {
        Row: {
          author: string | null
          candidate_rank: number
          category: string | null
          created_at: string
          description: string | null
          episode_count: number | null
          id: string
          image_url: string | null
          import_attempts: number
          import_error: string | null
          import_status: string | null
          imported_at: string | null
          imported_podcast_id: string | null
          language: string | null
          last_episode_at: string | null
          last_import_attempt_at: string | null
          next_import_attempt_at: string | null
          pi_id: number | null
          rank_reason: Json
          rss_url: string
          source: string | null
          status: string
          title: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          author?: string | null
          candidate_rank?: number
          category?: string | null
          created_at?: string
          description?: string | null
          episode_count?: number | null
          id?: string
          image_url?: string | null
          import_attempts?: number
          import_error?: string | null
          import_status?: string | null
          imported_at?: string | null
          imported_podcast_id?: string | null
          language?: string | null
          last_episode_at?: string | null
          last_import_attempt_at?: string | null
          next_import_attempt_at?: string | null
          pi_id?: number | null
          rank_reason?: Json
          rss_url: string
          source?: string | null
          status?: string
          title: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          author?: string | null
          candidate_rank?: number
          category?: string | null
          created_at?: string
          description?: string | null
          episode_count?: number | null
          id?: string
          image_url?: string | null
          import_attempts?: number
          import_error?: string | null
          import_status?: string | null
          imported_at?: string | null
          imported_podcast_id?: string | null
          language?: string | null
          last_episode_at?: string | null
          last_import_attempt_at?: string | null
          next_import_attempt_at?: string | null
          pi_id?: number | null
          rank_reason?: Json
          rss_url?: string
          source?: string | null
          status?: string
          title?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      dynamic_mood_cache: {
        Row: {
          country: string
          created_at: string
          dow: number
          expires_at: string
          hits: number
          hour_bucket: number
          id: string
          payload: Json
        }
        Insert: {
          country: string
          created_at?: string
          dow: number
          expires_at?: string
          hits?: number
          hour_bucket: number
          id?: string
          payload?: Json
        }
        Update: {
          country?: string
          created_at?: string
          dow?: number
          expires_at?: string
          hits?: number
          hour_bucket?: number
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      entity_profiles: {
        Row: {
          appearance_stats: Json
          bio: string | null
          cost_usd: number | null
          display_name: string
          episode_ids: string[]
          episodes_summary: string | null
          featured_episode_ids: string[]
          generated_at: string
          image_checked_at: string | null
          image_source: string | null
          image_url: string | null
          kind: string
          model: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          appearance_stats?: Json
          bio?: string | null
          cost_usd?: number | null
          display_name: string
          episode_ids?: string[]
          episodes_summary?: string | null
          featured_episode_ids?: string[]
          generated_at?: string
          image_checked_at?: string | null
          image_source?: string | null
          image_url?: string | null
          kind: string
          model?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          appearance_stats?: Json
          bio?: string | null
          cost_usd?: number | null
          display_name?: string
          episode_ids?: string[]
          episodes_summary?: string | null
          featured_episode_ids?: string[]
          generated_at?: string
          image_checked_at?: string | null
          image_source?: string | null
          image_url?: string | null
          kind?: string
          model?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      episode_chunks: {
        Row: {
          chunk_idx: number
          content_hash: string
          embedding: string
          episode_id: string
          id: string
          model: string
          podcast_id: string
          source: string
          text: string
          updated_at: string
        }
        Insert: {
          chunk_idx: number
          content_hash: string
          embedding: string
          episode_id: string
          id?: string
          model: string
          podcast_id: string
          source: string
          text: string
          updated_at?: string
        }
        Update: {
          chunk_idx?: number
          content_hash?: string
          embedding?: string
          episode_id?: string
          id?: string
          model?: string
          podcast_id?: string
          source?: string
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      episode_embeddings: {
        Row: {
          content_hash: string
          embedding: string
          episode_id: string
          model: string
          podcast_id: string
          updated_at: string
        }
        Insert: {
          content_hash: string
          embedding: string
          episode_id: string
          model: string
          podcast_id: string
          updated_at?: string
        }
        Update: {
          content_hash?: string
          embedding?: string
          episode_id?: string
          model?: string
          podcast_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      episode_events: {
        Row: {
          created_at: string
          episode_id: string | null
          event_type: string
          id: string
          platform: string | null
          podcast_id: string | null
          referrer: string | null
          search_query: string | null
          search_rank: number | null
          user_id: string | null
          viewport_width: number | null
        }
        Insert: {
          created_at?: string
          episode_id?: string | null
          event_type: string
          id?: string
          platform?: string | null
          podcast_id?: string | null
          referrer?: string | null
          search_query?: string | null
          search_rank?: number | null
          user_id?: string | null
          viewport_width?: number | null
        }
        Update: {
          created_at?: string
          episode_id?: string | null
          event_type?: string
          id?: string
          platform?: string | null
          podcast_id?: string | null
          referrer?: string | null
          search_query?: string | null
          search_rank?: number | null
          user_id?: string | null
          viewport_width?: number | null
        }
        Relationships: []
      }
      episode_transcripts: {
        Row: {
          attempts: number
          created_at: string
          episode_id: string
          error: string | null
          fetched_at: string | null
          format: string | null
          language: string | null
          last_attempt_at: string | null
          next_attempt_at: string | null
          podcast_id: string
          source: string | null
          status: string
          text: string | null
          transcript_url: string | null
          updated_at: string
          word_count: number | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          episode_id: string
          error?: string | null
          fetched_at?: string | null
          format?: string | null
          language?: string | null
          last_attempt_at?: string | null
          next_attempt_at?: string | null
          podcast_id: string
          source?: string | null
          status?: string
          text?: string | null
          transcript_url?: string | null
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          attempts?: number
          created_at?: string
          episode_id?: string
          error?: string | null
          fetched_at?: string | null
          format?: string | null
          language?: string | null
          last_attempt_at?: string | null
          next_attempt_at?: string | null
          podcast_id?: string
          source?: string | null
          status?: string
          text?: string | null
          transcript_url?: string | null
          updated_at?: string
          word_count?: number | null
        }
        Relationships: []
      }
      episodes: {
        Row: {
          ai_enriched_at: string | null
          ai_entities_version: number
          ai_summary: string | null
          apple_url: string | null
          audio_url: string | null
          chunks_source_hash: string | null
          chunks_status: string | null
          chunks_updated_at: string | null
          companies: string[] | null
          created_at: string
          desc_chunk_claim_id: string | null
          desc_chunk_claimed_at: string | null
          desc_chunk_status: string | null
          description: string | null
          description_cleaned_at: string | null
          description_cleanup_meta: Json
          description_cleanup_status: string | null
          display_description: string | null
          display_title: string | null
          episode_rank: number
          episode_rank_label: string | null
          episode_rank_reason: Json
          episode_rank_updated_at: string | null
          episode_url: string | null
          guid: string | null
          id: string
          image_url: string | null
          ingredients: string[] | null
          next_transcript_check_at: string | null
          people: string[] | null
          people_roles: Json
          podcast_id: string
          published_at: string | null
          search_text: string | null
          search_tsv: unknown
          seo_description: string | null
          seo_title: string | null
          slug: string
          spotify_url: string | null
          summary: string | null
          tickers: string[] | null
          title: string
          topics: string[] | null
          transcript_status: string | null
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
          ai_enriched_at?: string | null
          ai_entities_version?: number
          ai_summary?: string | null
          apple_url?: string | null
          audio_url?: string | null
          chunks_source_hash?: string | null
          chunks_status?: string | null
          chunks_updated_at?: string | null
          companies?: string[] | null
          created_at?: string
          desc_chunk_claim_id?: string | null
          desc_chunk_claimed_at?: string | null
          desc_chunk_status?: string | null
          description?: string | null
          description_cleaned_at?: string | null
          description_cleanup_meta?: Json
          description_cleanup_status?: string | null
          display_description?: string | null
          display_title?: string | null
          episode_rank?: number
          episode_rank_label?: string | null
          episode_rank_reason?: Json
          episode_rank_updated_at?: string | null
          episode_url?: string | null
          guid?: string | null
          id?: string
          image_url?: string | null
          ingredients?: string[] | null
          next_transcript_check_at?: string | null
          people?: string[] | null
          people_roles?: Json
          podcast_id: string
          published_at?: string | null
          search_text?: string | null
          search_tsv?: unknown
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          spotify_url?: string | null
          summary?: string | null
          tickers?: string[] | null
          title: string
          topics?: string[] | null
          transcript_status?: string | null
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
          ai_enriched_at?: string | null
          ai_entities_version?: number
          ai_summary?: string | null
          apple_url?: string | null
          audio_url?: string | null
          chunks_source_hash?: string | null
          chunks_status?: string | null
          chunks_updated_at?: string | null
          companies?: string[] | null
          created_at?: string
          desc_chunk_claim_id?: string | null
          desc_chunk_claimed_at?: string | null
          desc_chunk_status?: string | null
          description?: string | null
          description_cleaned_at?: string | null
          description_cleanup_meta?: Json
          description_cleanup_status?: string | null
          display_description?: string | null
          display_title?: string | null
          episode_rank?: number
          episode_rank_label?: string | null
          episode_rank_reason?: Json
          episode_rank_updated_at?: string | null
          episode_url?: string | null
          guid?: string | null
          id?: string
          image_url?: string | null
          ingredients?: string[] | null
          next_transcript_check_at?: string | null
          people?: string[] | null
          people_roles?: Json
          podcast_id?: string
          published_at?: string | null
          search_text?: string | null
          search_tsv?: unknown
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          spotify_url?: string | null
          summary?: string | null
          tickers?: string[] | null
          title?: string
          topics?: string[] | null
          transcript_status?: string | null
          updated_at?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "episodes_podcast_id_fkey"
            columns: ["podcast_id"]
            isOneToOne: false
            referencedRelation: "mv_homepage_evergreen"
            referencedColumns: ["podcast_id"]
          },
          {
            foreignKeyName: "episodes_podcast_id_fkey"
            columns: ["podcast_id"]
            isOneToOne: false
            referencedRelation: "mv_homepage_feed"
            referencedColumns: ["podcast_id"]
          },
          {
            foreignKeyName: "episodes_podcast_id_fkey"
            columns: ["podcast_id"]
            isOneToOne: false
            referencedRelation: "podcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          ok: boolean
          started_at: string
          stats: Json
          trigger: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          ok?: boolean
          started_at?: string
          stats?: Json
          trigger?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          ok?: boolean
          started_at?: string
          stats?: Json
          trigger?: string
        }
        Relationships: []
      }
      landing_events: {
        Row: {
          anonymous_session_id: string
          created_at: string
          device_type: string | null
          event_name: string
          id: string
          landing_variant: string | null
          meta: Json
          path: string | null
          referrer_domain: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          anonymous_session_id: string
          created_at?: string
          device_type?: string | null
          event_name: string
          id?: string
          landing_variant?: string | null
          meta?: Json
          path?: string | null
          referrer_domain?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          anonymous_session_id?: string
          created_at?: string
          device_type?: string | null
          event_name?: string
          id?: string
          landing_variant?: string | null
          meta?: Json
          path?: string | null
          referrer_domain?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      mood_collections: {
        Row: {
          accent_hsl: string | null
          active: boolean
          created_at: string
          description: string | null
          episode_ids: string[]
          id: string
          mood: string
          podcast_ids: string[]
          seed_query: string | null
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          accent_hsl?: string | null
          active?: boolean
          created_at?: string
          description?: string | null
          episode_ids?: string[]
          id?: string
          mood: string
          podcast_ids?: string[]
          seed_query?: string | null
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          accent_hsl?: string | null
          active?: boolean
          created_at?: string
          description?: string | null
          episode_ids?: string[]
          id?: string
          mood?: string
          podcast_ids?: string[]
          seed_query?: string | null
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      mood_pool: {
        Row: {
          accent_hsl: string | null
          clicks: number
          country_hint: string | null
          created_at: string
          ctr: number | null
          description: string | null
          embedding: string | null
          episode_ids: string[]
          episodes_refreshed_at: string | null
          id: string
          impressions: number
          last_shown_at: string | null
          mood: string
          query: string
          retire_reason: string | null
          retired_at: string | null
          slug: string
          status: string
          time_tags: string[]
          title: string
        }
        Insert: {
          accent_hsl?: string | null
          clicks?: number
          country_hint?: string | null
          created_at?: string
          ctr?: number | null
          description?: string | null
          embedding?: string | null
          episode_ids?: string[]
          episodes_refreshed_at?: string | null
          id?: string
          impressions?: number
          last_shown_at?: string | null
          mood: string
          query: string
          retire_reason?: string | null
          retired_at?: string | null
          slug: string
          status?: string
          time_tags?: string[]
          title: string
        }
        Update: {
          accent_hsl?: string | null
          clicks?: number
          country_hint?: string | null
          created_at?: string
          ctr?: number | null
          description?: string | null
          embedding?: string | null
          episode_ids?: string[]
          episodes_refreshed_at?: string | null
          id?: string
          impressions?: number
          last_shown_at?: string | null
          mood?: string
          query?: string
          retire_reason?: string | null
          retired_at?: string | null
          slug?: string
          status?: string
          time_tags?: string[]
          title?: string
        }
        Relationships: []
      }
      page_events: {
        Row: {
          country: string | null
          created_at: string
          full_url: string | null
          id: string
          path: string
          referrer: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          viewport_width: number | null
          visitor_id: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          full_url?: string | null
          id?: string
          path: string
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          viewport_width?: number | null
          visitor_id?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          full_url?: string | null
          id?: string
          path?: string
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          viewport_width?: number | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      pi_dump_imports: {
        Row: {
          auto_added: number
          candidates_accepted: number
          candidates_rejected: number
          created_at: string
          failed_rss_tests: number
          feeds_received: number
          feeds_scanned: number
          hidden_low_rank: number
          id: string
          notes: Json
          queued: number
          skipped_duplicates: number
          snapshot_date: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          auto_added?: number
          candidates_accepted?: number
          candidates_rejected?: number
          created_at?: string
          failed_rss_tests?: number
          feeds_received?: number
          feeds_scanned?: number
          hidden_low_rank?: number
          id?: string
          notes?: Json
          queued?: number
          skipped_duplicates?: number
          snapshot_date?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          auto_added?: number
          candidates_accepted?: number
          candidates_rejected?: number
          created_at?: string
          failed_rss_tests?: number
          feeds_received?: number
          feeds_scanned?: number
          hidden_low_rank?: number
          id?: string
          notes?: Json
          queued?: number
          skipped_duplicates?: number
          snapshot_date?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pi_feed_staging: {
        Row: {
          ai_active_signal: string | null
          ai_confidence: number | null
          ai_decision: string | null
          ai_detected_language: string | null
          ai_gated_at: string | null
          ai_input_hash: string | null
          ai_likely_category: string | null
          ai_model: string | null
          ai_quality_score: number | null
          ai_reasons: Json
          ai_spam_score: number | null
          author: string | null
          created_at: string
          dead: boolean
          decision: string | null
          description: string | null
          episode_count: number | null
          id: string
          image_url: string | null
          import_id: string | null
          language: string | null
          last_http_status: number | null
          newest_item_at: string | null
          next_process_attempt_at: string | null
          pi_id: number | null
          process_attempts: number
          processed: boolean
          processed_at: string | null
          reject_reason: string | null
          rss_url: string
          rss_url_norm: string | null
          score: number | null
          title: string | null
          website_url: string | null
        }
        Insert: {
          ai_active_signal?: string | null
          ai_confidence?: number | null
          ai_decision?: string | null
          ai_detected_language?: string | null
          ai_gated_at?: string | null
          ai_input_hash?: string | null
          ai_likely_category?: string | null
          ai_model?: string | null
          ai_quality_score?: number | null
          ai_reasons?: Json
          ai_spam_score?: number | null
          author?: string | null
          created_at?: string
          dead?: boolean
          decision?: string | null
          description?: string | null
          episode_count?: number | null
          id?: string
          image_url?: string | null
          import_id?: string | null
          language?: string | null
          last_http_status?: number | null
          newest_item_at?: string | null
          next_process_attempt_at?: string | null
          pi_id?: number | null
          process_attempts?: number
          processed?: boolean
          processed_at?: string | null
          reject_reason?: string | null
          rss_url: string
          rss_url_norm?: string | null
          score?: number | null
          title?: string | null
          website_url?: string | null
        }
        Update: {
          ai_active_signal?: string | null
          ai_confidence?: number | null
          ai_decision?: string | null
          ai_detected_language?: string | null
          ai_gated_at?: string | null
          ai_input_hash?: string | null
          ai_likely_category?: string | null
          ai_model?: string | null
          ai_quality_score?: number | null
          ai_reasons?: Json
          ai_spam_score?: number | null
          author?: string | null
          created_at?: string
          dead?: boolean
          decision?: string | null
          description?: string | null
          episode_count?: number | null
          id?: string
          image_url?: string | null
          import_id?: string | null
          language?: string | null
          last_http_status?: number | null
          newest_item_at?: string | null
          next_process_attempt_at?: string | null
          pi_id?: number | null
          process_attempts?: number
          processed?: boolean
          processed_at?: string | null
          reject_reason?: string | null
          rss_url?: string
          rss_url_norm?: string | null
          score?: number | null
          title?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pi_feed_staging_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "pi_dump_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      player_events: {
        Row: {
          created_at: string
          duration_sec: number | null
          episode_id: string | null
          event_type: string
          id: string
          meta: Json
          playback_rate: number | null
          podcast_id: string | null
          position_sec: number | null
          session_id: string | null
          user_agent: string | null
          viewport_width: number | null
        }
        Insert: {
          created_at?: string
          duration_sec?: number | null
          episode_id?: string | null
          event_type: string
          id?: string
          meta?: Json
          playback_rate?: number | null
          podcast_id?: string | null
          position_sec?: number | null
          session_id?: string | null
          user_agent?: string | null
          viewport_width?: number | null
        }
        Update: {
          created_at?: string
          duration_sec?: number | null
          episode_id?: string | null
          event_type?: string
          id?: string
          meta?: Json
          playback_rate?: number | null
          podcast_id?: string | null
          position_sec?: number | null
          session_id?: string | null
          user_agent?: string | null
          viewport_width?: number | null
        }
        Relationships: []
      }
      podcast_embeddings: {
        Row: {
          content_hash: string
          embedding: string
          model: string
          podcast_id: string
          updated_at: string
        }
        Insert: {
          content_hash: string
          embedding: string
          model: string
          podcast_id: string
          updated_at?: string
        }
        Update: {
          content_hash?: string
          embedding?: string
          model?: string
          podcast_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      podcasts: {
        Row: {
          ai_category_alt: string | null
          ai_category_at: string | null
          ai_category_confidence: number | null
          ai_category_model: string | null
          ai_category_needs_review: boolean | null
          ai_enriched_at: string | null
          ai_entities_version: number
          ai_quality_input_hash: string | null
          ai_quality_model: string | null
          ai_quality_reason: Json
          ai_quality_score: number | null
          ai_quality_updated_at: string | null
          ai_spam_score: number | null
          apple_url: string | null
          category: string | null
          consecutive_failure_count: number
          country: string | null
          crawl_priority: string | null
          crawl_state: string
          created_at: string
          deep_hydration_error: string | null
          deep_hydration_status: string
          deep_hydration_target: number | null
          description: string | null
          description_cleaned_at: string | null
          description_cleanup_meta: Json
          description_cleanup_status: string | null
          display_description: string | null
          display_title: string | null
          featured: boolean
          featured_rank: number | null
          full_backfill_completed_at: string | null
          hydrated_episode_count: number
          id: string
          image_url: string | null
          is_sample: boolean
          known_hosts: string[]
          language: string | null
          last_deep_hydrated_at: string | null
          last_etag: string | null
          last_fetch_duplicate_count: number
          last_fetch_error: string | null
          last_fetch_new_count: number
          last_fetched_at: string | null
          last_modified: string | null
          last_rss_hunt_at: string | null
          manual_rank_boost: number
          next_fetch_at: string | null
          next_rss_hunt_at: string | null
          podiverzum_rank: number
          quarantined_until: string | null
          rank_label: string | null
          rank_reason: Json
          rank_updated_at: string | null
          refresh_interval_minutes: number
          rss_hunt_attempts: number
          rss_status: string
          rss_url: string | null
          rss_url_norm: string | null
          search_text: string | null
          search_tsv: unknown
          seo_description: string | null
          seo_title: string | null
          shadow_computed_at: string | null
          shadow_rank: number | null
          shadow_rank_components: Json
          shadow_rank_tier: string | null
          slug: string
          source: string | null
          spotify_url: string | null
          summary: string | null
          title: string
          updated_at: string
          website_url: string | null
          youtube_url: string | null
        }
        Insert: {
          ai_category_alt?: string | null
          ai_category_at?: string | null
          ai_category_confidence?: number | null
          ai_category_model?: string | null
          ai_category_needs_review?: boolean | null
          ai_enriched_at?: string | null
          ai_entities_version?: number
          ai_quality_input_hash?: string | null
          ai_quality_model?: string | null
          ai_quality_reason?: Json
          ai_quality_score?: number | null
          ai_quality_updated_at?: string | null
          ai_spam_score?: number | null
          apple_url?: string | null
          category?: string | null
          consecutive_failure_count?: number
          country?: string | null
          crawl_priority?: string | null
          crawl_state?: string
          created_at?: string
          deep_hydration_error?: string | null
          deep_hydration_status?: string
          deep_hydration_target?: number | null
          description?: string | null
          description_cleaned_at?: string | null
          description_cleanup_meta?: Json
          description_cleanup_status?: string | null
          display_description?: string | null
          display_title?: string | null
          featured?: boolean
          featured_rank?: number | null
          full_backfill_completed_at?: string | null
          hydrated_episode_count?: number
          id?: string
          image_url?: string | null
          is_sample?: boolean
          known_hosts?: string[]
          language?: string | null
          last_deep_hydrated_at?: string | null
          last_etag?: string | null
          last_fetch_duplicate_count?: number
          last_fetch_error?: string | null
          last_fetch_new_count?: number
          last_fetched_at?: string | null
          last_modified?: string | null
          last_rss_hunt_at?: string | null
          manual_rank_boost?: number
          next_fetch_at?: string | null
          next_rss_hunt_at?: string | null
          podiverzum_rank?: number
          quarantined_until?: string | null
          rank_label?: string | null
          rank_reason?: Json
          rank_updated_at?: string | null
          refresh_interval_minutes?: number
          rss_hunt_attempts?: number
          rss_status?: string
          rss_url?: string | null
          rss_url_norm?: string | null
          search_text?: string | null
          search_tsv?: unknown
          seo_description?: string | null
          seo_title?: string | null
          shadow_computed_at?: string | null
          shadow_rank?: number | null
          shadow_rank_components?: Json
          shadow_rank_tier?: string | null
          slug: string
          source?: string | null
          spotify_url?: string | null
          summary?: string | null
          title: string
          updated_at?: string
          website_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          ai_category_alt?: string | null
          ai_category_at?: string | null
          ai_category_confidence?: number | null
          ai_category_model?: string | null
          ai_category_needs_review?: boolean | null
          ai_enriched_at?: string | null
          ai_entities_version?: number
          ai_quality_input_hash?: string | null
          ai_quality_model?: string | null
          ai_quality_reason?: Json
          ai_quality_score?: number | null
          ai_quality_updated_at?: string | null
          ai_spam_score?: number | null
          apple_url?: string | null
          category?: string | null
          consecutive_failure_count?: number
          country?: string | null
          crawl_priority?: string | null
          crawl_state?: string
          created_at?: string
          deep_hydration_error?: string | null
          deep_hydration_status?: string
          deep_hydration_target?: number | null
          description?: string | null
          description_cleaned_at?: string | null
          description_cleanup_meta?: Json
          description_cleanup_status?: string | null
          display_description?: string | null
          display_title?: string | null
          featured?: boolean
          featured_rank?: number | null
          full_backfill_completed_at?: string | null
          hydrated_episode_count?: number
          id?: string
          image_url?: string | null
          is_sample?: boolean
          known_hosts?: string[]
          language?: string | null
          last_deep_hydrated_at?: string | null
          last_etag?: string | null
          last_fetch_duplicate_count?: number
          last_fetch_error?: string | null
          last_fetch_new_count?: number
          last_fetched_at?: string | null
          last_modified?: string | null
          last_rss_hunt_at?: string | null
          manual_rank_boost?: number
          next_fetch_at?: string | null
          next_rss_hunt_at?: string | null
          podiverzum_rank?: number
          quarantined_until?: string | null
          rank_label?: string | null
          rank_reason?: Json
          rank_updated_at?: string | null
          refresh_interval_minutes?: number
          rss_hunt_attempts?: number
          rss_status?: string
          rss_url?: string | null
          rss_url_norm?: string | null
          search_text?: string | null
          search_tsv?: unknown
          seo_description?: string | null
          seo_title?: string | null
          shadow_computed_at?: string | null
          shadow_rank?: number | null
          shadow_rank_components?: Json
          shadow_rank_tier?: string | null
          slug?: string
          source?: string | null
          spotify_url?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          website_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      podcasts_backup_pre_c_v3: {
        Row: {
          backed_up_at: string | null
          id: string | null
          podiverzum_rank: number | null
          rank_label: string | null
          rank_reason: Json | null
          rank_updated_at: string | null
          refresh_interval_minutes: number | null
          shadow_rank: number | null
          shadow_rank_components: Json | null
          shadow_rank_tier: string | null
        }
        Insert: {
          backed_up_at?: string | null
          id?: string | null
          podiverzum_rank?: number | null
          rank_label?: string | null
          rank_reason?: Json | null
          rank_updated_at?: string | null
          refresh_interval_minutes?: number | null
          shadow_rank?: number | null
          shadow_rank_components?: Json | null
          shadow_rank_tier?: string | null
        }
        Update: {
          backed_up_at?: string | null
          id?: string | null
          podiverzum_rank?: number | null
          rank_label?: string | null
          rank_reason?: Json | null
          rank_updated_at?: string | null
          refresh_interval_minutes?: number | null
          shadow_rank?: number | null
          shadow_rank_components?: Json | null
          shadow_rank_tier?: string | null
        }
        Relationships: []
      }
      queue_health_events: {
        Row: {
          action: string
          created_at: string
          detail: Json
          id: string
          pending_now: number | null
          pending_prev: number | null
          pending_prev_prev: number | null
          reason: string | null
          runner: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json
          id?: string
          pending_now?: number | null
          pending_prev?: number | null
          pending_prev_prev?: number | null
          reason?: string | null
          runner: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json
          id?: string
          pending_now?: number | null
          pending_prev?: number | null
          pending_prev_prev?: number | null
          reason?: string | null
          runner?: string
        }
        Relationships: []
      }
      rss_url_history: {
        Row: {
          changed_at: string
          id: string
          new_url: string
          old_url: string | null
          podcast_id: string
          reason: string
        }
        Insert: {
          changed_at?: string
          id?: string
          new_url: string
          old_url?: string | null
          podcast_id: string
          reason: string
        }
        Update: {
          changed_at?: string
          id?: string
          new_url?: string
          old_url?: string | null
          podcast_id?: string
          reason?: string
        }
        Relationships: []
      }
      search_events: {
        Row: {
          confidence_band: string | null
          created_at: string
          fallback_used: boolean
          id: string
          query: string
          result_count: number
          terms_count: number
          user_id: string | null
          viewport_width: number | null
        }
        Insert: {
          confidence_band?: string | null
          created_at?: string
          fallback_used?: boolean
          id?: string
          query: string
          result_count?: number
          terms_count?: number
          user_id?: string | null
          viewport_width?: number | null
        }
        Update: {
          confidence_band?: string | null
          created_at?: string
          fallback_used?: boolean
          id?: string
          query?: string
          result_count?: number
          terms_count?: number
          user_id?: string | null
          viewport_width?: number | null
        }
        Relationships: []
      }
      search_hyde_cache: {
        Row: {
          created_at: string
          embedding: string | null
          hyde_text: string
          q_norm: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          hyde_text: string
          q_norm: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          hyde_text?: string
          q_norm?: string
        }
        Relationships: []
      }
      search_query_cache: {
        Row: {
          created_at: string
          embedding: string | null
          hits: number
          q_norm: string
          refine: Json | null
          rerank: Json | null
          rerank_updated_at: string | null
          understanding: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          hits?: number
          q_norm: string
          refine?: Json | null
          rerank?: Json | null
          rerank_updated_at?: string | null
          understanding?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          hits?: number
          q_norm?: string
          refine?: Json | null
          rerank?: Json | null
          rerank_updated_at?: string | null
          understanding?: Json
          updated_at?: string
        }
        Relationships: []
      }
      search_suggest_cache: {
        Row: {
          created_at: string
          hits: number
          prefix: string
          suggestions: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          hits?: number
          prefix: string
          suggestions?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          hits?: number
          prefix?: string
          suggestions?: Json
          updated_at?: string
        }
        Relationships: []
      }
      search_synonyms: {
        Row: {
          created_at: string
          id: string
          synonyms: string[]
          term: string
        }
        Insert: {
          created_at?: string
          id?: string
          synonyms?: string[]
          term: string
        }
        Update: {
          created_at?: string
          id?: string
          synonyms?: string[]
          term?: string
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          ai_model: string | null
          bookmarks: number | null
          content: string
          cost_usd: number | null
          created_at: string
          ctr: number | null
          engagement_rate: number | null
          episode_ids: string[]
          error: string | null
          follows: number | null
          hook_type: string | null
          id: string
          impressions: number | null
          likes: number | null
          link_clicks: number | null
          link_placement: string | null
          metadata: Json
          metrics_refreshed_at: string | null
          parent_post_id: string | null
          platform: string
          platform_post_id: string | null
          platform_post_url: string | null
          podcast_ids: string[]
          post_type: string | null
          replies_count: number | null
          reposts: number | null
          score: number | null
          score_breakdown: Json | null
          slot_utc: string | null
          status: string
          trigger: string
        }
        Insert: {
          ai_model?: string | null
          bookmarks?: number | null
          content: string
          cost_usd?: number | null
          created_at?: string
          ctr?: number | null
          engagement_rate?: number | null
          episode_ids?: string[]
          error?: string | null
          follows?: number | null
          hook_type?: string | null
          id?: string
          impressions?: number | null
          likes?: number | null
          link_clicks?: number | null
          link_placement?: string | null
          metadata?: Json
          metrics_refreshed_at?: string | null
          parent_post_id?: string | null
          platform: string
          platform_post_id?: string | null
          platform_post_url?: string | null
          podcast_ids?: string[]
          post_type?: string | null
          replies_count?: number | null
          reposts?: number | null
          score?: number | null
          score_breakdown?: Json | null
          slot_utc?: string | null
          status?: string
          trigger?: string
        }
        Update: {
          ai_model?: string | null
          bookmarks?: number | null
          content?: string
          cost_usd?: number | null
          created_at?: string
          ctr?: number | null
          engagement_rate?: number | null
          episode_ids?: string[]
          error?: string | null
          follows?: number | null
          hook_type?: string | null
          id?: string
          impressions?: number | null
          likes?: number | null
          link_clicks?: number | null
          link_placement?: string | null
          metadata?: Json
          metrics_refreshed_at?: string | null
          parent_post_id?: string | null
          platform?: string
          platform_post_id?: string | null
          platform_post_url?: string | null
          podcast_ids?: string[]
          post_type?: string | null
          replies_count?: number | null
          reposts?: number | null
          score?: number | null
          score_breakdown?: Json | null
          slot_utc?: string | null
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      taste_cards: {
        Row: {
          active: boolean
          archetype_tags: string[]
          card_embedding: string | null
          catalog_fit_score: number | null
          created_at: string
          format_tags: string[]
          id: string
          image_url: string | null
          mood_tags: string[]
          priority: number
          psych_tags: string[]
          sensitivity_level: string
          stage: string
          subtitle: string | null
          text_for_embedding: string | null
          title: string
          top_episode_similarity: number | null
          topic_tags: string[]
          updated_at: string
          validation_status: string
        }
        Insert: {
          active?: boolean
          archetype_tags?: string[]
          card_embedding?: string | null
          catalog_fit_score?: number | null
          created_at?: string
          format_tags?: string[]
          id?: string
          image_url?: string | null
          mood_tags?: string[]
          priority?: number
          psych_tags?: string[]
          sensitivity_level?: string
          stage?: string
          subtitle?: string | null
          text_for_embedding?: string | null
          title: string
          top_episode_similarity?: number | null
          topic_tags?: string[]
          updated_at?: string
          validation_status?: string
        }
        Update: {
          active?: boolean
          archetype_tags?: string[]
          card_embedding?: string | null
          catalog_fit_score?: number | null
          created_at?: string
          format_tags?: string[]
          id?: string
          image_url?: string | null
          mood_tags?: string[]
          priority?: number
          psych_tags?: string[]
          sensitivity_level?: string
          stage?: string
          subtitle?: string | null
          text_for_embedding?: string | null
          title?: string
          top_episode_similarity?: number | null
          topic_tags?: string[]
          updated_at?: string
          validation_status?: string
        }
        Relationships: []
      }
      taste_interactions: {
        Row: {
          action: string
          anonymous_session_id: string
          card_id: string
          created_at: string
          id: string
          swipe_index: number
          user_id: string | null
        }
        Insert: {
          action: string
          anonymous_session_id: string
          card_id: string
          created_at?: string
          id?: string
          swipe_index?: number
          user_id?: string | null
        }
        Update: {
          action?: string
          anonymous_session_id?: string
          card_id?: string
          created_at?: string
          id?: string
          swipe_index?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "taste_interactions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "taste_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_videos: {
        Row: {
          broll_cost_usd: number | null
          broll_image_urls: string[] | null
          created_at: string
          episode_id: string
          error: string | null
          generated_at: string | null
          id: string
          podcast_id: string
          render_cost_usd: number | null
          script: string | null
          script_cost_usd: number | null
          script_model: string | null
          status: string
          subtitle_words: Json | null
          total_cost_usd: number | null
          updated_at: string
          video_duration_s: number | null
          video_url: string | null
          voiceover_cost_usd: number | null
          voiceover_duration_s: number | null
          voiceover_url: string | null
        }
        Insert: {
          broll_cost_usd?: number | null
          broll_image_urls?: string[] | null
          created_at?: string
          episode_id: string
          error?: string | null
          generated_at?: string | null
          id?: string
          podcast_id: string
          render_cost_usd?: number | null
          script?: string | null
          script_cost_usd?: number | null
          script_model?: string | null
          status?: string
          subtitle_words?: Json | null
          total_cost_usd?: number | null
          updated_at?: string
          video_duration_s?: number | null
          video_url?: string | null
          voiceover_cost_usd?: number | null
          voiceover_duration_s?: number | null
          voiceover_url?: string | null
        }
        Update: {
          broll_cost_usd?: number | null
          broll_image_urls?: string[] | null
          created_at?: string
          episode_id?: string
          error?: string | null
          generated_at?: string | null
          id?: string
          podcast_id?: string
          render_cost_usd?: number | null
          script?: string | null
          script_cost_usd?: number | null
          script_model?: string | null
          status?: string
          subtitle_words?: Json | null
          total_cost_usd?: number | null
          updated_at?: string
          video_duration_s?: number | null
          video_url?: string | null
          voiceover_cost_usd?: number | null
          voiceover_duration_s?: number | null
          voiceover_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_videos_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiktok_videos_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "mv_homepage_evergreen"
            referencedColumns: ["episode_id"]
          },
          {
            foreignKeyName: "tiktok_videos_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "mv_homepage_feed"
            referencedColumns: ["episode_id"]
          },
          {
            foreignKeyName: "tiktok_videos_podcast_id_fkey"
            columns: ["podcast_id"]
            isOneToOne: false
            referencedRelation: "mv_homepage_evergreen"
            referencedColumns: ["podcast_id"]
          },
          {
            foreignKeyName: "tiktok_videos_podcast_id_fkey"
            columns: ["podcast_id"]
            isOneToOne: false
            referencedRelation: "mv_homepage_feed"
            referencedColumns: ["podcast_id"]
          },
          {
            foreignKeyName: "tiktok_videos_podcast_id_fkey"
            columns: ["podcast_id"]
            isOneToOne: false
            referencedRelation: "podcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      token_df_cache: {
        Row: {
          computed_at: string
          df: number
          token: string
        }
        Insert: {
          computed_at?: string
          df: number
          token: string
        }
        Update: {
          computed_at?: string
          df?: number
          token?: string
        }
        Relationships: []
      }
      topic_hubs: {
        Row: {
          accent_hsl: string | null
          active: boolean
          aliases: string[]
          appearance_stats: Json
          bio: string | null
          category: string | null
          cost_usd: number | null
          created_at: string
          description: string | null
          episode_ids: string[]
          episodes_summary: string | null
          featured_episode_ids: string[]
          generated_at: string | null
          id: string
          model: string | null
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          accent_hsl?: string | null
          active?: boolean
          aliases?: string[]
          appearance_stats?: Json
          bio?: string | null
          category?: string | null
          cost_usd?: number | null
          created_at?: string
          description?: string | null
          episode_ids?: string[]
          episodes_summary?: string | null
          featured_episode_ids?: string[]
          generated_at?: string | null
          id?: string
          model?: string | null
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          accent_hsl?: string | null
          active?: boolean
          aliases?: string[]
          appearance_stats?: Json
          bio?: string | null
          category?: string | null
          cost_usd?: number | null
          created_at?: string
          description?: string | null
          episode_ids?: string[]
          episodes_summary?: string | null
          featured_episode_ids?: string[]
          generated_at?: string | null
          id?: string
          model?: string | null
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      watchdog_events: {
        Row: {
          alert_sent: boolean
          auto_paused: boolean
          created_at: string
          dedup_key: string
          id: string
          message: string
          payload: Json
          rule: string
          runner: string
          severity: string
        }
        Insert: {
          alert_sent?: boolean
          auto_paused?: boolean
          created_at?: string
          dedup_key: string
          id?: string
          message: string
          payload?: Json
          rule: string
          runner: string
          severity: string
        }
        Update: {
          alert_sent?: boolean
          auto_paused?: boolean
          created_at?: string
          dedup_key?: string
          id?: string
          message?: string
          payload?: Json
          rule?: string
          runner?: string
          severity?: string
        }
        Relationships: []
      }
      x_reply_audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          details: Json | null
          id: string
          suggestion_id: string | null
          watched_post_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          suggestion_id?: string | null
          watched_post_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          suggestion_id?: string | null
          watched_post_id?: string | null
        }
        Relationships: []
      }
      x_reply_suggestions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          error_message: string | null
          id: string
          podiverzum_url: string
          posted_at: string | null
          status: string
          suggestion_text: string
          updated_at: string
          variant: string | null
          watched_post_id: string
          x_reply_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          podiverzum_url: string
          posted_at?: string | null
          status?: string
          suggestion_text: string
          updated_at?: string
          variant?: string | null
          watched_post_id: string
          x_reply_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          podiverzum_url?: string
          posted_at?: string | null
          status?: string
          suggestion_text?: string
          updated_at?: string
          variant?: string | null
          watched_post_id?: string
          x_reply_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "x_reply_suggestions_watched_post_id_fkey"
            columns: ["watched_post_id"]
            isOneToOne: false
            referencedRelation: "x_watched_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      x_watch_accounts: {
        Row: {
          created_at: string
          default_podiverzum_url: string | null
          display_name: string | null
          id: string
          is_active: boolean
          last_checked_at: string | null
          last_seen_post_id: string | null
          notes: string | null
          person_slug: string | null
          priority: number
          updated_at: string
          x_handle: string
          x_user_id: string | null
        }
        Insert: {
          created_at?: string
          default_podiverzum_url?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_seen_post_id?: string | null
          notes?: string | null
          person_slug?: string | null
          priority?: number
          updated_at?: string
          x_handle: string
          x_user_id?: string | null
        }
        Update: {
          created_at?: string
          default_podiverzum_url?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_seen_post_id?: string | null
          notes?: string | null
          person_slug?: string | null
          priority?: number
          updated_at?: string
          x_handle?: string
          x_user_id?: string | null
        }
        Relationships: []
      }
      x_watched_posts: {
        Row: {
          created_at: string
          detected_at: string
          id: string
          match_reason: string | null
          matched_person_slug: string | null
          matched_podiverzum_url: string | null
          matched_topic: string | null
          post_text: string | null
          post_url: string
          posted_at: string | null
          relevance_score: number | null
          status: string
          updated_at: string
          x_handle: string
          x_post_id: string
        }
        Insert: {
          created_at?: string
          detected_at?: string
          id?: string
          match_reason?: string | null
          matched_person_slug?: string | null
          matched_podiverzum_url?: string | null
          matched_topic?: string | null
          post_text?: string | null
          post_url: string
          posted_at?: string | null
          relevance_score?: number | null
          status?: string
          updated_at?: string
          x_handle: string
          x_post_id: string
        }
        Update: {
          created_at?: string
          detected_at?: string
          id?: string
          match_reason?: string | null
          matched_person_slug?: string | null
          matched_podiverzum_url?: string | null
          matched_topic?: string | null
          post_text?: string | null
          post_url?: string
          posted_at?: string | null
          relevance_score?: number | null
          status?: string
          updated_at?: string
          x_handle?: string
          x_post_id?: string
        }
        Relationships: []
      }
      yt_url_backfill_attempts: {
        Row: {
          attempts: number
          created_at: string
          episode_id: string
          last_attempt_at: string | null
          match_score: number | null
          matched_video_id: string | null
          next_attempt_at: string | null
          podcast_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          episode_id: string
          last_attempt_at?: string | null
          match_score?: number | null
          matched_video_id?: string | null
          next_attempt_at?: string | null
          podcast_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          episode_id?: string
          last_attempt_at?: string | null
          match_score?: number | null
          matched_video_id?: string | null
          next_attempt_at?: string | null
          podcast_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      mv_homepage_evergreen: {
        Row: {
          ai_summary: string | null
          audio_url: string | null
          description: string | null
          display_title: string | null
          episode_id: string | null
          featured: boolean | null
          pod_rank: number | null
          podcast_category: string | null
          podcast_display_title: string | null
          podcast_id: string | null
          podcast_image_url: string | null
          podcast_slug: string | null
          podcast_title: string | null
          podiverzum_rank: number | null
          published_at: string | null
          rank_label: string | null
          rss_status: string | null
          slug: string | null
          summary: string | null
          title: string | null
          topics: string[] | null
        }
        Relationships: []
      }
      mv_homepage_feed: {
        Row: {
          ai_summary: string | null
          audio_url: string | null
          description: string | null
          display_title: string | null
          episode_id: string | null
          featured: boolean | null
          featured_rank: number | null
          freshness_bucket: string | null
          pod_rank: number | null
          podcast_category: string | null
          podcast_display_title: string | null
          podcast_id: string | null
          podcast_image_url: string | null
          podcast_slug: string | null
          podcast_title: string | null
          podiverzum_rank: number | null
          published_at: string | null
          rank_label: string | null
          rss_status: string | null
          slug: string | null
          summary: string | null
          title: string | null
          topics: string[] | null
        }
        Relationships: []
      }
    }
    Functions: {
      _mood_time_tags: {
        Args: { p_dow: number; p_hour: number }
        Returns: string[]
      }
      admin_update_entity_images: {
        Args: { p_slugs: string[]; p_urls: string[] }
        Returns: number
      }
      admin_update_entity_images_by_kind: {
        Args: { p_kind: string; p_slugs: string[]; p_urls: string[] }
        Returns: number
      }
      backfill_desc_chunk_status_done: {
        Args: { _limit?: number }
        Returns: number
      }
      backfill_desc_chunk_status_done_batch: {
        Args: { p_batch?: number }
        Returns: number
      }
      backfill_desc_chunk_status_pending: {
        Args: { _limit?: number }
        Returns: number
      }
      backfill_desc_chunk_status_pending_batch: {
        Args: { p_batch?: number }
        Returns: number
      }
      backfill_desc_chunk_status_skipped: {
        Args: { _limit?: number }
        Returns: number
      }
      backfill_desc_chunk_status_skipped_batch: {
        Args: { p_batch?: number }
        Returns: number
      }
      chunk_candidate_stats: {
        Args: never
        Returns: {
          episodes_with_chunks: number
          pending: number
          total_chunks: number
        }[]
      }
      claim_ai_jobs: {
        Args: { _limit: number; _lock_seconds?: number }
        Returns: {
          attempts: number
          completed_at: string | null
          cost_usd: number | null
          created_at: string
          id: string
          input_hash: string
          input_tokens: number | null
          kind: string
          last_error: string | null
          locked_until: string | null
          model: string | null
          output_tokens: number | null
          priority: number
          result: Json | null
          started_at: string | null
          status: string
          target_id: string
          target_type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_enrichment_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_ai_jobs_by_kinds: {
        Args: { _kinds: string[]; _limit: number; _lock_seconds?: number }
        Returns: {
          attempts: number
          completed_at: string | null
          cost_usd: number | null
          created_at: string
          id: string
          input_hash: string
          input_tokens: number | null
          kind: string
          last_error: string | null
          locked_until: string | null
          model: string | null
          output_tokens: number | null
          priority: number
          result: Json | null
          started_at: string | null
          status: string
          target_id: string
          target_type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_enrichment_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_description_chunk_jobs: {
        Args: { _limit: number; _worker: string }
        Returns: {
          description: string
          id: string
          podcast_id: string
        }[]
      }
      cleanup_ai_call_audit: { Args: never; Returns: number }
      complete_description_chunk_job: {
        Args: { _episode_id: string; _status: string }
        Returns: undefined
      }
      cron_revert_title_cleanup: { Args: never; Returns: undefined }
      dedup_episodes_audio_url_batch: {
        Args: { _batch?: number }
        Returns: number
      }
      dedup_episodes_guid_batch: { Args: { _batch?: number }; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      description_chunk_candidate_stats: {
        Args: never
        Returns: {
          done_episodes: number
          pending: number
          total_desc_chunks: number
        }[]
      }
      description_chunk_drain_stats: {
        Args: never
        Returns: {
          claimed: number
          done: number
          failed: number
          pending: number
          skipped: number
          stale_claims: number
          total_desc_chunks: number
        }[]
      }
      description_cleanup_stats: {
        Args: never
        Returns: {
          ep_ai_refined: number
          ep_pending: number
          ep_reverted: number
          ep_rules_ok: number
          ep_skipped: number
          pod_ai_refined: number
          pod_pending: number
          pod_reverted: number
          pod_rules_ok: number
          pod_skipped: number
        }[]
      }
      embed_candidate_stats: {
        Args: { _model: string; _tiers: string[] }
        Returns: Json
      }
      embed_episode_candidate_stats: { Args: { _model: string }; Returns: Json }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      entity_extract_enqueue: { Args: { _limit?: number }; Returns: number }
      entity_slugify: { Args: { s: string }; Returns: string }
      episodes_by_entity: {
        Args: { p_kind: string; p_limit?: number; p_slug: string }
        Returns: {
          ai_enriched_at: string | null
          ai_entities_version: number
          ai_summary: string | null
          apple_url: string | null
          audio_url: string | null
          chunks_source_hash: string | null
          chunks_status: string | null
          chunks_updated_at: string | null
          companies: string[] | null
          created_at: string
          desc_chunk_claim_id: string | null
          desc_chunk_claimed_at: string | null
          desc_chunk_status: string | null
          description: string | null
          description_cleaned_at: string | null
          description_cleanup_meta: Json
          description_cleanup_status: string | null
          display_description: string | null
          display_title: string | null
          episode_rank: number
          episode_rank_label: string | null
          episode_rank_reason: Json
          episode_rank_updated_at: string | null
          episode_url: string | null
          guid: string | null
          id: string
          image_url: string | null
          ingredients: string[] | null
          next_transcript_check_at: string | null
          people: string[] | null
          people_roles: Json
          podcast_id: string
          published_at: string | null
          search_text: string | null
          search_tsv: unknown
          seo_description: string | null
          seo_title: string | null
          slug: string
          spotify_url: string | null
          summary: string | null
          tickers: string[] | null
          title: string
          topics: string[] | null
          transcript_status: string | null
          updated_at: string
          youtube_url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "episodes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      formula_c_candidates: {
        Args: { _limit?: number }
        Returns: {
          id: string
        }[]
      }
      formula_c_status: { Args: never; Returns: Json }
      get_active_taste_cards: {
        Args: { p_limit?: number }
        Returns: {
          archetype_tags: string[]
          card_embedding: string
          catalog_fit_score: number
          format_tags: string[]
          id: string
          image_url: string
          mood_tags: string[]
          priority: number
          psych_tags: string[]
          sensitivity_level: string
          stage: string
          subtitle: string
          title: string
          top_episode_similarity: number
          topic_tags: string[]
        }[]
      }
      get_cron_health: { Args: never; Returns: Json }
      get_ops_dashboard_status: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_episodes_by_embedding: {
        Args: {
          match_limit?: number
          max_age_days?: number
          query_embedding: string
        }
        Returns: {
          ai_summary: string
          audio_url: string
          display_title: string
          episode_id: string
          episode_slug: string
          podcast_category: string
          podcast_display_title: string
          podcast_id: string
          podcast_image_url: string
          podcast_slug: string
          podcast_title: string
          published_at: string
          rank_label: string
          similarity: number
          title: string
        }[]
      }
      match_episodes_by_taste_vector: {
        Args: {
          p_exclude_episode_ids?: string[]
          p_limit?: number
          p_negative_vector?: string
          p_user_vector: string
        }
        Returns: {
          ai_summary: string
          category: string
          display_title: string
          episode_id: string
          final_score: number
          image_url: string
          podcast_id: string
          podcast_image_url: string
          podcast_slug: string
          podcast_title: string
          published_at: string
          similarity: number
          slug: string
          title: string
          topics: string[]
        }[]
      }
      match_podcast_by_name: {
        Args: { p_max?: number; p_q: string; p_threshold?: number }
        Returns: {
          podcast_id: string
          similarity: number
          slug: string
          title: string
        }[]
      }
      match_podcasts_by_embedding: {
        Args: {
          p_embedding: string
          p_lang?: string
          p_limit?: number
          p_model?: string
        }
        Returns: {
          category: string
          display_title: string
          id: string
          image_url: string
          podiverzum_rank: number
          shadow_rank_tier: string
          similarity: number
          slug: string
          title: string
        }[]
      }
      merge_duplicate_podcasts: {
        Args: { _canonical_id: string; _duplicate_id: string; _reason?: string }
        Returns: Json
      }
      mood_pool_bump_click: { Args: { p_slug: string }; Returns: undefined }
      mood_pool_bump_impression: {
        Args: { p_slug: string }
        Returns: undefined
      }
      mood_pool_pick: {
        Args: { p_country: string; p_dow: number; p_hour: number; p_k: number }
        Returns: {
          accent_hsl: string | null
          clicks: number
          country_hint: string | null
          created_at: string
          ctr: number | null
          description: string | null
          embedding: string | null
          episode_ids: string[]
          episodes_refreshed_at: string | null
          id: string
          impressions: number
          last_shown_at: string | null
          mood: string
          query: string
          retire_reason: string | null
          retired_at: string | null
          slug: string
          status: string
          time_tags: string[]
          title: string
        }[]
        SetofOptions: {
          from: "*"
          to: "mood_pool"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mood_pool_retire_overflow: { Args: { p_keep: number }; Returns: number }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_rss_url: { Args: { _url: string }; Returns: string }
      person_slugify: { Args: { p: string }; Returns: string }
      purge_non_en_step: {
        Args: { _batch?: number; _budget_ms?: number }
        Returns: Json
      }
      purge_search_query_cache: {
        Args: { older_than_days?: number }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reap_ai_stale_locks: {
        Args: { _older_than_minutes?: number }
        Returns: number
      }
      reap_deep_hydration_stale: {
        Args: { _older_than_minutes?: number }
        Returns: number
      }
      reap_description_chunk_stale_claims: { Args: never; Returns: number }
      refresh_episodes_search_text_batch: {
        Args: { _limit?: number }
        Returns: Json
      }
      refresh_homepage_feed: { Args: never; Returns: undefined }
      resolve_query_entities: {
        Args: { p_max?: number; p_q: string; p_threshold?: number }
        Returns: {
          display_name: string
          kind: string
          similarity: number
          slug: string
        }[]
      }
      search_backfill_batch: {
        Args: { _batch?: number; _table: string }
        Returns: number
      }
      search_episode_chunks: {
        Args: {
          candidate_pool?: number
          match_count?: number
          query_embedding: string
        }
        Returns: {
          best_chunk_idx: number
          best_source: string
          best_text: string
          episode_id: string
          podcast_id: string
          similarity: number
        }[]
      }
      search_episodes_hybrid: {
        Args: {
          alpha_lex?: number
          entity_terms?: string[]
          lang?: string
          limit_n?: number
          p_decay_lambda?: number
          phrase_terms?: string[]
          q: string
          q_embedding?: string
          required_terms?: string[]
        }
        Returns: {
          episode_id: string
          lex_rank: number
          score: number
          sem_rank: number
        }[]
      }
      search_ndcg_weekly: {
        Args: { p_min_impressions?: number }
        Returns: {
          clicks: number
          ctr: number
          impressions: number
          mrr: number
          ndcg10: number
          query: string
        }[]
      }
      select_chunk_candidates: {
        Args: { _limit?: number }
        Returns: {
          description: string
          display_title: string
          id: string
          podcast_category: string
          podcast_id: string
          podcast_title: string
          shadow_rank_tier: string
          transcript_source: string
          transcript_text: string
        }[]
      }
      select_company_candidates: {
        Args: { _limit?: number; _min_count?: number; _min_pods?: number }
        Returns: {
          cnt: number
          display_name: string
          pods: number
          slug: string
        }[]
      }
      select_company_refresh_candidates: {
        Args: { _limit?: number }
        Returns: {
          display_name: string
          generated_at: string
          new_eps: number
          slug: string
        }[]
      }
      select_description_chunk_candidates: {
        Args: { _limit?: number }
        Returns: {
          description: string
          id: string
          podcast_id: string
        }[]
      }
      select_description_cleanup_candidates: {
        Args: { _kind?: string; _limit?: number }
        Returns: {
          description: string
          id: string
          podcast_id: string
          tier: string
          title: string
        }[]
      }
      select_embed_candidates: {
        Args: { _limit: number; _model: string; _tiers: string[] }
        Returns: {
          category: string
          description: string
          display_title: string
          id: string
          rank_label: string
          seo_description: string
          shadow_rank_components: Json
          title: string
        }[]
      }
      select_embed_episode_candidates: {
        Args: { _limit: number; _model: string }
        Returns: {
          ai_summary: string
          companies: string[]
          description: string
          display_title: string
          id: string
          ingredients: string[]
          people: string[]
          podcast_category: string
          podcast_display_title: string
          podcast_id: string
          podcast_title: string
          seo_description: string
          tickers: string[]
          title: string
          topics: string[]
        }[]
      }
      select_person_candidates: {
        Args: { _limit?: number; _min_count?: number; _min_pods?: number }
        Returns: {
          cnt: number
          display_name: string
          pods: number
          slug: string
        }[]
      }
      select_person_refresh_candidates: {
        Args: { _limit?: number }
        Returns: {
          display_name: string
          generated_at: string
          new_eps: number
          slug: string
        }[]
      }
      select_transcript_scout_candidates: {
        Args: { _limit?: number }
        Returns: {
          audio_url: string
          episode_url: string
          guid: string
          id: string
          podcast_id: string
          podcast_rss_url: string
          rss_url: string
          shadow_rank_tier: string
          youtube_url: string
        }[]
      }
      select_yt_backfill_candidates: {
        Args: { _limit?: number }
        Returns: {
          episode_title: string
          id: string
          podcast_id: string
          podcast_title: string
          published_at: string
        }[]
      }
      set_categorize_runner_schedule: {
        Args: { _schedule: string }
        Returns: string
      }
      set_deep_hydration_schedule: {
        Args: { _schedule: string }
        Returns: undefined
      }
      set_description_cleanup_schedule: {
        Args: { _schedule: string }
        Returns: undefined
      }
      set_embed_chunks_schedule: {
        Args: { _schedule: string }
        Returns: undefined
      }
      set_embed_description_schedule: {
        Args: { _schedule: string }
        Returns: undefined
      }
      set_embed_episode_schedule: {
        Args: { _schedule: string }
        Returns: undefined
      }
      set_embed_schedule: { Args: { _schedule: string }; Returns: undefined }
      set_entity_extract_runner_schedule: {
        Args: { _schedule: string }
        Returns: undefined
      }
      set_incremental_refresh_command: {
        Args: { _command: string }
        Returns: undefined
      }
      set_incremental_refresh_schedule: {
        Args: { _schedule: string }
        Returns: undefined
      }
      set_pi_dump_process_schedule: {
        Args: { pending_count: number }
        Returns: string
      }
      set_podcast_dedup_schedule: {
        Args: { _schedule: string }
        Returns: undefined
      }
      set_rss_hunter_schedule: {
        Args: { _schedule: string }
        Returns: undefined
      }
      set_rss_self_healing_command: {
        Args: { _active?: boolean; _command: string; _schedule?: string }
        Returns: undefined
      }
      set_seo_enrich_runner_schedule: {
        Args: { _schedule: string }
        Returns: undefined
      }
      set_title_cleanup_schedule: {
        Args: { _schedule: string }
        Returns: undefined
      }
      set_transcript_scout_schedule: {
        Args: { _schedule: string }
        Returns: undefined
      }
      set_yt_backfill_schedule: {
        Args: { _schedule: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      similar_episodes: {
        Args: { p_episode_id: string; p_limit?: number }
        Returns: {
          ai_summary: string
          audio_url: string
          description: string
          display_title: string
          episode_id: string
          podcast_category: string
          podcast_display_title: string
          podcast_id: string
          podcast_image_url: string
          podcast_slug: string
          podcast_title: string
          podiverzum_rank: number
          published_at: string
          rank_label: string
          similarity: number
          slug: string
          summary: string
          title: string
          topics: string[]
        }[]
      }
      similar_podcasts: {
        Args: { p_limit?: number; p_podcast_id: string }
        Returns: {
          apple_url: string
          category: string
          description: string
          display_title: string
          featured: boolean
          id: string
          image_url: string
          podiverzum_rank: number
          rank_label: string
          rss_status: string
          similarity: number
          slug: string
          spotify_url: string
          summary: string
          title: string
          website_url: string
          youtube_url: string
        }[]
      }
      sitemap_episode_month_counts: {
        Args: never
        Returns: {
          max_updated_at: string
          n: number
          ym: string
        }[]
      }
      suggest_token_corrections: {
        Args: { p_tokens: string[] }
        Returns: {
          df: number
          similarity: number
          suggestion: string
          token: string
        }[]
      }
      token_idf: {
        Args: { p_tokens: string[] }
        Returns: {
          df: number
          token: string
        }[]
      }
      transcript_roi_report: { Args: { _hours?: number }; Returns: Json }
      transcript_scout_stats: {
        Args: never
        Returns: {
          failed: number
          found: number
          not_available: number
          unchecked: number
        }[]
      }
      unaccent: { Args: { "": string }; Returns: string }
      yt_backfill_stats: {
        Args: never
        Returns: {
          failed: number
          found: number
          not_available: number
          pending: number
          total_eligible: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
