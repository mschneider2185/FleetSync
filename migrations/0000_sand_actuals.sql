CREATE TABLE "allocation_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_id" integer NOT NULL,
	"frac_job_id" integer NOT NULL,
	"hauler_id" integer NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"trucks_per_shift" integer NOT NULL,
	"shift" text DEFAULT 'both' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_frac_day_actuals" (
	"id" serial PRIMARY KEY NOT NULL,
	"sync_run_id" integer,
	"dev_run_uid" text NOT NULL,
	"dev_run_name" text NOT NULL,
	"frac_job_id" integer,
	"site_uid" text,
	"site_name" text,
	"resource_spread" text,
	"water_system" text,
	"calendar_report_date" date NOT NULL,
	"operational_day_date" date NOT NULL,
	"delivered_load_count" integer DEFAULT 0 NOT NULL,
	"delivered_tons" numeric(14, 2) DEFAULT '0' NOT NULL,
	"delivered_total_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"avg_field_cycle_hours" numeric(10, 2),
	"avg_ticket_cycle_hours" numeric(10, 2),
	"participating_truck_count" integer DEFAULT 0 NOT NULL,
	"active_driver_count" integer DEFAULT 0 NOT NULL,
	"day_load_count" integer DEFAULT 0 NOT NULL,
	"night_load_count" integer DEFAULT 0 NOT NULL,
	"core_truck_count_2plus" integer DEFAULT 0 NOT NULL,
	"core_truck_count_3plus" integer DEFAULT 0 NOT NULL,
	"stage_count_actual" integer,
	"pump_time_hours" numeric(10, 2),
	"ops_npt_hours" numeric(10, 2),
	"total_proppant_lb_actual" numeric(14, 2),
	"daily_req_tons" numeric(14, 2),
	"ton_delta" numeric(14, 2),
	"total_npt_hours" numeric(10, 2),
	"sand_npt_hours" numeric(10, 2),
	"water_npt_hours" numeric(10, 2),
	"weather_npt_hours" numeric(10, 2),
	"pump_npt_hours" numeric(10, 2),
	"npt_d1_cat" text,
	"npt_d1_reason" text,
	"npt_d1_hours" numeric(10, 2),
	"npt_d2_cat" text,
	"npt_d2_reason" text,
	"npt_d2_hours" numeric(10, 2),
	"tons_per_stage" numeric(14, 2),
	"cost_per_stage" numeric(14, 2),
	"cost_per_ton" numeric(14, 2),
	"attribution_method" text NOT NULL,
	"refreshed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "frac_daily_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_id" integer NOT NULL,
	"frac_job_id" integer NOT NULL,
	"date" text NOT NULL,
	"shift" text DEFAULT 'both' NOT NULL,
	"category" text NOT NULL,
	"sub_category" text,
	"hours_lost" real,
	"notes" text,
	"created_by_user_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "frac_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"pad_name" text NOT NULL,
	"lane_id" integer NOT NULL,
	"customer" text,
	"basin" text,
	"notes" text,
	"stages_per_day" real,
	"tons_per_stage" integer,
	"total_stages" integer,
	"travel_time_hours" real,
	"avg_tons_per_load" real,
	"load_unload_time_hours" real,
	"storage_type" text,
	"storage_capacity" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hauler_capacity_exceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"hauler_id" integer NOT NULL,
	"date" text NOT NULL,
	"max_trucks_per_shift" integer,
	"min_committed_trucks_per_shift" integer,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "haulers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"split_allowed" boolean DEFAULT false NOT NULL,
	"home_area" text,
	"notes" text,
	"default_max_trucks_per_shift" integer DEFAULT 10 NOT NULL,
	"default_min_committed_trucks_per_shift" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "ingested_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"commodity" text DEFAULT 'sand' NOT NULL,
	"source_ticket_number" text NOT NULL,
	"source_dispatch_number" text,
	"ticket_id_raw" text,
	"ticket_status" text,
	"material" text,
	"load_type" text,
	"operator" text,
	"hauler" text,
	"driver_name" text,
	"driver_first_name" text,
	"driver_last_name" text,
	"truck_number" text,
	"trailer_number" text,
	"source_name" text,
	"source_external_id" text,
	"source_location_type" text,
	"destination_name" text,
	"destination_external_id" text,
	"destination_location_type" text,
	"source_volume" numeric(14, 2),
	"destination_volume" numeric(14, 2),
	"volume_unit_of_measure" text,
	"hauling_rate" numeric(14, 4),
	"cost_type" text,
	"hauling_cost" numeric(14, 2),
	"total_npt_cost" numeric(14, 2),
	"total_ticket_cost" numeric(14, 2),
	"duration_hours" numeric(10, 2),
	"billable_time_hours" numeric(10, 2),
	"npt_billable_hours" numeric(10, 2),
	"total_billable_time" numeric(10, 2),
	"gps_ticket_started_at" timestamp,
	"gps_pickup_completed_at" timestamp,
	"gps_dropoff_completed_at" timestamp,
	"hauler_service_start_at" timestamp,
	"hauler_service_end_at" timestamp,
	"hauler_pickup_completed_at" timestamp,
	"hauler_dropoff_completed_at" timestamp,
	"failed_audit_reason" text,
	"driver_comments" text,
	"admin_comments" text,
	"rerouted" boolean DEFAULT false,
	"flagged" boolean DEFAULT false,
	"normalized_hauler" text,
	"normalized_truck_number" text,
	"normalized_driver_name" text,
	"raw_payload" jsonb,
	"synced_at" timestamp DEFAULT now(),
	"last_seen_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lanes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#3b82f6' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presets" (
	"id" serial PRIMARY KEY NOT NULL,
	"preset_type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"data" text NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scenario_frac_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_id" integer NOT NULL,
	"frac_job_id" integer NOT NULL,
	"planned_start_date" text NOT NULL,
	"planned_end_date" text NOT NULL,
	"transition_days_after" integer DEFAULT 0 NOT NULL,
	"required_trucks_per_shift" integer DEFAULT 0 NOT NULL,
	"truck_requirement_overrides" text,
	"status" text DEFAULT 'planned' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_scenario_id" integer,
	"locked" boolean DEFAULT false NOT NULL,
	"created_by_user_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'sand_tickets' NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"ended_at" timestamp,
	"rows_read" integer DEFAULT 0 NOT NULL,
	"rows_written" integer DEFAULT 0 NOT NULL,
	"rows_updated" integer DEFAULT 0 NOT NULL,
	"rows_skipped" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp,
	"request_payload" jsonb,
	"error_message" text,
	"triggered_by_user_id" varchar
);
--> statement-breakpoint
CREATE TABLE "ticket_attributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ingested_ticket_id" integer NOT NULL,
	"sync_run_id" integer,
	"attribution_method" text NOT NULL,
	"attribution_status" text DEFAULT 'attributed' NOT NULL,
	"exclusion_reason" text,
	"precedence_field_used" text,
	"effective_event_at_local" timestamp NOT NULL,
	"effective_event_at_utc" timestamp NOT NULL,
	"calendar_report_date" date NOT NULL,
	"operational_day_date" date NOT NULL,
	"day_part" text,
	"hour_local" integer,
	"dev_run_uid" text,
	"dev_run_name" text,
	"frac_job_id" integer,
	"site_uid" text,
	"site_name" text,
	"resource_spread" text,
	"water_system" text,
	"attribution_confidence" numeric(5, 2) DEFAULT '1.00',
	"active_pad_snapshot_loaded_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fact_frac_day_actuals_unique_grain" ON "fact_frac_day_actuals" USING btree ("dev_run_uid","calendar_report_date","operational_day_date","attribution_method");--> statement-breakpoint
