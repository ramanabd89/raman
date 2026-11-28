-- RamanPhone — Phase 2 migration (run once on top of a Phase 1 database).
-- The store also applies this file by itself on the first request after the update (App\Core\Migrator),
-- skipping parts that already exist, then rebuilds the search index and clears the cache.
-- Manual use:  mysql -u USER -p DBNAME < database/migration_phase2.sql

-- 1) Used & refurbished phones + 4) model codes
ALTER TABLE `products`
  ADD COLUMN `is_used` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `condition_grade` ENUM('A+','A','B','C') NULL,
  ADD COLUMN `battery_health` TINYINT UNSIGNED NULL,
  ADD COLUMN `has_box` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `has_charger` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `used_warranty_days` INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN `cosmetic_notes_ku` TEXT NULL,
  ADD COLUMN `cosmetic_notes_ar` TEXT NULL,
  ADD COLUMN `cosmetic_notes_en` TEXT NULL,
  ADD COLUMN `model_code` VARCHAR(60) NULL;

CREATE INDEX `idx_products_used` ON `products` (`is_used`, `active`);
CREATE INDEX `idx_products_model_code` ON `products` (`model_code`);

-- trade-in → used listing link
ALTER TABLE `tradeins` ADD COLUMN `listed_product_id` BIGINT NULL;

-- 2) Accessories that explicitly fit phone models
CREATE TABLE IF NOT EXISTS `product_compatibility` (
  `product_id` BIGINT NOT NULL,
  `model_key` VARCHAR(120) NOT NULL,
  `label` VARCHAR(120) NOT NULL,
  PRIMARY KEY (`product_id`, `model_key`),
  KEY `idx_compat_model` (`model_key`),
  CONSTRAINT `fk_compat_product_id` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Wishlists (Phase 1 table `wishlist` is moved into `wishlists`)
CREATE TABLE IF NOT EXISTS `wishlist` (
  `user_id` BIGINT NOT NULL,
  `product_id` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wishlists` (
  `user_id` BIGINT NOT NULL,
  `product_id` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `product_id`),
  UNIQUE KEY `uq_wishlists_user_product` (`user_id`, `product_id`),
  KEY `idx_wishlists_product` (`product_id`),
  CONSTRAINT `fk_wishlists_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wishlists_product_id` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `wishlists` (`user_id`, `product_id`, `created_at`)
  SELECT w.`user_id`, w.`product_id`, w.`created_at` FROM `wishlist` w
  JOIN `users` u ON u.`id` = w.`user_id` JOIN `products` p ON p.`id` = w.`product_id`;

DROP TABLE IF EXISTS `wishlist`;

-- 5) cache version marker + schema version
INSERT INTO `settings` (`key`, `value`) VALUES ('schema_version', '2') ON DUPLICATE KEY UPDATE `value` = '2';
