CREATE TYPE "public"."publish_result" AS ENUM('published', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."spec_status" AS ENUM('draft', 'published', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "consumers" (
	"id" serial PRIMARY KEY NOT NULL,
	"consumer_name" text NOT NULL,
	"service_id" integer NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"fields_used" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"spec_version_id" integer NOT NULL,
	"attempted_by" text NOT NULL,
	"result" "publish_result" NOT NULL,
	"reason" text,
	"breaking_count" integer DEFAULT 0 NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "spec_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" integer NOT NULL,
	"version" text NOT NULL,
	"raw_spec" text NOT NULL,
	"spec" jsonb NOT NULL,
	"status" "spec_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spec_versions_service_version_unique" UNIQUE("service_id","version")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"team" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "consumers" ADD CONSTRAINT "consumers_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_spec_version_id_spec_versions_id_fk" FOREIGN KEY ("spec_version_id") REFERENCES "public"."spec_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_versions" ADD CONSTRAINT "spec_versions_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;