
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "appointment_events": {
                  Row: {
                    "actor_id": string | null,"appointment_id": string,"at": string,"id": number,"payload": NonNullable<Json>,"salon_id": string,"type": Database["public"]['Enums']["appointment_event_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"appointment_id": string,"at"?: string,"id"?: never,"payload"?: NonNullable<Json>,"salon_id": string,"type": Database["public"]['Enums']["appointment_event_type"]
                  }
                  Update: {
                    "actor_id"?: string | null,"appointment_id"?: string,"at"?: string,"id"?: never,"payload"?: NonNullable<Json>,"salon_id"?: string,"type"?: Database["public"]['Enums']["appointment_event_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointment_events_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: false
      referencedRelation: "appointments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointment_events_salon_id_fkey"
      columns: ["salon_id"]
isOneToOne: false
      referencedRelation: "salons"
      referencedColumns: ["id"]
    }
                  ]
                },"appointments": {
                  Row: {
                    "blocked_until": string,"booking_group_id": string,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"created_at": string,"customer_display": string,"customer_id": string,"ends_at": string,"id": string,"price_cents": number,"professional_id": string,"salon_id": string,"service_id": string | null,"service_name_en": string,"service_name_es": string,"starts_at": string,"status": Database["public"]['Enums']["appointment_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_until": string,"booking_group_id": string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"customer_display"?: string,"customer_id": string,"ends_at": string,"id"?: string,"price_cents": number,"professional_id": string,"salon_id": string,"service_id"?: string | null,"service_name_en": string,"service_name_es": string,"starts_at": string,"status"?: Database["public"]['Enums']["appointment_status"],"updated_at"?: string
                  }
                  Update: {
                    "blocked_until"?: string,"booking_group_id"?: string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"customer_display"?: string,"customer_id"?: string,"ends_at"?: string,"id"?: string,"price_cents"?: number,"professional_id"?: string,"salon_id"?: string,"service_id"?: string | null,"service_name_en"?: string,"service_name_es"?: string,"starts_at"?: string,"status"?: Database["public"]['Enums']["appointment_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointments_booking_group_id_customer_id_fkey"
      columns: ["booking_group_id","customer_id"]
isOneToOne: false
      referencedRelation: "booking_groups"
      referencedColumns: ["id","customer_id"]
    },{
      foreignKeyName: "appointments_booking_group_id_salon_id_fkey"
      columns: ["booking_group_id","salon_id"]
isOneToOne: false
      referencedRelation: "booking_groups"
      referencedColumns: ["id","salon_id"]
    },{
      foreignKeyName: "appointments_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_professional_id_salon_id_fkey"
      columns: ["professional_id","salon_id"]
isOneToOne: false
      referencedRelation: "professionals"
      referencedColumns: ["id","salon_id"]
    },{
      foreignKeyName: "appointments_service_id_salon_id_fkey"
      columns: ["service_id","salon_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id","salon_id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"at": string,"diff": Json | null,"entity": string,"entity_id": string | null,"id": number,"organization_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"at"?: string,"diff"?: Json | null,"entity": string,"entity_id"?: string | null,"id"?: never,"organization_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"at"?: string,"diff"?: Json | null,"entity"?: string,"entity_id"?: string | null,"id"?: never,"organization_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"booking_groups": {
                  Row: {
                    "created_at": string,"created_by": string | null,"customer_id": string,"guest_token_hash": string | null,"id": string,"organization_id": string,"salon_id": string,"source": Database["public"]['Enums']["booking_source"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"customer_id": string,"guest_token_hash"?: string | null,"id"?: string,"organization_id": string,"salon_id": string,"source"?: Database["public"]['Enums']["booking_source"]
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"guest_token_hash"?: string | null,"id"?: string,"organization_id"?: string,"salon_id"?: string,"source"?: Database["public"]['Enums']["booking_source"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_groups_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_groups_customer_id_organization_id_fkey"
      columns: ["customer_id","organization_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "booking_groups_salon_id_organization_id_fkey"
      columns: ["salon_id","organization_id"]
isOneToOne: false
      referencedRelation: "salons"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "created_at": string,"email": string | null,"first_name": string,"id": string,"is_blocked": boolean,"last_name": string,"locale": Database["public"]['Enums']["app_locale"],"marketing_opt_in": boolean,"no_show_count": number,"notes": string | null,"organization_id": string,"phone": string,"updated_at": string,"user_id": string | null,"whatsapp_opt_in": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"first_name": string,"id"?: string,"is_blocked"?: boolean,"last_name"?: string,"locale"?: Database["public"]['Enums']["app_locale"],"marketing_opt_in"?: boolean,"no_show_count"?: number,"notes"?: string | null,"organization_id": string,"phone": string,"updated_at"?: string,"user_id"?: string | null,"whatsapp_opt_in"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"first_name"?: string,"id"?: string,"is_blocked"?: boolean,"last_name"?: string,"locale"?: Database["public"]['Enums']["app_locale"],"marketing_opt_in"?: boolean,"no_show_count"?: number,"notes"?: string | null,"organization_id"?: string,"phone"?: string,"updated_at"?: string,"user_id"?: string | null,"whatsapp_opt_in"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customers_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"email": string | null,"expires_at": string,"id": string,"invited_by": string | null,"organization_id": string,"phone": string | null,"professional_id": string | null,"role": Database["public"]['Enums']["member_role"],"salon_id": string | null,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"email"?: string | null,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"organization_id": string,"phone"?: string | null,"professional_id"?: string | null,"role": Database["public"]['Enums']["member_role"],"salon_id"?: string | null,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"email"?: string | null,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"organization_id"?: string,"phone"?: string | null,"professional_id"?: string | null,"role"?: Database["public"]['Enums']["member_role"],"salon_id"?: string | null,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_professional_fk"
      columns: ["professional_id","salon_id"]
isOneToOne: false
      referencedRelation: "professionals"
      referencedColumns: ["id","salon_id"]
    },{
      foreignKeyName: "invitations_salon_id_organization_id_fkey"
      columns: ["salon_id","organization_id"]
isOneToOne: false
      referencedRelation: "salons"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "amount_cents": number,"created_at": string,"due_at": string,"id": string,"number": string,"organization_id": string,"period_end": string,"period_start": string,"status": Database["public"]['Enums']["invoice_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"due_at": string,"id"?: string,"number": string,"organization_id": string,"period_end": string,"period_start": string,"status"?: Database["public"]['Enums']["invoice_status"]
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"due_at"?: string,"id"?: string,"number"?: string,"organization_id"?: string,"period_end"?: string,"period_start"?: string,"status"?: Database["public"]['Enums']["invoice_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"live_devices": {
                  Row: {
                    "created_at": string,"id": string,"last_seen_at": string | null,"locale": Database["public"]['Enums']["app_locale"],"name": string,"paired_at": string | null,"pairing_code_hash": string | null,"pairing_expires_at": string | null,"revoked_at": string | null,"salon_id": string,"sound_enabled": boolean,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_seen_at"?: string | null,"locale"?: Database["public"]['Enums']["app_locale"],"name"?: string,"paired_at"?: string | null,"pairing_code_hash"?: string | null,"pairing_expires_at"?: string | null,"revoked_at"?: string | null,"salon_id": string,"sound_enabled"?: boolean,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_seen_at"?: string | null,"locale"?: Database["public"]['Enums']["app_locale"],"name"?: string,"paired_at"?: string | null,"pairing_code_hash"?: string | null,"pairing_expires_at"?: string | null,"revoked_at"?: string | null,"salon_id"?: string,"sound_enabled"?: boolean,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "live_devices_salon_id_fkey"
      columns: ["salon_id"]
isOneToOne: false
      referencedRelation: "salons"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "created_at": string,"id": string,"organization_id": string,"professional_id": string | null,"role": Database["public"]['Enums']["member_role"],"salon_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"organization_id": string,"professional_id"?: string | null,"role": Database["public"]['Enums']["member_role"],"salon_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"organization_id"?: string,"professional_id"?: string | null,"role"?: Database["public"]['Enums']["member_role"],"salon_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_professional_fk"
      columns: ["professional_id","salon_id"]
isOneToOne: false
      referencedRelation: "professionals"
      referencedColumns: ["id","salon_id"]
    },{
      foreignKeyName: "memberships_salon_id_organization_id_fkey"
      columns: ["salon_id","organization_id"]
isOneToOne: false
      referencedRelation: "salons"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_jobs": {
                  Row: {
                    "appointment_id": string,"attempts": number,"channel": Database["public"]['Enums']["notification_channel"],"created_at": string,"error": string | null,"id": string,"kind": Database["public"]['Enums']["notification_kind"],"locale": Database["public"]['Enums']["app_locale"],"provider": string | null,"provider_message_id": string | null,"salon_id": string,"scheduled_for": string,"sent_at": string | null,"status": Database["public"]['Enums']["notification_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "appointment_id": string,"attempts"?: number,"channel": Database["public"]['Enums']["notification_channel"],"created_at"?: string,"error"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["notification_kind"],"locale"?: Database["public"]['Enums']["app_locale"],"provider"?: string | null,"provider_message_id"?: string | null,"salon_id": string,"scheduled_for": string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"]
                  }
                  Update: {
                    "appointment_id"?: string,"attempts"?: number,"channel"?: Database["public"]['Enums']["notification_channel"],"created_at"?: string,"error"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["notification_kind"],"locale"?: Database["public"]['Enums']["app_locale"],"provider"?: string | null,"provider_message_id"?: string | null,"salon_id"?: string,"scheduled_for"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_jobs_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: false
      referencedRelation: "appointments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_jobs_salon_id_fkey"
      columns: ["salon_id"]
isOneToOne: false
      referencedRelation: "salons"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"owner_id": string,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"owner_id": string,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organizations_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_cents": number,"created_at": string,"id": string,"invoice_id": string,"method": Database["public"]['Enums']["payment_method"],"organization_id": string,"received_at": string,"recorded_by": string | null,"reference": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"id"?: string,"invoice_id": string,"method": Database["public"]['Enums']["payment_method"],"organization_id": string,"received_at": string,"recorded_by"?: string | null,"reference"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"id"?: string,"invoice_id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"organization_id"?: string,"received_at"?: string,"recorded_by"?: string | null,"reference"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_invoice_id_organization_id_fkey"
      columns: ["invoice_id","organization_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "payments_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"plans": {
                  Row: {
                    "annual_price_cents": number,"code": string,"extra_branch_price_cents": number,"features": NonNullable<Json>,"is_active": boolean,"max_pros": number | null,"message_quota": number,"min_pros": number,"monthly_price_cents": number,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "annual_price_cents": number,"code": string,"extra_branch_price_cents": number,"features"?: NonNullable<Json>,"is_active"?: boolean,"max_pros"?: number | null,"message_quota"?: number,"min_pros": number,"monthly_price_cents": number,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "annual_price_cents"?: number,"code"?: string,"extra_branch_price_cents"?: number,"features"?: NonNullable<Json>,"is_active"?: boolean,"max_pros"?: number | null,"message_quota"?: number,"min_pros"?: number,"monthly_price_cents"?: number,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"professional_services": {
                  Row: {
                    "duration_min_override": number | null,"price_cents_override": number | null,"professional_id": string,"salon_id": string,"service_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "duration_min_override"?: number | null,"price_cents_override"?: number | null,"professional_id": string,"salon_id": string,"service_id": string
                  }
                  Update: {
                    "duration_min_override"?: number | null,"price_cents_override"?: number | null,"professional_id"?: string,"salon_id"?: string,"service_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "professional_services_professional_id_salon_id_fkey"
      columns: ["professional_id","salon_id"]
isOneToOne: false
      referencedRelation: "professionals"
      referencedColumns: ["id","salon_id"]
    },{
      foreignKeyName: "professional_services_service_id_salon_id_fkey"
      columns: ["service_id","salon_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id","salon_id"]
    }
                  ]
                },"professionals": {
                  Row: {
                    "accepts_online": boolean,"avatar_url": string | null,"bio_en": string | null,"bio_es": string | null,"color_hex": string,"created_at": string,"first_name": string,"id": string,"initials": string | null,"is_active": boolean,"last_name": string,"public_name": string | null,"salon_id": string,"sort_order": number,"title": Database["public"]['Enums']["pro_title"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepts_online"?: boolean,"avatar_url"?: string | null,"bio_en"?: string | null,"bio_es"?: string | null,"color_hex": string,"created_at"?: string,"first_name": string,"id"?: string,"initials"?: never,"is_active"?: boolean,"last_name"?: string,"public_name"?: never,"salon_id": string,"sort_order"?: number,"title"?: Database["public"]['Enums']["pro_title"],"updated_at"?: string
                  }
                  Update: {
                    "accepts_online"?: boolean,"avatar_url"?: string | null,"bio_en"?: string | null,"bio_es"?: string | null,"color_hex"?: string,"created_at"?: string,"first_name"?: string,"id"?: string,"initials"?: never,"is_active"?: boolean,"last_name"?: string,"public_name"?: never,"salon_id"?: string,"sort_order"?: number,"title"?: Database["public"]['Enums']["pro_title"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "professionals_salon_id_fkey"
      columns: ["salon_id"]
isOneToOne: false
      referencedRelation: "salons"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string | null,"full_name": string,"id": string,"is_platform_admin": boolean,"locale": Database["public"]['Enums']["app_locale"],"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string,"id": string,"is_platform_admin"?: boolean,"locale"?: Database["public"]['Enums']["app_locale"],"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"is_platform_admin"?: boolean,"locale"?: Database["public"]['Enums']["app_locale"],"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"salon_closures": {
                  Row: {
                    "created_at": string,"ends_at": string,"id": string,"reason_en": string | null,"reason_es": string | null,"salon_id": string,"starts_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_at": string,"id"?: string,"reason_en"?: string | null,"reason_es"?: string | null,"salon_id": string,"starts_at": string
                  }
                  Update: {
                    "created_at"?: string,"ends_at"?: string,"id"?: string,"reason_en"?: string | null,"reason_es"?: string | null,"salon_id"?: string,"starts_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "salon_closures_salon_id_fkey"
      columns: ["salon_id"]
isOneToOne: false
      referencedRelation: "salons"
      referencedColumns: ["id"]
    }
                  ]
                },"salons": {
                  Row: {
                    "address": string | null,"business_types": (Database["public"]['Enums']["business_type"])[],"cancellation_window_hours": number,"created_at": string,"currency": string,"id": string,"is_published": boolean,"max_advance_days": number,"min_lead_time_min": number,"name": string,"no_show_block_enabled": boolean,"no_show_threshold": number,"organization_id": string,"phone": string | null,"reminder_offsets_min": (number)[],"search": unknown,"slot_step_min": number,"slug": string,"timezone": string,"updated_at": string,"zone": Database["public"]['Enums']["salon_zone"]
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"business_types": (Database["public"]['Enums']["business_type"])[],"cancellation_window_hours"?: number,"created_at"?: string,"currency"?: string,"id"?: string,"is_published"?: boolean,"max_advance_days"?: number,"min_lead_time_min"?: number,"name": string,"no_show_block_enabled"?: boolean,"no_show_threshold"?: number,"organization_id": string,"phone"?: string | null,"reminder_offsets_min"?: (number)[],"search"?: never,"slot_step_min"?: number,"slug": string,"timezone"?: string,"updated_at"?: string,"zone": Database["public"]['Enums']["salon_zone"]
                  }
                  Update: {
                    "address"?: string | null,"business_types"?: (Database["public"]['Enums']["business_type"])[],"cancellation_window_hours"?: number,"created_at"?: string,"currency"?: string,"id"?: string,"is_published"?: boolean,"max_advance_days"?: number,"min_lead_time_min"?: number,"name"?: string,"no_show_block_enabled"?: boolean,"no_show_threshold"?: number,"organization_id"?: string,"phone"?: string | null,"reminder_offsets_min"?: (number)[],"search"?: never,"slot_step_min"?: number,"slug"?: string,"timezone"?: string,"updated_at"?: string,"zone"?: Database["public"]['Enums']["salon_zone"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "salons_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"service_categories": {
                  Row: {
                    "business_type": Database["public"]['Enums']["business_type"],"code": string,"name_en": string,"name_es": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "business_type": Database["public"]['Enums']["business_type"],"code": string,"name_en": string,"name_es": string,"sort_order"?: number
                  }
                  Update: {
                    "business_type"?: Database["public"]['Enums']["business_type"],"code"?: string,"name_en"?: string,"name_es"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"services": {
                  Row: {
                    "buffer_min": number,"category_code": string,"created_at": string,"description_en": string | null,"description_es": string | null,"duration_min": number,"id": string,"is_active": boolean,"name_en": string,"name_es": string,"price_cents": number,"salon_id": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buffer_min"?: number,"category_code": string,"created_at"?: string,"description_en"?: string | null,"description_es"?: string | null,"duration_min": number,"id"?: string,"is_active"?: boolean,"name_en": string,"name_es": string,"price_cents": number,"salon_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "buffer_min"?: number,"category_code"?: string,"created_at"?: string,"description_en"?: string | null,"description_es"?: string | null,"duration_min"?: number,"id"?: string,"is_active"?: boolean,"name_en"?: string,"name_es"?: string,"price_cents"?: number,"salon_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "services_category_code_fkey"
      columns: ["category_code"]
isOneToOne: false
      referencedRelation: "service_categories"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "services_salon_id_fkey"
      columns: ["salon_id"]
isOneToOne: false
      referencedRelation: "salons"
      referencedColumns: ["id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "billing_cycle": Database["public"]['Enums']["billing_cycle"],"created_at": string,"current_period_end": string | null,"extra_branches": number,"id": string,"organization_id": string,"plan_code": string,"status": Database["public"]['Enums']["subscription_status"],"trial_ends_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_cycle"?: Database["public"]['Enums']["billing_cycle"],"created_at"?: string,"current_period_end"?: string | null,"extra_branches"?: number,"id"?: string,"organization_id": string,"plan_code": string,"status"?: Database["public"]['Enums']["subscription_status"],"trial_ends_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "billing_cycle"?: Database["public"]['Enums']["billing_cycle"],"created_at"?: string,"current_period_end"?: string | null,"extra_branches"?: number,"id"?: string,"organization_id"?: string,"plan_code"?: string,"status"?: Database["public"]['Enums']["subscription_status"],"trial_ends_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_plan_code_fkey"
      columns: ["plan_code"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["code"]
    }
                  ]
                },"time_off": {
                  Row: {
                    "created_at": string,"created_by": string | null,"ends_at": string,"id": string,"professional_id": string,"reason": string | null,"starts_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"ends_at": string,"id"?: string,"professional_id": string,"reason"?: string | null,"starts_at": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"ends_at"?: string,"id"?: string,"professional_id"?: string,"reason"?: string | null,"starts_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_off_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_off_professional_id_fkey"
      columns: ["professional_id"]
isOneToOne: false
      referencedRelation: "professionals"
      referencedColumns: ["id"]
    }
                  ]
                },"working_hours": {
                  Row: {
                    "end_time": string,"id": string,"professional_id": string,"start_time": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "end_time": string,"id"?: string,"professional_id": string,"start_time": string,"weekday": number
                  }
                  Update: {
                    "end_time"?: string,"id"?: string,"professional_id"?: string,"start_time"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "working_hours_professional_id_fkey"
      columns: ["professional_id"]
isOneToOne: false
      referencedRelation: "professionals"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: Json
                           },
"book_appointment":
{ Args: { "p_guest"?: Json,"p_items": Json,"p_salon_id": string,"p_starts_at": string }; Returns: Json
                           },
"cancel_booking":
{ Args: { "p_booking_group_id": string,"p_reason"?: string }; Returns: number
                           },
"cancel_by_guest_token":
{ Args: { "p_reason"?: string,"p_token": string }; Returns: number
                           },
"create_branch":
{ Args: { "p_address"?: string,"p_business_types": (Database["public"]['Enums']["business_type"])[],"p_organization_id": string,"p_phone"?: string,"p_salon_name": string,"p_zone": Database["public"]['Enums']["salon_zone"] }; Returns: Json
                           },
"create_invitation":
{ Args: { "p_email"?: string,"p_organization_id": string,"p_phone"?: string,"p_professional_id"?: string,"p_role": Database["public"]['Enums']["member_role"],"p_salon_id"?: string }; Returns: string
                           },
"create_organization":
{ Args: { "p_address"?: string,"p_business_types": (Database["public"]['Enums']["business_type"])[],"p_org_name": string,"p_phone"?: string,"p_salon_name": string,"p_zone": Database["public"]['Enums']["salon_zone"] }; Returns: Json
                           },
"get_guest_booking":
{ Args: { "p_token": string }; Returns: Json
                           },
"get_live_board":
{ Args: { "p_day"?: string,"p_salon_id": string }; Returns: Json
                           },
"get_public_schedule":
{ Args: { "p_from": string,"p_salon_id": string,"p_to": string }; Returns: Json
                           },
"live_device_status":
{ Args: { "p_salon_slug": string }; Returns: Json
                           },
"mark_appointment":
{ Args: { "p_appointment_id": string,"p_status": Database["public"]['Enums']["appointment_status"] }; Returns: undefined
                           },
"my_bookings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_context":
{ Args: Record<PropertyKey, never>; Returns: {
              "organization_id": string,"organization_name": string,"organization_slug": string,"professional_id": string,"role": Database["public"]['Enums']["member_role"],"salon_id": string,"salon_name": string,"salon_slug": string
            }[]
                           },
"pair_live_device":
{ Args: { "p_code": string,"p_name"?: string,"p_salon_id": string }; Returns: string
                           },
"request_live_pairing":
{ Args: { "p_salon_slug": string }; Returns: Json
                           },
"reschedule_booking":
{ Args: { "p_booking_group_id": string,"p_new_start": string }; Returns: string
                           },
"reschedule_by_guest_token":
{ Args: { "p_new_start": string,"p_token": string }; Returns: string
                           },
"revoke_live_device":
{ Args: { "p_device_id": string }; Returns: undefined
                           },
"set_professional_services":
{ Args: { "p_professional_id": string,"p_service_ids": (string)[] }; Returns: number
                           },
"set_salon_published":
{ Args: { "p_published": boolean,"p_salon_id": string }; Returns: boolean
                           },
"set_working_hours":
{ Args: { "p_hours": Json,"p_professional_id": string }; Returns: number
                           },
"staff_create_appointment":
{ Args: { "p_allow_outside_hours"?: boolean,"p_customer": Json,"p_items": Json,"p_salon_id": string,"p_source"?: Database["public"]['Enums']["booking_source"],"p_starts_at": string }; Returns: Json
                           }
          }
          Enums: {
            "app_locale": "en"|"es","appointment_event_type": "created"|"rescheduled"|"cancelled"|"completed"|"no_show"|"status_changed","appointment_status": "booked"|"completed"|"cancelled"|"no_show","billing_cycle": "monthly"|"annual","booking_source": "online"|"phone"|"walk_in","business_type": "barbershop"|"salon"|"spa","invoice_status": "open"|"paid"|"void","member_role": "owner"|"admin"|"professional"|"display","notification_channel": "whatsapp"|"sms"|"email","notification_kind": "confirmation"|"reminder"|"cancellation"|"reschedule","notification_status": "pending"|"sent"|"failed"|"skipped","payment_method": "bank_transfer"|"cash"|"other","pro_title": "barber"|"stylist"|"nail_tech"|"makeup_artist"|"esthetician"|"massage_therapist"|"other","salon_zone": "grace_bay"|"downtown_provo"|"leeward"|"long_bay"|"turtle_cove"|"the_bight"|"chalk_sound"|"five_cays"|"blue_hills"|"kew_town"|"grand_turk"|"north_caicos"|"middle_caicos"|"south_caicos"|"salt_cay","subscription_status": "trialing"|"active"|"past_due"|"suspended"|"cancelled"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "app_locale": ["en", "es"],"appointment_event_type": ["created", "rescheduled", "cancelled", "completed", "no_show", "status_changed"],"appointment_status": ["booked", "completed", "cancelled", "no_show"],"billing_cycle": ["monthly", "annual"],"booking_source": ["online", "phone", "walk_in"],"business_type": ["barbershop", "salon", "spa"],"invoice_status": ["open", "paid", "void"],"member_role": ["owner", "admin", "professional", "display"],"notification_channel": ["whatsapp", "sms", "email"],"notification_kind": ["confirmation", "reminder", "cancellation", "reschedule"],"notification_status": ["pending", "sent", "failed", "skipped"],"payment_method": ["bank_transfer", "cash", "other"],"pro_title": ["barber", "stylist", "nail_tech", "makeup_artist", "esthetician", "massage_therapist", "other"],"salon_zone": ["grace_bay", "downtown_provo", "leeward", "long_bay", "turtle_cove", "the_bight", "chalk_sound", "five_cays", "blue_hills", "kew_town", "grand_turk", "north_caicos", "middle_caicos", "south_caicos", "salt_cay"],"subscription_status": ["trialing", "active", "past_due", "suspended", "cancelled"]
          }
        }
} as const