CREATE INDEX "fact_frac_day_actuals_calendar_date_idx" ON "fact_frac_day_actuals" USING btree ("calendar_report_date");--> statement-breakpoint
CREATE INDEX "fact_frac_day_actuals_operational_date_idx" ON "fact_frac_day_actuals" USING btree ("operational_day_date");--> statement-breakpoint
CREATE UNIQUE INDEX "ingested_tickets_ticket_unique" ON "ingested_tickets" USING btree ("source_ticket_number");--> statement-breakpoint
CREATE INDEX "ingested_tickets_commodity_idx" ON "ingested_tickets" USING btree ("commodity");--> statement-breakpoint
CREATE INDEX "ingested_tickets_status_idx" ON "ingested_tickets" USING btree ("ticket_status");--> statement-breakpoint
CREATE INDEX "ingested_tickets_destination_external_id_idx" ON "ingested_tickets" USING btree ("destination_external_id");--> statement-breakpoint
CREATE INDEX "ingested_tickets_gps_dropoff_idx" ON "ingested_tickets" USING btree ("gps_dropoff_completed_at");--> statement-breakpoint
CREATE INDEX "ingested_tickets_hauler_service_end_idx" ON "ingested_tickets" USING btree ("hauler_service_end_at");--> statement-breakpoint
CREATE INDEX "sync_runs_source_idx" ON "sync_runs" USING btree ("source");--> statement-breakpoint
CREATE INDEX "sync_runs_status_idx" ON "sync_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ticket_attributions_ticket_idx" ON "ticket_attributions" USING btree ("ingested_ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_attributions_dev_run_date_idx" ON "ticket_attributions" USING btree ("dev_run_uid","calendar_report_date");--> statement-breakpoint
CREATE INDEX "ticket_attributions_operational_date_idx" ON "ticket_attributions" USING btree ("operational_day_date");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");