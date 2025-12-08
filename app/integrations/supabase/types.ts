
export type Json =
  | string
  | number
  | boolean
  | null
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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_notifications: {
        Row: {
          created_at: string | null
          data: Json
          id: string
          message: string | null
          read: boolean | null
          read_at: string | null
          reservation_id: string
          title: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data?: Json
          id?: string
          message?: string | null
          read?: boolean | null
          read_at?: string | null
          reservation_id: string
          title?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data?: Json
          id?: string
          message?: string | null
          read?: boolean | null
          read_at?: string | null
          reservation_id?: string
          title?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          capacity: number
          created_at: string
          date: string
          description: string
          id: string
          image: string
          is_invite_only: boolean | null
          is_private: boolean | null
          location: string
          shareable_link: string | null
          title: string
          updated_at: string
        }
        Insert: {
          capacity: number
          created_at?: string
          date: string
          description: string
          id?: string
          image: string
          is_invite_only?: boolean | null
          is_private?: boolean | null
          location: string
          shareable_link?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          date?: string
          description?: string
          id?: string
          image?: string
          is_invite_only?: boolean | null
          is_private?: boolean | null
          location?: string
          shareable_link?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      gift_cards: {
        Row: {
          created_at: string
          id: string
          message: string | null
          points: number
          recipient_email: string | null
          recipient_id: string | null
          recipient_name: string | null
          redeemed_at: string | null
          sender_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          points: number
          recipient_email?: string | null
          recipient_id?: string | null
          recipient_name?: string | null
          redeemed_at?: string | null
          sender_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          points?: number
          recipient_email?: string | null
          recipient_id?: string | null
          recipient_name?: string | null
          redeemed_at?: string | null
          sender_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_cards_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_token_audit: {
        Row: {
          expires_at: string
          id: number
          issued_at: string
          issued_by_ip: string | null
          order_id: string
          token_jti: string
          ttl_seconds: number
          user_agent: string | null
        }
        Insert: {
          expires_at: string
          id?: number
          issued_at?: string
          issued_by_ip?: string | null
          order_id: string
          token_jti: string
          ttl_seconds: number
          user_agent?: string | null
        }
        Update: {
          expires_at?: string
          id?: number
          issued_at?: string
          issued_by_ip?: string | null
          order_id?: string
          token_jti?: string
          ttl_seconds?: number
          user_agent?: string | null
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          available: boolean | null
          category: string
          created_at: string
          description: string
          id: number
          image: string
          name: string
          popular: boolean | null
          price: number
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          available?: boolean | null
          category: string
          created_at?: string
          description: string
          id?: number
          image: string
          name: string
          popular?: boolean | null
          price: number
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          available?: boolean | null
          category?: string
          created_at?: string
          description?: string
          id?: number
          image?: string
          name?: string
          popular?: boolean | null
          price?: number
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      merch_items: {
        Row: {
          created_at: string
          description: string
          id: string
          image: string
          in_stock: boolean | null
          name: string
          points_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          image: string
          in_stock?: boolean | null
          name: string
          points_cost: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          image?: string
          in_stock?: boolean | null
          name?: string
          points_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      merch_redemptions: {
        Row: {
          created_at: string
          delivery_address: string | null
          id: string
          merch_item_id: string | null
          merch_name: string
          pickup_notes: string | null
          points_cost: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delivery_address?: string | null
          id?: string
          merch_item_id?: string | null
          merch_name: string
          pickup_notes?: string | null
          points_cost: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delivery_address?: string | null
          id?: string
          merch_item_id?: string | null
          merch_name?: string
          pickup_notes?: string | null
          points_cost?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merch_redemptions_merch_item_id_fkey"
            columns: ["merch_item_id"]
            isOneToOne: false
            referencedRelation: "merch_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merch_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          created_at: string | null
          customer_email: string | null
          details: Json | null
          error_message: string | null
          event_type: string
          id: string
          last_retry_at: string | null
          reservation_id: string | null
          retry_count: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_email?: string | null
          details?: Json | null
          error_message?: string | null
          event_type: string
          id?: string
          last_retry_at?: string | null
          reservation_id?: string | null
          retry_count?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_email?: string | null
          details?: Json | null
          error_message?: string | null
          event_type?: string
          id?: string
          last_retry_at?: string | null
          reservation_id?: string | null
          retry_count?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          id: string
          message: string
          read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          id?: string
          message: string
          read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          id?: string
          message?: string
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          menu_item_id: number | null
          name: string
          order_id: string
          price: number
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id?: number | null
          name: string
          order_id: string
          price: number
          quantity: number
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: number | null
          name?: string
          order_id?: string
          price?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          delivery_address: string | null
          full_name: string | null
          id: string
          order_number: number
          payment_id: string | null
          payment_status: string | null
          pickup_notes: string | null
          points_earned: number
          status: string
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          delivery_address?: string | null
          full_name?: string | null
          id?: string
          order_number?: number
          payment_id?: string | null
          payment_status?: string | null
          pickup_notes?: string | null
          points_earned?: number
          status?: string
          total: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          delivery_address?: string | null
          full_name?: string | null
          id?: string
          order_number?: number
          payment_id?: string | null
          payment_status?: string | null
          pickup_notes?: string | null
          points_earned?: number
          status?: string
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          brand: string | null
          card_number: string | null
          cardholder_name: string
          created_at: string
          exp_month: number | null
          exp_year: number | null
          expiry_date: string
          id: string
          is_default: boolean | null
          last4: string | null
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          card_number?: string | null
          cardholder_name: string
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          expiry_date: string
          id?: string
          is_default?: boolean | null
          last4?: string | null
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          card_number?: string | null
          cardholder_name?: string
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          expiry_date?: string
          id?: string
          is_default?: boolean | null
          last4?: string | null
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          created_at: string | null
          date: string
          email: string
          email_sent: boolean | null
          guests: number
          id: string
          name: string
          notification_sent: boolean | null
          phone: string
          special_requests: string | null
          status: string | null
          table_number: string | null
          time: string
        }
        Insert: {
          created_at?: string | null
          date: string
          email: string
          email_sent?: boolean | null
          guests: number
          id?: string
          name: string
          notification_sent?: boolean | null
          phone: string
          special_requests?: string | null
          status?: string | null
          table_number?: string | null
          time: string
        }
        Update: {
          created_at?: string | null
          date?: string
          email?: string
          email_sent?: boolean | null
          guests?: number
          id?: string
          name?: string
          notification_sent?: boolean | null
          phone?: string
          special_requests?: string | null
          status?: string | null
          table_number?: string | null
          time?: string
        }
        Relationships: []
      }
      square_payments: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          order_id: string | null
          payment_method: string | null
          receipt_url: string | null
          square_order_id: string | null
          square_payment_id: string
          status: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          square_order_id?: string | null
          square_payment_id: string
          status: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          square_order_id?: string | null
          square_payment_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "square_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "square_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          error_message: string | null
          id: string
          metadata: Json | null
          order_id: string | null
          payment_gateway: string | null
          payment_id: string
          payment_method: string | null
          receipt_url: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          payment_gateway?: string | null
          payment_id: string
          payment_method?: string | null
          receipt_url?: string | null
          status: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          payment_gateway?: string | null
          payment_id?: string
          payment_method?: string | null
          receipt_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      theme_settings: {
        Row: {
          color_scheme: string
          created_at: string
          id: string
          mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color_scheme?: string
          created_at?: string
          id?: string
          mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color_scheme?: string
          created_at?: string
          id?: string
          mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "theme_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          points: number
          profile_image: string | null
          updated_at: string
          user_id: string | null
          user_role: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          phone?: string | null
          points?: number
          profile_image?: string | null
          updated_at?: string
          user_id?: string | null
          user_role?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          points?: number
          profile_image?: string | null
          updated_at?: string
          user_id?: string | null
          user_role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_logs: { Args: { p_days_old?: number }; Returns: number }
      cleanup_old_notifications: {
        Args: { p_days_old?: number }
        Returns: number
      }
      create_admin_notification: {
        Args: {
          p_data?: Json
          p_message?: string
          p_reservation_id: string
          p_title?: string
          p_type: string
        }
        Returns: string
      }
      get_pending_notifications: {
        Args: { p_limit?: number }
        Returns: {
          customer_email: string
          customer_name: string
          details: Json
          event_type: string
          guests: number
          id: string
          new_status: string
          old_status: string
          reservation_date: string
          reservation_time: string
          special_requests: string
        }[]
      }
      get_unread_notifications_count: { Args: never; Returns: number }
      get_user_role: { Args: never; Returns: string }
      increment_user_points: {
        Args: { points_to_add: number; user_id_param: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      mark_admin_notification_read: {
        Args: { p_notification_id: string }
        Returns: boolean
      }
      mark_notification_processed: {
        Args: { p_error_message?: string; p_log_id: string; p_success: boolean }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
