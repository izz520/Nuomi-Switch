use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use crate::models::error::{AppError, AppResult};

pub fn write_atomic(path: &Path, content: &[u8]) -> AppResult<()> {
    let parent = path.parent().ok_or_else(|| {
        AppError::new(
            "ATOMIC_WRITE_INVALID_PATH",
            "目标路径没有父目录。",
            "请选择有效的文件路径。",
        )
    })?;
    fs::create_dir_all(parent).map_err(|err| {
        AppError::new(
            "ATOMIC_WRITE_CREATE_DIR_FAILED",
            format!("创建目录 {} 失败：{}", parent.display(), err),
            "请检查目录权限。",
        )
    })?;

    let temp_path = path.with_extension("tmp");
    {
        let mut file = File::create(&temp_path).map_err(|err| {
            AppError::new(
                "ATOMIC_WRITE_CREATE_FAILED",
                format!(
                    "创建临时文件 {} 失败：{}",
                    temp_path.display(),
                    err
                ),
                "请检查文件权限。",
            )
        })?;
        file.write_all(content).map_err(|err| {
            AppError::new(
                "ATOMIC_WRITE_FAILED",
            format!("写入临时文件 {} 失败：{}", temp_path.display(), err),
            "请检查磁盘空间和文件权限。",
            )
        })?;
        file.sync_all().map_err(|err| {
            AppError::new(
                "ATOMIC_WRITE_SYNC_FAILED",
            format!("同步临时文件 {} 失败：{}", temp_path.display(), err),
            "请检查磁盘状态。",
            )
        })?;
    }

    fs::rename(&temp_path, path).map_err(|err| {
        AppError::new(
            "ATOMIC_WRITE_RENAME_FAILED",
            format!("替换 {} 失败：{}", path.display(), err),
            "请检查文件权限后重试。",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::write_atomic;

    #[test]
    fn writes_complete_content_to_target_file() {
        let root =
            std::env::temp_dir().join(format!("nuomi-switch-atomic-write-{}", uuid::Uuid::new_v4()));
        let target = root.join("nested").join("accounts.json");

        write_atomic(&target, br#"{"schemaVersion":"1.0.0"}"#)
            .expect("atomic write should succeed");

        let content = std::fs::read_to_string(&target).expect("target file should be readable");
        assert_eq!(content, r#"{"schemaVersion":"1.0.0"}"#);
        assert!(
            !target.with_extension("tmp").exists(),
            "temporary file should be renamed away"
        );

        let _ = std::fs::remove_dir_all(root);
    }
}
