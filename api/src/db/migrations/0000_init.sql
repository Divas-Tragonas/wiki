CREATE TABLE "board_layout" (
	"town_id" text NOT NULL,
	"piece" text NOT NULL,
	"pose" jsonb NOT NULL,
	CONSTRAINT "board_layout_town_id_piece_pk" PRIMARY KEY("town_id","piece")
);
--> statement-breakpoint
CREATE TABLE "board_places" (
	"town_id" text NOT NULL,
	"place_id" text NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "board_places_town_id_place_id_pk" PRIMARY KEY("town_id","place_id")
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"rev" bigint DEFAULT 0 NOT NULL,
	"tracked_quest_id" text,
	"party_level" integer DEFAULT 1 NOT NULL,
	"party_title" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "changes" (
	"rev" bigint PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"summary" text NOT NULL,
	"role" text NOT NULL,
	"session_id" text,
	"items" jsonb NOT NULL,
	"undone_by" bigint
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"role" text PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ecos" (
	"id" text PRIMARY KEY NOT NULL,
	"num" integer,
	"position" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"unlocked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"quest_id" text NOT NULL,
	"position" integer NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"done" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_towns" (
	"quest_id" text NOT NULL,
	"town_id" text NOT NULL,
	"place_id" text,
	"position" integer NOT NULL,
	CONSTRAINT "quest_towns_quest_id_town_id_pk" PRIMARY KEY("quest_id","town_id")
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"position" integer NOT NULL,
	"cat" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"reward" text DEFAULT '' NOT NULL,
	"who" text DEFAULT '' NOT NULL,
	"giver" text DEFAULT '' NOT NULL,
	"where_text" text DEFAULT '' NOT NULL,
	"special" text,
	"status" text DEFAULT 'active' NOT NULL,
	"done_at" bigint,
	"hidden" boolean DEFAULT true NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"role" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"dm_until" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"rev" bigint NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "towns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_layout" ADD CONSTRAINT "board_layout_town_id_towns_id_fk" FOREIGN KEY ("town_id") REFERENCES "public"."towns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_places" ADD CONSTRAINT "board_places_town_id_towns_id_fk" FOREIGN KEY ("town_id") REFERENCES "public"."towns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_steps" ADD CONSTRAINT "quest_steps_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_towns" ADD CONSTRAINT "quest_towns_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_towns" ADD CONSTRAINT "quest_towns_town_id_towns_id_fk" FOREIGN KEY ("town_id") REFERENCES "public"."towns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "changes_at_idx" ON "changes" USING btree ("at");--> statement-breakpoint
CREATE INDEX "quest_steps_quest_idx" ON "quest_steps" USING btree ("quest_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");