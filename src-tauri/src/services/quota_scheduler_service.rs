use std::time::Duration;

use crate::infra::storage;
use crate::models::settings::MIN_QUOTA_AUTO_REFRESH_INTERVAL_MINUTES;
use crate::services::quota_service;

fn interval_duration(minutes: u64) -> Duration {
    Duration::from_secs(minutes.max(MIN_QUOTA_AUTO_REFRESH_INTERVAL_MINUTES) * 60)
}

async fn refresh_all_for_scheduler(reason: &str) {
    match quota_service::refresh_all_quotas().await {
        Ok(accounts) => {
            tracing::info!(
                reason,
                account_count = accounts.len(),
                "automatic Codex quota refresh completed"
            );
        }
        Err(error) => {
            tracing::warn!(
                reason,
                code = error.code,
                message = error.message,
                "automatic Codex quota refresh failed"
            );
        }
    }
}

pub async fn run_auto_refresh_loop() {
    match storage::load_settings() {
        Ok(settings) => {
            if settings.quota_refresh_on_start || settings.quota_auto_refresh_enabled {
                refresh_all_for_scheduler("startup").await;
            }
        }
        Err(error) => {
            tracing::warn!(
                code = error.code,
                message = error.message,
                "failed to load settings for startup quota refresh"
            );
        }
    }

    loop {
        let settings = match storage::load_settings() {
            Ok(settings) => settings,
            Err(error) => {
                tracing::warn!(
                    code = error.code,
                    message = error.message,
                    "failed to load settings for automatic quota refresh"
                );
                tokio::time::sleep(interval_duration(MIN_QUOTA_AUTO_REFRESH_INTERVAL_MINUTES))
                    .await;
                continue;
            }
        };

        tokio::time::sleep(interval_duration(
            settings.quota_auto_refresh_interval_minutes,
        ))
        .await;

        match storage::load_settings() {
            Ok(settings) if settings.quota_auto_refresh_enabled => {
                refresh_all_for_scheduler("interval").await;
            }
            Ok(_) => {}
            Err(error) => {
                tracing::warn!(
                    code = error.code,
                    message = error.message,
                    "failed to load settings before automatic quota refresh"
                );
            }
        }
    }
}
