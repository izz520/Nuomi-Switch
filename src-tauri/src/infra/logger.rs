use std::{
    fs::OpenOptions,
    io::{self, Write},
    path::PathBuf,
};

use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::infra::paths;

struct LogFileWriter {
    path: PathBuf,
}

impl Write for LogFileWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        file.write(buf)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

pub fn init_logger() {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let stdout_layer = fmt::layer().with_writer(std::io::stdout);

    let registry = tracing_subscriber::registry()
        .with(env_filter)
        .with(stdout_layer);

    match paths::logs_dir().and_then(|dir| {
        std::fs::create_dir_all(&dir).map_err(|err| {
            crate::models::error::AppError::new(
                "LOG_DIR_CREATE_FAILED",
                format!("Failed to create {}: {}", dir.display(), err),
                "Check app log directory permissions.",
            )
        })?;
        Ok(dir)
    }) {
        Ok(logs_dir) => {
            let log_file_path = logs_dir.join("nuomi-switch.log");
            let file_layer = fmt::layer()
                .with_ansi(false)
                .with_writer(move || LogFileWriter {
                    path: log_file_path.clone(),
                });
            if registry.with(file_layer).try_init().is_ok() {
                tracing::info!("Nuomi Switch logger initialized");
            }
        }
        Err(error) => {
            if registry.try_init().is_ok() {
                tracing::warn!(
                    code = error.code,
                    message = error.message,
                    "failed to initialize file logger"
                );
            }
        }
    }
}
