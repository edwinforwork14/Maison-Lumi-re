CREATE SEQUENCE "public"."orders_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_names_not_blank_check" CHECK (length(btrim("customers"."first_name")) > 0 and length(btrim("customers"."last_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_not_blank_check" CHECK (length(btrim("permissions"."key")) > 0)
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_not_blank_check" CHECK (length(btrim("roles"."key")) > 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"rotated_from" uuid,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_kind_check" CHECK ("sessions"."kind" in ('storefront', 'admin')),
	CONSTRAINT "sessions_expires_after_created_check" CHECK ("sessions"."expires_at" > "sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_not_blank_check" CHECK (length(btrim("users"."email")) > 0),
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_not_blank_check" CHECK (length(btrim("brands"."slug")) > 0),
	CONSTRAINT "brands_position_check" CHECK ("brands"."position" >= 0),
	CONSTRAINT "brands_status_check" CHECK ("brands"."status" in ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_parent_slug_key" UNIQUE NULLS NOT DISTINCT("parent_id","slug"),
	CONSTRAINT "categories_slug_not_blank_check" CHECK (length(btrim("categories"."slug")) > 0),
	CONSTRAINT "categories_position_check" CHECK ("categories"."position" >= 0),
	CONSTRAINT "categories_status_check" CHECK ("categories"."status" in ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_slug_not_blank_check" CHECK (length(btrim("collections"."slug")) > 0),
	CONSTRAINT "collections_position_check" CHECK ("collections"."position" >= 0),
	CONSTRAINT "collections_status_check" CHECK ("collections"."status" in ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "product_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"storage_key" text NOT NULL,
	"alt" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"type" text DEFAULT 'image' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_media_alt_not_blank_check" CHECK (length(btrim("product_media"."alt")) > 0),
	CONSTRAINT "product_media_dimensions_check" CHECK ("product_media"."width" > 0 and "product_media"."height" > 0),
	CONSTRAINT "product_media_position_check" CHECK ("product_media"."position" >= 0),
	CONSTRAINT "product_media_type_check" CHECK ("product_media"."type" in ('image', 'video'))
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"size" text NOT NULL,
	"color" text NOT NULL,
	"price_cents" bigint NOT NULL,
	"compare_at_price_cents" bigint,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"weight_grams" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_product_size_color_key" UNIQUE NULLS NOT DISTINCT("product_id","size","color"),
	CONSTRAINT "product_variants_sku_not_blank_check" CHECK (length(btrim("product_variants"."sku")) > 0),
	CONSTRAINT "product_variants_price_cents_check" CHECK ("product_variants"."price_cents" >= 0),
	CONSTRAINT "product_variants_compare_at_price_cents_check" CHECK ("product_variants"."compare_at_price_cents" is null or "product_variants"."compare_at_price_cents" >= "product_variants"."price_cents"),
	CONSTRAINT "product_variants_weight_grams_check" CHECK ("product_variants"."weight_grams" is null or "product_variants"."weight_grams" > 0),
	CONSTRAINT "product_variants_status_check" CHECK ("product_variants"."status" in ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_description" text,
	"description" text,
	"category_id" uuid NOT NULL,
	"brand_id" uuid,
	"collection_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"seo_title" text,
	"seo_description" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_not_blank_check" CHECK (length(btrim("products"."slug")) > 0),
	CONSTRAINT "products_status_check" CHECK ("products"."status" in ('draft', 'active', 'archived')),
	CONSTRAINT "products_active_requires_published_at_check" CHECK ("products"."status" <> 'active' or "products"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"variant_id" uuid PRIMARY KEY NOT NULL,
	"on_hand" bigint DEFAULT 0 NOT NULL,
	"reserved" bigint DEFAULT 0 NOT NULL,
	"low_stock_threshold" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_on_hand_check" CHECK ("inventory_items"."on_hand" >= 0),
	CONSTRAINT "inventory_items_reserved_check" CHECK ("inventory_items"."reserved" >= 0),
	CONSTRAINT "inventory_items_reserved_within_on_hand_check" CHECK ("inventory_items"."reserved" <= "inventory_items"."on_hand"),
	CONSTRAINT "inventory_items_low_stock_threshold_check" CHECK ("inventory_items"."low_stock_threshold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"delta" bigint NOT NULL,
	"reason" text NOT NULL,
	"order_id" uuid,
	"actor_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_delta_check" CHECK ("inventory_movements"."delta" <> 0),
	CONSTRAINT "inventory_movements_reason_check" CHECK ("inventory_movements"."reason" in ('purchase', 'order', 'return', 'adjustment', 'correction', 'release')),
	CONSTRAINT "inventory_movements_adjustment_note_check" CHECK ("inventory_movements"."reason" <> 'adjustment' or "inventory_movements"."note" is not null)
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"order_id" uuid,
	"cart_id" uuid,
	"quantity" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_reservations_quantity_check" CHECK ("inventory_reservations"."quantity" > 0),
	CONSTRAINT "inventory_reservations_status_check" CHECK ("inventory_reservations"."status" in ('held', 'committed', 'released', 'expired')),
	CONSTRAINT "inventory_reservations_target_check" CHECK ("inventory_reservations"."order_id" is not null or "inventory_reservations"."cart_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"postal_code" text NOT NULL,
	"country_code" char(2) NOT NULL,
	"region" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "addresses_kind_check" CHECK ("addresses"."kind" in ('shipping', 'billing')),
	CONSTRAINT "addresses_country_code_check" CHECK ("addresses"."country_code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"cart_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" bigint NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_pk" PRIMARY KEY("cart_id","variant_id"),
	CONSTRAINT "cart_items_quantity_check" CHECK ("cart_items"."quantity" > 0),
	CONSTRAINT "cart_items_unit_price_cents_check" CHECK ("cart_items"."unit_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"anonymous_token" text,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_owner_check" CHECK ("carts"."user_id" is not null or "carts"."anonymous_token" is not null),
	CONSTRAINT "carts_status_check" CHECK ("carts"."status" in ('active', 'converted', 'abandoned', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "order_addresses" (
	"order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"recipient_name" text,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"postal_code" text NOT NULL,
	"country_code" char(2) NOT NULL,
	"region" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_addresses_pk" PRIMARY KEY("order_id","kind"),
	CONSTRAINT "order_addresses_kind_check" CHECK ("order_addresses"."kind" in ('shipping', 'billing')),
	CONSTRAINT "order_addresses_country_code_check" CHECK ("order_addresses"."country_code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"sku_snapshot" text NOT NULL,
	"name_snapshot" text NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"quantity" bigint NOT NULL,
	"line_total_cents" bigint NOT NULL,
	"tax_rate_bp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_unit_price_cents_check" CHECK ("order_items"."unit_price_cents" >= 0),
	CONSTRAINT "order_items_line_total_cents_check" CHECK ("order_items"."line_total_cents" >= 0),
	CONSTRAINT "order_items_line_total_identity_check" CHECK ("order_items"."line_total_cents" = "order_items"."unit_price_cents" * "order_items"."quantity"),
	CONSTRAINT "order_items_tax_rate_bp_check" CHECK ("order_items"."tax_rate_bp" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_status_history_to_status_check" CHECK ("order_status_history"."to_status" in ('draft', 'placed', 'paid', 'fulfilled', 'cancelled', 'refunded')),
	CONSTRAINT "order_status_history_from_status_check" CHECK ("order_status_history"."from_status" is null or "order_status_history"."from_status" in ('draft', 'placed', 'paid', 'fulfilled', 'cancelled', 'refunded')),
	CONSTRAINT "order_status_history_transition_check" CHECK ("order_status_history"."from_status" is null or "order_status_history"."from_status" <> "order_status_history"."to_status")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"shipping_cents" bigint DEFAULT 0 NOT NULL,
	"tax_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint NOT NULL,
	"shipping_method_id" uuid,
	"coupon_id" uuid,
	"idempotency_key" text,
	"placed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_not_blank_check" CHECK (length(btrim("orders"."number")) > 0),
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('draft', 'placed', 'paid', 'fulfilled', 'cancelled', 'refunded')),
	CONSTRAINT "orders_subtotal_cents_check" CHECK ("orders"."subtotal_cents" >= 0),
	CONSTRAINT "orders_discount_cents_check" CHECK ("orders"."discount_cents" >= 0),
	CONSTRAINT "orders_shipping_cents_check" CHECK ("orders"."shipping_cents" >= 0),
	CONSTRAINT "orders_tax_cents_check" CHECK ("orders"."tax_cents" >= 0),
	CONSTRAINT "orders_total_cents_check" CHECK ("orders"."total_cents" >= 0),
	CONSTRAINT "orders_total_identity_check" CHECK ("orders"."total_cents" = "orders"."subtotal_cents" - "orders"."discount_cents" + "orders"."shipping_cents" + "orders"."tax_cents"),
	CONSTRAINT "orders_placed_at_check" CHECK ("orders"."status" = 'draft' or "orders"."placed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_provider_not_blank_check" CHECK (length(btrim("payment_events"."provider")) > 0),
	CONSTRAINT "payment_events_provider_event_id_not_blank_check" CHECK (length(btrim("payment_events"."provider_event_id")) > 0),
	CONSTRAINT "payment_events_type_not_blank_check" CHECK (length(btrim("payment_events"."type")) > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_reference" text NOT NULL,
	"method" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"refunded_cents" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_not_blank_check" CHECK (length(btrim("payments"."provider")) > 0),
	CONSTRAINT "payments_provider_reference_not_blank_check" CHECK (length(btrim("payments"."provider_reference")) > 0),
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" in ('pending', 'authorized', 'captured', 'failed', 'cancelled', 'refunded', 'partially_refunded')),
	CONSTRAINT "payments_amount_cents_check" CHECK ("payments"."amount_cents" >= 0),
	CONSTRAINT "payments_refunded_cents_check" CHECK ("payments"."refunded_cents" >= 0),
	CONSTRAINT "payments_refunded_within_amount_check" CHECK ("payments"."refunded_cents" <= "payments"."amount_cents")
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"carrier" text NOT NULL,
	"tracking_number" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_carrier_not_blank_check" CHECK (length(btrim("shipments"."carrier")) > 0),
	CONSTRAINT "shipments_tracking_number_not_blank_check" CHECK (length(btrim("shipments"."tracking_number")) > 0),
	CONSTRAINT "shipments_status_check" CHECK ("shipments"."status" in ('pending', 'label_created', 'in_transit', 'delivered', 'returned', 'failed')),
	CONSTRAINT "shipments_delivered_after_shipped_check" CHECK ("shipments"."delivered_at" is null or ("shipments"."shipped_at" is not null and "shipments"."delivered_at" >= "shipments"."shipped_at"))
);
--> statement-breakpoint
CREATE TABLE "shipping_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"carrier" text,
	"eta_min_days" integer DEFAULT 0 NOT NULL,
	"eta_max_days" integer DEFAULT 0 NOT NULL,
	"price_cents" bigint NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_methods_code_not_blank_check" CHECK (length(btrim("shipping_methods"."code")) > 0),
	CONSTRAINT "shipping_methods_price_cents_check" CHECK ("shipping_methods"."price_cents" >= 0),
	CONSTRAINT "shipping_methods_eta_min_days_check" CHECK ("shipping_methods"."eta_min_days" >= 0),
	CONSTRAINT "shipping_methods_eta_range_check" CHECK ("shipping_methods"."eta_max_days" >= "shipping_methods"."eta_min_days"),
	CONSTRAINT "shipping_methods_status_check" CHECK ("shipping_methods"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "shipping_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"method_id" uuid NOT NULL,
	"country_code" char(2) NOT NULL,
	"region" text,
	"price_cents" bigint NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_zones_method_country_region_key" UNIQUE NULLS NOT DISTINCT("method_id","country_code","region"),
	CONSTRAINT "shipping_zones_price_cents_check" CHECK ("shipping_zones"."price_cents" >= 0),
	CONSTRAINT "shipping_zones_country_code_check" CHECK ("shipping_zones"."country_code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" char(2) NOT NULL,
	"region" text,
	"kind" text DEFAULT 'standard' NOT NULL,
	"rate_bp" integer NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_rates_country_region_kind_from_key" UNIQUE NULLS NOT DISTINCT("country_code","region","kind","effective_from"),
	CONSTRAINT "tax_rates_rate_bp_check" CHECK ("tax_rates"."rate_bp" between 0 and 10000),
	CONSTRAINT "tax_rates_kind_check" CHECK ("tax_rates"."kind" in ('standard', 'reduced', 'super_reduced', 'zero')),
	CONSTRAINT "tax_rates_country_code_check" CHECK ("tax_rates"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "tax_rates_effective_range_check" CHECK ("tax_rates"."effective_to" is null or "tax_rates"."effective_to" > "tax_rates"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_redemptions_amount_cents_check" CHECK ("coupon_redemptions"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"value" bigint NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"min_subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"max_uses" integer,
	"max_uses_per_customer" integer,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_not_blank_check" CHECK (length(btrim("coupons"."code")) > 0),
	CONSTRAINT "coupons_kind_check" CHECK ("coupons"."kind" in ('percent', 'fixed', 'free_shipping')),
	CONSTRAINT "coupons_value_check" CHECK ("coupons"."value" >= 0),
	CONSTRAINT "coupons_percent_value_check" CHECK ("coupons"."kind" <> 'percent' or "coupons"."value" between 1 and 100),
	CONSTRAINT "coupons_fixed_value_check" CHECK ("coupons"."kind" <> 'fixed' or "coupons"."value" > 0),
	CONSTRAINT "coupons_min_subtotal_cents_check" CHECK ("coupons"."min_subtotal_cents" >= 0),
	CONSTRAINT "coupons_max_uses_check" CHECK ("coupons"."max_uses" is null or "coupons"."max_uses" > 0),
	CONSTRAINT "coupons_max_uses_per_customer_check" CHECK ("coupons"."max_uses_per_customer" is null or "coupons"."max_uses_per_customer" > 0),
	CONSTRAINT "coupons_window_check" CHECK ("coupons"."ends_at" is null or "coupons"."ends_at" > "coupons"."starts_at"),
	CONSTRAINT "coupons_status_check" CHECK ("coupons"."status" in ('active', 'paused', 'expired', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"customer_id" uuid,
	"order_item_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"body" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_check" CHECK ("reviews"."rating" between 1 and 5),
	CONSTRAINT "reviews_status_check" CHECK ("reviews"."status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"wishlist_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_items_pk" PRIMARY KEY("wishlist_id","variant_id")
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT 'default' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlists_name_not_blank_check" CHECK (length(btrim("wishlists"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "banners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"title" text,
	"subtitle" text,
	"cta_label" text,
	"cta_href" text,
	"media_id" uuid,
	"placement" text DEFAULT 'home_hero' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "banners_key_not_blank_check" CHECK (length(btrim("banners"."key")) > 0),
	CONSTRAINT "banners_position_check" CHECK ("banners"."position" >= 0),
	CONSTRAINT "banners_status_check" CHECK ("banners"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "banners_window_check" CHECK ("banners"."ends_at" is null or "banners"."starts_at" is null or "banners"."ends_at" > "banners"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "homepage_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"title" text,
	"subtitle" text,
	"cta_label" text,
	"cta_href" text,
	"media_id" uuid,
	"placement" text DEFAULT 'home' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homepage_sections_key_not_blank_check" CHECK (length(btrim("homepage_sections"."key")) > 0),
	CONSTRAINT "homepage_sections_position_check" CHECK ("homepage_sections"."position" >= 0),
	CONSTRAINT "homepage_sections_status_check" CHECK ("homepage_sections"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "homepage_sections_window_check" CHECK ("homepage_sections"."ends_at" is null or "homepage_sections"."starts_at" is null or "homepage_sections"."ends_at" > "homepage_sections"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"type" text DEFAULT 'json' NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_key_not_blank_check" CHECK (length(btrim("site_settings"."key")) > 0),
	CONSTRAINT "site_settings_type_check" CHECK ("site_settings"."type" in ('string', 'number', 'boolean', 'json'))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"request_id" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_actor_kind_check" CHECK ("audit_logs"."actor_kind" in ('user', 'system', 'webhook')),
	CONSTRAINT "audit_logs_action_not_blank_check" CHECK (length(btrim("audit_logs"."action")) > 0),
	CONSTRAINT "audit_logs_entity_not_blank_check" CHECK (length(btrim("audit_logs"."entity")) > 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb,
	"order_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_key_not_blank_check" CHECK (length(btrim("idempotency_keys"."key")) > 0),
	CONSTRAINT "idempotency_keys_scope_not_blank_check" CHECK (length(btrim("idempotency_keys"."scope")) > 0),
	CONSTRAINT "idempotency_keys_request_hash_not_blank_check" CHECK (length(btrim("idempotency_keys"."request_hash")) > 0)
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_rotated_from_sessions_id_fk" FOREIGN KEY ("rotated_from") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_addresses" ADD CONSTRAINT "order_addresses_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_zones" ADD CONSTRAINT "shipping_zones_method_id_shipping_methods_id_fk" FOREIGN KEY ("method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_media_id_product_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."product_media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homepage_sections" ADD CONSTRAINT "homepage_sections_media_id_product_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."product_media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_user_id_idx" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customers_anonymized_at_idx" ON "customers" USING btree ("anonymized_at");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_key_key" ON "roles" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_roles_role_id_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_key" ON "brands" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_parent_position_idx" ON "categories" USING btree ("parent_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_slug_key" ON "collections" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "product_media_product_position_idx" ON "product_media" USING btree ("product_id","position");--> statement-breakpoint
CREATE INDEX "product_media_variant_id_idx" ON "product_media" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_media_storage_key_key" ON "product_media" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_key" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "products_status_published_idx" ON "products" USING btree ("status","published_at") WHERE "products"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_brand_id_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "products_collection_id_idx" ON "products" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "products_featured_idx" ON "products" USING btree ("featured") WHERE "products"."featured" and "products"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "products_search_idx" ON "products" USING gin (to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("short_description", '') || ' ' || coalesce("description", '')));--> statement-breakpoint
CREATE INDEX "inventory_items_low_stock_idx" ON "inventory_items" USING btree ("variant_id") WHERE "inventory_items"."on_hand" <= "inventory_items"."low_stock_threshold";--> statement-breakpoint
CREATE INDEX "inventory_movements_variant_created_idx" ON "inventory_movements" USING btree ("variant_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_order_id_idx" ON "inventory_movements" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_expires_at_idx" ON "inventory_reservations" USING btree ("expires_at") WHERE "inventory_reservations"."status" = 'held';--> statement-breakpoint
CREATE INDEX "inventory_reservations_variant_id_idx" ON "inventory_reservations" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_order_id_idx" ON "inventory_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "addresses_customer_id_idx" ON "addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "addresses_customer_kind_idx" ON "addresses" USING btree ("customer_id","kind");--> statement-breakpoint
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "carts_user_id_idx" ON "carts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "carts_status_idx" ON "carts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_anonymous_token_key" ON "carts" USING btree ("anonymous_token") WHERE "carts"."anonymous_token" is not null;--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_variant_id_idx" ON "order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_created_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_key" ON "orders" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_user_placed_idx" ON "orders" USING btree ("user_id","placed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_placed_at_idx" ON "orders" USING btree ("placed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_id_key" ON "payment_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_events_pending_idx" ON "payment_events" USING btree ("created_at") WHERE "payment_events"."processed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_reference_key" ON "payments" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_carrier_tracking_number_key" ON "shipments" USING btree ("carrier","tracking_number");--> statement-breakpoint
CREATE INDEX "shipments_order_id_idx" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_methods_code_key" ON "shipping_methods" USING btree ("code");--> statement-breakpoint
CREATE INDEX "shipping_zones_country_code_idx" ON "shipping_zones" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "tax_rates_country_code_kind_idx" ON "tax_rates" USING btree ("country_code","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_coupon_order_key" ON "coupon_redemptions" USING btree ("coupon_id","order_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_customer_id_idx" ON "coupon_redemptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_coupon_customer_idx" ON "coupon_redemptions" USING btree ("coupon_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "coupons_status_idx" ON "coupons" USING btree ("status");--> statement-breakpoint
CREATE INDEX "coupons_window_idx" ON "coupons" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_item_id_key" ON "reviews" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "reviews_product_id_idx" ON "reviews" USING btree ("product_id") WHERE "reviews"."status" = 'approved';--> statement-breakpoint
CREATE INDEX "reviews_status_idx" ON "reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reviews_customer_id_idx" ON "reviews" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "wishlist_items_variant_id_idx" ON "wishlist_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlists_user_id_key" ON "wishlists" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "banners_key_key" ON "banners" USING btree ("key");--> statement-breakpoint
CREATE INDEX "banners_placement_position_idx" ON "banners" USING btree ("placement","position") WHERE "banners"."status" = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX "homepage_sections_key_key" ON "homepage_sections" USING btree ("key");--> statement-breakpoint
CREATE INDEX "homepage_sections_placement_position_idx" ON "homepage_sections" USING btree ("placement","position") WHERE "homepage_sections"."status" = 'published';--> statement-breakpoint
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_order_id_idx" ON "idempotency_keys" USING btree ("order_id");