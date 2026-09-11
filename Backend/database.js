const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

function createDeliveryStore({ databasePath, uploadsDirectory }) {
    if (databasePath !== ":memory:") {
        fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    }

    fs.mkdirSync(uploadsDirectory, { recursive: true });
    const database = new DatabaseSync(databasePath, { timeout: 5000 });

    database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS deliveries (
            id TEXT PRIMARY KEY,
            client_name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            photo_count INTEGER NOT NULL DEFAULT 0 CHECK (photo_count >= 0),
            message TEXT NOT NULL DEFAULT '',
            expires_at TEXT,
            password_hash TEXT,
            password_salt TEXT,
            allow_individual_download INTEGER NOT NULL DEFAULT 1 CHECK (allow_individual_download IN (0, 1)),
            allow_zip_download INTEGER NOT NULL DEFAULT 1 CHECK (allow_zip_download IN (0, 1)),
            favorites_enabled INTEGER NOT NULL DEFAULT 1 CHECK (favorites_enabled IN (0, 1)),
            owner_id INTEGER,
            brand_name TEXT NOT NULL DEFAULT '',
            accent_color TEXT NOT NULL DEFAULT '#c9aa70',
            background_color TEXT NOT NULL DEFAULT '#ffffff',
            website_url TEXT NOT NULL DEFAULT '',
            instagram_url TEXT NOT NULL DEFAULT '',
            facebook_url TEXT NOT NULL DEFAULT '',
            tiktok_url TEXT NOT NULL DEFAULT '',
            social_links TEXT,
            gallery_style TEXT NOT NULL DEFAULT 'masonry',
            cover_filename TEXT,
            cover_style TEXT NOT NULL DEFAULT 'immersive',
            cover_position_x INTEGER NOT NULL DEFAULT 50,
            cover_position_y INTEGER NOT NULL DEFAULT 50,
            logo_scale INTEGER NOT NULL DEFAULT 100,
            logo_position_x INTEGER NOT NULL DEFAULT 50,
            logo_position_y INTEGER NOT NULL DEFAULT 50,
            client_email TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
            published_at TEXT,
            last_sent_at TEXT,
            updated_at TEXT
        ) STRICT;

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            email TEXT UNIQUE COLLATE NOCASE,
            display_name TEXT NOT NULL DEFAULT '',
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            email_verified_at TEXT,
            plan TEXT NOT NULL DEFAULT 'free',
            plan_status TEXT NOT NULL DEFAULT 'active',
            stripe_customer_id TEXT,
            stripe_subscription_id TEXT,
            stripe_environment TEXT CHECK (stripe_environment IN ('test', 'live')),
            stripe_current_period_end TEXT,
            terms_accepted_at TEXT,
            is_guest INTEGER NOT NULL DEFAULT 0 CHECK (is_guest IN (0, 1)),
            auth_disabled INTEGER NOT NULL DEFAULT 0 CHECK (auth_disabled IN (0, 1)),
            created_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) STRICT;

        CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);

        CREATE TABLE IF NOT EXISTS user_identities (
            provider TEXT NOT NULL,
            subject TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (provider, subject),
            UNIQUE (provider, user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) STRICT;

        CREATE INDEX IF NOT EXISTS user_identities_user_id
        ON user_identities(user_id);

        CREATE TABLE IF NOT EXISTS brand_profiles (
            user_id INTEGER PRIMARY KEY,
            brand_name TEXT NOT NULL DEFAULT '',
            accent_color TEXT NOT NULL DEFAULT '#c9aa70',
            background_color TEXT NOT NULL DEFAULT '#ffffff',
            website_url TEXT NOT NULL DEFAULT '',
            instagram_url TEXT NOT NULL DEFAULT '',
            facebook_url TEXT NOT NULL DEFAULT '',
            tiktok_url TEXT NOT NULL DEFAULT '',
            social_links TEXT,
            logo_scale INTEGER NOT NULL DEFAULT 100,
            logo_position_x INTEGER NOT NULL DEFAULT 50,
            logo_position_y INTEGER NOT NULL DEFAULT 50,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) STRICT;
    `);

    const columns = new Set(
        database.prepare("PRAGMA table_info(deliveries)").all()
            .map((column) => column.name)
    );
    const migrations = [
        ["message", "ALTER TABLE deliveries ADD COLUMN message TEXT NOT NULL DEFAULT ''"],
        ["expires_at", "ALTER TABLE deliveries ADD COLUMN expires_at TEXT"],
        ["password_hash", "ALTER TABLE deliveries ADD COLUMN password_hash TEXT"],
        ["password_salt", "ALTER TABLE deliveries ADD COLUMN password_salt TEXT"],
        ["allow_individual_download", "ALTER TABLE deliveries ADD COLUMN allow_individual_download INTEGER NOT NULL DEFAULT 1 CHECK (allow_individual_download IN (0, 1))"],
        ["allow_zip_download", "ALTER TABLE deliveries ADD COLUMN allow_zip_download INTEGER NOT NULL DEFAULT 1 CHECK (allow_zip_download IN (0, 1))"],
        ["favorites_enabled", "ALTER TABLE deliveries ADD COLUMN favorites_enabled INTEGER NOT NULL DEFAULT 1 CHECK (favorites_enabled IN (0, 1))"],
        ["owner_id", "ALTER TABLE deliveries ADD COLUMN owner_id INTEGER"],
        ["brand_name", "ALTER TABLE deliveries ADD COLUMN brand_name TEXT NOT NULL DEFAULT ''"],
        ["accent_color", "ALTER TABLE deliveries ADD COLUMN accent_color TEXT NOT NULL DEFAULT '#c9aa70'"],
        ["background_color", "ALTER TABLE deliveries ADD COLUMN background_color TEXT NOT NULL DEFAULT '#ffffff'"],
        ["website_url", "ALTER TABLE deliveries ADD COLUMN website_url TEXT NOT NULL DEFAULT ''"],
        ["instagram_url", "ALTER TABLE deliveries ADD COLUMN instagram_url TEXT NOT NULL DEFAULT ''"],
        ["facebook_url", "ALTER TABLE deliveries ADD COLUMN facebook_url TEXT NOT NULL DEFAULT ''"],
        ["tiktok_url", "ALTER TABLE deliveries ADD COLUMN tiktok_url TEXT NOT NULL DEFAULT ''"],
        ["social_links", "ALTER TABLE deliveries ADD COLUMN social_links TEXT"],
        ["gallery_style", "ALTER TABLE deliveries ADD COLUMN gallery_style TEXT NOT NULL DEFAULT 'masonry'"],
        ["cover_filename", "ALTER TABLE deliveries ADD COLUMN cover_filename TEXT"],
        ["cover_style", "ALTER TABLE deliveries ADD COLUMN cover_style TEXT NOT NULL DEFAULT 'immersive'"],
        ["cover_position_x", "ALTER TABLE deliveries ADD COLUMN cover_position_x INTEGER NOT NULL DEFAULT 50"],
        ["cover_position_y", "ALTER TABLE deliveries ADD COLUMN cover_position_y INTEGER NOT NULL DEFAULT 50"],
        ["logo_scale", "ALTER TABLE deliveries ADD COLUMN logo_scale INTEGER NOT NULL DEFAULT 100"],
        ["logo_position_x", "ALTER TABLE deliveries ADD COLUMN logo_position_x INTEGER NOT NULL DEFAULT 50"],
        ["logo_position_y", "ALTER TABLE deliveries ADD COLUMN logo_position_y INTEGER NOT NULL DEFAULT 50"],
        ["client_email", "ALTER TABLE deliveries ADD COLUMN client_email TEXT NOT NULL DEFAULT ''"],
        ["status", "ALTER TABLE deliveries ADD COLUMN status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived'))"],
        ["published_at", "ALTER TABLE deliveries ADD COLUMN published_at TEXT"],
        ["last_sent_at", "ALTER TABLE deliveries ADD COLUMN last_sent_at TEXT"],
        ["updated_at", "ALTER TABLE deliveries ADD COLUMN updated_at TEXT"]
    ];

    for (const [column, statement] of migrations) {
        if (!columns.has(column)) database.exec(statement);
    }

    const userColumns = new Set(
        database.prepare("PRAGMA table_info(users)").all()
            .map((column) => column.name)
    );
    const userMigrations = [
        ["email", "ALTER TABLE users ADD COLUMN email TEXT"],
        ["display_name", "ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''"],
        ["email_verified_at", "ALTER TABLE users ADD COLUMN email_verified_at TEXT"],
        ["plan", "ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'"],
        ["plan_status", "ALTER TABLE users ADD COLUMN plan_status TEXT NOT NULL DEFAULT 'active'"],
        ["stripe_customer_id", "ALTER TABLE users ADD COLUMN stripe_customer_id TEXT"],
        ["stripe_subscription_id", "ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT"],
        ["stripe_environment", "ALTER TABLE users ADD COLUMN stripe_environment TEXT CHECK (stripe_environment IN ('test', 'live'))"],
        ["stripe_current_period_end", "ALTER TABLE users ADD COLUMN stripe_current_period_end TEXT"],
        ["terms_accepted_at", "ALTER TABLE users ADD COLUMN terms_accepted_at TEXT"],
        ["is_guest", "ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0 CHECK (is_guest IN (0, 1))"],
        ["auth_disabled", "ALTER TABLE users ADD COLUMN auth_disabled INTEGER NOT NULL DEFAULT 0 CHECK (auth_disabled IN (0, 1))"]
    ];
    for (const [column, statement] of userMigrations) {
        if (!userColumns.has(column)) database.exec(statement);
    }
    if (!userColumns.has("stripe_environment")) {
        database.prepare(`
            UPDATE users SET stripe_environment = 'test'
            WHERE stripe_customer_id IS NOT NULL
                OR stripe_subscription_id IS NOT NULL
        `).run();
    }

    const brandColumns = new Set(
        database.prepare("PRAGMA table_info(brand_profiles)").all()
            .map((column) => column.name)
    );
    const brandMigrations = [
        ["social_links", "ALTER TABLE brand_profiles ADD COLUMN social_links TEXT"],
        ["logo_scale", "ALTER TABLE brand_profiles ADD COLUMN logo_scale INTEGER NOT NULL DEFAULT 100"],
        ["logo_position_x", "ALTER TABLE brand_profiles ADD COLUMN logo_position_x INTEGER NOT NULL DEFAULT 50"],
        ["logo_position_y", "ALTER TABLE brand_profiles ADD COLUMN logo_position_y INTEGER NOT NULL DEFAULT 50"]
    ];
    for (const [column, statement] of brandMigrations) {
        if (!brandColumns.has(column)) database.exec(statement);
    }

    database.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
        ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;

        CREATE TABLE IF NOT EXISTS account_tokens (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) STRICT;

        CREATE INDEX IF NOT EXISTS account_tokens_user_purpose
        ON account_tokens(user_id, purpose);

        CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer_unique
        ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_subscription_unique
        ON users(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS stripe_events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            processed_at TEXT NOT NULL
        ) STRICT;

        CREATE INDEX IF NOT EXISTS stripe_events_processed_at
        ON stripe_events(processed_at);

        CREATE TABLE IF NOT EXISTS application_migrations (
            name TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        ) STRICT;
    `);

    const emailOnlyResetMigration = "email-only-auth-reset-v1";
    const emailOnlyResetApplied = database.prepare(
        "SELECT 1 FROM application_migrations WHERE name = ?"
    ).get(emailOnlyResetMigration);
    if (!emailOnlyResetApplied) {
        database.exec("BEGIN IMMEDIATE");
        try {
            database.prepare(`
                DELETE FROM sessions
                WHERE user_id IN (
                    SELECT id FROM users WHERE is_guest = 0
                )
            `).run();
            database.prepare(`
                DELETE FROM account_tokens
                WHERE user_id IN (
                    SELECT id FROM users WHERE is_guest = 0
                )
            `).run();
            database.prepare(`
                UPDATE users
                SET username = 'retired_' || id || '_' || lower(hex(randomblob(8))),
                    password_hash = lower(hex(randomblob(64))),
                    password_salt = lower(hex(randomblob(16))),
                    email_verified_at = NULL,
                    auth_disabled = 1
                WHERE is_guest = 0
            `).run();
            database.prepare(`
                INSERT INTO application_migrations (name, applied_at)
                VALUES (?, ?)
            `).run(emailOnlyResetMigration, new Date().toISOString());
            database.exec("COMMIT");
        } catch (error) {
            database.exec("ROLLBACK");
            throw error;
        }
    }

    database.exec(`
        CREATE TABLE IF NOT EXISTS gallery_sessions (
            token_hash TEXT PRIMARY KEY,
            delivery_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
        ) STRICT;

        CREATE INDEX IF NOT EXISTS gallery_sessions_expires_at
        ON gallery_sessions(expires_at);

        CREATE TABLE IF NOT EXISTS favorites (
            delivery_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (delivery_id, filename),
            FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
        ) STRICT;

        CREATE TABLE IF NOT EXISTS selection_settings (
            delivery_id TEXT PRIMARY KEY,
            selection_limit INTEGER NOT NULL DEFAULT 0 CHECK (selection_limit >= 0),
            status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'submitted')),
            client_name TEXT NOT NULL DEFAULT '',
            client_email TEXT NOT NULL DEFAULT '',
            submitted_at TEXT,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
        ) STRICT;

        CREATE TABLE IF NOT EXISTS favorite_comments (
            delivery_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            comment TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL,
            PRIMARY KEY (delivery_id, filename),
            FOREIGN KEY (delivery_id, filename)
                REFERENCES favorites(delivery_id, filename) ON DELETE CASCADE
        ) STRICT;

        CREATE TABLE IF NOT EXISTS gallery_activity (
            id INTEGER PRIMARY KEY,
            delivery_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            filename TEXT,
            details TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
        ) STRICT;

        CREATE INDEX IF NOT EXISTS gallery_activity_delivery_created
        ON gallery_activity(delivery_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS gallery_sections (
            id INTEGER PRIMARY KEY,
            delivery_id TEXT NOT NULL,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
        ) STRICT;

        CREATE TABLE IF NOT EXISTS media_sections (
            delivery_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            section_id INTEGER,
            PRIMARY KEY (delivery_id, filename),
            FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
            FOREIGN KEY (section_id) REFERENCES gallery_sections(id) ON DELETE SET NULL
        ) STRICT;

        CREATE TABLE IF NOT EXISTS gallery_templates (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            settings TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) STRICT;

        CREATE TABLE IF NOT EXISTS transfers (
            id TEXT PRIMARY KEY,
            owner_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL DEFAULT '',
            recipient_email TEXT NOT NULL DEFAULT '',
            sender_email TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            password_hash TEXT,
            password_salt TEXT,
            file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count >= 0),
            total_bytes INTEGER NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
            download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
            last_download_at TEXT,
            status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('uploading', 'ready', 'failed')),
            storage_provider TEXT NOT NULL DEFAULT 'local' CHECK (storage_provider IN ('local', 'r2')),
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        ) STRICT;

        CREATE INDEX IF NOT EXISTS transfers_owner_created
        ON transfers(owner_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS transfer_files (
            id TEXT PRIMARY KEY,
            transfer_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            object_key TEXT,
            size INTEGER NOT NULL CHECK (size >= 0),
            mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
            multipart_upload_id TEXT,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'ready', 'failed')),
            created_at TEXT NOT NULL,
            FOREIGN KEY (transfer_id) REFERENCES transfers(id) ON DELETE CASCADE
        ) STRICT;

        CREATE INDEX IF NOT EXISTS transfer_files_transfer
        ON transfer_files(transfer_id, created_at);

        CREATE TABLE IF NOT EXISTS transfer_sessions (
            token_hash TEXT PRIMARY KEY,
            transfer_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (transfer_id) REFERENCES transfers(id) ON DELETE CASCADE
        ) STRICT;

        CREATE INDEX IF NOT EXISTS transfer_sessions_expires_at
        ON transfer_sessions(expires_at);

        CREATE TABLE IF NOT EXISTS guest_upload_sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) STRICT;

        CREATE INDEX IF NOT EXISTS guest_upload_sessions_expires_at
        ON guest_upload_sessions(expires_at);

        CREATE TABLE IF NOT EXISTS transfer_sender_verifications (
            owner_id INTEGER NOT NULL,
            email TEXT NOT NULL COLLATE NOCASE,
            code_hash TEXT NOT NULL,
            code_salt TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            verified_at INTEGER,
            PRIMARY KEY (owner_id, email),
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        ) STRICT;

        CREATE INDEX IF NOT EXISTS transfer_sender_verifications_expires
        ON transfer_sender_verifications(expires_at);

        CREATE TABLE IF NOT EXISTS usage_counters (
            scope TEXT NOT NULL CHECK (scope IN ('global', 'account')),
            scope_id TEXT NOT NULL,
            period TEXT NOT NULL,
            metric TEXT NOT NULL,
            value INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),
            updated_at TEXT NOT NULL,
            PRIMARY KEY (scope, scope_id, period, metric)
        ) STRICT;

        CREATE INDEX IF NOT EXISTS usage_counters_period_metric
        ON usage_counters(period, metric);

        CREATE TABLE IF NOT EXISTS transfer_zip_jobs (
            transfer_id TEXT PRIMARY KEY,
            owner_id INTEGER NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('building', 'ready', 'failed')),
            object_key TEXT NOT NULL,
            size INTEGER NOT NULL DEFAULT 0 CHECK (size >= 0),
            expected_size INTEGER NOT NULL DEFAULT 0 CHECK (expected_size >= 0),
            error_code TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (transfer_id) REFERENCES transfers(id) ON DELETE CASCADE,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        ) STRICT;

        CREATE INDEX IF NOT EXISTS transfer_zip_jobs_owner_status
        ON transfer_zip_jobs(owner_id, status);

        CREATE TABLE IF NOT EXISTS transfer_conversion_jobs (
            id TEXT PRIMARY KEY,
            owner_id INTEGER NOT NULL,
            transfer_id TEXT NOT NULL,
            idempotency_key TEXT NOT NULL,
            delivery_id TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('pending', 'building', 'ready', 'failed')),
            selected_files TEXT NOT NULL,
            settings TEXT NOT NULL,
            expected_bytes INTEGER NOT NULL DEFAULT 0 CHECK (expected_bytes >= 0),
            copied_bytes INTEGER NOT NULL DEFAULT 0 CHECK (copied_bytes >= 0),
            error_code TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (owner_id, idempotency_key),
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        ) STRICT;

        CREATE INDEX IF NOT EXISTS transfer_conversion_jobs_owner_status
        ON transfer_conversion_jobs(owner_id, status);

        CREATE INDEX IF NOT EXISTS transfer_conversion_jobs_transfer_status
        ON transfer_conversion_jobs(transfer_id, status);
    `);

    const transferColumns = new Set(
        database.prepare("PRAGMA table_info(transfers)").all()
            .map((column) => column.name)
    );
    const transferMigrations = [
        ["sender_email", "ALTER TABLE transfers ADD COLUMN sender_email TEXT NOT NULL DEFAULT ''"],
        ["status", "ALTER TABLE transfers ADD COLUMN status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('uploading', 'ready', 'failed'))"],
        ["storage_provider", "ALTER TABLE transfers ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'local' CHECK (storage_provider IN ('local', 'r2'))"]
    ];
    for (const [column, statement] of transferMigrations) {
        if (!transferColumns.has(column)) database.exec(statement);
    }
    const zipJobColumns = new Set(
        database.prepare("PRAGMA table_info(transfer_zip_jobs)").all()
            .map((column) => column.name)
    );
    if (!zipJobColumns.has("expected_size")) {
        database.exec(
            "ALTER TABLE transfer_zip_jobs ADD COLUMN expected_size INTEGER NOT NULL DEFAULT 0 CHECK (expected_size >= 0)"
        );
    }

    database.exec(`
        CREATE TABLE IF NOT EXISTS app_migrations (
            name TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        ) STRICT;
    `);
    const whiteGalleryMigration = "white-gallery-background-v1";
    const backgroundAlreadyMigrated = database.prepare(
        "SELECT 1 FROM app_migrations WHERE name = ?"
    ).get(whiteGalleryMigration);
    if (!backgroundAlreadyMigrated) {
        database.exec("BEGIN IMMEDIATE");
        try {
            database.prepare(
                "UPDATE deliveries SET background_color = '#ffffff' WHERE background_color = '#080808'"
            ).run();
            database.prepare(
                "UPDATE brand_profiles SET background_color = '#ffffff' WHERE background_color = '#080808'"
            ).run();
            database.prepare(
                "INSERT INTO app_migrations (name, applied_at) VALUES (?, ?)"
            ).run(whiteGalleryMigration, new Date().toISOString());
            database.exec("COMMIT");
        } catch (error) {
            database.exec("ROLLBACK");
            throw error;
        }
    }

    const straclaseBrandMigration = "straclase-brand-v1";
    const brandAlreadyMigrated = database.prepare(
        "SELECT 1 FROM app_migrations WHERE name = ?"
    ).get(straclaseBrandMigration);
    if (!brandAlreadyMigrated) {
        database.exec("BEGIN IMMEDIATE");
        try {
            const legacyBrandNames = "('the real gallery', 'real gallery', 'phocloud', 'pho cloud')";
            database.prepare(`
                UPDATE deliveries SET brand_name = 'Straclase'
                WHERE lower(trim(brand_name)) IN ${legacyBrandNames}
            `).run();
            database.prepare(`
                UPDATE brand_profiles SET brand_name = 'Straclase'
                WHERE lower(trim(brand_name)) IN ${legacyBrandNames}
            `).run();
            database.prepare(`
                UPDATE users SET display_name = 'Straclase'
                WHERE lower(trim(display_name)) IN ${legacyBrandNames}
            `).run();
            database.prepare(
                "INSERT INTO app_migrations (name, applied_at) VALUES (?, ?)"
            ).run(straclaseBrandMigration, new Date().toISOString());
            database.exec("COMMIT");
        } catch (error) {
            database.exec("ROLLBACK");
            throw error;
        }
    }

    const projection = `
        id,
        client_name AS clientName,
        created_at AS createdAt,
        photo_count AS photoCount,
        message,
        expires_at AS expiresAt,
        allow_individual_download AS allowIndividualDownload,
        allow_zip_download AS allowZipDownload,
        favorites_enabled AS favoritesEnabled,
        owner_id AS ownerId,
        brand_name AS brandName,
        accent_color AS accentColor,
        background_color AS backgroundColor,
        website_url AS websiteUrl,
        instagram_url AS instagramUrl,
        facebook_url AS facebookUrl,
        tiktok_url AS tiktokUrl,
        social_links AS socialLinks,
        gallery_style AS galleryStyle,
        cover_filename AS coverFilename,
        cover_style AS coverStyle,
        cover_position_x AS coverPositionX,
        cover_position_y AS coverPositionY,
        logo_scale AS logoScale,
        logo_position_x AS logoPositionX,
        logo_position_y AS logoPositionY,
        client_email AS clientEmail,
        status,
        published_at AS publishedAt,
        last_sent_at AS lastSentAt,
        updated_at AS updatedAt,
        CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END AS hasPassword
    `;
    const insertDelivery = database.prepare(`
        INSERT INTO deliveries (
            id, client_name, created_at, photo_count, message, expires_at,
            password_hash, password_salt, allow_individual_download,
            allow_zip_download, favorites_enabled, owner_id, brand_name,
            accent_color, background_color, website_url, instagram_url,
            facebook_url, tiktok_url, social_links, gallery_style, cover_filename,
            cover_style, cover_position_x, cover_position_y, logo_scale,
            logo_position_x, logo_position_y, client_email,
            status, published_at, last_sent_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLegacyDelivery = database.prepare(`
        INSERT OR IGNORE INTO deliveries (id, client_name, created_at, photo_count)
        VALUES (?, ?, ?, ?)
    `);
    const selectDeliveries = database.prepare(`
        SELECT ${projection} FROM deliveries
        WHERE owner_id = ? ORDER BY created_at DESC
    `);
    const selectDelivery = database.prepare(`
        SELECT ${projection} FROM deliveries WHERE id = ?
    `);
    const selectDeliveryAccess = database.prepare(`
        SELECT ${projection}, password_hash AS passwordHash,
            password_salt AS passwordSalt
        FROM deliveries WHERE id = ?
    `);
    const selectOwnedDelivery = database.prepare(`
        SELECT ${projection} FROM deliveries WHERE id = ? AND owner_id = ?
    `);
    const selectOwnedDeliveryAccess = database.prepare(`
        SELECT ${projection}, password_hash AS passwordHash,
            password_salt AS passwordSalt
        FROM deliveries WHERE id = ? AND owner_id = ?
    `);
    const updateDeliveryStatement = database.prepare(`
        UPDATE deliveries
        SET client_name = ?, message = ?, expires_at = ?,
            password_hash = ?, password_salt = ?,
            allow_individual_download = ?, allow_zip_download = ?,
            favorites_enabled = ?, brand_name = ?, accent_color = ?,
            background_color = ?, website_url = ?, instagram_url = ?,
            facebook_url = ?, tiktok_url = ?, social_links = ?, gallery_style = ?,
            cover_filename = ?, cover_style = ?, cover_position_x = ?,
            cover_position_y = ?, logo_scale = ?, logo_position_x = ?,
            logo_position_y = ?, client_email = ?, status = ?,
            published_at = ?, last_sent_at = ?, updated_at = ?
        WHERE id = ?
    `);
    const updatePhotoCountStatement = database.prepare(`
        UPDATE deliveries SET photo_count = ?, updated_at = ? WHERE id = ?
    `);
    const removeDelivery = database.prepare(
        "DELETE FROM deliveries WHERE id = ? AND owner_id = ?"
    );
    const removeAllDeliveries = database.prepare(
        "DELETE FROM deliveries WHERE owner_id = ?"
    );
    const countDeliveries = database.prepare(
        "SELECT COUNT(*) AS count FROM deliveries WHERE owner_id = ?"
    );
    const countUsers = database.prepare(`
        SELECT COUNT(*) AS count FROM users
        WHERE is_guest = 0 AND auth_disabled = 0
    `);
    const insertUser = database.prepare(`
        INSERT INTO users (
            username, email, display_name, password_hash, password_salt,
            email_verified_at, plan, plan_status, terms_accepted_at, is_guest,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const selectUser = database.prepare(`
        SELECT id, username, email, display_name AS displayName,
            password_hash AS passwordHash, password_salt AS passwordSalt,
            email_verified_at AS emailVerifiedAt, plan,
            plan_status AS planStatus, terms_accepted_at AS termsAcceptedAt,
            stripe_customer_id AS stripeCustomerId,
            stripe_subscription_id AS stripeSubscriptionId,
            stripe_environment AS stripeEnvironment,
            stripe_current_period_end AS stripeCurrentPeriodEnd, is_guest AS isGuest,
            auth_disabled AS authDisabled,
            created_at AS createdAt
        FROM users WHERE username = ? COLLATE NOCASE
    `);
    const selectUserByEmail = database.prepare(`
        SELECT id, username, email, display_name AS displayName,
            password_hash AS passwordHash, password_salt AS passwordSalt,
            email_verified_at AS emailVerifiedAt, plan,
            plan_status AS planStatus, terms_accepted_at AS termsAcceptedAt,
            stripe_customer_id AS stripeCustomerId,
            stripe_subscription_id AS stripeSubscriptionId,
            stripe_environment AS stripeEnvironment,
            stripe_current_period_end AS stripeCurrentPeriodEnd, is_guest AS isGuest,
            auth_disabled AS authDisabled,
            created_at AS createdAt
        FROM users WHERE email = ? COLLATE NOCASE
    `);
    const selectUserById = database.prepare(`
        SELECT id, username, email, display_name AS displayName,
            password_hash AS passwordHash, password_salt AS passwordSalt,
            email_verified_at AS emailVerifiedAt, plan,
            plan_status AS planStatus, terms_accepted_at AS termsAcceptedAt,
            stripe_customer_id AS stripeCustomerId,
            stripe_subscription_id AS stripeSubscriptionId,
            stripe_environment AS stripeEnvironment,
            stripe_current_period_end AS stripeCurrentPeriodEnd, is_guest AS isGuest,
            auth_disabled AS authDisabled,
            created_at AS createdAt
        FROM users WHERE id = ?
    `);
    const selectUserIdentity = database.prepare(`
        SELECT user_id AS userId
        FROM user_identities
        WHERE provider = ? AND subject = ?
    `);
    const insertUserIdentity = database.prepare(`
        INSERT OR IGNORE INTO user_identities (
            provider, subject, user_id, created_at
        ) VALUES (?, ?, ?, ?)
    `);
    const verifyUserEmail = database.prepare(`
        UPDATE users SET email_verified_at = ? WHERE id = ?
    `);
    const updateUserPassword = database.prepare(`
        UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?
    `);
    const prepareUserRegistrationStatement = database.prepare(`
        UPDATE users
        SET username = ?, display_name = ?, password_hash = ?, password_salt = ?,
            email_verified_at = NULL, terms_accepted_at = ?, auth_disabled = 0
        WHERE id = ? AND is_guest = 0
            AND (auth_disabled = 1 OR email_verified_at IS NULL)
    `);
    const updateUserPlan = database.prepare(`
        UPDATE users SET plan = ?, plan_status = ? WHERE id = ?
    `);
    const updateUserBillingStatement = database.prepare(`
        UPDATE users SET stripe_customer_id = ?, stripe_subscription_id = ?,
            stripe_environment = ?, plan = ?, plan_status = ?,
            stripe_current_period_end = ?
        WHERE id = ?
    `);
    const clearUserStripeBillingByEnvironment = database.prepare(`
        UPDATE users SET stripe_customer_id = NULL,
            stripe_subscription_id = NULL, stripe_environment = NULL,
            stripe_current_period_end = NULL, plan = 'free',
            plan_status = 'active'
        WHERE id = ? AND stripe_environment = ?
    `);
    const selectUserByStripeCustomer = database.prepare(`
        SELECT id, username, email, display_name AS displayName,
            password_hash AS passwordHash, password_salt AS passwordSalt,
            email_verified_at AS emailVerifiedAt, plan,
            plan_status AS planStatus, terms_accepted_at AS termsAcceptedAt,
            stripe_customer_id AS stripeCustomerId,
            stripe_subscription_id AS stripeSubscriptionId,
            stripe_environment AS stripeEnvironment,
            stripe_current_period_end AS stripeCurrentPeriodEnd, is_guest AS isGuest,
            auth_disabled AS authDisabled,
            created_at AS createdAt
        FROM users WHERE stripe_customer_id = ?
    `);
    const selectUserByStripeSubscription = database.prepare(`
        SELECT id, username, email, display_name AS displayName,
            password_hash AS passwordHash, password_salt AS passwordSalt,
            email_verified_at AS emailVerifiedAt, plan,
            plan_status AS planStatus, terms_accepted_at AS termsAcceptedAt,
            stripe_customer_id AS stripeCustomerId,
            stripe_subscription_id AS stripeSubscriptionId,
            stripe_environment AS stripeEnvironment,
            stripe_current_period_end AS stripeCurrentPeriodEnd, is_guest AS isGuest,
            auth_disabled AS authDisabled,
            created_at AS createdAt
        FROM users WHERE stripe_subscription_id = ?
    `);
    const selectStripeEvent = database.prepare(
        "SELECT event_id FROM stripe_events WHERE event_id = ?"
    );
    const insertStripeEvent = database.prepare(`
        INSERT OR IGNORE INTO stripe_events (event_id, event_type, processed_at)
        VALUES (?, ?, ?)
    `);
    const removeOldStripeEvents = database.prepare(
        "DELETE FROM stripe_events WHERE processed_at < ?"
    );
    const selectBrandProfile = database.prepare(`
        SELECT user_id AS userId, brand_name AS brandName,
            accent_color AS accentColor, background_color AS backgroundColor,
            website_url AS websiteUrl, instagram_url AS instagramUrl,
            facebook_url AS facebookUrl, tiktok_url AS tiktokUrl,
            social_links AS socialLinks,
            logo_scale AS logoScale, logo_position_x AS logoPositionX,
            logo_position_y AS logoPositionY,
            updated_at AS updatedAt
        FROM brand_profiles WHERE user_id = ?
    `);
    const upsertBrandProfileStatement = database.prepare(`
        INSERT INTO brand_profiles (
            user_id, brand_name, accent_color, background_color,
            website_url, instagram_url, facebook_url, tiktok_url, social_links,
            logo_scale, logo_position_x, logo_position_y, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            brand_name = excluded.brand_name,
            accent_color = excluded.accent_color,
            background_color = excluded.background_color,
            website_url = excluded.website_url,
            instagram_url = excluded.instagram_url,
            facebook_url = excluded.facebook_url,
            tiktok_url = excluded.tiktok_url,
            social_links = excluded.social_links,
            logo_scale = excluded.logo_scale,
            logo_position_x = excluded.logo_position_x,
            logo_position_y = excluded.logo_position_y,
            updated_at = excluded.updated_at
    `);
    const insertSession = database.prepare(`
        INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    `);
    const selectSession = database.prepare(`
        SELECT sessions.token_hash AS tokenHash, sessions.user_id AS userId,
            sessions.created_at AS createdAt, sessions.expires_at AS expiresAt,
            users.username AS username, users.email AS email,
            users.display_name AS displayName, users.plan AS plan,
            users.plan_status AS planStatus
        FROM sessions
        INNER JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?
            AND users.auth_disabled = 0
    `);
    const removeSession = database.prepare("DELETE FROM sessions WHERE token_hash = ?");
    const removeUserSessions = database.prepare("DELETE FROM sessions WHERE user_id = ?");
    const removeExpiredSessions = database.prepare("DELETE FROM sessions WHERE expires_at <= ?");
    const removeAccountTokens = database.prepare(`
        DELETE FROM account_tokens WHERE user_id = ? AND purpose = ?
    `);
    const insertAccountToken = database.prepare(`
        INSERT INTO account_tokens (token_hash, user_id, purpose, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
    `);
    const selectAccountToken = database.prepare(`
        SELECT token_hash AS tokenHash, user_id AS userId, purpose,
            created_at AS createdAt, expires_at AS expiresAt
        FROM account_tokens
        WHERE token_hash = ? AND purpose = ? AND expires_at > ?
    `);
    const removeAccountToken = database.prepare(
        "DELETE FROM account_tokens WHERE token_hash = ?"
    );
    const removeExpiredAccountTokens = database.prepare(
        "DELETE FROM account_tokens WHERE expires_at <= ?"
    );
    const insertGallerySession = database.prepare(`
        INSERT INTO gallery_sessions (token_hash, delivery_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    `);
    const selectGallerySession = database.prepare(`
        SELECT delivery_id AS deliveryId, expires_at AS expiresAt
        FROM gallery_sessions
        WHERE token_hash = ? AND delivery_id = ? AND expires_at > ?
    `);
    const removeGallerySessions = database.prepare("DELETE FROM gallery_sessions WHERE delivery_id = ?");
    const removeExpiredGallerySessions = database.prepare("DELETE FROM gallery_sessions WHERE expires_at <= ?");
    const insertFavorite = database.prepare(`
        INSERT OR IGNORE INTO favorites (delivery_id, filename, created_at)
        VALUES (?, ?, ?)
    `);
    const removeFavorite = database.prepare(`
        DELETE FROM favorites WHERE delivery_id = ? AND filename = ?
    `);
    const selectFavorites = database.prepare(`
        SELECT filename, created_at AS createdAt
        FROM favorites WHERE delivery_id = ? ORDER BY created_at ASC
    `);
    const selectSelectionSettings = database.prepare(`
        SELECT delivery_id AS deliveryId, selection_limit AS selectionLimit,
            status, client_name AS clientName, client_email AS clientEmail,
            submitted_at AS submittedAt, updated_at AS updatedAt
        FROM selection_settings WHERE delivery_id = ?
    `);
    const upsertSelectionSettings = database.prepare(`
        INSERT INTO selection_settings (
            delivery_id, selection_limit, status, client_name, client_email,
            submitted_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(delivery_id) DO UPDATE SET
            selection_limit = excluded.selection_limit,
            status = excluded.status,
            client_name = excluded.client_name,
            client_email = excluded.client_email,
            submitted_at = excluded.submitted_at,
            updated_at = excluded.updated_at
    `);
    const selectFavoriteComments = database.prepare(`
        SELECT filename, comment, updated_at AS updatedAt
        FROM favorite_comments WHERE delivery_id = ? ORDER BY updated_at ASC
    `);
    const upsertFavoriteComment = database.prepare(`
        INSERT INTO favorite_comments (delivery_id, filename, comment, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(delivery_id, filename) DO UPDATE SET
            comment = excluded.comment, updated_at = excluded.updated_at
    `);
    const insertActivity = database.prepare(`
        INSERT INTO gallery_activity (
            delivery_id, event_type, filename, details, created_at
        ) VALUES (?, ?, ?, ?, ?)
    `);
    const selectActivity = database.prepare(`
        SELECT id, event_type AS eventType, filename, details,
            created_at AS createdAt
        FROM gallery_activity WHERE delivery_id = ?
        ORDER BY created_at DESC LIMIT ?
    `);
    const selectSections = database.prepare(`
        SELECT id, delivery_id AS deliveryId, name, sort_order AS sortOrder,
            created_at AS createdAt
        FROM gallery_sections WHERE delivery_id = ?
        ORDER BY sort_order ASC, id ASC
    `);
    const insertSection = database.prepare(`
        INSERT INTO gallery_sections (delivery_id, name, sort_order, created_at)
        VALUES (?, ?, ?, ?)
    `);
    const removeSection = database.prepare(`
        DELETE FROM gallery_sections WHERE id = ? AND delivery_id = ?
    `);
    const selectMediaSections = database.prepare(`
        SELECT filename, section_id AS sectionId
        FROM media_sections WHERE delivery_id = ?
    `);
    const upsertMediaSection = database.prepare(`
        INSERT INTO media_sections (delivery_id, filename, section_id)
        VALUES (?, ?, ?)
        ON CONFLICT(delivery_id, filename) DO UPDATE SET
            section_id = excluded.section_id
    `);
    const selectTemplates = database.prepare(`
        SELECT id, name, settings, created_at AS createdAt,
            updated_at AS updatedAt
        FROM gallery_templates WHERE user_id = ? ORDER BY updated_at DESC
    `);
    const selectTemplate = database.prepare(`
        SELECT id, user_id AS userId, name, settings,
            created_at AS createdAt, updated_at AS updatedAt
        FROM gallery_templates WHERE id = ? AND user_id = ?
    `);
    const insertTemplate = database.prepare(`
        INSERT INTO gallery_templates (
            user_id, name, settings, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
    `);
    const removeTemplate = database.prepare(`
        DELETE FROM gallery_templates WHERE id = ? AND user_id = ?
    `);
    const transferProjection = `
        id, owner_id AS ownerId, title, message,
        recipient_email AS recipientEmail, sender_email AS senderEmail,
        created_at AS createdAt,
        expires_at AS expiresAt, file_count AS fileCount,
        total_bytes AS totalBytes, download_count AS downloadCount,
        last_download_at AS lastDownloadAt, status,
        storage_provider AS storageProvider,
        CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END AS hasPassword
    `;
    const selectTransfers = database.prepare(`
        SELECT ${transferProjection} FROM transfers
        WHERE owner_id = ? ORDER BY created_at DESC
    `);
    const selectTransfer = database.prepare(`
        SELECT ${transferProjection} FROM transfers WHERE id = ?
    `);
    const selectTransferAccess = database.prepare(`
        SELECT ${transferProjection}, password_hash AS passwordHash,
            password_salt AS passwordSalt
        FROM transfers WHERE id = ?
    `);
    const selectOwnedTransfer = database.prepare(`
        SELECT ${transferProjection} FROM transfers WHERE id = ? AND owner_id = ?
    `);
    const insertTransfer = database.prepare(`
        INSERT INTO transfers (
            id, owner_id, title, message, recipient_email, sender_email, created_at,
            expires_at, password_hash, password_salt, file_count, total_bytes,
            status, storage_provider
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateTransferReady = database.prepare(`
        UPDATE transfers SET status = 'ready', expires_at = ?
        WHERE id = ? AND owner_id = ? AND status = 'uploading'
    `);
    const touchUploadingTransfer = database.prepare(`
        UPDATE transfers SET expires_at = ?
        WHERE id = ? AND owner_id = ? AND status = 'uploading'
    `);
    const insertTransferFile = database.prepare(`
        INSERT INTO transfer_files (
            id, transfer_id, display_name, object_key, size, mime_type,
            multipart_upload_id, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const selectTransferFiles = database.prepare(`
        SELECT id, transfer_id AS transferId, display_name AS name,
            object_key AS objectKey, size, mime_type AS mimeType,
            multipart_upload_id AS multipartUploadId, status, created_at AS createdAt
        FROM transfer_files WHERE transfer_id = ? ORDER BY created_at, id
    `);
    const selectOwnedTransferFile = database.prepare(`
        SELECT f.id, f.transfer_id AS transferId, f.display_name AS name,
            f.object_key AS objectKey, f.size, f.mime_type AS mimeType,
            f.multipart_upload_id AS multipartUploadId, f.status,
            t.owner_id AS ownerId
        FROM transfer_files f JOIN transfers t ON t.id = f.transfer_id
        WHERE f.id = ? AND f.transfer_id = ? AND t.owner_id = ?
    `);
    const updateTransferFileStarted = database.prepare(`
        UPDATE transfer_files SET object_key = ?, multipart_upload_id = ?,
            status = 'uploading' WHERE id = ? AND transfer_id = ?
    `);
    const updateTransferFileReady = database.prepare(`
        UPDATE transfer_files SET status = 'ready', multipart_upload_id = NULL
        WHERE id = ? AND transfer_id = ?
    `);
    const countPendingTransferFiles = database.prepare(`
        SELECT COUNT(*) AS count FROM transfer_files
        WHERE transfer_id = ? AND status != 'ready'
    `);
    const removeTransfer = database.prepare(
        "DELETE FROM transfers WHERE id = ? AND owner_id = ?"
    );
    const updateTransferOwner = database.prepare(
        "UPDATE transfers SET owner_id = ? WHERE id = ? AND owner_id = ?"
    );
    const updateTransferZipOwner = database.prepare(
        "UPDATE transfer_zip_jobs SET owner_id = ? WHERE transfer_id = ? AND owner_id = ?"
    );
    const selectExpiredTransfers = database.prepare(`
        SELECT ${transferProjection} FROM transfers WHERE expires_at <= ?
    `);
    const removeTransferById = database.prepare(
        "DELETE FROM transfers WHERE id = ?"
    );
    const updateTransferDownload = database.prepare(`
        UPDATE transfers SET download_count = download_count + 1,
            last_download_at = ? WHERE id = ?
    `);
    const insertTransferSession = database.prepare(`
        INSERT INTO transfer_sessions (token_hash, transfer_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    `);
    const selectTransferSession = database.prepare(`
        SELECT transfer_id AS transferId, expires_at AS expiresAt
        FROM transfer_sessions
        WHERE token_hash = ? AND transfer_id = ? AND expires_at > ?
    `);
    const removeExpiredTransferSessions = database.prepare(
        "DELETE FROM transfer_sessions WHERE expires_at <= ?"
    );
    const insertGuestUploadSession = database.prepare(`
        INSERT INTO guest_upload_sessions (token_hash, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    `);
    const selectGuestUploadSession = database.prepare(`
        SELECT user_id AS userId, expires_at AS expiresAt
        FROM guest_upload_sessions
        WHERE token_hash = ? AND expires_at > ?
    `);
    const removeExpiredGuestUploadSessions = database.prepare(
        "DELETE FROM guest_upload_sessions WHERE expires_at <= ?"
    );
    const upsertTransferSenderVerification = database.prepare(`
        INSERT INTO transfer_sender_verifications (
            owner_id, email, code_hash, code_salt, attempts,
            created_at, expires_at, verified_at
        ) VALUES (?, ?, ?, ?, 0, ?, ?, NULL)
        ON CONFLICT(owner_id, email) DO UPDATE SET
            code_hash = excluded.code_hash,
            code_salt = excluded.code_salt,
            attempts = 0,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at,
            verified_at = NULL
    `);
    const selectTransferSenderVerification = database.prepare(`
        SELECT owner_id AS ownerId, email, code_hash AS codeHash,
            code_salt AS codeSalt, attempts, created_at AS createdAt,
            expires_at AS expiresAt, verified_at AS verifiedAt
        FROM transfer_sender_verifications
        WHERE owner_id = ? AND email = ? COLLATE NOCASE
    `);
    const incrementTransferSenderVerificationFailure = database.prepare(`
        UPDATE transfer_sender_verifications
        SET attempts = attempts + 1
        WHERE owner_id = ? AND email = ? COLLATE NOCASE
            AND verified_at IS NULL AND expires_at > ? AND attempts < ?
    `);
    const verifyTransferSenderEmail = database.prepare(`
        UPDATE transfer_sender_verifications
        SET verified_at = ?, expires_at = ?
        WHERE owner_id = ? AND email = ? COLLATE NOCASE
            AND expires_at > ? AND attempts < ?
    `);
    const removeExpiredTransferSenderVerifications = database.prepare(
        "DELETE FROM transfer_sender_verifications WHERE expires_at <= ?"
    );
    const removeOrphanGuestUsers = database.prepare(`
        DELETE FROM users
        WHERE is_guest = 1
          AND NOT EXISTS (SELECT 1 FROM transfers WHERE owner_id = users.id)
    `);
    const upsertUsageCounter = database.prepare(`
        INSERT INTO usage_counters (
            scope, scope_id, period, metric, value, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(scope, scope_id, period, metric) DO UPDATE SET
            value = MAX(0, usage_counters.value + excluded.value),
            updated_at = excluded.updated_at
    `);
    const decreaseUsageCounter = database.prepare(`
        UPDATE usage_counters
        SET value = MAX(0, value - ?), updated_at = ?
        WHERE scope = ? AND scope_id = ? AND period = ? AND metric = ?
    `);
    const selectUsageCounters = database.prepare(`
        SELECT metric, value FROM usage_counters
        WHERE scope = ? AND scope_id = ? AND period = ?
        ORDER BY metric
    `);
    const selectUsageCounter = database.prepare(`
        SELECT value FROM usage_counters
        WHERE scope = ? AND scope_id = ? AND period = ? AND metric = ?
    `);
    const selectActiveTransferTotals = database.prepare(`
        SELECT COALESCE(SUM(total_bytes), 0) AS bytes,
            COUNT(*) AS transferCount,
            COALESCE(SUM(CASE WHEN status = 'uploading' THEN 1 ELSE 0 END), 0)
                AS uploadingCount
        FROM transfers
        WHERE expires_at > ? AND status IN ('uploading', 'ready')
    `);
    const selectAccountActiveTransferTotals = database.prepare(`
        SELECT COALESCE(SUM(total_bytes), 0) AS bytes,
            COUNT(*) AS transferCount,
            COALESCE(SUM(CASE WHEN status = 'uploading' THEN 1 ELSE 0 END), 0)
                AS uploadingCount
        FROM transfers
        WHERE owner_id = ? AND expires_at > ? AND status IN ('uploading', 'ready')
    `);
    const selectReadyZipTotals = database.prepare(`
        SELECT COALESCE(SUM(z.size), 0) AS bytes, COUNT(*) AS zipCount
        FROM transfer_zip_jobs z
        INNER JOIN transfers t ON t.id = z.transfer_id
        WHERE z.status = 'ready' AND t.expires_at > ?
    `);
    const selectAccountReadyZipTotals = database.prepare(`
        SELECT COALESCE(SUM(z.size), 0) AS bytes, COUNT(*) AS zipCount
        FROM transfer_zip_jobs z
        INNER JOIN transfers t ON t.id = z.transfer_id
        WHERE z.owner_id = ? AND z.status = 'ready' AND t.expires_at > ?
    `);
    const selectTransferForQuota = database.prepare(`
        SELECT id, owner_id AS ownerId, total_bytes AS totalBytes,
            created_at AS createdAt, expires_at AS expiresAt, status
        FROM transfers WHERE id = ?
    `);
    const selectZipJob = database.prepare(`
        SELECT transfer_id AS transferId, owner_id AS ownerId, status,
            object_key AS objectKey, size, expected_size AS expectedSize,
            error_code AS errorCode,
            created_at AS createdAt, updated_at AS updatedAt
        FROM transfer_zip_jobs WHERE transfer_id = ?
    `);
    const countBuildingZipJobs = database.prepare(`
        SELECT COUNT(*) AS count FROM transfer_zip_jobs WHERE status = 'building'
    `);
    const countAccountBuildingZipJobs = database.prepare(`
        SELECT COUNT(*) AS count FROM transfer_zip_jobs
        WHERE owner_id = ? AND status = 'building'
    `);
    const markStaleZipJobsFailed = database.prepare(`
        UPDATE transfer_zip_jobs SET status = 'failed', error_code = 'STALE_JOB',
            updated_at = ? WHERE status = 'building' AND updated_at < ?
    `);
    const selectStaleZipJobs = database.prepare(`
        SELECT transfer_id AS transferId, owner_id AS ownerId,
            expected_size AS expectedSize, created_at AS createdAt
        FROM transfer_zip_jobs WHERE status = 'building' AND updated_at < ?
    `);
    const upsertBuildingZipJob = database.prepare(`
        INSERT INTO transfer_zip_jobs (
            transfer_id, owner_id, status, object_key, size, expected_size,
            error_code, created_at, updated_at
        ) VALUES (?, ?, 'building', ?, 0, ?, NULL, ?, ?)
        ON CONFLICT(transfer_id) DO UPDATE SET
            status = 'building', object_key = excluded.object_key,
            size = 0, expected_size = excluded.expected_size,
            error_code = NULL, created_at = excluded.created_at,
            updated_at = excluded.updated_at
    `);
    const updateReadyZipJob = database.prepare(`
        UPDATE transfer_zip_jobs SET status = 'ready', size = ?,
            error_code = NULL, updated_at = ?
        WHERE transfer_id = ? AND status = 'building'
    `);
    const updateFailedZipJob = database.prepare(`
        UPDATE transfer_zip_jobs SET status = 'failed', error_code = ?, updated_at = ?
        WHERE transfer_id = ? AND status = 'building'
    `);
    const conversionProjection = `
        id, owner_id AS ownerId, transfer_id AS transferId,
        idempotency_key AS idempotencyKey, delivery_id AS deliveryId,
        status, selected_files AS selectedFiles, settings,
        expected_bytes AS expectedBytes, copied_bytes AS copiedBytes,
        error_code AS errorCode, created_at AS createdAt,
        updated_at AS updatedAt
    `;
    const selectConversionJob = database.prepare(`
        SELECT ${conversionProjection} FROM transfer_conversion_jobs WHERE id = ?
    `);
    const selectOwnedConversionJob = database.prepare(`
        SELECT ${conversionProjection} FROM transfer_conversion_jobs
        WHERE id = ? AND owner_id = ?
    `);
    const selectConversionByIdempotency = database.prepare(`
        SELECT ${conversionProjection} FROM transfer_conversion_jobs
        WHERE owner_id = ? AND idempotency_key = ?
    `);
    const selectLatestTransferConversion = database.prepare(`
        SELECT ${conversionProjection} FROM transfer_conversion_jobs
        WHERE transfer_id = ? AND owner_id = ?
        ORDER BY created_at DESC LIMIT 1
    `);
    const selectRecoverableConversions = database.prepare(`
        SELECT ${conversionProjection} FROM transfer_conversion_jobs
        WHERE status IN ('pending', 'building') ORDER BY created_at ASC
    `);
    const countActiveConversions = database.prepare(`
        SELECT COUNT(*) AS count FROM transfer_conversion_jobs
        WHERE status IN ('pending', 'building')
    `);
    const countAccountActiveConversions = database.prepare(`
        SELECT COUNT(*) AS count FROM transfer_conversion_jobs
        WHERE owner_id = ? AND status IN ('pending', 'building')
    `);
    const sumAccountReservedConversionBytes = database.prepare(`
        SELECT COALESCE(SUM(expected_bytes), 0) AS bytes
        FROM transfer_conversion_jobs
        WHERE owner_id = ? AND status IN ('pending', 'building')
    `);
    const hasActiveTransferConversion = database.prepare(`
        SELECT 1 AS active FROM transfer_conversion_jobs
        WHERE transfer_id = ? AND status IN ('pending', 'building') LIMIT 1
    `);
    const insertConversionJob = database.prepare(`
        INSERT INTO transfer_conversion_jobs (
            id, owner_id, transfer_id, idempotency_key, delivery_id,
            status, selected_files, settings, expected_bytes, copied_bytes,
            error_code, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, 0, NULL, ?, ?)
    `);
    const claimConversionJob = database.prepare(`
        UPDATE transfer_conversion_jobs SET status = 'building',
            error_code = NULL, updated_at = ?
        WHERE id = ? AND status = 'pending'
    `);
    const updateConversionProgress = database.prepare(`
        UPDATE transfer_conversion_jobs SET copied_bytes = ?, updated_at = ?
        WHERE id = ? AND status = 'building'
    `);
    const completeConversionJob = database.prepare(`
        UPDATE transfer_conversion_jobs SET status = 'ready',
            copied_bytes = expected_bytes, error_code = NULL, updated_at = ?
        WHERE id = ? AND status IN ('pending', 'building')
    `);
    const failConversionJob = database.prepare(`
        UPDATE transfer_conversion_jobs SET status = 'failed',
            error_code = ?, updated_at = ?
        WHERE id = ? AND status IN ('pending', 'building')
    `);
    const retryConversionJob = database.prepare(`
        UPDATE transfer_conversion_jobs SET status = 'pending', copied_bytes = 0,
            error_code = NULL, updated_at = ?
        WHERE id = ? AND owner_id = ? AND status = 'failed'
    `);
    const resetBuildingConversions = database.prepare(`
        UPDATE transfer_conversion_jobs SET status = 'pending',
            copied_bytes = 0, error_code = 'SERVER_RESTART', updated_at = ?
        WHERE status = 'building'
    `);

    function legacySocialLinks(row) {
        return [
            ["Web", row.websiteUrl],
            ["Instagram", row.instagramUrl],
            ["Facebook", row.facebookUrl],
            ["TikTok", row.tiktokUrl]
        ].filter(([, url]) => Boolean(url)).map(([label, url]) => ({ label, url }));
    }

    function parseSocialLinks(row) {
        if (row.socialLinks !== null && row.socialLinks !== undefined) {
            try {
                const parsed = JSON.parse(row.socialLinks);
                if (Array.isArray(parsed)) return parsed;
            } catch {}
        }
        return legacySocialLinks(row);
    }

    function normalize(row) {
        if (!row) return null;
        const allowOriginalDownload = Boolean(row.allowIndividualDownload);
        const allowWebDownload = Boolean(row.allowZipDownload);
        return {
            ...row,
            socialLinks: parseSocialLinks(row),
            photoCount: Number(row.photoCount),
            hasPassword: Boolean(row.hasPassword),
            viewingEnabled: row.status === "published",
            allowIndividualDownload: allowOriginalDownload,
            allowZipDownload: allowWebDownload,
            allowOriginalDownload,
            allowWebDownload,
            favoritesEnabled: Boolean(row.favoritesEnabled)
        };
    }

    function normalizeConversion(row) {
        if (!row) return null;
        let selectedFiles = [];
        let settings = {};
        try { selectedFiles = JSON.parse(row.selectedFiles); } catch {}
        try { settings = JSON.parse(row.settings); } catch {}
        return { ...row, selectedFiles, settings };
    }

    function migrateExistingDeliveries() {
        const folders = fs.readdirSync(uploadsDirectory, { withFileTypes: true })
            .filter((item) => item.isDirectory());

        for (const folder of folders) {
            const folderPath = path.join(uploadsDirectory, folder.name);
            const metadataPath = path.join(folderPath, "metadata.json");
            let clientName = "Galería sin nombre";
            let createdAt = fs.statSync(folderPath).birthtime.toISOString();

            if (fs.existsSync(metadataPath)) {
                try {
                    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
                    if (typeof metadata.clientName === "string" && metadata.clientName.trim()) {
                        clientName = metadata.clientName.trim();
                    }
                    if (typeof metadata.createdAt === "string" && !Number.isNaN(Date.parse(metadata.createdAt))) {
                        createdAt = metadata.createdAt;
                    }
                } catch (error) {
                    console.warn(`No se pudo importar ${metadataPath}: ${error.message}`);
                }
            }

            const photoCount = fs.readdirSync(folderPath, { withFileTypes: true })
                .filter((item) => item.isFile()
                    && item.name !== "metadata.json"
                    && !item.name.startsWith("."))
                .length;
            insertLegacyDelivery.run(folder.name, clientName, createdAt, photoCount);
        }

        database.exec(`
            UPDATE deliveries
            SET owner_id = (SELECT id FROM users ORDER BY id LIMIT 1)
            WHERE owner_id IS NULL AND EXISTS (SELECT 1 FROM users)
        `);
    }

    migrateExistingDeliveries();

    function scopeRows(ownerId) {
        return ownerId === null || ownerId === undefined
            ? [["global", "all"]]
            : [["global", "all"], ["account", String(ownerId)]];
    }

    function metricValue(scope, scopeId, period, metric) {
        return Number(selectUsageCounter.get(scope, scopeId, period, metric)?.value || 0);
    }

    function adjustMetric(ownerId, period, metric, delta, updatedAt) {
        if (!Number.isSafeInteger(delta) || delta === 0) return;
        for (const [scope, scopeId] of scopeRows(ownerId)) {
            if (delta < 0) {
                decreaseUsageCounter.run(
                    Math.abs(delta), updatedAt, scope, scopeId, period, metric
                );
            } else {
                upsertUsageCounter.run(
                    scope, scopeId, period, metric, delta, updatedAt
                );
            }
        }
    }

    function releaseTransferReservation(transfer, updatedAt) {
        if (!transfer || transfer.status !== "uploading") return;
        adjustMetric(
            transfer.ownerId,
            String(transfer.createdAt).slice(0, 7),
            "reserved_upload_bytes",
            -Number(transfer.totalBytes || 0),
            updatedAt
        );
    }

    function failStaleZipJobs(staleBeforeIso, updatedAt) {
        const stale = selectStaleZipJobs.all(staleBeforeIso);
        for (const job of stale) {
            adjustMetric(
                job.ownerId, String(job.createdAt).slice(0, 7),
                "reserved_zip_bytes", -Number(job.expectedSize || 0), updatedAt
            );
        }
        markStaleZipJobsFailed.run(updatedAt, staleBeforeIso);
        return stale.length;
    }

    function deleteTransferWithReservation(id, ownerId) {
        database.exec("BEGIN IMMEDIATE");
        try {
            const transfer = selectTransferForQuota.get(id);
            if (!transfer || (ownerId !== null && transfer.ownerId !== ownerId)) {
                database.exec("ROLLBACK");
                return false;
            }
            releaseTransferReservation(transfer, new Date().toISOString());
            const changes = ownerId === null
                ? removeTransferById.run(id).changes
                : removeTransfer.run(id, ownerId).changes;
            database.exec("COMMIT");
            return changes > 0;
        } catch (error) {
            database.exec("ROLLBACK");
            throw error;
        }
    }

    return {
        listDeliveries: (ownerId) => selectDeliveries.all(ownerId).map(normalize),
        countDeliveries: (ownerId) => Number(countDeliveries.get(ownerId).count),
        getDelivery: (id) => normalize(selectDelivery.get(id)),
        getDeliveryAccess: (id) => normalize(selectDeliveryAccess.get(id)),
        getOwnedDelivery: (id, ownerId) => normalize(
            selectOwnedDelivery.get(id, ownerId)
        ),
        getOwnedDeliveryAccess: (id, ownerId) => normalize(
            selectOwnedDeliveryAccess.get(id, ownerId)
        ),
        createDelivery(delivery) {
            insertDelivery.run(
                delivery.id, delivery.clientName, delivery.createdAt,
                delivery.photoCount, delivery.message || "", delivery.expiresAt || null,
                delivery.passwordHash || null, delivery.passwordSalt || null,
                delivery.allowIndividualDownload !== false ? 1 : 0,
                delivery.allowZipDownload !== false ? 1 : 0,
                delivery.favoritesEnabled !== false ? 1 : 0,
                delivery.ownerId || null,
                delivery.brandName || "",
                delivery.accentColor || "#c9aa70",
                delivery.backgroundColor || "#ffffff",
                delivery.websiteUrl || "",
                delivery.instagramUrl || "",
                delivery.facebookUrl || "",
                delivery.tiktokUrl || "",
                Array.isArray(delivery.socialLinks)
                    ? JSON.stringify(delivery.socialLinks)
                    : null,
                delivery.galleryStyle || "masonry",
                delivery.coverFilename || null,
                delivery.coverStyle || "immersive",
                Number.isFinite(delivery.coverPositionX) ? delivery.coverPositionX : 50,
                Number.isFinite(delivery.coverPositionY) ? delivery.coverPositionY : 50,
                Number.isFinite(delivery.logoScale) ? delivery.logoScale : 100,
                Number.isFinite(delivery.logoPositionX) ? delivery.logoPositionX : 50,
                Number.isFinite(delivery.logoPositionY) ? delivery.logoPositionY : 50,
                delivery.clientEmail || "",
                delivery.status || "published",
                delivery.publishedAt || null,
                delivery.lastSentAt || null,
                delivery.updatedAt || delivery.createdAt
            );
        },
        updateDelivery(delivery) {
            return updateDeliveryStatement.run(
                delivery.clientName, delivery.message || "", delivery.expiresAt || null,
                delivery.passwordHash || null, delivery.passwordSalt || null,
                delivery.allowIndividualDownload ? 1 : 0,
                delivery.allowZipDownload ? 1 : 0,
                delivery.favoritesEnabled ? 1 : 0,
                delivery.brandName || "",
                delivery.accentColor || "#c9aa70",
                delivery.backgroundColor || "#ffffff",
                delivery.websiteUrl || "",
                delivery.instagramUrl || "",
                delivery.facebookUrl || "",
                delivery.tiktokUrl || "",
                Array.isArray(delivery.socialLinks)
                    ? JSON.stringify(delivery.socialLinks)
                    : null,
                delivery.galleryStyle || "masonry",
                delivery.coverFilename || null,
                delivery.coverStyle || "immersive",
                Number.isFinite(delivery.coverPositionX) ? delivery.coverPositionX : 50,
                Number.isFinite(delivery.coverPositionY) ? delivery.coverPositionY : 50,
                Number.isFinite(delivery.logoScale) ? delivery.logoScale : 100,
                Number.isFinite(delivery.logoPositionX) ? delivery.logoPositionX : 50,
                Number.isFinite(delivery.logoPositionY) ? delivery.logoPositionY : 50,
                delivery.clientEmail || "",
                delivery.status || "published",
                delivery.publishedAt || null,
                delivery.lastSentAt || null,
                delivery.updatedAt, delivery.id
            ).changes > 0;
        },
        updatePhotoCount(id, photoCount, updatedAt) {
            return updatePhotoCountStatement.run(photoCount, updatedAt, id).changes > 0;
        },
        deleteDelivery: (id, ownerId) => removeDelivery.run(id, ownerId).changes > 0,
        deleteAllDeliveries: (ownerId) => Number(removeAllDeliveries.run(ownerId).changes),
        hasUsers: () => Number(countUsers.get().count) > 0,
        createUser({
            username, email = null, displayName = "", passwordHash,
            passwordSalt, emailVerifiedAt = null, plan = "free",
            planStatus = "active", termsAcceptedAt = null, createdAt
        }) {
            return Number(insertUser.run(
                username, email, displayName, passwordHash, passwordSalt,
                emailVerifiedAt, plan, planStatus, termsAcceptedAt, 0, createdAt
            ).lastInsertRowid);
        },
        createGuestUser({ username, passwordHash, passwordSalt, createdAt }) {
            return Number(insertUser.run(
                username, null, "", passwordHash, passwordSalt,
                createdAt, "free", "active", null, 1, createdAt
            ).lastInsertRowid);
        },
        getUserByUsername: (username) => selectUser.get(username) || null,
        getUserByEmail: (email) => selectUserByEmail.get(email) || null,
        getUserById: (id) => selectUserById.get(id) || null,
        getUserByIdentity(provider, subject) {
            const identity = selectUserIdentity.get(provider, subject);
            return identity ? selectUserById.get(identity.userId) || null : null;
        },
        linkUserIdentity(provider, subject, userId, createdAt) {
            insertUserIdentity.run(provider, subject, userId, createdAt);
            return selectUserIdentity.get(provider, subject)?.userId === userId;
        },
        getUserByIdentifier(identifier) {
            return selectUserByEmail.get(identifier)
                || selectUser.get(identifier)
                || null;
        },
        markEmailVerified(userId, verifiedAt) {
            return verifyUserEmail.run(verifiedAt, userId).changes > 0;
        },
        updateUserPassword(userId, passwordHash, passwordSalt) {
            return updateUserPassword.run(
                passwordHash, passwordSalt, userId
            ).changes > 0;
        },
        prepareUserRegistration(userId, {
            username, displayName, passwordHash, passwordSalt, termsAcceptedAt
        }) {
            return prepareUserRegistrationStatement.run(
                username, displayName, passwordHash, passwordSalt,
                termsAcceptedAt, userId
            ).changes > 0;
        },
        updateUserPlan(userId, plan, planStatus = "active") {
            return updateUserPlan.run(plan, planStatus, userId).changes > 0;
        },
        updateUserBilling(userId, {
            customerId = null, subscriptionId = null, plan = "free",
            environment = null, planStatus = "active", currentPeriodEnd = null
        }) {
            return updateUserBillingStatement.run(
                customerId, subscriptionId, environment, plan, planStatus,
                currentPeriodEnd, userId
            ).changes > 0;
        },
        clearUserStripeBillingForEnvironment(userId, environment) {
            if (!["test", "live"].includes(environment)) return 0;
            return Number(
                clearUserStripeBillingByEnvironment.run(
                    userId, environment
                ).changes
            );
        },
        getUserByStripeCustomerId: (customerId) => (
            selectUserByStripeCustomer.get(customerId) || null
        ),
        getUserByStripeSubscriptionId: (subscriptionId) => (
            selectUserByStripeSubscription.get(subscriptionId) || null
        ),
        hasStripeEvent: (eventId) => Boolean(selectStripeEvent.get(eventId)),
        markStripeEventProcessed(eventId, eventType, processedAt) {
            return insertStripeEvent.run(eventId, eventType, processedAt).changes > 0;
        },
        deleteOldStripeEvents(before) {
            return Number(removeOldStripeEvents.run(before).changes);
        },
        getBrandProfile(userId) {
            const profile = selectBrandProfile.get(userId);
            return profile ? {
                ...profile,
                socialLinks: parseSocialLinks(profile)
            } : {
                userId,
                brandName: "",
                accentColor: "#c9aa70",
                backgroundColor: "#ffffff",
                websiteUrl: "",
                instagramUrl: "",
                facebookUrl: "",
                tiktokUrl: "",
                socialLinks: [],
                logoScale: 100,
                logoPositionX: 50,
                logoPositionY: 50,
                updatedAt: null
            };
        },
        upsertBrandProfile(profile) {
            upsertBrandProfileStatement.run(
                profile.userId, profile.brandName || "",
                profile.accentColor || "#c9aa70",
                profile.backgroundColor || "#ffffff",
                profile.websiteUrl || "", profile.instagramUrl || "",
                profile.facebookUrl || "", profile.tiktokUrl || "",
                Array.isArray(profile.socialLinks)
                    ? JSON.stringify(profile.socialLinks)
                    : null,
                Number.isFinite(profile.logoScale) ? profile.logoScale : 100,
                Number.isFinite(profile.logoPositionX) ? profile.logoPositionX : 50,
                Number.isFinite(profile.logoPositionY) ? profile.logoPositionY : 50,
                profile.updatedAt
            );
            const saved = selectBrandProfile.get(profile.userId);
            return { ...saved, socialLinks: parseSocialLinks(saved) };
        },
        createSession({ tokenHash, userId, createdAt, expiresAt }) {
            insertSession.run(tokenHash, userId, createdAt, expiresAt);
        },
        getSession: (tokenHash, now) => selectSession.get(tokenHash, now) || null,
        deleteSession: (tokenHash) => removeSession.run(tokenHash).changes > 0,
        deleteUserSessions(userId) {
            return Number(removeUserSessions.run(userId).changes);
        },
        deleteExpiredSessions: (now) => Number(removeExpiredSessions.run(now).changes),
        createAccountToken({ tokenHash, userId, purpose, createdAt, expiresAt }) {
            removeAccountTokens.run(userId, purpose);
            insertAccountToken.run(
                tokenHash, userId, purpose, createdAt, expiresAt
            );
        },
        getAccountToken(tokenHash, purpose, now) {
            return selectAccountToken.get(tokenHash, purpose, now) || null;
        },
        deleteAccountToken(tokenHash) {
            return removeAccountToken.run(tokenHash).changes > 0;
        },
        deleteExpiredAccountTokens(now) {
            return Number(removeExpiredAccountTokens.run(now).changes);
        },
        createGallerySession({ tokenHash, deliveryId, createdAt, expiresAt }) {
            insertGallerySession.run(tokenHash, deliveryId, createdAt, expiresAt);
        },
        getGallerySession(tokenHash, deliveryId, now) {
            return selectGallerySession.get(tokenHash, deliveryId, now) || null;
        },
        deleteGallerySessions(deliveryId) {
            return Number(removeGallerySessions.run(deliveryId).changes);
        },
        deleteExpiredGallerySessions(now) {
            return Number(removeExpiredGallerySessions.run(now).changes);
        },
        listFavorites: (deliveryId) => selectFavorites.all(deliveryId),
        addFavorite(deliveryId, filename, createdAt) {
            return insertFavorite.run(deliveryId, filename, createdAt).changes > 0;
        },
        deleteFavorite(deliveryId, filename) {
            return removeFavorite.run(deliveryId, filename).changes > 0;
        },
        deleteFavoritesForFile(deliveryId, filename) {
            return removeFavorite.run(deliveryId, filename).changes > 0;
        },
        getSelectionSettings(deliveryId) {
            return selectSelectionSettings.get(deliveryId) || {
                deliveryId,
                selectionLimit: 0,
                status: "open",
                clientName: "",
                clientEmail: "",
                submittedAt: null,
                updatedAt: null
            };
        },
        saveSelectionSettings(settings) {
            upsertSelectionSettings.run(
                settings.deliveryId,
                Math.max(0, Number(settings.selectionLimit) || 0),
                settings.status === "submitted" ? "submitted" : "open",
                settings.clientName || "",
                settings.clientEmail || "",
                settings.submittedAt || null,
                settings.updatedAt
            );
            return selectSelectionSettings.get(settings.deliveryId);
        },
        listFavoriteComments: (deliveryId) => selectFavoriteComments.all(deliveryId),
        saveFavoriteComment(deliveryId, filename, comment, updatedAt) {
            upsertFavoriteComment.run(deliveryId, filename, comment, updatedAt);
            return true;
        },
        logActivity(deliveryId, eventType, {
            filename = null, details = null, createdAt
        } = {}) {
            insertActivity.run(
                deliveryId,
                eventType,
                filename,
                details === null ? null : JSON.stringify(details),
                createdAt || new Date().toISOString()
            );
        },
        listActivity(deliveryId, limit = 100) {
            return selectActivity.all(
                deliveryId,
                Math.max(1, Math.min(500, Number(limit) || 100))
            ).map((item) => {
                let details = null;
                try { details = item.details ? JSON.parse(item.details) : null; }
                catch {}
                return { ...item, details };
            });
        },
        listSections: (deliveryId) => selectSections.all(deliveryId),
        addSection(deliveryId, name, sortOrder, createdAt) {
            return Number(insertSection.run(
                deliveryId, name, sortOrder, createdAt
            ).lastInsertRowid);
        },
        deleteSection(sectionId, deliveryId) {
            return removeSection.run(sectionId, deliveryId).changes > 0;
        },
        listMediaSections(deliveryId) {
            return Object.fromEntries(selectMediaSections.all(deliveryId)
                .map((item) => [item.filename, item.sectionId]));
        },
        setMediaSection(deliveryId, filename, sectionId) {
            upsertMediaSection.run(deliveryId, filename, sectionId || null);
            return true;
        },
        listTemplates(userId) {
            return selectTemplates.all(userId).map((template) => {
                let settings = {};
                try { settings = JSON.parse(template.settings); } catch {}
                return { ...template, settings };
            });
        },
        getTemplate(id, userId) {
            const template = selectTemplate.get(id, userId);
            if (!template) return null;
            let settings = {};
            try { settings = JSON.parse(template.settings); } catch {}
            return { ...template, settings };
        },
        createTemplate(userId, name, settings, createdAt) {
            return Number(insertTemplate.run(
                userId, name, JSON.stringify(settings), createdAt, createdAt
            ).lastInsertRowid);
        },
        deleteTemplate(id, userId) {
            return removeTemplate.run(id, userId).changes > 0;
        },
        listTransfers(ownerId) {
            return selectTransfers.all(ownerId).map((item) => ({
                ...item,
                hasPassword: Boolean(item.hasPassword)
            }));
        },
        getTransfer(id) {
            const item = selectTransfer.get(id);
            return item ? { ...item, hasPassword: Boolean(item.hasPassword) } : null;
        },
        getTransferAccess(id) {
            const item = selectTransferAccess.get(id);
            return item ? { ...item, hasPassword: Boolean(item.hasPassword) } : null;
        },
        getOwnedTransfer(id, ownerId) {
            const item = selectOwnedTransfer.get(id, ownerId);
            return item ? { ...item, hasPassword: Boolean(item.hasPassword) } : null;
        },
        getTransferConversion(id) {
            return normalizeConversion(selectConversionJob.get(id));
        },
        getOwnedTransferConversion(id, ownerId) {
            return normalizeConversion(selectOwnedConversionJob.get(id, ownerId));
        },
        getLatestTransferConversion(transferId, ownerId) {
            return normalizeConversion(selectLatestTransferConversion.get(
                transferId, ownerId
            ));
        },
        listRecoverableTransferConversions() {
            return selectRecoverableConversions.all().map(normalizeConversion);
        },
        hasActiveTransferConversion(transferId) {
            return Boolean(hasActiveTransferConversion.get(transferId));
        },
        countActiveTransferConversions(ownerId) {
            return Number(countAccountActiveConversions.get(ownerId).count);
        },
        getReservedTransferConversionBytes(ownerId) {
            return Number(sumAccountReservedConversionBytes.get(ownerId).bytes);
        },
        reserveTransferConversion({ job, limits }) {
            database.exec("BEGIN IMMEDIATE");
            try {
                const existing = selectConversionByIdempotency.get(
                    job.ownerId, job.idempotencyKey
                );
                if (existing) {
                    database.exec("COMMIT");
                    return { ok: true, existing: true, job: normalizeConversion(existing) };
                }
                const galleryCount = Number(countDeliveries.get(job.ownerId).count);
                const accountActive = Number(
                    countAccountActiveConversions.get(job.ownerId).count
                );
                const reservedBytes = Number(
                    sumAccountReservedConversionBytes.get(job.ownerId).bytes
                );
                const checks = [
                    [galleryCount + accountActive >= limits.galleryLimit,
                        "PLAN_GALLERY_LIMIT"],
                    [limits.galleryStorageBytes + reservedBytes + job.expectedBytes
                        > limits.galleryStorageLimitBytes, "PLAN_STORAGE_LIMIT"],
                    [accountActive >= limits.accountConcurrentConversions,
                        "ACCOUNT_CONVERSION_CONCURRENCY_LIMIT"],
                    [Number(countActiveConversions.get().count)
                        >= limits.globalConcurrentConversions,
                        "GLOBAL_CONVERSION_CONCURRENCY_LIMIT"]
                ];
                const rejection = checks.find(([blocked]) => blocked);
                if (rejection) {
                    database.exec("ROLLBACK");
                    return { ok: false, code: rejection[1] };
                }
                insertConversionJob.run(
                    job.id, job.ownerId, job.transferId, job.idempotencyKey,
                    job.deliveryId, JSON.stringify(job.selectedFiles),
                    JSON.stringify(job.settings), job.expectedBytes,
                    job.createdAt, job.createdAt
                );
                database.exec("COMMIT");
                return { ok: true, existing: false, job: normalizeConversion(
                    selectConversionJob.get(job.id)
                ) };
            } catch (error) {
                database.exec("ROLLBACK");
                throw error;
            }
        },
        claimTransferConversion(id, updatedAt) {
            return claimConversionJob.run(updatedAt, id).changes > 0;
        },
        updateTransferConversionProgress(id, copiedBytes, updatedAt) {
            return updateConversionProgress.run(
                Math.max(0, Math.round(copiedBytes)), updatedAt, id
            ).changes > 0;
        },
        completeTransferConversion(id, updatedAt) {
            return completeConversionJob.run(updatedAt, id).changes > 0;
        },
        failTransferConversion(id, errorCode, updatedAt) {
            return failConversionJob.run(
                String(errorCode || "CONVERSION_FAILED").slice(0, 80),
                updatedAt, id
            ).changes > 0;
        },
        retryTransferConversion({ id, ownerId, updatedAt, limits }) {
            database.exec("BEGIN IMMEDIATE");
            try {
                const job = selectOwnedConversionJob.get(id, ownerId);
                if (!job || job.status !== "failed") {
                    database.exec("ROLLBACK");
                    return { ok: false, code: "CONVERSION_NOT_RETRYABLE" };
                }
                const accountActive = Number(
                    countAccountActiveConversions.get(ownerId).count
                );
                const reservedBytes = Number(
                    sumAccountReservedConversionBytes.get(ownerId).bytes
                );
                const checks = [
                    [Number(countDeliveries.get(ownerId).count) + accountActive
                        >= limits.galleryLimit, "PLAN_GALLERY_LIMIT"],
                    [limits.galleryStorageBytes + reservedBytes
                        + Number(job.expectedBytes) > limits.galleryStorageLimitBytes,
                    "PLAN_STORAGE_LIMIT"],
                    [accountActive >= limits.accountConcurrentConversions,
                        "ACCOUNT_CONVERSION_CONCURRENCY_LIMIT"],
                    [Number(countActiveConversions.get().count)
                        >= limits.globalConcurrentConversions,
                        "GLOBAL_CONVERSION_CONCURRENCY_LIMIT"]
                ];
                const rejection = checks.find(([blocked]) => blocked);
                if (rejection) {
                    database.exec("ROLLBACK");
                    return { ok: false, code: rejection[1] };
                }
                retryConversionJob.run(updatedAt, id, ownerId);
                database.exec("COMMIT");
                return { ok: true, job: normalizeConversion(
                    selectConversionJob.get(id)
                ) };
            } catch (error) {
                database.exec("ROLLBACK");
                throw error;
            }
        },
        resetInterruptedTransferConversions(updatedAt = new Date().toISOString()) {
            return Number(resetBuildingConversions.run(updatedAt).changes);
        },
        createTransfer(transfer) {
            insertTransfer.run(
                transfer.id, transfer.ownerId, transfer.title,
                transfer.message || "", transfer.recipientEmail || "",
                transfer.senderEmail || "",
                transfer.createdAt, transfer.expiresAt,
                transfer.passwordHash || null, transfer.passwordSalt || null,
                transfer.fileCount, transfer.totalBytes,
                transfer.status || "ready", transfer.storageProvider || "local"
            );
        },
        claimGuestTransfer({ id, guestOwnerId, newOwnerId, limits, nowIso }) {
            database.exec("BEGIN IMMEDIATE");
            try {
                const transfer = selectTransferForQuota.get(id);
                const guest = selectUserById.get(guestOwnerId);
                const owner = selectUserById.get(newOwnerId);
                if (!transfer || transfer.ownerId !== guestOwnerId
                    || !guest || !guest.isGuest || !owner || owner.isGuest) {
                    database.exec("ROLLBACK");
                    return { ok: false, code: "GUEST_TRANSFER_NOT_OWNED" };
                }
                if (transfer.status !== "ready") {
                    database.exec("ROLLBACK");
                    return { ok: false, code: "TRANSFER_NOT_READY" };
                }
                if (Date.parse(transfer.expiresAt) <= Date.parse(nowIso)) {
                    database.exec("ROLLBACK");
                    return { ok: false, code: "TRANSFER_EXPIRED" };
                }
                const period = String(transfer.createdAt).slice(0, 7);
                const accountTotals = selectAccountActiveTransferTotals.get(
                    newOwnerId, nowIso
                );
                const accountUploaded = metricValue(
                    "account", String(newOwnerId), period, "uploaded_bytes"
                );
                if (Number(accountTotals.bytes) + Number(transfer.totalBytes)
                    > limits.accountStorageBytes) {
                    database.exec("ROLLBACK");
                    return { ok: false, code: "PLAN_TRANSFER_STORAGE_LIMIT" };
                }
                if (accountUploaded + Number(transfer.totalBytes)
                    > limits.accountMonthlyUploadBytes) {
                    database.exec("ROLLBACK");
                    return { ok: false, code: "PLAN_MONTHLY_UPLOAD_LIMIT" };
                }
                if (!updateTransferOwner.run(newOwnerId, id, guestOwnerId).changes) {
                    database.exec("ROLLBACK");
                    return { ok: false, code: "GUEST_TRANSFER_NOT_OWNED" };
                }
                updateTransferZipOwner.run(newOwnerId, id, guestOwnerId);
                decreaseUsageCounter.run(
                    Number(transfer.totalBytes), nowIso, "account",
                    String(guestOwnerId), period, "uploaded_bytes"
                );
                upsertUsageCounter.run(
                    "account", String(newOwnerId), period, "uploaded_bytes",
                    Number(transfer.totalBytes), nowIso
                );
                decreaseUsageCounter.run(
                    1, nowIso, "account", String(guestOwnerId),
                    period, "transfers_created"
                );
                upsertUsageCounter.run(
                    "account", String(newOwnerId), period,
                    "transfers_created", 1, nowIso
                );
                database.exec("COMMIT");
                return { ok: true };
            } catch (error) {
                database.exec("ROLLBACK");
                throw error;
            }
        },
        reserveTransferUpload({ transfer, files = [], limits, nowIso, period }) {
            database.exec("BEGIN IMMEDIATE");
            try {
                const accountTotals = selectAccountActiveTransferTotals.get(
                    transfer.ownerId, nowIso
                );
                const globalTotals = selectActiveTransferTotals.get(nowIso);
                const accountUploaded = metricValue(
                    "account", String(transfer.ownerId), period, "uploaded_bytes"
                );
                const accountReserved = metricValue(
                    "account", String(transfer.ownerId), period, "reserved_upload_bytes"
                );
                const globalUploaded = metricValue(
                    "global", "all", period, "uploaded_bytes"
                );
                const globalGalleryUploaded = metricValue(
                    "global", "all", period, "gallery_uploaded_bytes"
                );
                const globalReserved = metricValue(
                    "global", "all", period, "reserved_upload_bytes"
                );
                const globalDownloads = metricValue(
                    "global", "all", period, "downloaded_bytes"
                );
                const globalErrors = metricValue("global", "all", period, "errors");
                const checks = [
                    [transfer.totalBytes > limits.transferMaxBytes, "PLAN_TRANSFER_SIZE_LIMIT"],
                    [Number(accountTotals.bytes) + transfer.totalBytes
                        > limits.accountStorageBytes, "PLAN_TRANSFER_STORAGE_LIMIT"],
                    [accountUploaded + accountReserved + transfer.totalBytes
                        > limits.accountMonthlyUploadBytes, "PLAN_MONTHLY_UPLOAD_LIMIT"],
                    [Number(accountTotals.uploadingCount) >= limits.accountConcurrentUploads,
                        "ACCOUNT_UPLOAD_CONCURRENCY_LIMIT"],
                    [Number(globalTotals.bytes) + transfer.totalBytes
                        > limits.globalStorageBytes, "GLOBAL_TRANSFER_STORAGE_LIMIT"],
                    [globalUploaded + globalGalleryUploaded
                        + globalReserved + transfer.totalBytes
                        > limits.globalMonthlyUploadBytes, "GLOBAL_MONTHLY_UPLOAD_LIMIT"],
                    [Number(globalTotals.uploadingCount) >= limits.globalConcurrentUploads,
                        "GLOBAL_UPLOAD_CONCURRENCY_LIMIT"],
                    [globalDownloads >= limits.globalMonthlyDownloadBytes,
                        "GLOBAL_DOWNLOAD_THRESHOLD"],
                    [globalErrors >= limits.globalMonthlyErrorLimit,
                        "GLOBAL_ERROR_THRESHOLD"]
                ];
                const rejection = checks.find(([blocked]) => blocked);
                if (rejection) {
                    database.exec("ROLLBACK");
                    return { ok: false, code: rejection[1] };
                }

                insertTransfer.run(
                    transfer.id, transfer.ownerId, transfer.title,
                    transfer.message || "", transfer.recipientEmail || "",
                    transfer.senderEmail || "",
                    transfer.createdAt, transfer.expiresAt,
                    transfer.passwordHash || null, transfer.passwordSalt || null,
                    transfer.fileCount, transfer.totalBytes,
                    transfer.status || "uploading", transfer.storageProvider || "local"
                );
                for (const file of files) {
                    insertTransferFile.run(
                        file.id, transfer.id, file.name, file.objectKey || null,
                        file.size, file.mimeType || "application/octet-stream",
                        file.multipartUploadId || null, file.status || "pending",
                        file.createdAt || transfer.createdAt
                    );
                }
                adjustMetric(
                    transfer.ownerId, period,
                    transfer.status === "ready" ? "uploaded_bytes" : "reserved_upload_bytes",
                    transfer.totalBytes, nowIso
                );
                adjustMetric(transfer.ownerId, period, "transfers_created", 1, nowIso);
                database.exec("COMMIT");
                return { ok: true };
            } catch (error) {
                database.exec("ROLLBACK");
                throw error;
            }
        },
        markTransferReady(id, ownerId, expiresAt) {
            return updateTransferReady.run(expiresAt, id, ownerId).changes > 0;
        },
        touchTransferUpload(id, ownerId, expiresAt) {
            return touchUploadingTransfer.run(expiresAt, id, ownerId).changes > 0;
        },
        finalizeTransferUpload(id, ownerId, expiresAt, updatedAt) {
            database.exec("BEGIN IMMEDIATE");
            try {
                const transfer = selectTransferForQuota.get(id);
                if (!transfer || transfer.ownerId !== ownerId) {
                    database.exec("ROLLBACK");
                    return false;
                }
                if (transfer.status !== "uploading") {
                    database.exec("COMMIT");
                    return transfer.status === "ready";
                }
                if (!updateTransferReady.run(expiresAt, id, ownerId).changes) {
                    database.exec("ROLLBACK");
                    return false;
                }
                const period = String(transfer.createdAt).slice(0, 7);
                adjustMetric(ownerId, period, "reserved_upload_bytes", -transfer.totalBytes, updatedAt);
                adjustMetric(ownerId, period, "uploaded_bytes", transfer.totalBytes, updatedAt);
                database.exec("COMMIT");
                return true;
            } catch (error) {
                database.exec("ROLLBACK");
                throw error;
            }
        },
        createTransferFiles(files) {
            database.exec("BEGIN IMMEDIATE");
            try {
                for (const file of files) {
                    insertTransferFile.run(
                        file.id, file.transferId, file.name, file.objectKey || null,
                        file.size, file.mimeType || "application/octet-stream",
                        file.multipartUploadId || null, file.status || "pending",
                        file.createdAt
                    );
                }
                database.exec("COMMIT");
            } catch (error) {
                database.exec("ROLLBACK");
                throw error;
            }
        },
        listTransferFiles(id) {
            return selectTransferFiles.all(id);
        },
        getOwnedTransferFile(fileId, transferId, ownerId) {
            return selectOwnedTransferFile.get(fileId, transferId, ownerId) || null;
        },
        markTransferFileStarted(fileId, transferId, objectKey, multipartUploadId) {
            return updateTransferFileStarted.run(
                objectKey, multipartUploadId, fileId, transferId
            ).changes > 0;
        },
        markTransferFileReady(fileId, transferId) {
            return updateTransferFileReady.run(fileId, transferId).changes > 0;
        },
        transferHasPendingFiles(id) {
            return Number(countPendingTransferFiles.get(id)?.count || 0) > 0;
        },
        deleteTransfer(id, ownerId) {
            return deleteTransferWithReservation(id, ownerId);
        },
        listExpiredTransfers(nowIso) {
            return selectExpiredTransfers.all(nowIso);
        },
        deleteTransferById(id) {
            return deleteTransferWithReservation(id, null);
        },
        recordTransferDownload(id, downloadedAt) {
            return updateTransferDownload.run(downloadedAt, id).changes > 0;
        },
        createTransferSession({ tokenHash, transferId, createdAt, expiresAt }) {
            insertTransferSession.run(tokenHash, transferId, createdAt, expiresAt);
        },
        getTransferSession(tokenHash, transferId, now) {
            return selectTransferSession.get(tokenHash, transferId, now) || null;
        },
        deleteExpiredTransferSessions(now) {
            return Number(removeExpiredTransferSessions.run(now).changes);
        },
        createGuestUploadSession({ tokenHash, userId, createdAt, expiresAt }) {
            insertGuestUploadSession.run(tokenHash, userId, createdAt, expiresAt);
        },
        getGuestUploadSession(tokenHash, now) {
            return selectGuestUploadSession.get(tokenHash, now) || null;
        },
        deleteExpiredGuestUploadSessions(now) {
            return Number(removeExpiredGuestUploadSessions.run(now).changes);
        },
        saveTransferSenderVerification({
            ownerId, email, codeHash, codeSalt, createdAt, expiresAt
        }) {
            upsertTransferSenderVerification.run(
                ownerId, email, codeHash, codeSalt, createdAt, expiresAt
            );
        },
        getTransferSenderVerification(ownerId, email) {
            return selectTransferSenderVerification.get(ownerId, email) || null;
        },
        recordTransferSenderVerificationFailure(ownerId, email, now, maxAttempts) {
            return Number(incrementTransferSenderVerificationFailure.run(
                ownerId, email, now, maxAttempts
            ).changes);
        },
        markTransferSenderVerified({
            ownerId, email, verifiedAt, expiresAt, now, maxAttempts
        }) {
            return Number(verifyTransferSenderEmail.run(
                verifiedAt, expiresAt, ownerId, email, now, maxAttempts
            ).changes) > 0;
        },
        deleteExpiredTransferSenderVerifications(now) {
            return Number(removeExpiredTransferSenderVerifications.run(now).changes);
        },
        deleteOrphanGuestUsers() {
            return Number(removeOrphanGuestUsers.run().changes);
        },
        recordUsageMetric(ownerId, metric, value, at = new Date().toISOString()) {
            const period = String(at).slice(0, 7);
            database.exec("BEGIN IMMEDIATE");
            try {
                adjustMetric(ownerId, period, metric, Math.max(0, Math.round(value)), at);
                database.exec("COMMIT");
            } catch (error) {
                database.exec("ROLLBACK");
                throw error;
            }
        },
        getEconomicUsage(ownerId, period, nowIso = new Date().toISOString()) {
            const scope = ownerId === null || ownerId === undefined ? "global" : "account";
            const scopeId = scope === "global" ? "all" : String(ownerId);
            const counters = Object.fromEntries(selectUsageCounters
                .all(scope, scopeId, period)
                .map((row) => [row.metric, Number(row.value)]));
            const active = scope === "global"
                ? selectActiveTransferTotals.get(nowIso)
                : selectAccountActiveTransferTotals.get(ownerId, nowIso);
            const zip = scope === "global"
                ? selectReadyZipTotals.get(nowIso)
                : selectAccountReadyZipTotals.get(ownerId, nowIso);
            return {
                period,
                counters,
                activeTransferBytes: Number(active.bytes),
                activeTransferCount: Number(active.transferCount),
                activeUploads: Number(active.uploadingCount),
                readyZipBytes: Number(zip.bytes),
                readyZipCount: Number(zip.zipCount)
            };
        },
        getTransferZipJob(transferId) {
            return selectZipJob.get(transferId) || null;
        },
        reserveTransferZip({
            transferId, ownerId, objectKey, expectedBytes, period,
            nowIso, staleBeforeIso, limits
        }) {
            database.exec("BEGIN IMMEDIATE");
            try {
                failStaleZipJobs(staleBeforeIso, nowIso);
                const existing = selectZipJob.get(transferId);
                if (existing?.status === "ready") {
                    database.exec("COMMIT");
                    return { ok: true, status: "ready", job: existing };
                }
                if (existing?.status === "building") {
                    database.exec("COMMIT");
                    return { ok: true, status: "building", job: existing };
                }
                const accountJobs = metricValue(
                    "account", String(ownerId), period, "zip_jobs_started"
                );
                const accountBytes = metricValue(
                    "account", String(ownerId), period, "zip_generated_bytes"
                );
                const accountReservedBytes = metricValue(
                    "account", String(ownerId), period, "reserved_zip_bytes"
                );
                const globalJobs = metricValue("global", "all", period, "zip_jobs_started");
                const globalBytes = metricValue("global", "all", period, "zip_generated_bytes");
                const globalReservedBytes = metricValue(
                    "global", "all", period, "reserved_zip_bytes"
                );
                const globalErrors = metricValue("global", "all", period, "errors");
                const checks = [
                    [expectedBytes > limits.accountZipMaxBytes, "PLAN_ZIP_SIZE_LIMIT"],
                    [accountJobs >= limits.accountMonthlyZipJobs, "PLAN_MONTHLY_ZIP_JOB_LIMIT"],
                    [accountBytes + accountReservedBytes + expectedBytes
                        > limits.accountMonthlyZipBytes,
                        "PLAN_MONTHLY_ZIP_BYTES_LIMIT"],
                    [Number(countAccountBuildingZipJobs.get(ownerId).count)
                        >= limits.accountConcurrentZips, "ACCOUNT_ZIP_CONCURRENCY_LIMIT"],
                    [globalJobs >= limits.globalMonthlyZipJobs, "GLOBAL_MONTHLY_ZIP_JOB_LIMIT"],
                    [globalBytes + globalReservedBytes + expectedBytes
                        > limits.globalMonthlyZipBytes,
                        "GLOBAL_MONTHLY_ZIP_BYTES_LIMIT"],
                    [Number(countBuildingZipJobs.get().count)
                        >= limits.globalConcurrentZips, "GLOBAL_ZIP_CONCURRENCY_LIMIT"],
                    [globalErrors >= limits.globalMonthlyErrorLimit, "GLOBAL_ERROR_THRESHOLD"]
                ];
                const rejection = checks.find(([blocked]) => blocked);
                if (rejection) {
                    database.exec("ROLLBACK");
                    return { ok: false, code: rejection[1] };
                }
                upsertBuildingZipJob.run(
                    transferId, ownerId, objectKey, expectedBytes, nowIso, nowIso
                );
                adjustMetric(ownerId, period, "zip_jobs_started", 1, nowIso);
                adjustMetric(ownerId, period, "reserved_zip_bytes", expectedBytes, nowIso);
                database.exec("COMMIT");
                return { ok: true, status: "building", job: selectZipJob.get(transferId) };
            } catch (error) {
                database.exec("ROLLBACK");
                throw error;
            }
        },
        reserveEphemeralZip({ ownerId, expectedBytes, period, nowIso, limits }) {
            database.exec("BEGIN IMMEDIATE");
            try {
                const accountJobs = metricValue(
                    "account", String(ownerId), period, "zip_jobs_started"
                );
                const accountBytes = metricValue(
                    "account", String(ownerId), period, "zip_generated_bytes"
                );
                const accountReserved = metricValue(
                    "account", String(ownerId), period, "reserved_zip_bytes"
                );
                const globalJobs = metricValue("global", "all", period, "zip_jobs_started");
                const globalBytes = metricValue("global", "all", period, "zip_generated_bytes");
                const globalReserved = metricValue("global", "all", period, "reserved_zip_bytes");
                const globalErrors = metricValue("global", "all", period, "errors");
                const checks = [
                    [expectedBytes > limits.accountZipMaxBytes, "PLAN_ZIP_SIZE_LIMIT"],
                    [accountJobs >= limits.accountMonthlyZipJobs, "PLAN_MONTHLY_ZIP_JOB_LIMIT"],
                    [accountBytes + accountReserved + expectedBytes
                        > limits.accountMonthlyZipBytes, "PLAN_MONTHLY_ZIP_BYTES_LIMIT"],
                    [globalJobs >= limits.globalMonthlyZipJobs, "GLOBAL_MONTHLY_ZIP_JOB_LIMIT"],
                    [globalBytes + globalReserved + expectedBytes
                        > limits.globalMonthlyZipBytes, "GLOBAL_MONTHLY_ZIP_BYTES_LIMIT"],
                    [globalErrors >= limits.globalMonthlyErrorLimit, "GLOBAL_ERROR_THRESHOLD"]
                ];
                const rejection = checks.find(([blocked]) => blocked);
                if (rejection) {
                    database.exec("ROLLBACK");
                    return { ok: false, code: rejection[1] };
                }
                adjustMetric(ownerId, period, "zip_jobs_started", 1, nowIso);
                adjustMetric(ownerId, period, "zip_generated_bytes", expectedBytes, nowIso);
                database.exec("COMMIT");
                return { ok: true };
            } catch (error) {
                database.exec("ROLLBACK");
                throw error;
            }
        },
        completeTransferZip(transferId, size, updatedAt) {
            database.exec("BEGIN IMMEDIATE");
            try {
                const job = selectZipJob.get(transferId);
                if (!job || job.status !== "building") {
                    database.exec("ROLLBACK");
                    return false;
                }
                updateReadyZipJob.run(size, updatedAt, transferId);
                adjustMetric(
                    job.ownerId, String(job.createdAt).slice(0, 7),
                    "reserved_zip_bytes", -Number(job.expectedSize || 0), updatedAt
                );
                adjustMetric(
                    job.ownerId, String(job.createdAt).slice(0, 7),
                    "zip_generated_bytes", Math.max(0, Math.round(size)), updatedAt
                );
                database.exec("COMMIT");
                return true;
            } catch (error) {
                database.exec("ROLLBACK");
                throw error;
            }
        },
        failTransferZip(transferId, errorCode, updatedAt) {
            database.exec("BEGIN IMMEDIATE");
            try {
                const job = selectZipJob.get(transferId);
                if (!job || job.status !== "building") {
                    database.exec("ROLLBACK");
                    return false;
                }
                adjustMetric(
                    job.ownerId, String(job.createdAt).slice(0, 7),
                    "reserved_zip_bytes", -Number(job.expectedSize || 0), updatedAt
                );
                const changed = updateFailedZipJob.run(
                    String(errorCode || "ZIP_FAILED").slice(0, 80), updatedAt, transferId
                ).changes > 0;
                database.exec("COMMIT");
                return changed;
            } catch (error) {
                database.exec("ROLLBACK");
                throw error;
            }
        },
        resetStaleZipJobs(cutoffIso, updatedAt = new Date().toISOString()) {
            database.exec("BEGIN IMMEDIATE");
            try {
                const count = failStaleZipJobs(cutoffIso, updatedAt);
                database.exec("COMMIT");
                return count;
            } catch (error) {
                database.exec("ROLLBACK");
                throw error;
            }
        },
        close() {
            if (database.isOpen) database.close();
        }
    };
}

module.exports = { createDeliveryStore };
